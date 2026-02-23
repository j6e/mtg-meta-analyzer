<script lang="ts">
	import { tournamentList } from '$lib/stores/tournaments';

	type SortKey = 'name' | 'date' | 'formats' | 'playerCount' | 'roundCount' | 'matchCount';
	type SortDir = 'asc' | 'desc';

	let sortKey: SortKey = $state('date');
	let sortDir: SortDir = $state('desc');

	function toggleSort(key: SortKey) {
		if (sortKey === key) {
			sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		} else {
			sortKey = key;
			sortDir = key === 'name' ? 'asc' : 'desc';
		}
	}

	const sorted = $derived.by(() => {
		const list = [...$tournamentList];
		const dir = sortDir === 'asc' ? 1 : -1;
		return list.sort((a, b) => {
			switch (sortKey) {
				case 'name':
					return dir * a.name.localeCompare(b.name);
				case 'date':
					return dir * a.date.localeCompare(b.date);
				case 'formats':
					return dir * a.formats.join(', ').localeCompare(b.formats.join(', '));
				case 'playerCount':
					return dir * (a.playerCount - b.playerCount);
				case 'roundCount':
					return dir * (a.roundCount - b.roundCount);
				case 'matchCount':
					return dir * (a.matchCount - b.matchCount);
			}
		});
	});

	function sortIndicator(key: SortKey): string {
		if (sortKey !== key) return '';
		return sortDir === 'asc' ? ' \u25B2' : ' \u25BC';
	}
</script>

<svelte:head>
	<title>Tournaments — MTG Meta Analyzer</title>
</svelte:head>

<h1>Tournaments</h1>

{#if sorted.length === 0}
	<p class="empty">No tournaments loaded.</p>
{:else}
	<div class="table-wrap">
		<table>
			<thead>
				<tr>
					<th class="sortable" onclick={() => toggleSort('name')}>
						Name{sortIndicator('name')}
					</th>
					<th class="sortable" onclick={() => toggleSort('date')}>
						Date{sortIndicator('date')}
					</th>
					<th class="sortable" onclick={() => toggleSort('formats')}>
						Format{sortIndicator('formats')}
					</th>
					<th class="sortable num" onclick={() => toggleSort('playerCount')}>
						Players{sortIndicator('playerCount')}
					</th>
					<th class="sortable num" onclick={() => toggleSort('roundCount')}>
						Rounds{sortIndicator('roundCount')}
					</th>
					<th class="sortable num" onclick={() => toggleSort('matchCount')}>
						Matches{sortIndicator('matchCount')}
					</th>
				</tr>
			</thead>
			<tbody>
				{#each sorted as t}
					<tr>
						<td>
							<a href={t.url} target="_blank" rel="noopener">{t.name}</a>
						</td>
						<td class="mono">{t.date}</td>
						<td>{t.formats.join(', ')}</td>
						<td class="num">{t.playerCount}</td>
						<td class="num">{t.roundCount}</td>
						<td class="num">{t.matchCount}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<style>
	h1 {
		font-size: 1.5rem;
		margin-bottom: 1rem;
	}

	.empty {
		color: var(--color-text-muted);
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
		padding: 0.5rem 0.75rem;
		text-align: left;
		border-bottom: 1px solid var(--color-border);
	}

	th {
		font-weight: 600;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-muted);
		background: var(--color-surface);
		position: sticky;
		top: 0;
		white-space: nowrap;
	}

	th.sortable {
		cursor: pointer;
		user-select: none;
	}

	th.sortable:hover {
		color: var(--color-text);
	}

	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.mono {
		font-family: var(--font-mono);
		font-size: 0.8rem;
	}

	tbody tr:hover {
		background: rgba(79, 70, 229, 0.04);
	}

	td a {
		color: var(--color-accent);
		text-decoration: none;
	}

	td a:hover {
		text-decoration: underline;
	}
</style>
