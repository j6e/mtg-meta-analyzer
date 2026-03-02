<script lang="ts">
	import { base } from '$app/paths';
	import { globalMetagameData } from '$lib/stores/tournaments';
	import { pct } from '$lib/utils/format';

	type SortKey = 'name' | 'share' | 'winrate' | 'players' | 'matches';
	let sortKey = $state<SortKey>('share');
	let sortAsc = $state(false);

	const sortedStats = $derived.by(() => {
		const stats = $globalMetagameData?.stats ?? [];
		const rows = stats.filter((s) => s.name !== 'Unknown');
		const dir = sortAsc ? 1 : -1;
		rows.sort((a, b) => {
			switch (sortKey) {
				case 'name':
					return dir * a.name.localeCompare(b.name);
				case 'share':
					return dir * (a.metagameShare - b.metagameShare);
				case 'winrate':
					return dir * (a.overallWinrate - b.overallWinrate);
				case 'players':
					return dir * (a.playerCount - b.playerCount);
				case 'matches':
					return dir * (a.totalMatches - b.totalMatches);
			}
		});
		return rows;
	});

	function toggleSort(key: SortKey) {
		if (sortKey === key) {
			sortAsc = !sortAsc;
		} else {
			sortKey = key;
			sortAsc = key === 'name';
		}
	}

	function sortIndicator(key: SortKey): string {
		if (sortKey !== key) return '';
		return sortAsc ? ' \u25B2' : ' \u25BC';
	}
</script>

<svelte:head>
	<title>Archetypes — MTG Meta Analyzer</title>
</svelte:head>

<h1>Archetypes</h1>

{#if sortedStats.length > 0}
	<div class="table-wrap">
		<table>
			<thead>
				<tr>
					<th class="name-col sortable" onclick={() => toggleSort('name')}>
						Archetype{sortIndicator('name')}
					</th>
					<th class="num-col sortable" onclick={() => toggleSort('share')}>
						Meta Share{sortIndicator('share')}
					</th>
					<th class="num-col sortable" onclick={() => toggleSort('winrate')}>
						Win Rate{sortIndicator('winrate')}
					</th>
					<th class="num-col sortable" onclick={() => toggleSort('players')}>
						Players{sortIndicator('players')}
					</th>
					<th class="num-col sortable" onclick={() => toggleSort('matches')}>
						Matches{sortIndicator('matches')}
					</th>
					<th class="num-col">Record</th>
				</tr>
			</thead>
			<tbody>
				{#each sortedStats as s}
					<tr>
						<td class="name-col">
							<a href="{base}/archetypes/{encodeURIComponent(s.name)}">{s.name}</a>
						</td>
						<td class="num-col">{pct(s.metagameShare)}</td>
						<td class="num-col" class:above50={s.overallWinrate >= 0.5} class:below50={s.overallWinrate < 0.5}>
							{pct(s.overallWinrate)}
						</td>
						<td class="num-col">{s.playerCount}</td>
						<td class="num-col">{s.totalMatches}</td>
						<td class="num-col mono">{s.wins}-{s.losses}-{s.draws}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else}
	<p class="no-data">No archetype data available. Load tournament data from the Metagame page.</p>
{/if}

<style>
	h1 {
		font-size: 1.5rem;
		margin-bottom: 1rem;
	}

	.table-wrap {
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
	}

	th, td {
		padding: 0.4rem 0.6rem;
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

	.sortable {
		cursor: pointer;
		user-select: none;
	}

	.sortable:hover {
		color: var(--color-text);
	}

	.name-col {
		text-align: left;
	}

	.num-col {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.mono {
		font-family: var(--font-mono, monospace);
	}

	.above50 {
		color: #16a34a;
	}

	.below50 {
		color: #dc2626;
	}

	tbody tr:hover {
		outline: 1px solid rgba(79, 70, 229, 0.15);
		outline-offset: -1px;
	}

	td a {
		color: var(--color-text);
		text-decoration: none;
		font-weight: 500;
	}

	td a:hover {
		color: var(--color-accent);
		text-decoration: underline;
	}

	.no-data {
		color: var(--color-text-muted);
		margin-top: 1rem;
	}
</style>
