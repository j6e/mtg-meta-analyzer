<script lang="ts">
import { base } from '$app/paths';
import { metagameData } from '$lib/stores/tournaments';
import { settingsQueryString } from '$lib/stores/url-settings';
import { pct } from '$lib/utils/format';

const qs = $derived($settingsQueryString);

type SortKey = "name" | "share" | "winrate" | "players" | "matches";
let sortKey = $state<SortKey>("share");
let sortAsc = $state(false);

const PINNED_BOTTOM = ["Other", "Unknown"];

const sortedStats = $derived.by(() => {
	const stats = $metagameData?.stats ?? [];
	const normal = stats.filter((s) => !PINNED_BOTTOM.includes(s.name));
	const pinned = PINNED_BOTTOM.map((name) => stats.find((s) => s.name === name)).filter((x): x is NonNullable<typeof x> => x !== undefined);
	const dir = sortAsc ? 1 : -1;
	normal.sort((a, b) => {
		switch (sortKey) {
			case "name":
				return dir * a.name.localeCompare(b.name);
			case "share":
				return dir * (a.metagameShare - b.metagameShare);
			case "winrate":
				return dir * ((a.adjustedWinrate ?? a.overallWinrate) - (b.adjustedWinrate ?? b.overallWinrate));
			case "players":
				return dir * (a.playerCount - b.playerCount);
			case "matches":
				return dir * (a.totalMatches - b.totalMatches);
			default:
				return 0;
		}
	});
	return [...normal, ...pinned];
});

function toggleSort(key: SortKey) {
	if (sortKey === key) {
		sortAsc = !sortAsc;
	} else {
		sortKey = key;
		sortAsc = key === "name";
	}
}

function sortIndicator(key: SortKey): string {
	if (sortKey !== key) return "";
	return sortAsc ? " \u25B2" : " \u25BC";
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
					<th
						class="name-col sortable"
						role="columnheader"
						tabindex="0"
						aria-sort={sortKey === 'name' ? (sortAsc ? 'ascending' : 'descending') : 'none'}
						onclick={() => toggleSort('name')}
						onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSort('name'); } }}
					>
						Archetype{sortIndicator('name')}
					</th>
					<th
						class="num-col sortable"
						role="columnheader"
						tabindex="0"
						aria-sort={sortKey === 'share' ? (sortAsc ? 'ascending' : 'descending') : 'none'}
						onclick={() => toggleSort('share')}
						onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSort('share'); } }}
					>
						Meta Share{sortIndicator('share')}
					</th>
					<th
						class="num-col sortable"
						role="columnheader"
						tabindex="0"
						aria-sort={sortKey === 'winrate' ? (sortAsc ? 'ascending' : 'descending') : 'none'}
						onclick={() => toggleSort('winrate')}
						onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSort('winrate'); } }}
					>
						Win Rate{sortIndicator('winrate')}
					</th>
					<th
						class="num-col sortable"
						role="columnheader"
						tabindex="0"
						aria-sort={sortKey === 'players' ? (sortAsc ? 'ascending' : 'descending') : 'none'}
						onclick={() => toggleSort('players')}
						onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSort('players'); } }}
					>
						Players{sortIndicator('players')}
					</th>
					<th
						class="num-col sortable"
						role="columnheader"
						tabindex="0"
						aria-sort={sortKey === 'matches' ? (sortAsc ? 'ascending' : 'descending') : 'none'}
						onclick={() => toggleSort('matches')}
						onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSort('matches'); } }}
					>
						Matches{sortIndicator('matches')}
					</th>
					<th class="num-col">Record</th>
				</tr>
			</thead>
			<tbody>
				{#each sortedStats as s}
					<tr>
						<td class="name-col">
							{#if PINNED_BOTTOM.includes(s.name)}
								<span class="pinned-name">{s.name}</span>
							{:else}
								<a href="{base}/archetypes/{encodeURIComponent(s.name)}{qs}">{s.name}</a>
							{/if}
						</td>
						<td class="num-col">{pct(s.metagameShare)}</td>
						<td class="num-col" class:above50={(s.adjustedWinrate ?? s.overallWinrate) >= 0.5} class:below50={(s.adjustedWinrate ?? s.overallWinrate) < 0.5}>
							{pct(s.adjustedWinrate ?? s.overallWinrate)}
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
	.pinned-name {
		color: var(--color-text-muted);
		font-style: italic;
	}

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

	th.sortable:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: -2px;
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
		color: var(--color-win);
	}

	.below50 {
		color: var(--color-loss);
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
