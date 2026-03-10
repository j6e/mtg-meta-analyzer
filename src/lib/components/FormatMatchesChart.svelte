<script lang="ts">
import type { TournamentListEntry } from '$lib/stores/tournaments';

let {
	tournaments,
	format,
	dateFrom,
	dateTo,
	selectedIds,
}: {
	tournaments: TournamentListEntry[];
	format: string;
	dateFrom: string;
	dateTo: string;
	selectedIds: string[];
} = $props();

const BAR_MAX_HEIGHT = 160;

interface FormatBar {
	format: string;
	totalMatches: number;
	selectedMatches: number;
	isActive: boolean;
}

const dateFiltered = $derived(
	tournaments.filter(
		(t) =>
			(!dateFrom || t.date >= dateFrom) &&
			(!dateTo || t.date <= dateTo),
	),
);

const formatData = $derived.by((): FormatBar[] => {
	const map = new Map<string, { total: number; selected: number }>();

	const idSet = new Set(selectedIds);

	for (const t of dateFiltered) {
		for (const f of t.formats) {
			const entry = map.get(f) ?? { total: 0, selected: 0 };
			entry.total += t.matchCount;
			if (f === format && idSet.has(t.id)) {
				entry.selected += t.matchCount;
			}
			map.set(f, entry);
		}
	}

	return [...map.entries()]
		.map(([f, { total, selected }]) => ({
			format: f,
			totalMatches: total,
			selectedMatches: f === format ? selected : total,
			isActive: f === format,
		}))
		.sort((a, b) => b.totalMatches - a.totalMatches);
});

const maxMatches = $derived(
	Math.max(...formatData.map((d) => d.totalMatches), 0),
);

const hasExcluded = $derived(
	formatData.some((d) => d.isActive && d.selectedMatches < d.totalMatches),
);

function barHeight(matches: number): number {
	if (maxMatches === 0) return 0;
	return (matches / maxMatches) * BAR_MAX_HEIGHT;
}
</script>

{#if formatData.length === 0}
	<p class="empty">No tournament data for this period.</p>
{:else}
	<div class="chart-container">
		<div class="chart-title">Matches by Format</div>
		<div class="bars">
			{#each formatData as fd}
				<div class="bar-col">
					<div class="bar-area" style="height: {BAR_MAX_HEIGHT}px">
						{#if fd.isActive && fd.selectedMatches < fd.totalMatches}
							<div
								class="bar bar-excluded"
								style="height: {barHeight(fd.totalMatches)}px"
							></div>
							<div
								class="bar bar-selected"
								style="height: {barHeight(fd.selectedMatches)}px"
							></div>
						{:else if fd.isActive}
							<div
								class="bar bar-active"
								style="height: {barHeight(fd.totalMatches)}px"
							></div>
						{:else}
							<div
								class="bar bar-inactive"
								style="height: {barHeight(fd.totalMatches)}px"
							></div>
						{/if}
					</div>
					<div class="bar-label" class:active={fd.isActive}>{fd.format}</div>
					<div class="bar-count">{fd.totalMatches.toLocaleString()}</div>
				</div>
			{/each}
		</div>
		{#if hasExcluded}
			<div class="legend">
				<span class="legend-item"><span class="swatch swatch-selected"></span> Selected</span>
				<span class="legend-item"><span class="swatch swatch-excluded"></span> Excluded</span>
			</div>
		{/if}
	</div>
{/if}

<style>
	.chart-container {
		margin-bottom: 1.5rem;
		padding: 1rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
	}

	.chart-title {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		margin-bottom: 0.75rem;
	}

	.bars {
		display: flex;
		justify-content: center;
		gap: 1rem;
	}

	.bar-col {
		display: flex;
		flex-direction: column;
		align-items: center;
		min-width: 40px;
		max-width: 100px;
		flex: 1;
	}

	.bar-area {
		position: relative;
		width: 100%;
		display: flex;
		align-items: flex-end;
	}

	.bar {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		border-radius: 4px 4px 0 0;
		transition: height 0.3s ease;
	}

	.bar-active {
		background: var(--color-accent);
	}

	.bar-selected {
		background: var(--color-accent);
		z-index: 1;
	}

	.bar-excluded {
		background: repeating-linear-gradient(
			45deg,
			var(--color-accent) 0,
			var(--color-accent) 3px,
			transparent 3px,
			transparent 6px
		);
		opacity: 0.35;
	}

	.bar-inactive {
		background: var(--color-accent);
		opacity: 0.4;
	}

	.bar-label {
		margin-top: 0.5rem;
		font-size: 0.75rem;
		color: var(--color-text-muted);
		white-space: nowrap;
	}

	.bar-label.active {
		color: var(--color-text);
		font-weight: 600;
	}

	.bar-count {
		font-size: 0.7rem;
		color: var(--color-text-muted);
		font-variant-numeric: tabular-nums;
	}

	.legend {
		display: flex;
		gap: 1rem;
		justify-content: center;
		margin-top: 0.75rem;
		font-size: 0.7rem;
		color: var(--color-text-muted);
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}

	.swatch {
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: 2px;
	}

	.swatch-selected {
		background: var(--color-accent);
	}

	.swatch-excluded {
		background: repeating-linear-gradient(
			45deg,
			var(--color-accent) 0,
			var(--color-accent) 2px,
			transparent 2px,
			transparent 4px
		);
		opacity: 0.35;
	}

	.empty {
		color: var(--color-text-muted);
		font-size: 0.85rem;
	}
</style>
