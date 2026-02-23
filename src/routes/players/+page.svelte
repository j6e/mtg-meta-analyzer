<script lang="ts">
	import { base } from '$app/paths';
	import { globalPlayerArchetypes, getAllTournaments } from '$lib/stores/tournaments';

	interface PlayerEntry {
		id: string;
		name: string;
		tournaments: number;
		bestFinish: number;
		archetype: string;
	}

	// Build aggregated player list across all tournaments
	const players = $derived.by(() => {
		const archetypes = $globalPlayerArchetypes;
		const tournaments = getAllTournaments();
		const map = new Map<string, PlayerEntry>();

		for (const t of tournaments) {
			for (const [playerId, player] of Object.entries(t.players)) {
				const existing = map.get(playerId);
				if (existing) {
					existing.tournaments++;
					existing.bestFinish = Math.min(existing.bestFinish, player.rank);
				} else {
					map.set(playerId, {
						id: playerId,
						name: player.name,
						tournaments: 1,
						bestFinish: player.rank,
						archetype: archetypes.get(playerId) ?? 'Unknown',
					});
				}
			}
		}
		return [...map.values()];
	});

	// Search filter
	let search = $state('');

	const filtered = $derived.by(() => {
		const q = search.toLowerCase().trim();
		if (!q) return players;
		return players.filter(
			(p) =>
				p.name.toLowerCase().includes(q) ||
				p.archetype.toLowerCase().includes(q),
		);
	});

	// Sort
	type SortKey = 'name' | 'tournaments' | 'bestFinish' | 'archetype';
	type SortDir = 'asc' | 'desc';

	let sortKey: SortKey = $state('bestFinish');
	let sortDir: SortDir = $state('asc');

	function toggleSort(key: SortKey) {
		if (sortKey === key) {
			sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		} else {
			sortKey = key;
			sortDir = key === 'name' || key === 'archetype' ? 'asc' : 'asc';
		}
	}

	function sortIndicator(key: SortKey): string {
		if (sortKey !== key) return '';
		return sortDir === 'asc' ? ' \u25B2' : ' \u25BC';
	}

	const sorted = $derived.by(() => {
		const dir = sortDir === 'asc' ? 1 : -1;
		return [...filtered].sort((a, b) => {
			switch (sortKey) {
				case 'name':
					return dir * a.name.localeCompare(b.name);
				case 'tournaments':
					return dir * (a.tournaments - b.tournaments);
				case 'bestFinish':
					return dir * (a.bestFinish - b.bestFinish);
				case 'archetype':
					return dir * a.archetype.localeCompare(b.archetype);
			}
		});
	});
</script>

<svelte:head>
	<title>Players — MTG Meta Analyzer</title>
</svelte:head>

<h1>Players</h1>

<div class="search-bar">
	<input
		type="text"
		placeholder="Search by name or archetype..."
		bind:value={search}
	/>
	<span class="count">{filtered.length} player{filtered.length !== 1 ? 's' : ''}</span>
</div>

{#if sorted.length === 0}
	<p class="empty">No players found.</p>
{:else}
	<div class="table-wrap">
		<table>
			<thead>
				<tr>
					<th class="sortable" onclick={() => toggleSort('name')}>
						Player{sortIndicator('name')}
					</th>
					<th class="sortable" onclick={() => toggleSort('archetype')}>
						Archetype{sortIndicator('archetype')}
					</th>
					<th class="sortable num" onclick={() => toggleSort('bestFinish')}>
						Best Finish{sortIndicator('bestFinish')}
					</th>
					<th class="sortable num" onclick={() => toggleSort('tournaments')}>
						Tournaments{sortIndicator('tournaments')}
					</th>
				</tr>
			</thead>
			<tbody>
				{#each sorted as player}
					<tr>
						<td>
							<a href="{base}/players/{player.id}">{player.name}</a>
						</td>
						<td>
							<span class="archetype-badge">{player.archetype}</span>
						</td>
						<td class="num">{player.bestFinish}</td>
						<td class="num">{player.tournaments}</td>
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

	.search-bar {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.search-bar input {
		flex: 1;
		max-width: 400px;
		padding: 0.4rem 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		font-size: 0.85rem;
		background: var(--color-surface);
	}

	.search-bar input:focus {
		outline: none;
		border-color: var(--color-accent);
	}

	.count {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		white-space: nowrap;
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

	.archetype-badge {
		font-size: 0.75rem;
		color: var(--color-accent);
		background: rgba(79, 70, 229, 0.08);
		padding: 0.1rem 0.45rem;
		border-radius: 9999px;
		white-space: nowrap;
	}
</style>
