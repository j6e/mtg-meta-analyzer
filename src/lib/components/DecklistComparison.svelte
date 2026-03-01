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
	{#if !selectedDecklist}
		<div class="columns">
			<div class="col">
				<div class="col-header">{aggregateLabel}</div>
				<div class="decklist-wrap">
					<section>
						<h4>Mainboard</h4>
						<ul>
							{#each aggregateDecklist.mainboard as card}
								<li>
									<span class="qty">{card.quantity}x</span>
									<CardTooltip cardName={card.cardName}>
										<span class="card-name">{card.cardName}</span>
									</CardTooltip>
								</li>
							{/each}
						</ul>
					</section>
					{#if aggregateDecklist.sideboard.length > 0}
						<section>
							<h4>Sideboard</h4>
							<ul>
								{#each aggregateDecklist.sideboard as card}
									<li>
										<span class="qty">{card.quantity}x</span>
										<CardTooltip cardName={card.cardName}>
											<span class="card-name">{card.cardName}</span>
										</CardTooltip>
									</li>
								{/each}
							</ul>
						</section>
					{/if}
				</div>
			</div>
			<div class="col placeholder-col">
				<div class="col-header muted">Select a decklist to compare</div>
			</div>
		</div>
	{:else}
		<div class="columns">
			<div class="col">
				<div class="col-header">{aggregateLabel}</div>
			</div>
			<div class="col">
				<div class="col-header">{selectedLabel}</div>
			</div>
		</div>

		{#if mainDiff && mainDiff.length > 0}
			<h4>Mainboard</h4>
			<div class="diff-table">
				{#each mainDiff as entry}
					<div class="diff-row {deltaClass(entry.aggQty, entry.selQty)}">
						<span class="qty">{entry.aggQty || '—'}</span>
						<CardTooltip cardName={entry.cardName}>
							<span class="card-name">{entry.cardName}</span>
						</CardTooltip>
						<span class="qty">{entry.selQty || '—'}</span>
						{#if formatDelta(entry.aggQty, entry.selQty)}
							<span class="delta" class:positive={entry.selQty > entry.aggQty} class:negative={entry.selQty < entry.aggQty}>
								{formatDelta(entry.aggQty, entry.selQty)}
							</span>
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		{#if sideDiff && sideDiff.length > 0}
			<h4>Sideboard</h4>
			<div class="diff-table">
				{#each sideDiff as entry}
					<div class="diff-row {deltaClass(entry.aggQty, entry.selQty)}">
						<span class="qty">{entry.aggQty || '—'}</span>
						<CardTooltip cardName={entry.cardName}>
							<span class="card-name">{entry.cardName}</span>
						</CardTooltip>
						<span class="qty">{entry.selQty || '—'}</span>
						{#if formatDelta(entry.aggQty, entry.selQty)}
							<span class="delta" class:positive={entry.selQty > entry.aggQty} class:negative={entry.selQty < entry.aggQty}>
								{formatDelta(entry.aggQty, entry.selQty)}
							</span>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<style>
	.comparison {
		font-size: 0.85rem;
	}

	.columns {
		display: flex;
		gap: 1.5rem;
	}

	.col {
		flex: 1;
		min-width: 0;
	}

	.col-header {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-muted);
		margin-bottom: 0.5rem;
		padding-bottom: 0.35rem;
		border-bottom: 1px solid var(--color-border);
	}

	.col-header.muted {
		color: var(--color-text-muted);
		opacity: 0.6;
		font-weight: 400;
		text-transform: none;
		font-style: italic;
	}

	.decklist-wrap section {
		margin-bottom: 0.75rem;
	}

	h4 {
		font-size: 0.8rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--color-text-muted);
		margin: 1rem 0 0.35rem;
	}

	ul {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	li {
		display: flex;
		gap: 0.35rem;
		padding: 0.1rem 0;
		line-height: 1.5;
	}

	.diff-table {
		display: flex;
		flex-direction: column;
	}

	.diff-row {
		display: grid;
		grid-template-columns: 2rem 1fr 2rem 2.5rem;
		gap: 0.35rem;
		align-items: center;
		padding: 0.15rem 0.25rem;
		border-radius: 3px;
	}

	.diff-row.only-agg {
		background: rgba(79, 70, 229, 0.06);
	}

	.diff-row.only-sel {
		background: rgba(22, 163, 74, 0.06);
	}

	.diff-row.diff-qty {
		background: rgba(245, 158, 11, 0.06);
	}

	.qty {
		color: var(--color-text-muted);
		text-align: right;
		font-variant-numeric: tabular-nums;
		font-size: 0.8rem;
	}

	.card-name {
		color: var(--color-text);
	}

	.delta {
		font-size: 0.75rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.delta.positive {
		color: #16a34a;
	}

	.delta.negative {
		color: #dc2626;
	}

	.placeholder-col {
		display: flex;
		align-items: flex-start;
		justify-content: center;
	}
</style>
