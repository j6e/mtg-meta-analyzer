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
	import type { TournamentData } from '../types/tournament';
	import {
		computeMetagameEvolution,
		type EvolutionSeries,
		type PeriodSize,
	} from '../utils/metagame-evolution';
	import { cardImageIndex, ensureCardImagesLoaded, lookupCardImage } from '../stores/card-images';
	import { settings } from '../stores/settings';

	Chart.register(CategoryScale, Legend, LineController, LineElement, LinearScale, PointElement, Tooltip);

	let {
		tournaments,
		playerArchetypes,
		matrixOptions,
		archetypeCardMap,
	}: {
		tournaments: TournamentData[];
		playerArchetypes: Map<string, string>;
		matrixOptions: { topN?: number; minMetagameShare?: number };
		archetypeCardMap: Map<string, string>;
	} = $props();

	let periodSize = $state<PeriodSize>('2w');
	let hiddenSeries = $state(new Set<string>());

	const evolutionResult = $derived(
		computeMetagameEvolution(tournaments, playerArchetypes, periodSize, {
			topN: matrixOptions.topN,
			minMetagameShare: matrixOptions.minMetagameShare,
			winnersMode: $settings.winnersMode,
			winnersCutoff: $settings.winnersCutoff,
		}),
	);

	const series = $derived(
		evolutionResult.series.filter((s) => s.name !== 'Other'),
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

	async function loadArchetypeImages(names: string[]) {
		await ensureCardImagesLoaded();
		for (const name of names) {
			if (loadedImages.has(name)) continue;
			const cardName = archetypeCardMap.get(name);
			if (!cardName) continue;
			const entry = lookupCardImage($cardImageIndex, cardName);
			if (!entry) continue;
			// CORS-enabled load (needed for color extraction via getImageData);
			// on failure the point just keeps its colored fill.
			const img = new Image();
			img.crossOrigin = 'anonymous';
			img.onload = () => {
				loadedImages.set(name, img);
				dominantColors.set(name, extractDominantColor(img));
				if (chart) chart.update('none');
			};
			img.src = entry.art_crop;
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

	function toggleSeries(name: string) {
		const next = new Set(hiddenSeries);
		if (next.has(name)) next.delete(name);
		else next.add(name);
		hiddenSeries = next;
	}

	function buildChart(currentSeries: EvolutionSeries[]) {
		hoveredDatasetIndex = -1;
		if (chart) {
			chart.destroy();
			chart = null;
		}
		if (currentSeries.length === 0 || currentSeries[0].points.length === 0) return;

		void loadArchetypeImages(currentSeries.map((s) => s.name));

		const visibleSeries = currentSeries.filter((s) => !hiddenSeries.has(s.name));
		const labels = currentSeries[0].points.map((p) => p.label);
		const maxShare = visibleSeries.length > 0
			? Math.max(...visibleSeries.flatMap((s) => s.points.map((p) => (p.share ?? 0) * 100)))
			: 10;
		const yMax = Math.ceil(maxShare) + 2;

		chart = new Chart(canvas, {
			type: 'line',
			data: {
				labels,
				datasets: currentSeries.map((s, i) => {
					const isOther = s.name === 'Other';
					const color = isOther ? OTHER_COLOR : COLORS[i % COLORS.length];
					const hidden = hiddenSeries.has(s.name);
					return {
						label: s.name,
						archetypeName: s.name,
						baseColor: color,
						data: hidden ? s.points.map(() => null) : s.points.map((p) => (p.share === null ? null : p.share * 100)),
						pointRadius: hidden ? 0 : s.points.map((p) => (p.share ? 10 : 0)),
						pointHoverRadius: hidden ? 0 : s.points.map((p) => (p.share ? 12 : 0)),
						spanGaps: true,
						pointBackgroundColor: `${color}bb`,
						pointBorderColor: color,
						pointBorderWidth: 2,
						borderColor: color,
						borderWidth: hidden ? 0 : 2,
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
							// Scryfall imagery guideline: art crops must credit the artist
							footer: (items) => {
								const archName = (items[0]?.dataset as unknown as Record<string, unknown>)
									?.archetypeName as string | undefined;
								const cardName = archName ? archetypeCardMap.get(archName) : undefined;
								const artist = cardName
									? lookupCardImage($cardImageIndex, cardName)?.artist
									: undefined;
								return artist ? `Art: ${artist} © Wizards of the Coast` : '';
							},
						},
						footerFont: { weight: 'normal', size: 10 },
					},
				},
			},
			plugins: [hoverHighlightPlugin, cardArtPlugin],
		});
	}

	onMount(() => buildChart(series));
	onDestroy(() => {
		chart?.destroy();
		// Null out so in-flight image onload callbacks don't update a destroyed chart
		chart = null;
	});

	$effect(() => {
		const s = series;
		void hiddenSeries;
		if (canvas) buildChart(s);
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

	<span class="separator"></span>

	<span class="label" title="Field shows all players. Winners shows only the top finishers.">View:</span>
	<button
		type="button"
		class="period-btn"
		class:active={!$settings.winnersMode}
		onclick={() => ($settings.winnersMode = false)}
		title="Metagame share across all tournament participants"
	>Field</button>
	<button
		type="button"
		class="period-btn"
		class:active={$settings.winnersMode}
		onclick={() => ($settings.winnersMode = true)}
		title="Metagame share among top finishers only"
	>Winners</button>

	{#if $settings.winnersMode}
		<select
			class="cutoff-select"
			value={$settings.winnersCutoff}
			onchange={(e) => ($settings.winnersCutoff = Number(e.currentTarget.value))}
		>
			{#each [0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50] as pct}
				<option value={pct}>{Math.round(pct * 100)}%</option>
			{/each}
		</select>
	{/if}
</div>

<div class="chart-container">
	{#if $settings.winnersMode}
		<span class="chart-subtitle">Top {Math.round($settings.winnersCutoff * 100)}%</span>
	{/if}
	<canvas bind:this={canvas} data-testid="evolution-canvas"></canvas>
</div>

<div class="legend">
	{#each series as s, i}
		{@const art = lookupCardImage($cardImageIndex, archetypeCardMap.get(s.name) ?? '')}
		<button
			type="button"
			class="legend-item"
			class:legend-hidden={hiddenSeries.has(s.name)}
			onclick={() => toggleSeries(s.name)}
		>
			{#if art}
				<!-- crossorigin keeps the browser cache coherent with the CORS-mode
				     plugin loads of the same URL (else Chrome blocks the second use) -->
				<img class="legend-art" crossorigin="anonymous" src={art.art_crop} alt={s.name} />
			{:else}
				<span
					class="dot"
					style="background: {s.name === 'Other' ? OTHER_COLOR : COLORS[i % COLORS.length]}"
				></span>
			{/if}
			{s.name}
		</button>
	{/each}
	{#if evolutionResult.incompleteData && $settings.winnersMode}
		<span class="legend-warning">
			⚠ Some tournaments have incomplete data for this cutoff
		</span>
	{/if}
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
		cursor: pointer;
		background: none;
		border: none;
		padding: 0.1rem 0.3rem;
		border-radius: 4px;
		font: inherit;
		font-size: 0.8rem;
		color: inherit;
		transition: opacity 0.15s;
	}

	.legend-item:hover {
		background: var(--color-hover, rgba(0, 0, 0, 0.05));
	}

	.legend-hidden {
		opacity: 0.4;
		filter: grayscale(1);
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

	.separator {
		width: 1px;
		height: 1.2rem;
		background: var(--color-border);
		margin: 0 0.4rem;
	}

	.cutoff-select {
		padding: 0.15rem 0.4rem;
		border-radius: 9999px;
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		font-size: 0.8rem;
		color: var(--color-text);
		cursor: pointer;
	}

	.chart-subtitle {
		display: block;
		font-size: 0.8rem;
		color: var(--color-text-muted);
		margin-bottom: 0.5rem;
	}

	.legend-warning {
		font-size: 0.75rem;
		color: var(--color-warning, #b45309);
		font-style: italic;
	}
</style>
