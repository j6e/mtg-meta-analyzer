<script lang="ts">
	import type { DecklistInfo, CardEntry } from '../types/decklist';
	import CardTooltip from './CardTooltip.svelte';

	let {
		aggregateDecklist,
		selectedDecklist = null,
		aggregateLabel = 'Aggregate',
		selectedLabel = 'Selected',
	}: {
		aggregateDecklist: DecklistInfo;
		selectedDecklist?: DecklistInfo | null;
		aggregateLabel?: string;
		selectedLabel?: string;
	} = $props();

	interface DiffEntry {
		cardName: string;
		aggQty: number;
		selQty: number;
	}

	function buildDiff(aggCards: CardEntry[], selCards: CardEntry[]): DiffEntry[] {
		const map = new Map<string, { agg: number; sel: number }>();
		for (const c of aggCards) {
			const e = map.get(c.cardName) ?? { agg: 0, sel: 0 };
			e.agg += c.quantity;
			map.set(c.cardName, e);
		}
		for (const c of selCards) {
			const e = map.get(c.cardName) ?? { agg: 0, sel: 0 };
			e.sel += c.quantity;
			map.set(c.cardName, e);
		}

		return [...map.entries()]
			.map(([cardName, { agg, sel }]) => ({ cardName, aggQty: agg, selQty: sel }))
			.sort((a, b) => {
				// Sort by max qty desc, then name asc
				const maxA = Math.max(a.aggQty, a.selQty);
				const maxB = Math.max(b.aggQty, b.selQty);
				if (maxB !== maxA) return maxB - maxA;
				return a.cardName.localeCompare(b.cardName);
			});
	}

	const mainDiff = $derived(
		selectedDecklist
			? buildDiff(aggregateDecklist.mainboard, selectedDecklist.mainboard)
			: null,
	);

	const sideDiff = $derived(
		selectedDecklist
			? buildDiff(aggregateDecklist.sideboard, selectedDecklist.sideboard)
			: null,
	);

	function deltaClass(aggQty: number, selQty: number): string {
		if (aggQty > 0 && selQty === 0) return 'only-agg';
		if (selQty > 0 && aggQty === 0) return 'only-sel';
		if (aggQty !== selQty) return 'diff-qty';
		return '';
	}

	function formatDelta(aggQty: number, selQty: number): string {
		const d = selQty - aggQty;
		if (d > 0) return `+${d}`;
		if (d < 0) return `${d}`;
		return '';
	}
</script>

<div class="comparison">
	{#snippet diffTable(entries: DiffEntry[], showSel: boolean)}
		<table>
			<thead>
				<tr>
					<th class="name-col">Card</th>
					<th class="qty-col">{aggregateLabel}</th>
					{#if showSel}
						<th class="qty-col">{selectedLabel}</th>
						<th class="delta-col">Diff</th>
					{/if}
				</tr>
			</thead>
			<tbody>
				{#each entries as entry}
					<tr class={showSel ? deltaClass(entry.aggQty, entry.selQty) : ''}>
						<td class="name-col">
							<CardTooltip cardName={entry.cardName}>
								<span class="card-name">{entry.cardName}</span>
							</CardTooltip>
						</td>
						<td class="qty-col">{entry.aggQty || '—'}</td>
						{#if showSel}
							<td class="qty-col">{entry.selQty || '—'}</td>
							<td class="delta-col">
								{#if formatDelta(entry.aggQty, entry.selQty)}
									<span class="delta" class:positive={entry.selQty > entry.aggQty} class:negative={entry.selQty < entry.aggQty}>
										{formatDelta(entry.aggQty, entry.selQty)}
									</span>
								{/if}
							</td>
						{/if}
					</tr>
				{/each}
			</tbody>
		</table>
	{/snippet}

	{#if !selectedDecklist}
		<h4>Mainboard</h4>
		{@render diffTable(
			aggregateDecklist.mainboard.map((c) => ({ cardName: c.cardName, aggQty: c.quantity, selQty: 0 })),
			false,
		)}
		{#if aggregateDecklist.sideboard.length > 0}
			<h4>Sideboard</h4>
			{@render diffTable(
				aggregateDecklist.sideboard.map((c) => ({ cardName: c.cardName, aggQty: c.quantity, selQty: 0 })),
				false,
			)}
		{/if}
	{:else}
		{#if mainDiff && mainDiff.length > 0}
			<h4>Mainboard</h4>
			{@render diffTable(mainDiff, true)}
		{/if}

		{#if sideDiff && sideDiff.length > 0}
			<h4>Sideboard</h4>
			{@render diffTable(sideDiff, true)}
		{/if}
	{/if}
</div>

<style>
	.comparison {
		font-size: 0.85rem;
		max-width: 28rem;
	}

	h4 {
		font-size: 0.8rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--color-text-muted);
		margin: 1rem 0 0.35rem;
	}

	table {
		width: 100%;
		border-collapse: collapse;
	}

	th, td {
		padding: 0.2rem 0.4rem;
		border-bottom: 1px solid var(--color-border);
	}

	th {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-muted);
		background: var(--color-surface);
		position: sticky;
		top: 0;
	}

	.name-col {
		text-align: left;
	}

	.qty-col {
		text-align: center;
		font-variant-numeric: tabular-nums;
		width: 4.5rem;
	}

	.delta-col {
		text-align: center;
		width: 2.5rem;
	}

	tr.only-agg {
		background: rgba(79, 70, 229, 0.06);
	}

	tr.only-sel {
		background: rgba(22, 163, 74, 0.06);
	}

	tr.diff-qty {
		background: rgba(245, 158, 11, 0.06);
	}

	tbody tr:hover {
		outline: 1px solid rgba(79, 70, 229, 0.15);
		outline-offset: -1px;
	}

	.card-name {
		color: var(--color-text);
	}

	.delta {
		font-size: 0.7rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.delta.positive {
		color: #16a34a;
	}

	.delta.negative {
		color: #dc2626;
	}
</style>
