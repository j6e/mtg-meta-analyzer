<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		Chart,
		BubbleController,
		LinearScale,
		PointElement,
		Tooltip,
		Legend,
	} from 'chart.js';
	import type { ArchetypeStats } from '../types/metagame';
	import { archetypeCardMap } from '../stores/tournaments';
	import { getScryfallImageUrl } from '../utils/card-normalizer';

	Chart.register(BubbleController, LinearScale, PointElement, Tooltip, Legend);

	let { stats }: { stats: ArchetypeStats[] } = $props();

	let canvas: HTMLCanvasElement;
	let chart: Chart | null = null;

	/** Loaded card art images keyed by archetype name. */
	const loadedImages = new Map<string, HTMLImageElement>();

	const COLORS = [
		'#2563eb', '#e11d48', '#16a34a', '#ea580c', '#7c3aed',
		'#0891b2', '#ca8a04', '#be185d', '#059669', '#d97706',
		'#6366f1', '#dc2626', '#65a30d', '#0d9488', '#a855f7',
	];

	/** Load art_crop images for all archetypes that have a signature card. */
	function loadArchetypeImages(archetypeNames: string[]) {
		for (const name of archetypeNames) {
			if (loadedImages.has(name)) continue;
			const cardName = archetypeCardMap.get(name);
			if (!cardName) continue;

			const img = new Image();
			img.onload = () => {
				loadedImages.set(name, img);
				// Re-render chart to show the newly loaded image
				if (chart) chart.update('none');
			};
			img.src = getScryfallImageUrl(cardName, 'art_crop');
		}
	}

	/** Reference line plugin: draws a horizontal dashed line at 50% winrate. */
	const refLinePlugin = {
		id: 'refLine',
		afterDraw(chart: Chart) {
			const yScale = chart.scales.y;
			const ctx = chart.ctx;
			const y = yScale.getPixelForValue(50);
			ctx.save();
			ctx.strokeStyle = '#9ca3af';
			ctx.lineWidth = 1;
			ctx.setLineDash([6, 4]);
			ctx.beginPath();
			ctx.moveTo(chart.chartArea.left, y);
			ctx.lineTo(chart.chartArea.right, y);
			ctx.stroke();
			ctx.restore();
		},
	};

	/** Card art plugin: draws circular-cropped card art over each bubble. */
	const cardArtPlugin = {
		id: 'cardArt',
		afterDatasetsDraw(chart: Chart) {
			const ctx = chart.ctx;
			for (let dsIndex = 0; dsIndex < chart.data.datasets.length; dsIndex++) {
				const ds = chart.data.datasets[dsIndex] as any;
				const archName = ds.label as string;
				const img = loadedImages.get(archName);
				if (!img) continue;

				const meta = chart.getDatasetMeta(dsIndex);
				for (let ptIndex = 0; ptIndex < meta.data.length; ptIndex++) {
					const element = meta.data[ptIndex] as any;
					const { x, y } = element;
					// Bubble radius from the resolved element (Chart.js PointElement)
					const r = element.options?.pointRadius ?? element.options?.radius ?? element.radius ?? ds.data[ptIndex]?.r ?? 10;

					ctx.save();

					// Clip to circle
					ctx.beginPath();
					ctx.arc(x, y, r, 0, Math.PI * 2);
					ctx.closePath();
					ctx.clip();

					// Draw art_crop (landscape 626×457) — take centered square crop
					const imgW = img.naturalWidth;
					const imgH = img.naturalHeight;
					const cropSize = Math.min(imgW, imgH);
					const sx = (imgW - cropSize) / 2;
					const sy = (imgH - cropSize) / 2;

					ctx.drawImage(img, sx, sy, cropSize, cropSize, x - r, y - r, r * 2, r * 2);

					ctx.restore();

					// Draw border ring
					ctx.save();
					ctx.beginPath();
					ctx.arc(x, y, r, 0, Math.PI * 2);
					ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
					ctx.lineWidth = 2;
					ctx.stroke();
					ctx.restore();
				}
			}
		},
	};

	function buildChart() {
		if (chart) chart.destroy();

		const filtered = stats.filter((s) => s.name !== 'Unknown' && s.totalMatches > 0);
		if (filtered.length === 0) return;

		// Start loading images for all visible archetypes
		loadArchetypeImages(filtered.map((s) => s.name));

		const maxMatches = Math.max(...filtered.map((s) => s.totalMatches), 1);

		const data = filtered.map((s, i) => ({
			x: s.metagameShare * 100,
			y: s.overallWinrate * 100,
			r: 6 + (s.totalMatches / maxMatches) * 20,
			label: s.name,
			raw: s,
		}));

		chart = new Chart(canvas, {
			type: 'bubble',
			data: {
				datasets: data.map((d, i) => {
					return {
						label: d.label,
						data: [{ x: d.x, y: d.y, r: d.r }],
						// Colored fill always — card art plugin draws on top when image loads
						backgroundColor: COLORS[i % COLORS.length] + 'bb',
						borderColor: COLORS[i % COLORS.length],
						borderWidth: 2,
						hoverBorderWidth: 3,
						hoverBorderColor: '#fff',
						// Store archetype stats for tooltip
						metadata: d.raw,
					};
				}),
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				scales: {
					x: {
						title: { display: true, text: 'Metagame Share (%)', font: { size: 13 } },
						min: 0,
						ticks: { callback: (v) => v + '%' },
						grid: { color: '#f0f0f0' },
					},
					y: {
						title: { display: true, text: 'Win Rate (%)', font: { size: 13 } },
						min: Math.max(0, Math.floor(Math.min(...data.map((d) => d.y)) / 5) * 5 - 5),
						max: Math.min(100, Math.ceil(Math.max(...data.map((d) => d.y)) / 5) * 5 + 5),
						ticks: {
							callback: (v) => v + '%',
							stepSize: 5,
						},
						grid: { color: '#f0f0f0' },
					},
				},
				plugins: {
					legend: { display: false },
					tooltip: {
						callbacks: {
							label(ctx) {
								const ds = ctx.dataset as any;
								const s = ds.metadata as ArchetypeStats;
								return [
									ds.label,
									`Share: ${(s.metagameShare * 100).toFixed(1)}%`,
									`Win rate: ${(s.overallWinrate * 100).toFixed(1)}%`,
									`Players: ${s.playerCount}`,
									`Matches: ${s.totalMatches}`,
								];
							},
						},
					},
				},
			},
			plugins: [refLinePlugin, cardArtPlugin],
		});
	}

	onMount(() => {
		buildChart();
	});

	onDestroy(() => {
		chart?.destroy();
	});

	// Rebuild chart when stats change
	$effect(() => {
		// Read stats to track the dependency
		void stats.length;
		if (canvas) buildChart();
	});
</script>

<div class="chart-container">
	<canvas bind:this={canvas} data-testid="scatter-canvas"></canvas>
</div>

<div class="legend">
	{#each stats.filter((s) => s.name !== 'Unknown' && s.totalMatches > 0) as s, i}
		<span class="legend-item">
			{#if archetypeCardMap.has(s.name)}
				<img
					class="legend-art"
					src={getScryfallImageUrl(archetypeCardMap.get(s.name)!, 'art_crop')}
					alt={s.name}
				/>
			{:else}
				<span class="dot" style="background: {COLORS[i % COLORS.length]}"></span>
			{/if}
			{s.name}
		</span>
	{/each}
</div>

<style>
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
