<script lang="ts">
	import type { MatchupMatrix, ArchetypeStats } from '../types/metagame';

	let { matrix, stats = [] }: { matrix: MatchupMatrix; stats?: ArchetypeStats[] } = $props();

	let hoveredRow = $state(-1);
	let hoveredCol = $state(-1);

	/** Color gradient: red (0%) → white (50%) → green (100%). */
	function winrateColor(wr: number): string {
		if (wr < 0.5) {
			// Red to white: 0% → 50%
			const t = wr / 0.5;
			const r = 220;
			const g = Math.round(80 + t * 175);
			const b = Math.round(80 + t * 175);
			return `rgb(${r}, ${g}, ${b})`;
		} else {
			// White to green: 50% → 100%
			const t = (wr - 0.5) / 0.5;
			const r = Math.round(255 - t * 175);
			const g = Math.round(255 - t * 30);
			const b = Math.round(255 - t * 175);
			return `rgb(${r}, ${g}, ${b})`;
		}
	}

	function formatWinrate(wr: number | null): string {
		if (wr === null) return '—';
		return (wr * 100).toFixed(1) + '%';
	}

	function getStatForArchetype(name: string): ArchetypeStats | undefined {
		return stats.find((s) => s.name === name);
	}
</script>

<div class="matrix-wrapper">
	<table class="matchup-matrix" role="grid">
		<thead>
			<tr>
				<th class="corner-cell"></th>
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
						<span class="archetype-name">{rowName}</span>
						{#if getStatForArchetype(rowName)}
							{@const s = getStatForArchetype(rowName)!}
							<span class="meta-share">{(s.metagameShare * 100).toFixed(1)}%</span>
						{/if}
					</th>
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
							onmouseenter={() => { hoveredRow = i; hoveredCol = j; }}
							onmouseleave={() => { hoveredRow = -1; hoveredCol = -1; }}
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
	}

	.row-header {
		padding: 0.5rem 0.75rem;
		text-align: left;
		font-weight: 600;
		font-size: 0.8rem;
		white-space: nowrap;
		border-right: 2px solid var(--color-border);
	}

	.archetype-name {
		display: inline;
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
		background: rgba(255, 255, 255, 0.15);
	}
</style>
