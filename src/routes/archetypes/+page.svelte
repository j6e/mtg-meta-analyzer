<script lang="ts">
	import { base } from '$app/paths';
	import { globalMetagameData } from '$lib/stores/tournaments';

	type SortKey = 'name' | 'metagameShare' | 'overallWinrate' | 'playerCount' | 'totalMatches';
	type SortDir = 'asc' | 'desc';

	let sortKey: SortKey = $state('metagameShare');
	let sortDir: SortDir = $state('desc');

	function toggleSort(key: SortKey) {
		if (sortKey === key) {
			sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		} else {
			sortKey = key;
			sortDir = key === 'name' ? 'asc' : 'desc';
		}
	}

	function sortIndicator(key: SortKey): string {
		if (sortKey !== key) return '';
		return sortDir === 'asc' ? ' \u25B2' : ' \u25BC';
	}

	const sorted = $derived.by(() => {
		const stats = $globalMetagameData?.stats ?? [];
		const dir = sortDir === 'asc' ? 1 : -1;
		return [...stats].sort((a, b) => {
			switch (sortKey) {
				case 'name':
					return dir * a.name.localeCompare(b.name);
				case 'metagameShare':
					return dir * (a.metagameShare - b.metagameShare);
				case 'overallWinrate':
					return dir * (a.overallWinrate - b.overallWinrate);
				case 'playerCount':
					return dir * (a.playerCount - b.playerCount);
				case 'totalMatches':
					return dir * (a.totalMatches - b.totalMatches);
			}
		});
	});

	function pct(n: number): string {
		return (n * 100).toFixed(1) + '%';
	}
</script>

<svelte:head>
	<title>Archetypes — MTG Meta Analyzer</title>
</svelte:head>

<h1>Archetypes</h1>

{#if sorted.length === 0}
	<p class="empty">No archetype data available.</p>
{:else}
	<div class="table-wrap">
		<table>
			<thead>
				<tr>
					<th class="sortable" onclick={() => toggleSort('name')}>
						Archetype{sortIndicator('name')}
					</th>
					<th class="sortable num" onclick={() => toggleSort('metagameShare')}>
						Meta Share{sortIndicator('metagameShare')}
					</th>
					<th class="sortable num" onclick={() => toggleSort('overallWinrate')}>
						Win Rate{sortIndicator('overallWinrate')}
					</th>
					<th class="sortable num" onclick={() => toggleSort('playerCount')}>
						Players{sortIndicator('playerCount')}
					</th>
					<th class="sortable num" onclick={() => toggleSort('totalMatches')}>
						Matches{sortIndicator('totalMatches')}
					</th>
				</tr>
			</thead>
			<tbody>
				{#each sorted as arch}
					<tr>
						<td>
							<a href="{base}/archetypes/{encodeURIComponent(arch.name)}">{arch.name}</a>
						</td>
						<td class="num">{pct(arch.metagameShare)}</td>
						<td class="num" class:above50={arch.overallWinrate >= 0.5} class:below50={arch.overallWinrate < 0.5}>
							{pct(arch.overallWinrate)}
						</td>
						<td class="num">{arch.playerCount}</td>
						<td class="num">{arch.totalMatches}</td>
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

	.above50 {
		color: #16a34a;
	}

	.below50 {
		color: #dc2626;
	}
</style>
