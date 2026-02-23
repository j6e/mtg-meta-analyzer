<script lang="ts">
	import { base } from '$app/paths';
	import type { MatchupMatrix, MatchupCell, ArchetypeStats } from '../types/metagame';
	import { exportElementAsImage } from '../utils/export-image';

	let { matrix, stats = [] }: { matrix: MatchupMatrix; stats?: ArchetypeStats[] } = $props();

	let matrixWrapper: HTMLDivElement;

	let hoveredRow = $state(-1);
	let hoveredCol = $state(-1);

	// Tooltip state
	let tooltipVisible = $state(false);
	let tooltipX = $state(0);
	let tooltipY = $state(0);
	let tooltipData: { cell?: MatchupCell; stat?: ArchetypeStats; isOverall: boolean } | null = $state(null);
	let hoverTimer: ReturnType<typeof setTimeout> | null = null;

	/** Color gradient: red (≤30%) → gray (48-52%) → green (≥70%). */
	function winrateColor(wr: number): string {
		const red: [number, number, number] = [220, 160, 160];
		const neutral: [number, number, number] = [245, 245, 245];
		const green: [number, number, number] = [160, 220, 165];

		let from: [number, number, number];
		let to: [number, number, number];
		let t: number;

		if (wr <= 0.30) {
			return `rgb(${red[0]}, ${red[1]}, ${red[2]})`;
		} else if (wr < 0.48) {
			t = (wr - 0.30) / 0.18;
			from = red; to = neutral;
		} else if (wr <= 0.52) {
			return `rgb(${neutral[0]}, ${neutral[1]}, ${neutral[2]})`;
		} else if (wr < 0.70) {
			t = (wr - 0.52) / 0.18;
			from = neutral; to = green;
		} else {
			return `rgb(${green[0]}, ${green[1]}, ${green[2]})`;
		}

		const r = Math.round(from[0] + t * (to[0] - from[0]));
		const g = Math.round(from[1] + t * (to[1] - from[1]));
		const b = Math.round(from[2] + t * (to[2] - from[2]));
		return `rgb(${r}, ${g}, ${b})`;
	}

	function formatWinrate(wr: number | null): string {
		if (wr === null) return '—';
		return (wr * 100).toFixed(1) + '%';
	}

	function getStatForArchetype(name: string): ArchetypeStats | undefined {
		return stats.find((s) => s.name === name);
	}

	function overallStyle(name: string): string {
		const s = getStatForArchetype(name);
		if (s && s.totalMatches > 0) {
			return `background-color: ${winrateColor(s.overallWinrate)}`;
		}
		return '';
	}

	/** Wilson score 95% CI bounds. */
	function wilsonCI(wins: number, total: number): [number, number] {
		if (total === 0) return [0, 0];
		const z = 1.96;
		const p = wins / total;
		const denom = 1 + z * z / total;
		const centre = p + z * z / (2 * total);
		const margin = z * Math.sqrt((p * (1 - p) + z * z / (4 * total)) / total);
		return [
			Math.max(0, (centre - margin) / denom),
			Math.min(1, (centre + margin) / denom),
		];
	}

	function formatCI(lo: number, hi: number): string {
		return `${(lo * 100).toFixed(1)}% – ${(hi * 100).toFixed(1)}%`;
	}

	function updateTooltipPosition(e: MouseEvent) {
		const padding = 12;
		const tooltipWidth = 200;
		const tooltipHeight = 160;

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

	function startCellHover(e: MouseEvent, cell: MatchupCell, row: number, col: number) {
		hoveredRow = row;
		hoveredCol = col;
		clearTooltipTimer();
		if (cell.total === 0 || row === col) return;
		updateTooltipPosition(e);
		hoverTimer = setTimeout(() => {
			tooltipData = { cell, isOverall: false };
			tooltipVisible = true;
		}, 300);
	}

	function startOverallHover(e: MouseEvent, archName: string, row: number) {
		hoveredRow = row;
		clearTooltipTimer();
		const s = getStatForArchetype(archName);
		if (!s || s.totalMatches === 0) return;
		updateTooltipPosition(e);
		hoverTimer = setTimeout(() => {
			tooltipData = { stat: s, isOverall: true };
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

<div class="matrix-wrapper" bind:this={matrixWrapper}>
	<table class="matchup-matrix" role="grid">
		<thead>
			<tr>
				<th class="corner-cell"></th>
				<th class="col-header overall-col-header">
					<div class="header-content">Overall</div>
				</th>
				{#each matrix.archetypes as colName, j}
					<th
						class="col-header"
						class:highlight-col={hoveredCol === j}
					>
						<div class="header-content">{colName}</div>
					</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each matrix.archetypes as rowName, i}
				<tr>
					<th
						class="row-header"
						class:highlight-row={hoveredRow === i}
					>
						<a href="{base}/archetypes/{encodeURIComponent(rowName)}" class="archetype-link">{rowName}</a>
						{#if getStatForArchetype(rowName)}
							{@const s = getStatForArchetype(rowName)!}
							<span class="meta-share">{(s.metagameShare * 100).toFixed(1)}%</span>
						{/if}
					</th>
					<td
						class="cell overall-cell"
						class:highlight-row={hoveredRow === i}
						style={overallStyle(rowName)}
						onmouseenter={(e) => startOverallHover(e, rowName, i)}
						onmousemove={handleMouseMove}
						onmouseleave={endHover}
					>
						{#if getStatForArchetype(rowName)?.totalMatches}
							{@const s = getStatForArchetype(rowName)!}
							<span class="winrate">{formatWinrate(s.overallWinrate)}</span>
							<span class="match-count">({s.totalMatches})</span>
						{:else}
							<span class="no-data">—</span>
						{/if}
					</td>
					{#each matrix.cells[i] as cell, j}
						{@const isMirror = i === j}
						<td
							class="cell"
							class:mirror={isMirror}
							class:highlight-row={hoveredRow === i}
							class:highlight-col={hoveredCol === j}
							class:highlight-cross={hoveredRow === i && hoveredCol === j}
							style={!isMirror && cell.winrate !== null
								? `background-color: ${winrateColor(cell.winrate)}`
								: ''}
							onmouseenter={(e) => startCellHover(e, cell, i, j)}
							onmousemove={handleMouseMove}
							onmouseleave={endHover}
							role="gridcell"
							data-testid="cell-{i}-{j}"
						>
							{#if isMirror}
								<span class="mirror-label">Mirror</span>
							{:else if cell.total === 0}
								<span class="no-data">—</span>
							{:else}
								<span class="winrate" class:low-sample={cell.total < 20}>{formatWinrate(cell.winrate)}</span>
								<span class="match-count" class:low-sample={cell.total < 20}>({cell.total})</span>
							{/if}
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<button class="export-btn" onclick={() => exportElementAsImage(matrixWrapper, 'matchup-matrix.png', {
	width: 'fit-content',
	overflow: 'visible',
})}>
	Export as image
</button>

{#if tooltipVisible && tooltipData}
	<div class="matchup-tooltip" style="left: {tooltipX}px; top: {tooltipY}px;" role="tooltip">
		{#if tooltipData.isOverall && tooltipData.stat}
			{@const s = tooltipData.stat}
			{@const [lo, hi] = wilsonCI(s.wins, s.totalMatches)}
			<div class="tooltip-grid">
				<span class="tooltip-label">Wins</span><span class="tooltip-value">{s.wins}</span>
				<span class="tooltip-label">Losses</span><span class="tooltip-value">{s.losses}</span>
				<span class="tooltip-label">Draws</span><span class="tooltip-value">{s.draws}</span>
				<span class="tooltip-label">Byes</span><span class="tooltip-value tooltip-excluded">{s.byes} excl.</span>
				<span class="tooltip-label">IDs</span><span class="tooltip-value tooltip-excluded">{s.intentionalDraws} excl.</span>
				<span class="tooltip-label">Winrate</span><span class="tooltip-value">{formatWinrate(s.overallWinrate)}</span>
				<span class="tooltip-label">95% CI</span><span class="tooltip-value">{formatCI(lo, hi)}</span>
			</div>
		{:else if tooltipData.cell}
			{@const c = tooltipData.cell}
			{@const [lo, hi] = wilsonCI(c.wins, c.total)}
			<div class="tooltip-grid">
				<span class="tooltip-label">Wins</span><span class="tooltip-value">{c.wins}</span>
				<span class="tooltip-label">Losses</span><span class="tooltip-value">{c.losses}</span>
				<span class="tooltip-label">Draws</span><span class="tooltip-value">{c.draws}</span>
				<span class="tooltip-label">IDs</span><span class="tooltip-value tooltip-excluded">{c.intentionalDraws} excl.</span>
				<span class="tooltip-label">Winrate</span><span class="tooltip-value">{formatWinrate(c.winrate)}</span>
				<span class="tooltip-label">95% CI</span><span class="tooltip-value">{formatCI(lo, hi)}</span>
			</div>
		{/if}
	</div>
{/if}

<style>
	.matrix-wrapper {
		overflow-x: auto;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
	}

	.matchup-matrix {
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

	.overall-col-header {
		border-right: 2px solid rgba(255, 255, 255, 0.2);
		background: #212140;
	}

	.overall-cell {
		border-right: 2px solid var(--color-border);
	}

	.row-header {
		padding: 0.5rem 0.75rem;
		text-align: left;
		font-weight: 600;
		font-size: 0.8rem;
		white-space: nowrap;
		border-right: 2px solid var(--color-border);
	}

	.archetype-link {
		color: inherit;
		text-decoration: none;
	}

	.archetype-link:hover {
		text-decoration: underline;
		color: var(--color-accent);
	}

	.meta-share {
		margin-left: 0.5rem;
		font-weight: 400;
		font-size: 0.7rem;
		color: var(--color-text-muted);
	}

	.cell {
		padding: 0.25rem 0.125rem;
		text-align: center;
		border: 1px solid rgba(0, 0, 0, 0.06);
		cursor: default;
		transition: outline 0.1s;
		vertical-align: middle;
		line-height: 1.3;
	}

	.winrate {
		display: block;
		font-weight: 600;
		font-size: 0.8rem;
		color: var(--color-text);
	}

	.match-count {
		display: block;
		font-size: 0.65rem;
		color: var(--color-text-muted);
	}

	.no-data {
		color: var(--color-text-muted);
	}

	/* Low sample size indicator (<20 matches) */
	.low-sample {
		opacity: 0.5;
		font-style: italic;
	}

	/* Mirror cells */
	.mirror {
		background: repeating-linear-gradient(
			-45deg,
			var(--color-bg),
			var(--color-bg) 4px,
			var(--color-border) 4px,
			var(--color-border) 5px
		);
	}

	.mirror-label {
		font-size: 0.65rem;
		color: var(--color-text-muted);
		font-style: italic;
	}

	/* Hover highlight */
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

	/* Tooltip */
	.matchup-tooltip {
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

	.tooltip-excluded {
		font-weight: 400;
		font-style: italic;
		color: var(--color-text-muted);
	}

	.export-btn {
		margin-top: 0.5rem;
		padding: 0.3rem 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		background: var(--color-surface);
		cursor: pointer;
		font-size: 0.8rem;
		color: var(--color-text);
	}

	.export-btn:hover {
		background: var(--color-bg);
	}
</style>
