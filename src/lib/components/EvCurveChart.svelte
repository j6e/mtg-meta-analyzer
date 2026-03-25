<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		Chart,
		LineController,
		LineElement,
		LinearScale,
		PointElement,
		Tooltip,
		Legend,
		Filler,
	} from 'chart.js';
	import type { ParsedEvent, ValuationParams } from '../algorithms/ev-calculator';
	import { evCurve, breakEvenWinRate, outcomeBounds } from '../algorithms/ev-calculator';

	Chart.register(LineController, LineElement, LinearScale, PointElement, Tooltip, Legend, Filler);

	let {
		event,
		valuation,
		minWinRate = 0.3,
		maxWinRate = 0.8,
		currencySymbol = '€',
		nRuns = 1,
	}: {
		event: ParsedEvent;
		valuation: ValuationParams;
		minWinRate?: number;
		maxWinRate?: number;
		currencySymbol?: string;
		nRuns?: number;
	} = $props();

	let canvas: HTMLCanvasElement;
	let chart: Chart | null = null;

	const curveData = $derived(evCurve(event, valuation, [minWinRate, maxWinRate], 200));
	const breakEven = $derived(breakEvenWinRate(event, valuation));
	const bounds = $derived(outcomeBounds(event, valuation));

	/** Custom plugin: horizontal dashed line at y=0. */
	const zeroLinePlugin = {
		id: 'zeroLine',
		afterDraw(chart: Chart) {
			const yScale = chart.scales.y;
			const ctx = chart.ctx;
			const y = yScale.getPixelForValue(0);
			if (y < chart.chartArea.top || y > chart.chartArea.bottom) return;
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

	/** Custom plugin: vertical dashed line at break-even winrate. */
	const breakEvenPlugin = {
		id: 'breakEvenLine',
		afterDraw(ch: Chart) {
			if (breakEven == null) return;
			const pct = breakEven * 100;
			const xScale = ch.scales.x;
			const x = xScale.getPixelForValue(pct);
			if (x < ch.chartArea.left || x > ch.chartArea.right) return;

			const ctx = ch.ctx;
			ctx.save();

			ctx.strokeStyle = '#4f46e5';
			ctx.lineWidth = 1.5;
			ctx.setLineDash([4, 3]);
			ctx.beginPath();
			ctx.moveTo(x, ch.chartArea.top);
			ctx.lineTo(x, ch.chartArea.bottom);
			ctx.stroke();

			ctx.setLineDash([]);
			ctx.fillStyle = '#4f46e5';
			ctx.font = '600 11px system-ui, sans-serif';
			ctx.textAlign = 'left';
			ctx.fillText(`Break-even: ${pct.toFixed(1)}%`, x + 6, ch.chartArea.top + 14);

			ctx.restore();
		},
	};

	function buildChart() {
		if (!canvas) return;

		const n = Math.max(1, nRuns);
		const sqrtN = Math.sqrt(n);
		const evPoints = curveData.map(d => ({ x: d.winRate * 100, y: d.ev * n }));
		// Total EV ± total SD: N*EV ± √N*SD, clamped to possible outcome range
		const totalMin = bounds.minNet * n;
		const totalMax = bounds.maxNet * n;
		const upperBandTotal = curveData.map(d => ({
			x: d.winRate * 100,
			y: Math.min(d.ev * n + d.stdDev * sqrtN, totalMax),
		}));
		const lowerBandTotal = curveData.map(d => ({
			x: d.winRate * 100,
			y: Math.max(d.ev * n - d.stdDev * sqrtN, totalMin),
		}));

		if (chart) {
			chart.data.datasets[0].data = evPoints;
			chart.data.datasets[1].data = upperBandTotal;
			chart.data.datasets[2].data = lowerBandTotal;
			chart.options.scales!.x!.min = minWinRate * 100;
			chart.options.scales!.x!.max = maxWinRate * 100;
			(chart.options.scales!.y!.title as any).text = n > 1
				? `Total EV over ${n} runs (${currencySymbol})`
				: `Expected Value (${currencySymbol})`;
			chart.update('none');
			return;
		}

		chart = new Chart(canvas, {
			type: 'line',
			data: {
				datasets: [
					{
						label: 'Expected Value',
						data: evPoints,
						borderColor: '#4f46e5',
						backgroundColor: 'rgba(79, 70, 229, 0.08)',
						borderWidth: 2,
						pointRadius: 0,
						pointHitRadius: 8,
						fill: false,
						tension: 0.2,
					},
					{
						label: '+1 Std Dev',
						data: upperBandTotal,
						borderColor: 'rgba(79, 70, 229, 0.25)',
						backgroundColor: 'rgba(79, 70, 229, 0.08)',
						borderWidth: 1,
						borderDash: [3, 3],
						pointRadius: 0,
						pointHitRadius: 0,
						fill: '+1',
						tension: 0.2,
					},
					{
						label: '-1 Std Dev',
						data: lowerBandTotal,
						borderColor: 'rgba(79, 70, 229, 0.25)',
						borderWidth: 1,
						borderDash: [3, 3],
						pointRadius: 0,
						pointHitRadius: 0,
						fill: false,
						tension: 0.2,
					},
				],
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				animation: false,
				interaction: {
					mode: 'nearest',
					axis: 'x',
					intersect: false,
				},
				scales: {
					x: {
						type: 'linear',
						min: minWinRate * 100,
						max: maxWinRate * 100,
						title: {
							display: true,
							text: 'Win Rate (%)',
							font: { size: 12, weight: '500' },
						},
						ticks: {
							callback: (v) => `${v}%`,
							stepSize: 5,
						},
					},
					y: {
						title: {
							display: true,
							text: n > 1
								? `Total EV over ${n} runs (${currencySymbol})`
								: `Expected Value (${currencySymbol})`,
							font: { size: 12, weight: '500' },
						},
						ticks: {
							callback: (v) => `${currencySymbol}${v}`,
						},
					},
				},
				plugins: {
					tooltip: {
						filter: (item) => item.datasetIndex === 0,
						callbacks: {
							title: (items) => `Win Rate: ${(items[0].parsed.x).toFixed(1)}%`,
							label: (item) => {
								const idx = Math.round((item.parsed.x - minWinRate * 100) / ((maxWinRate - minWinRate) * 100) * 200);
								const point = curveData[Math.min(Math.max(0, idx), curveData.length - 1)];
								const totalEv = item.parsed.y;
								const totalSd = (point?.stdDev ?? 0) * sqrtN;
								const lines = [];
								if (n > 1) {
									lines.push(`Total EV (${n} runs): ${currencySymbol}${totalEv.toFixed(2)}`);
									lines.push(`Per-run EV: ${currencySymbol}${(totalEv / n).toFixed(2)}`);
									lines.push(`Total ±1 SD: ${currencySymbol}${totalSd.toFixed(2)}`);
								} else {
									lines.push(`EV: ${currencySymbol}${totalEv.toFixed(2)}`);
									lines.push(`±1 SD: ${currencySymbol}${totalSd.toFixed(2)}`);
								}
								return lines;
							},
						},
					},
					legend: {
						display: true,
						labels: {
							filter: (item) => item.text === 'Expected Value' || item.text === '±1 Std Dev',
							usePointStyle: true,
							pointStyle: 'line',
							font: { size: 11 },
							generateLabels: (chart) => {
								const evDs = chart.data.datasets[0];
								const bandDs = chart.data.datasets[1];
								return [
									{
										text: 'Expected Value',
										strokeStyle: evDs.borderColor as string,
										fillStyle: 'transparent',
										lineWidth: 2,
										lineDash: [],
										pointStyle: 'line',
										hidden: false,
										datasetIndex: 0,
									},
									{
										text: '±1 Std Dev',
										strokeStyle: bandDs.borderColor as string,
										fillStyle: bandDs.backgroundColor as string,
										lineWidth: 1,
										lineDash: [3, 3],
										pointStyle: 'line',
										hidden: false,
										datasetIndex: 1,
									},
								];
							},
						},
					},
				},
			},
			plugins: [zeroLinePlugin, breakEvenPlugin],
		});
	}

	onMount(() => {
		buildChart();
	});

	onDestroy(() => {
		chart?.destroy();
		chart = null;
	});

	$effect(() => {
		void curveData;
		void breakEven;
		void nRuns;
		if (chart) buildChart();
	});
</script>

<div class="ev-chart-wrapper">
	<h3>{nRuns > 1 ? `Expected Value over ${nRuns} Runs` : 'Expected Value vs Win Rate'}</h3>
	<div class="chart-container">
		<canvas bind:this={canvas}></canvas>
	</div>
</div>

<style>
	.ev-chart-wrapper {
		margin: 1.5rem 0;
	}

	.ev-chart-wrapper h3 {
		margin: 0 0 0.75rem;
		font-size: 1rem;
		font-weight: 600;
	}

	.chart-container {
		position: relative;
		height: 400px;
	}
</style>
