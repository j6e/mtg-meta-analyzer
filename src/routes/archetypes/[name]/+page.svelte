<script lang="ts">
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import {
		globalMetagameData,
		globalPlayerArchetypes,
		getAllTournaments,
	} from '$lib/stores/tournaments';
	import DecklistView from '$lib/components/DecklistView.svelte';

	const archetypeName = $derived(decodeURIComponent(page.params.name ?? ''));

	// Find this archetype's stats
	const stats = $derived.by(() => {
		const data = $globalMetagameData;
		if (!data) return null;
		return data.stats.find((s) => s.name === archetypeName) ?? null;
	});

	// Matchup breakdown: this archetype's row from the matrix
	const matchups = $derived.by(() => {
		const data = $globalMetagameData;
		if (!data) return [];
		const idx = data.matrix.archetypes.indexOf(archetypeName);
		if (idx === -1) return [];
		return data.matrix.archetypes
			.map((opponent, j) => ({
				opponent,
				cell: data.matrix.cells[idx][j],
			}))
			.filter((m) => m.opponent !== archetypeName && m.cell.total > 0)
			.sort((a, b) => (b.cell.winrate ?? 0) - (a.cell.winrate ?? 0));
	});

	// Decklists belonging to this archetype
	const decklists = $derived.by(() => {
		const archetypes = $globalPlayerArchetypes;
		const tournaments = getAllTournaments();
		const result: { playerName: string; tournamentName: string; decklistId: string; decklist: import('$lib/types/decklist').DecklistInfo }[] = [];

		for (const t of tournaments) {
			for (const [playerId, player] of Object.entries(t.players)) {
				if (archetypes.get(playerId) !== archetypeName) continue;
				for (const deckId of player.decklistIds) {
					const deck = t.decklists[deckId];
					if (deck) {
						result.push({
							playerName: player.name,
							tournamentName: t.meta.name,
							decklistId: deckId,
							decklist: deck,
						});
					}
				}
			}
		}
		return result;
	});

	// Show only a few decklists by default
	let showAllDecklists = $state(false);
	const visibleDecklists = $derived(showAllDecklists ? decklists : decklists.slice(0, 6));

	function pct(n: number): string {
		return (n * 100).toFixed(1) + '%';
	}
</script>

<svelte:head>
	<title>{archetypeName} — MTG Meta Analyzer</title>
</svelte:head>

<div class="breadcrumb">
	<a href="{base}/archetypes">Archetypes</a> / {archetypeName}
</div>

{#if stats}
	<h1>{archetypeName}</h1>

	<div class="stat-cards">
		<div class="stat-card">
			<span class="stat-label">Meta Share</span>
			<span class="stat-value">{pct(stats.metagameShare)}</span>
		</div>
		<div class="stat-card">
			<span class="stat-label">Win Rate</span>
			<span class="stat-value" class:above50={stats.overallWinrate >= 0.5} class:below50={stats.overallWinrate < 0.5}>
				{pct(stats.overallWinrate)}
			</span>
		</div>
		<div class="stat-card">
			<span class="stat-label">Players</span>
			<span class="stat-value">{stats.playerCount}</span>
		</div>
		<div class="stat-card">
			<span class="stat-label">Matches</span>
			<span class="stat-value">{stats.totalMatches}</span>
		</div>
	</div>

	<!-- Matchup Breakdown -->
	{#if matchups.length > 0}
		<section>
			<h2>Matchups</h2>
			<div class="table-wrap">
				<table>
					<thead>
						<tr>
							<th>Opponent</th>
							<th class="num">Win Rate</th>
							<th class="num">Record</th>
							<th class="num">Matches</th>
						</tr>
					</thead>
					<tbody>
						{#each matchups as m}
							<tr>
								<td>
									<a href="{base}/archetypes/{encodeURIComponent(m.opponent)}">{m.opponent}</a>
								</td>
								<td class="num" class:above50={(m.cell.winrate ?? 0) >= 0.5} class:below50={(m.cell.winrate ?? 0) < 0.5}>
									{m.cell.winrate !== null ? pct(m.cell.winrate) : '—'}
								</td>
								<td class="num mono">{m.cell.wins}-{m.cell.losses}-{m.cell.draws}</td>
								<td class="num">{m.cell.total}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/if}

	<!-- Decklists -->
	{#if decklists.length > 0}
		<section>
			<h2>Decklists ({decklists.length})</h2>
			<div class="decklist-grid">
				{#each visibleDecklists as d}
					<DecklistView
						decklist={d.decklist}
						playerName={d.playerName}
						archetype={d.tournamentName}
					/>
				{/each}
			</div>
			{#if decklists.length > 6 && !showAllDecklists}
				<button class="show-more" onclick={() => (showAllDecklists = true)}>
					Show all {decklists.length} decklists
				</button>
			{/if}
		</section>
	{/if}
{:else}
	<p class="not-found">Archetype "{archetypeName}" not found.</p>
{/if}

<style>
	.breadcrumb {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		margin-bottom: 1rem;
	}

	.breadcrumb a {
		color: var(--color-accent);
		text-decoration: none;
	}

	.breadcrumb a:hover {
		text-decoration: underline;
	}

	h1 {
		font-size: 1.5rem;
		margin-bottom: 1rem;
	}

	h2 {
		font-size: 1.15rem;
		font-weight: 600;
		margin-bottom: 0.75rem;
	}

	section {
		margin-bottom: 2rem;
	}

	/* Stat cards */
	.stat-cards {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
		margin-bottom: 2rem;
	}

	.stat-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		padding: 0.75rem 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 120px;
	}

	.stat-label {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-muted);
	}

	.stat-value {
		font-size: 1.25rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	/* Table */
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
		padding: 0.4rem 0.75rem;
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

	.above50 {
		color: #16a34a;
	}

	.below50 {
		color: #dc2626;
	}

	/* Decklists */
	.decklist-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: 1rem;
	}

	.show-more {
		margin-top: 1rem;
		background: none;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		padding: 0.5rem 1rem;
		cursor: pointer;
		font-size: 0.85rem;
		color: var(--color-accent);
	}

	.show-more:hover {
		background: rgba(79, 70, 229, 0.04);
	}

	.not-found {
		color: var(--color-text-muted);
		margin-top: 1rem;
	}
</style>
