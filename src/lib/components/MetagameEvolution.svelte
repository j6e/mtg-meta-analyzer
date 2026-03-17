<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import {
		Chart,
		CategoryScale,
		Legend,
		LineController,
		LineElement,
		LinearScale,
		PointElement,
		Tooltip,
	} from 'chart.js';
	import type { MatrixOptions } from '../utils/winrate-calculator';
	import type { TournamentData } from '../types/tournament';
	import {
		computeMetagameEvolution,
		type EvolutionSeries,
		type PeriodSize,
	} from '../utils/metagame-evolution';
	import { getScryfallImageUrl } from '../utils/card-normalizer';

	Chart.register(CategoryScale, Legend, LineController, LineElement, LinearScale, PointElement, Tooltip);

	let {
		tournaments,
		playerArchetypes,
		matrixOptions,
		archetypeCardMap,
	}: {
		tournaments: TournamentData[];
		playerArchetypes: Map<string, string>;
		matrixOptions: MatrixOptions;
		archetypeCardMap: Map<string, string>;
	} = $props();

	let periodSize = $state<PeriodSize>('2w');

	const series = $derived(
		computeMetagameEvolution(tournaments, playerArchetypes, periodSize, {
			topN: matrixOptions.topN,
			minMetagameShare: matrixOptions.minMetagameShare,
		}).filter((s) => s.name !== 'Other'),
	);

	let canvas: HTMLCanvasElement;
	let chart: Chart | null = null;

	/** Loaded card art images keyed by archetype name. */
	const loadedImages = new Map<string, HTMLImageElement>();
	/** Dominant color extracted from each archetype's card art. */
	const dominantColors = new Map<string, string>();

	const COLORS = [
		'#2563eb', '#e11d48', '#16a34a', '#ea580c', '#7c3aed',
		'#0891b2', '#ca8a04', '#be185d', '#059669', '#d97706',
		'#6366f1', '#dc2626', '#65a30d', '#0d9488', '#a855f7',
	];
	const OTHER_COLOR = '#555555';

	/** Extract dominant color from image center (reused from MetagameScatter). */
	function extractDominantColor(img: HTMLImageElement): string {
		const size = 32;
		const offscreen = document.createElement('canvas');
		offscreen.width = size;
		offscreen.height = size;
		const ctx = offscreen.getContext('2d');
		if (!ctx) return '#888888';
		const imgW = img.naturalWidth;
		const imgH = img.naturalHeight;
		const cropSize = Math.min(imgW, imgH);
		const sx = (imgW - cropSize) / 2;
		const sy = (imgH - cropSize) / 2;
		ctx.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, size, size);
		const data = ctx.getImageData(0, 0, size, size).data;
		let rSum = 0,
			gSum = 0,
			bSum = 0,
			count = 0;
		for (let i = 0; i < data.length; i += 4) {
			rSum += data[i];
			gSum += data[i + 1];
			bSum += data[i + 2];
			count++;
		}
		return `rgb(${Math.round(rSum / count)}, ${Math.round(gSum / count)}, ${Math.round(bSum / count)})`;
	}

	function loadArchetypeImages(names: string[]) {
		for (const name of names) {
			if (loadedImages.has(name)) continue;
			const cardName = archetypeCardMap.get(name);
			if (!cardName) continue;
			const url = getScryfallImageUrl(cardName, 'art_crop');
			const img = new Image();
			img.crossOrigin = 'anonymous';
			img.onload = () => {
				loadedImages.set(name, img);
				dominantColors.set(name, extractDominantColor(img));
				if (chart) chart.update('none');
			};
			img.onerror = () => {
				const fallback = new Image();
				fallback.onload = () => {
					loadedImages.set(name, fallback);
					if (chart) chart.update('none');
				};
				fallback.src = url;
			};
			img.src = url;
		}
	}

	/** Highlights the hovered line and dims all others. */
	let hoveredDatasetIndex = -1;
	const hoverHighlightPlugin = {
		id: 'hoverHighlight',
		afterEvent(chartInstance: Chart, args: { event: { type: string } }) {
			if (args.event.type !== 'mousemove' && args.event.type !== 'mouseout') return;
			const newIndex =
				args.event.type === 'mouseout'
					? -1
					: (chartInstance.getElementsAtEventForMode(
							args.event as unknown as Event,
							'nearest',
							{ intersect: false },
							false,
						)[0]?.datasetIndex ?? -1);
			if (newIndex === hoveredDatasetIndex) return;
			hoveredDatasetIndex = newIndex;
			chartInstance.data.datasets.forEach((ds, i) => {
				const d = ds as unknown as Record<string, unknown>;
				const base = d.baseColor as string;
				const active = hoveredDatasetIndex === -1 || i === hoveredDatasetIndex;
				d.borderWidth = active ? 2.5 : 1;
				d.borderColor = active ? base : `${base}33`;
				d.pointBorderColor = active ? base : `${base}33`;
				d.pointBackgroundColor = active ? `${base}bb` : `${base}22`;
			});
			chartInstance.update('none');
		},
	};

	/** Card-art plugin: draws circular card art over points where share > 0. */
	const cardArtPlugin = {
		id: 'evolutionCardArt',
		afterDatasetsDraw(chartInstance: Chart) {
			const ctx = chartInstance.ctx;
			for (let dsIndex = 0; dsIndex < chartInstance.data.datasets.length; dsIndex++) {
				const ds = chartInstance.data.datasets[dsIndex] as unknown as Record<string, unknown>;
				const archName = ds.archetypeName as string;
				const img = loadedImages.get(archName);
				if (!img) continue;
				const meta = chartInstance.getDatasetMeta(dsIndex);
				for (let ptIndex = 0; ptIndex < meta.data.length; ptIndex++) {
					const element = meta.data[ptIndex] as unknown as Record<string, unknown> & { x: number; y: number };
					const opts = element.options as Record<string, number> | undefined;
					const r = opts?.pointRadius ?? opts?.radius ?? 0;
					if (r === 0) continue; // skip 0% points
					const { x, y } = element;
					ctx.save();
					ctx.beginPath();
					ctx.arc(x, y, r, 0, Math.PI * 2);
					ctx.closePath();
					ctx.clip();
					const imgW = img.naturalWidth;
					const imgH = img.naturalHeight;
					const cropSize = Math.min(imgW, imgH);
					ctx.drawImage(
						img,
						(imgW - cropSize) / 2,
						(imgH - cropSize) / 2,
						cropSize,
						cropSize,
						x - r,
						y - r,
						r * 2,
						r * 2,
					);
					ctx.restore();
					ctx.save();
					ctx.beginPath();
					ctx.arc(x, y, r, 0, Math.PI * 2);
					ctx.strokeStyle = dominantColors.get(archName) ?? 'rgba(255,255,255,0.6)';
					ctx.lineWidth = 2;
					ctx.stroke();
					ctx.restore();
				}
			}
		},
	};

	function buildChart(currentSeries: EvolutionSeries[]) {
		hoveredDatasetIndex = -1;
		if (chart) {
			chart.destroy();
			chart = null;
		}
		if (currentSeries.length === 0 || currentSeries[0].points.length === 0) return;

		loadArchetypeImages(currentSeries.map((s) => s.name));

		const labels = currentSeries[0].points.map((p) => p.label);
		const maxShare = Math.max(...currentSeries.flatMap((s) => s.points.map((p) => (p.share ?? 0) * 100)));
		const yMax = Math.ceil(maxShare) + 2;

		chart = new Chart(canvas, {
			type: 'line',
			data: {
				labels,
				datasets: currentSeries.map((s, i) => {
					const isOther = s.name === 'Other';
					const color = isOther ? OTHER_COLOR : COLORS[i % COLORS.length];
					return {
						label: s.name,
						archetypeName: s.name,
					baseColor: color,
						data: s.points.map((p) => (p.share === null ? null : p.share * 100)),
						pointRadius: s.points.map((p) => (p.share ? 10 : 0)),
						pointHoverRadius: s.points.map((p) => (p.share ? 12 : 0)),
						spanGaps: true,
						pointBackgroundColor: `${color}bb`,
						pointBorderColor: color,
						pointBorderWidth: 2,
						borderColor: color,
						borderWidth: 2,
						backgroundColor: 'transparent',
						tension: 0.3,
					};
				}),
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				interaction: { mode: 'nearest', intersect: false },
				scales: {
					x: {
						grid: { color: '#f0f0f0' },
						ticks: { font: { size: 11 } },
					},
					y: {
						min: 0,
						max: yMax,
						title: { display: true, text: 'Metagame Share (%)', font: { size: 13 } },
						ticks: { callback: (v) => `${v}%`, stepSize: 10 },
						grid: { color: '#f0f0f0' },
					},
				},
				plugins: {
					legend: { display: false },
					tooltip: {
						callbacks: {
							label: (ctx) => `${ctx.dataset.label}: ${(ctx.parsed.y ?? 0).toFixed(1)}%`,
						},
					},
				},
			},
			plugins: [hoverHighlightPlugin, cardArtPlugin],
		});
	}

	onMount(() => buildChart(series));
	onDestroy(() => chart?.destroy());

	$effect(() => {
		void series.length; // track dependency
		if (canvas) buildChart(series);
	});
</script>

<div class="controls">
	<span class="label">Period:</span>
	{#each [['1w', '1 week'], ['2w', '2 weeks'], ['1m', '1 month']] as [value, label] (value)}
		<button
			type="button"
			class="period-btn"
			class:active={periodSize === value}
			onclick={() => (periodSize = value as PeriodSize)}
		>{label}</button>
	{/each}
</div>

<div class="chart-container">
	<canvas bind:this={canvas} data-testid="evolution-canvas"></canvas>
</div>

<div class="legend">
	{#each series as s, i}
		<span class="legend-item">
			{#if archetypeCardMap.has(s.name)}
				<img
					class="legend-art"
					src={getScryfallImageUrl(archetypeCardMap.get(s.name)!, 'art_crop')}
					alt={s.name}
				/>
			{:else}
				<span
					class="dot"
					style="background: {s.name === 'Other' ? OTHER_COLOR : COLORS[i % COLORS.length]}"
				></span>
			{/if}
			{s.name}
		</span>
	{/each}
</div>

<style>
	.controls {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-bottom: 0.75rem;
	}

	.label {
		font-size: 0.85rem;
		color: var(--color-text-muted);
		margin-right: 0.2rem;
	}

	.period-btn {
		padding: 0.2rem 0.7rem;
		border-radius: 9999px;
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		font-size: 0.8rem;
		cursor: pointer;
		color: var(--color-text-muted);
		transition: all 0.15s;
	}

	.period-btn.active {
		background: var(--color-text);
		color: var(--color-bg);
		border-color: var(--color-text);
	}

	.period-btn:hover:not(.active) {
		background: var(--color-hover);
	}

	.chart-container {
		position: relative;
		height: 380px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		padding: 1rem;
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-top: 0.75rem;
		font-size: 0.8rem;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}

	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		display: inline-block;
	}

	.legend-art {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		object-fit: cover;
		border: 1px solid var(--color-border);
	}
</style>
