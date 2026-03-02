<script lang="ts">
	import { base } from '$app/paths';
	import type { AttributionMatrix } from '../types/metagame';

	let { matrix }: { matrix: AttributionMatrix } = $props();

	let hoveredRow = $state(-1);
	let hoveredCol = $state(-1);

	// Tooltip state
	let tooltipVisible = $state(false);
	let tooltipX = $state(0);
	let tooltipY = $state(0);
	let tooltipData: {
		count: number;
		classified: string;
		reported: string;
		rowTotal: number;
		colTotal: number;
	} | null = $state(null);
	let hoverTimer: ReturnType<typeof setTimeout> | null = null;

	/** Single-hue intensity scale: indigo at varying opacity. */
	function countColor(count: number, max: number): string {
		if (count === 0 || max === 0) return 'transparent';
		const intensity = count / max;
		const alpha = 0.08 + 0.72 * intensity;
		return `rgba(79, 70, 229, ${alpha.toFixed(2)})`;
	}

	/** Use white text on dark cells for readability. */
	function textColor(count: number, max: number): string {
		if (max === 0) return '';
		return count / max > 0.5 ? 'color: #fff' : '';
	}

	function pct(n: number, total: number): string {
		if (total === 0) return '0.0%';
		return ((n / total) * 100).toFixed(1) + '%';
	}

	function updateTooltipPosition(e: MouseEvent) {
		const padding = 12;
		const tooltipWidth = 220;
		const tooltipHeight = 140;

		let newX = e.clientX + padding;
		let newY = e.clientY + padding;

		if (newX + tooltipWidth > window.innerWidth) {
			newX = e.clientX - tooltipWidth - padding;
		}
		if (newY + tooltipHeight > window.innerHeight) {
			newY = e.clientY - tooltipHeight - padding;
		}

		tooltipX = Math.max(0, newX);
		tooltipY = Math.max(0, newY);
	}

	function startCellHover(e: MouseEvent, i: number, j: number) {
		hoveredRow = i;
		hoveredCol = j;
		clearTooltipTimer();
		const count = matrix.cells[i][j];
		if (count === 0) return;
		updateTooltipPosition(e);
		hoverTimer = setTimeout(() => {
			tooltipData = {
				count,
				classified: matrix.classifiedArchetypes[i],
				reported: matrix.reportedArchetypes[j],
				rowTotal: matrix.rowTotals[i],
				colTotal: matrix.colTotals[j],
			};
			tooltipVisible = true;
		}, 300);
	}

	function handleMouseMove(e: MouseEvent) {
		if (tooltipVisible) updateTooltipPosition(e);
	}

	function clearTooltipTimer() {
		if (hoverTimer) {
			clearTimeout(hoverTimer);
			hoverTimer = null;
		}
		tooltipVisible = false;
		tooltipData = null;
	}

	function endHover() {
		hoveredRow = -1;
		hoveredCol = -1;
		clearTooltipTimer();
	}
</script>

<div class="matrix-wrapper">
	<table class="attribution-matrix" role="grid">
		<thead>
			<tr>
				<th class="corner-cell">
					<span class="corner-classified">Classified</span>
					<span class="corner-reported">Reported</span>
				</th>
				{#each matrix.reportedArchetypes as colName, j}
					<th
						class="col-header"
						class:highlight-col={hoveredCol === j}
					>
						<div class="header-content">{colName}</div>
					</th>
				{/each}
				<th class="col-header total-col-header">
					<div class="header-content">Total</div>
				</th>
			</tr>
		</thead>
		<tbody>
			{#each matrix.classifiedArchetypes as rowName, i}
				<tr>
					<th
						class="row-header"
						class:highlight-row={hoveredRow === i}
					>
						{rowName}
					</th>
					{#each matrix.cells[i] as count, j}
						{@const isAgreement = rowName === matrix.reportedArchetypes[j]}
						<td
							class="cell"
							class:agreement={isAgreement && count > 0}
							class:highlight-row={hoveredRow === i}
							class:highlight-col={hoveredCol === j}
							class:highlight-cross={hoveredRow === i && hoveredCol === j}
							style="{count > 0 ? `background-color: ${countColor(count, matrix.maxCount)};` : ''}{textColor(count, matrix.maxCount)}"
							onmouseenter={(e) => startCellHover(e, i, j)}
							onmousemove={handleMouseMove}
							onmouseleave={endHover}
							role="gridcell"
							data-testid="attr-cell-{i}-{j}"
						>
							{#if count > 0}
								<a
									href="{base}/archetype-cleaner/attribution?classified={encodeURIComponent(rowName)}&reported={encodeURIComponent(matrix.reportedArchetypes[j])}"
									class="cell-link"
								>
									<span class="count">{count}</span>
								</a>
							{:else}
								<span class="no-data">&mdash;</span>
							{/if}
						</td>
					{/each}
					<td class="cell total-cell" class:highlight-row={hoveredRow === i}>
						<span class="count total">{matrix.rowTotals[i]}</span>
					</td>
				</tr>
			{/each}
			<tr class="totals-row">
				<th class="row-header total-row-header">Total</th>
				{#each matrix.colTotals as colTotal, j}
					<td class="cell total-cell" class:highlight-col={hoveredCol === j}>
						<span class="count total">{colTotal}</span>
					</td>
				{/each}
				<td class="cell total-cell grand-total">
					<span class="count total">{matrix.grandTotal}</span>
				</td>
			</tr>
		</tbody>
	</table>
</div>

<p class="legend">Cells with amber borders indicate agreement between classification and self-report.</p>

{#if tooltipVisible && tooltipData}
	<div class="attribution-tooltip" style="left: {tooltipX}px; top: {tooltipY}px;" role="tooltip">
		<div class="tooltip-grid">
			<span class="tooltip-label">Classified</span><span class="tooltip-value">{tooltipData.classified}</span>
			<span class="tooltip-label">Reported</span><span class="tooltip-value">{tooltipData.reported}</span>
			<span class="tooltip-label">Count</span><span class="tooltip-value">{tooltipData.count}</span>
			<span class="tooltip-label">% of row</span><span class="tooltip-value">{pct(tooltipData.count, tooltipData.rowTotal)}</span>
			<span class="tooltip-label">% of col</span><span class="tooltip-value">{pct(tooltipData.count, tooltipData.colTotal)}</span>
		</div>
	</div>
{/if}

<style>
	.matrix-wrapper {
		overflow-x: auto;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
	}

	.attribution-matrix {
		border-collapse: separate;
		border-spacing: 0;
		width: max-content;
		font-size: 0.8rem;
	}

	/* Sticky header row */
	thead th {
		position: sticky;
		top: 0;
		z-index: 2;
		background: var(--color-header-bg);
		color: var(--color-header-text);
	}

	/* Sticky first column */
	.row-header,
	.corner-cell {
		position: sticky;
		left: 0;
		z-index: 1;
		background: var(--color-surface);
	}

	/* Corner cell overlaps both sticky axes */
	.corner-cell {
		z-index: 3;
		background: var(--color-header-bg);
		position: sticky;
		top: 0;
		left: 0;
		min-width: 5rem;
	}

	.corner-classified,
	.corner-reported {
		display: block;
		font-size: 0.65rem;
		font-weight: 400;
		opacity: 0.7;
	}

	.col-header {
		padding: 0.25rem;
		font-weight: 600;
		font-size: 0.75rem;
		border-bottom: 2px solid rgba(255, 255, 255, 0.1);
		height: 9rem;
		vertical-align: bottom;
		min-width: 2.5rem;
	}

	.header-content {
		writing-mode: vertical-rl;
		transform: rotate(180deg);
		white-space: nowrap;
		margin: 0 auto;
	}

	.total-col-header {
		border-left: 2px solid rgba(255, 255, 255, 0.2);
		background: #212140;
	}

	.row-header {
		padding: 0.5rem 0.75rem;
		text-align: left;
		font-weight: 600;
		font-size: 0.8rem;
		white-space: nowrap;
		border-right: 2px solid var(--color-border);
	}

	.total-row-header {
		border-top: 2px solid var(--color-border);
	}

	.cell {
		padding: 0.25rem 0.5rem;
		text-align: center;
		border: 1px solid rgba(0, 0, 0, 0.06);
		cursor: default;
		transition: outline 0.1s;
		vertical-align: middle;
		line-height: 1.3;
		font-variant-numeric: tabular-nums;
	}

	.count {
		font-weight: 600;
		font-size: 0.8rem;
	}

	.count.total {
		color: var(--color-text);
	}

	.cell-link {
		display: block;
		text-decoration: none;
		color: inherit;
	}

	.no-data {
		color: var(--color-text-muted);
	}

	/* Agreement cells: classified name matches reported name */
	.cell.agreement {
		outline: 2px solid #d97706;
		outline-offset: -2px;
		z-index: 1;
	}

	/* Total cells */
	.total-cell {
		background: var(--color-bg);
	}

	.totals-row .cell {
		border-top: 2px solid var(--color-border);
	}

	.grand-total {
		font-weight: 700;
		border-left: 2px solid var(--color-border);
	}

	/* Hover highlighting */
	.highlight-row {
		outline: none;
	}

	.cell.highlight-row,
	.cell.highlight-col {
		outline: 2px solid rgba(79, 70, 229, 0.25);
		outline-offset: -2px;
	}

	.cell.highlight-cross {
		outline: 2px solid var(--color-accent);
		outline-offset: -2px;
	}

	th.highlight-row {
		background: var(--color-bg);
	}

	th.highlight-col {
		background: var(--color-accent);
		color: #fff;
	}

	/* Legend */
	.legend {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin-top: 0.5rem;
	}

	/* Tooltip */
	.attribution-tooltip {
		position: fixed;
		z-index: 1000;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		padding: 0.5rem 0.65rem;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
		pointer-events: none;
		font-size: 0.75rem;
	}

	.tooltip-grid {
		display: grid;
		grid-template-columns: auto auto;
		gap: 0.15rem 0.75rem;
	}

	.tooltip-label {
		color: var(--color-text-muted);
	}

	.tooltip-value {
		text-align: right;
		font-weight: 600;
		color: var(--color-text);
	}
</style>
