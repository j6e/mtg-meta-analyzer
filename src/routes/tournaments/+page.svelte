<script lang="ts">
import { filteredTournaments, tournamentList } from '$lib/stores/tournaments';

type SortKey =
	| "cleanName"
	| "date"
	| "formats"
	| "importance"
	| "playerCount"
	| "roundCount"
	| "matchCount";

const importanceOrder = { professional: 0, premier: 1, competitive: 2, other: 3 } as const;
type SortDir = "asc" | "desc";

let sortKey: SortKey = $state("date");
let sortDir: SortDir = $state("desc");

function toggleSort(key: SortKey) {
	if (sortKey === key) {
		sortDir = sortDir === "asc" ? "desc" : "asc";
	} else {
		sortKey = key;
		sortDir = key === "cleanName" ? "asc" : "desc";
	}
}

function importanceStars(importance: string): string {
	switch (importance) {
		case "professional": return "***";
		case "premier": return "**";
		case "competitive": return "*";
		default: return "";
	}
}

const sorted = $derived.by(() => {
	const list = [...$tournamentList];
	const dir = sortDir === "asc" ? 1 : -1;
	return list.sort((a, b) => {
		switch (sortKey) {
			case "cleanName":
				return dir * a.cleanName.localeCompare(b.cleanName);
			case "date":
				return dir * a.date.localeCompare(b.date);
			case "formats":
				return dir * a.formats.join(", ").localeCompare(b.formats.join(", "));
			case "importance":
				return dir * (importanceOrder[a.importance] - importanceOrder[b.importance]);
			case "playerCount":
				return dir * (a.playerCount - b.playerCount);
			case "roundCount":
				return dir * (a.roundCount - b.roundCount);
			case "matchCount":
				return dir * (a.matchCount - b.matchCount);
			default:
				return 0;
		}
	});
});

function sortIndicator(key: SortKey): string {
	if (sortKey !== key) return "";
	return sortDir === "asc" ? " \u25B2" : " \u25BC";
}

// Filtered tournament stats for % weight display
const filteredIds = $derived(new Set($filteredTournaments.map(t => t.meta.id)));

const filteredMatchCounts = $derived(
	new Map($filteredTournaments.map(t => [
		t.meta.id,
		Object.values(t.rounds).reduce((sum, r) => sum + r.matches.length, 0)
	]))
);

const totalFilteredPlayers = $derived(
	$filteredTournaments.reduce((sum, t) => sum + t.meta.playerCount, 0)
);

const totalFilteredMatches = $derived(
	$filteredTournaments.reduce((sum, t) => sum + (filteredMatchCounts.get(t.meta.id) ?? 0), 0)
);

function pct(value: number, total: number): string {
	if (total === 0) return "";
	return (value / total * 100).toFixed(1) + "%";
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
					<th class="sortable" onclick={() => toggleSort('importance')}>
						Tier{sortIndicator('importance')}
					</th>
					<th class="sortable" onclick={() => toggleSort('cleanName')}>
						Name{sortIndicator('cleanName')}
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
					{@const inFilter = filteredIds.has(t.id)}
					{@const tMatchCount = filteredMatchCounts.get(t.id) ?? t.matchCount}
					<tr class:filtered={inFilter}>
						<td class="importance" title={t.importance}>{importanceStars(t.importance)}</td>
						<td>
							<a href={t.url} target="_blank" rel="noopener">{t.cleanName}</a>
						</td>
						<td class="mono">{t.date}</td>
						<td>{t.formats.join(', ')}</td>
						<td class="num">
							{t.playerCount}
							{#if inFilter && totalFilteredPlayers > 0}
								<span class="pct">{pct(t.playerCount, totalFilteredPlayers)}</span>
							{/if}
						</td>
						<td class="num">{t.roundCount}</td>
						<td class="num">
							{t.matchCount}
							{#if inFilter && totalFilteredMatches > 0}
								<span class="pct">{pct(tMatchCount, totalFilteredMatches)}</span>
							{/if}
						</td>
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

	.importance {
		text-align: center;
		color: var(--color-text-muted);
		white-space: nowrap;
	}

	tbody tr:hover {
		background: rgba(79, 70, 229, 0.04);
	}

	tr.filtered {
		background: rgba(79, 70, 229, 0.03);
	}

	tr.filtered:hover {
		background: rgba(79, 70, 229, 0.07);
	}

	.pct {
		display: inline-block;
		margin-left: 0.4em;
		font-size: 0.75em;
		color: var(--color-text-muted);
		font-variant-numeric: tabular-nums;
	}

	td a {
		color: var(--color-accent);
		text-decoration: none;
	}

	td a:hover {
		text-decoration: underline;
	}
</style>
