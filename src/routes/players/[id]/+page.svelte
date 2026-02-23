<script lang="ts">
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { globalPlayerArchetypes, getAllTournaments } from '$lib/stores/tournaments';
	import type { TournamentData, PlayerInfo } from '$lib/types/tournament';
	import type { DecklistInfo } from '$lib/types/decklist';
	import DecklistView from '$lib/components/DecklistView.svelte';

	const playerId = $derived(page.params.id ?? '');

	interface TournamentEntry {
		tournament: TournamentData;
		player: PlayerInfo;
		archetype: string;
	}

	// Find all tournaments this player participated in
	const tournamentEntries = $derived.by(() => {
		const archetypes = $globalPlayerArchetypes;
		const tournaments = getAllTournaments();
		const entries: TournamentEntry[] = [];

		for (const t of tournaments) {
			const player = t.players[playerId];
			if (player) {
				entries.push({
					tournament: t,
					player,
					archetype: archetypes.get(playerId) ?? 'Unknown',
				});
			}
		}
		return entries.sort((a, b) => b.tournament.meta.date.localeCompare(a.tournament.meta.date));
	});

	const playerName = $derived(tournamentEntries[0]?.player.name ?? playerId);

	// Aggregate win/loss/draw across all tournaments
	const record = $derived.by(() => {
		let wins = 0, losses = 0, draws = 0;
		for (const entry of tournamentEntries) {
			for (const round of Object.values(entry.tournament.rounds)) {
				for (const match of round.matches) {
					if (match.player1Id !== playerId && match.player2Id !== playerId) continue;
					if (!match.player2Id) continue; // skip byes

					if (match.winnerId === playerId) {
						wins++;
					} else if (match.winnerId && match.winnerId !== playerId) {
						losses++;
					} else {
						draws++;
					}
				}
			}
		}
		return { wins, losses, draws, total: wins + losses + draws };
	});

	// Expanded decklist per tournament
	let expandedTournamentId: number | null = $state(null);

	function toggleDecklist(id: number) {
		expandedTournamentId = expandedTournamentId === id ? null : id;
	}
</script>

<svelte:head>
	<title>{playerName} — MTG Meta Analyzer</title>
</svelte:head>

<div class="breadcrumb">
	<a href="{base}/players">Players</a> / {playerName}
</div>

{#if tournamentEntries.length === 0}
	<p class="not-found">Player not found.</p>
{:else}
	<h1>{playerName}</h1>

	<div class="stat-cards">
		<div class="stat-card">
			<span class="stat-label">Overall Record</span>
			<span class="stat-value mono">{record.wins}-{record.losses}-{record.draws}</span>
		</div>
		<div class="stat-card">
			<span class="stat-label">Win Rate</span>
			<span class="stat-value">
				{record.total > 0 ? ((record.wins / record.total) * 100).toFixed(1) + '%' : '—'}
			</span>
		</div>
		<div class="stat-card">
			<span class="stat-label">Tournaments</span>
			<span class="stat-value">{tournamentEntries.length}</span>
		</div>
		<div class="stat-card">
			<span class="stat-label">Total Matches</span>
			<span class="stat-value">{record.total}</span>
		</div>
	</div>

	<section>
		<h2>Tournament History</h2>
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th>Tournament</th>
						<th>Date</th>
						<th class="num">Rank</th>
						<th>Record</th>
						<th class="num">Points</th>
						<th>Archetype</th>
						<th>Decklist</th>
					</tr>
				</thead>
				<tbody>
					{#each tournamentEntries as entry}
						{@const t = entry.tournament}
						{@const p = entry.player}
						{@const isExpanded = expandedTournamentId === t.meta.id}
						<tr class:expanded={isExpanded}>
							<td>
								<a href="{base}/tournaments/{t.meta.id}">{t.meta.name}</a>
							</td>
							<td class="mono">{t.meta.date}</td>
							<td class="num">{p.rank}</td>
							<td class="mono">{p.matchRecord}</td>
							<td class="num">{p.points}</td>
							<td>
								<a
									href="{base}/archetypes/{encodeURIComponent(entry.archetype)}"
									class="archetype-badge"
								>
									{entry.archetype}
								</a>
							</td>
							<td>
								{#if p.decklistIds.length > 0}
									<button class="link-btn" onclick={() => toggleDecklist(t.meta.id)}>
										{isExpanded ? 'Hide' : 'View'}
									</button>
								{:else}
									<span class="muted">—</span>
								{/if}
							</td>
						</tr>
						{#if isExpanded}
							<tr class="decklist-row">
								<td colspan="7">
									<div class="decklist-container">
										{#each p.decklistIds as deckId}
											{@const deck = t.decklists[deckId]}
											{#if deck}
												<DecklistView
													decklist={deck}
													playerName={p.name}
													archetype={entry.archetype}
												/>
											{/if}
										{/each}
									</div>
								</td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
		</div>
	</section>
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
		padding: 0.4rem 0.6rem;
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

	.archetype-badge {
		font-size: 0.75rem;
		color: var(--color-accent);
		background: rgba(79, 70, 229, 0.08);
		padding: 0.1rem 0.45rem;
		border-radius: 9999px;
		white-space: nowrap;
		text-decoration: none;
	}

	.archetype-badge:hover {
		text-decoration: underline;
	}

	.link-btn {
		background: none;
		border: none;
		color: var(--color-accent);
		cursor: pointer;
		font-size: 0.8rem;
		padding: 0;
	}

	.link-btn:hover {
		text-decoration: underline;
	}

	.muted {
		color: var(--color-text-muted);
	}

	tr.expanded {
		background: rgba(79, 70, 229, 0.04);
	}

	.decklist-row td {
		padding: 0.75rem;
		background: var(--color-bg);
	}

	.decklist-container {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.not-found {
		color: var(--color-text-muted);
		margin-top: 1rem;
	}
</style>
