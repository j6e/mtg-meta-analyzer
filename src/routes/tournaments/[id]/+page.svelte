<script lang="ts">
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import {
		selectedTournamentId,
		currentTournament,
		playerList,
		decklistMap,
		currentTournamentArchetypes,
	} from '$lib/stores/tournaments';
	import DecklistView from '$lib/components/DecklistView.svelte';

	// Sync route param → store
	$effect(() => {
		const id = parseInt(page.params.id);
		if (!isNaN(id)) selectedTournamentId.set(id);
	});

	// Standings sort
	type StandingsSortKey = 'rank' | 'name' | 'archetype' | 'record' | 'points';
	type SortDir = 'asc' | 'desc';

	let standingsSortKey: StandingsSortKey = $state('rank');
	let standingsSortDir: SortDir = $state('asc');

	function toggleStandingsSort(key: StandingsSortKey) {
		if (standingsSortKey === key) {
			standingsSortDir = standingsSortDir === 'asc' ? 'desc' : 'asc';
		} else {
			standingsSortKey = key;
			standingsSortDir = key === 'name' || key === 'archetype' ? 'asc' : 'asc';
		}
	}

	function sortIndicator(key: StandingsSortKey): string {
		if (standingsSortKey !== key) return '';
		return standingsSortDir === 'asc' ? ' \u25B2' : ' \u25BC';
	}

	const sortedPlayers = $derived.by(() => {
		const list = [...$playerList];
		const archetypes = $currentTournamentArchetypes;
		const dir = standingsSortDir === 'asc' ? 1 : -1;
		return list.sort((a, b) => {
			switch (standingsSortKey) {
				case 'rank':
					return dir * (a.rank - b.rank);
				case 'name':
					return dir * a.name.localeCompare(b.name);
				case 'archetype': {
					const aa = archetypes.get(a.id) ?? 'Unknown';
					const ba = archetypes.get(b.id) ?? 'Unknown';
					return dir * aa.localeCompare(ba);
				}
				case 'record':
					return dir * a.matchRecord.localeCompare(b.matchRecord);
				case 'points':
					return dir * (a.points - b.points);
			}
		});
	});

	// Expanded decklist
	let expandedPlayerId: string | null = $state(null);

	function toggleDecklist(playerId: string) {
		expandedPlayerId = expandedPlayerId === playerId ? null : playerId;
	}

	// Round expansion
	let expandedRoundKey: string | null = $state(null);

	function toggleRound(key: string) {
		expandedRoundKey = expandedRoundKey === key ? null : key;
	}

	const sortedRounds = $derived.by(() => {
		if (!$currentTournament) return [];
		return Object.entries($currentTournament.rounds)
			.map(([key, round]) => ({ key, ...round }))
			.sort((a, b) => a.number - b.number);
	});

	function formatResult(result: string): string {
		if (result === 'bye') return 'Bye';
		if (result === 'draw') return 'Draw';
		return result;
	}

	function getPlayerName(id: string | null): string {
		if (!id || !$currentTournament) return '—';
		return $currentTournament.players[id]?.name ?? id;
	}
</script>

<svelte:head>
	<title>
		{$currentTournament?.meta.name ?? 'Tournament'} — MTG Meta Analyzer
	</title>
</svelte:head>

{#if $currentTournament}
	{@const meta = $currentTournament.meta}
	<div class="breadcrumb">
		<a href="{base}/tournaments">Tournaments</a> / {meta.name}
	</div>

	<header class="tournament-header">
		<h1>{meta.name}</h1>
		<div class="meta-row">
			<span>{meta.date}</span>
			<span>{meta.formats.join(', ')}</span>
			<span>{meta.playerCount} players</span>
			<span>{meta.roundCount} rounds</span>
		</div>
		{#if meta.url}
			<a href={meta.url} target="_blank" rel="noopener" class="external-link">
				View on melee.gg
			</a>
		{/if}
	</header>

	<!-- Standings -->
	<section>
		<h2>Standings</h2>
		<div class="table-wrap">
			<table class="standings-table">
				<thead>
					<tr>
						<th class="sortable num" onclick={() => toggleStandingsSort('rank')}>
							#{sortIndicator('rank')}
						</th>
						<th class="sortable" onclick={() => toggleStandingsSort('name')}>
							Player{sortIndicator('name')}
						</th>
						<th class="sortable" onclick={() => toggleStandingsSort('archetype')}>
							Archetype{sortIndicator('archetype')}
						</th>
						<th class="sortable" onclick={() => toggleStandingsSort('record')}>
							Record{sortIndicator('record')}
						</th>
						<th class="sortable num" onclick={() => toggleStandingsSort('points')}>
							Points{sortIndicator('points')}
						</th>
						<th>Decklist</th>
					</tr>
				</thead>
				<tbody>
					{#each sortedPlayers as player}
						{@const archetype = $currentTournamentArchetypes.get(player.id) ?? 'Unknown'}
						{@const isExpanded = expandedPlayerId === player.id}
						<tr class:expanded={isExpanded}>
							<td class="num">{player.rank}</td>
							<td>
								<a href="{base}/players/{player.id}">{player.name}</a>
							</td>
							<td>
								<span class="archetype-badge">{archetype}</span>
							</td>
							<td class="mono">{player.matchRecord}</td>
							<td class="num">{player.points}</td>
							<td>
								{#if player.decklistIds.length > 0}
									<button
										class="link-btn"
										onclick={() => toggleDecklist(player.id)}
									>
										{isExpanded ? 'Hide' : 'View'}
									</button>
								{:else}
									<span class="muted">—</span>
								{/if}
							</td>
						</tr>
						{#if isExpanded}
							<tr class="decklist-row">
								<td colspan="6">
									<div class="decklist-container">
										{#each player.decklistIds as deckId}
											{@const deck = $decklistMap[deckId]}
											{#if deck}
												<DecklistView
													decklist={deck}
													playerName={player.name}
													{archetype}
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

	<!-- Rounds -->
	<section>
		<h2>Rounds</h2>
		<div class="rounds">
			{#each sortedRounds as round}
				{@const isOpen = expandedRoundKey === round.key}
				<div class="round-block">
					<button class="round-header" onclick={() => toggleRound(round.key)}>
						<span class="round-name">
							{round.name}
							{#if round.isPlayoff}<span class="playoff-badge">Playoff</span>{/if}
						</span>
						<span class="round-info">
							{round.matches.length} matches
							<span class="chevron" class:open={isOpen}>&#9660;</span>
						</span>
					</button>
					{#if isOpen}
						<div class="round-matches">
							<table class="match-table">
								<thead>
									<tr>
										<th>Player 1</th>
										<th>Result</th>
										<th>Player 2</th>
									</tr>
								</thead>
								<tbody>
									{#each round.matches as match}
										<tr>
											<td
												class:winner={match.winnerId === match.player1Id}
											>
												{getPlayerName(match.player1Id)}
											</td>
											<td class="result mono">
												{formatResult(match.result)}
											</td>
											<td
												class:winner={match.winnerId === match.player2Id}
											>
												{getPlayerName(match.player2Id)}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</section>
{:else}
	<p class="not-found">Tournament not found.</p>
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

	.tournament-header {
		margin-bottom: 2rem;
	}

	h1 {
		font-size: 1.5rem;
		margin-bottom: 0.5rem;
	}

	.meta-row {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		font-size: 0.85rem;
		color: var(--color-text-muted);
		margin-bottom: 0.5rem;
	}

	.external-link {
		font-size: 0.8rem;
		color: var(--color-accent);
		text-decoration: none;
	}

	.external-link:hover {
		text-decoration: underline;
	}

	h2 {
		font-size: 1.15rem;
		font-weight: 600;
		margin-bottom: 0.75rem;
	}

	section {
		margin-bottom: 2rem;
	}

	/* Tables */
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

	.archetype-badge {
		font-size: 0.75rem;
		color: var(--color-accent);
		background: rgba(79, 70, 229, 0.08);
		padding: 0.1rem 0.45rem;
		border-radius: 9999px;
		white-space: nowrap;
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

	/* Rounds */
	.rounds {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.round-block {
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		overflow: hidden;
	}

	.round-header {
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 0.75rem;
		background: var(--color-surface);
		border: none;
		cursor: pointer;
		font-size: 0.85rem;
		text-align: left;
		color: var(--color-text);
	}

	.round-header:hover {
		background: rgba(79, 70, 229, 0.04);
	}

	.round-name {
		font-weight: 600;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.playoff-badge {
		font-size: 0.7rem;
		font-weight: 500;
		color: #e11d48;
		background: rgba(225, 29, 72, 0.08);
		padding: 0.1rem 0.4rem;
		border-radius: 9999px;
	}

	.round-info {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.chevron {
		font-size: 0.6rem;
		transition: transform 0.15s;
	}

	.chevron.open {
		transform: rotate(180deg);
	}

	.round-matches {
		border-top: 1px solid var(--color-border);
		max-height: 400px;
		overflow-y: auto;
	}

	.match-table th,
	.match-table td {
		padding: 0.3rem 0.6rem;
	}

	.result {
		text-align: center;
		color: var(--color-text-muted);
	}

	.winner {
		font-weight: 600;
	}

	.not-found {
		color: var(--color-text-muted);
		margin-top: 1rem;
	}
</style>
