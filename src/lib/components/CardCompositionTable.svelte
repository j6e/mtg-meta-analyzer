<script lang="ts">
	import type { CardCompositionRow } from '../utils/card-composition';
	import CardTooltip from './CardTooltip.svelte';

	let {
		rows,
		title,
		deckCount,
	}: {
		rows: CardCompositionRow[];
		title: string;
		deckCount: number;
	} = $props();

	type SortKey = 'name' | 'avg' | 't0' | 't1' | 't2' | 't3';

	let sortKey = $state<SortKey>('t0');
	let sortAsc = $state(false);

	const sortedRows = $derived.by(() => {
		const sorted = [...rows];
		sorted.sort((a, b) => {
			let cmp = 0;
			switch (sortKey) {
				case 'name':
					cmp = a.cardName.localeCompare(b.cardName);
					break;
				case 'avg':
					cmp = a.averageQuantity - b.averageQuantity;
					break;
				case 't0':
					cmp = a.thresholds[0] - b.thresholds[0];
					break;
				case 't1':
					cmp = a.thresholds[1] - b.thresholds[1];
					break;
				case 't2':
					cmp = a.thresholds[2] - b.thresholds[2];
					break;
				case 't3':
					cmp = a.thresholds[3] - b.thresholds[3];
					break;
			}
			return sortAsc ? cmp : -cmp;
		});
		return sorted;
	});

	function toggleSort(key: SortKey) {
		if (sortKey === key) {
			sortAsc = !sortAsc;
		} else {
			sortKey = key;
			sortAsc = key === 'name';
		}
	}

	function pctBg(value: number): string {
		// White at 0%, green at 100%
		const g = Math.round(160 + value * 60); // 160 → 220
		const r = Math.round(245 - value * 85); // 245 → 160
		const b = Math.round(245 - value * 80); // 245 → 165
		return `rgb(${r}, ${g}, ${b})`;
	}

	function pct(value: number): string {
		return (value * 100).toFixed(0) + '%';
	}

	function sortIndicator(key: SortKey): string {
		if (sortKey !== key) return '';
		return sortAsc ? ' ▲' : ' ▼';
	}
</script>

<div class="composition-section">
	<h3>{title} <span class="deck-count">({deckCount} decks)</span></h3>
	{#if rows.length === 0}
		<p class="empty">No cards found.</p>
	{:else}
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th class="name-col" onclick={() => toggleSort('name')}>
							Card{sortIndicator('name')}
						</th>
						<th class="num-col" onclick={() => toggleSort('t0')}>
							1+{sortIndicator('t0')}
						</th>
						<th class="num-col" onclick={() => toggleSort('t1')}>
							2+{sortIndicator('t1')}
						</th>
						<th class="num-col" onclick={() => toggleSort('t2')}>
							3+{sortIndicator('t2')}
						</th>
						<th class="num-col" onclick={() => toggleSort('t3')}>
							4+{sortIndicator('t3')}
						</th>
						<th class="num-col" onclick={() => toggleSort('avg')}>
							Avg{sortIndicator('avg')}
						</th>
					</tr>
				</thead>
				<tbody>
					{#each sortedRows as row}
						<tr>
							<td class="name-col">
								<CardTooltip cardName={row.cardName}>
									<span class="card-name">{row.cardName}</span>
								</CardTooltip>
							</td>
							<td class="num-col" style="background: {pctBg(row.thresholds[0])}">{pct(row.thresholds[0])}</td>
							<td class="num-col" style="background: {pctBg(row.thresholds[1])}">{pct(row.thresholds[1])}</td>
							<td class="num-col" style="background: {pctBg(row.thresholds[2])}">{pct(row.thresholds[2])}</td>
							<td class="num-col" style="background: {pctBg(row.thresholds[3])}">{pct(row.thresholds[3])}</td>
							<td class="num-col avg-col">{row.averageQuantity.toFixed(1)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<style>
	.composition-section {
		margin-bottom: 1.5rem;
	}

	h3 {
		font-size: 0.8rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--color-text-muted);
		margin-bottom: 0.5rem;
	}

	.deck-count {
		font-weight: 400;
	}

	.empty {
		color: var(--color-text-muted);
		font-size: 0.85rem;
		font-style: italic;
	}

	.table-wrap {
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
	}

	th,
	td {
		padding: 0.35rem 0.5rem;
		border-bottom: 1px solid var(--color-border);
	}

	th {
		font-weight: 600;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-muted);
		background: var(--color-surface);
		white-space: nowrap;
		cursor: pointer;
		user-select: none;
		position: sticky;
		top: 0;
	}

	th:hover {
		color: var(--color-text);
	}

	.name-col {
		text-align: left;
	}

	.num-col {
		text-align: center;
		font-variant-numeric: tabular-nums;
		min-width: 3.5rem;
	}

	.avg-col {
		background: transparent !important;
	}

	tbody tr:hover {
		outline: 1px solid rgba(79, 70, 229, 0.15);
		outline-offset: -1px;
	}

	.card-name {
		color: var(--color-text);
	}
</style>
