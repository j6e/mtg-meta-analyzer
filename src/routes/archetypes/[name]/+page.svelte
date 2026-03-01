<script lang="ts">
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import {
		globalMetagameData,
		globalPlayerArchetypes,
		getAllTournaments,
	} from '$lib/stores/tournaments';
	import DecklistView from '$lib/components/DecklistView.svelte';
	import DecklistComparison from '$lib/components/DecklistComparison.svelte';
	import CardCompositionTable from '$lib/components/CardCompositionTable.svelte';
	import WinrateSplitterPanel from '$lib/components/WinrateSplitterPanel.svelte';
	import {
		collectArchetypeDecklists,
		findBestDecklist,
	} from '$lib/utils/decklist-collector';
	import { aggregateDecks, type AggregatedDeck } from '$lib/algorithms/noka';
	import { computeCardComposition } from '$lib/utils/card-composition';
	import { pct } from '$lib/utils/format';
	import type { DecklistInfo } from '$lib/types/decklist';

	const archetypeName = $derived(decodeURIComponent(page.params.name ?? ''));

	// Find this archetype's stats
	const stats = $derived.by(() => {
		const data = $globalMetagameData;
		if (!data) return null;
		return data.stats.find((s) => s.name === archetypeName) ?? null;
	});

	// Rank badges for meta share and winrate
	const metaShareRank = $derived.by(() => {
		const data = $globalMetagameData;
		if (!data || !stats) return null;
		const sorted = [...data.stats].sort((a, b) => b.metagameShare - a.metagameShare);
		const idx = sorted.findIndex((s) => s.name === archetypeName);
		return idx >= 0 ? idx + 1 : null;
	});

	const winrateRank = $derived.by(() => {
		const data = $globalMetagameData;
		if (!data || !stats) return null;
		const sorted = [...data.stats].sort((a, b) => b.overallWinrate - a.overallWinrate);
		const idx = sorted.findIndex((s) => s.name === archetypeName);
		return idx >= 0 ? idx + 1 : null;
	});

	function rankBadge(rank: number | null): string {
		if (rank === null) return '';
		if (rank === 1) return '🥇';
		if (rank === 2) return '🥈';
		if (rank === 3) return '🥉';
		return `#${rank}`;
	}

	// Matchup breakdown: this archetype's row from the matrix (unsorted)
	const matchupsRaw = $derived.by(() => {
		const data = $globalMetagameData;
		if (!data) return [];
		const idx = data.matrix.archetypes.indexOf(archetypeName);
		if (idx === -1) return [];
		return data.matrix.archetypes
			.map((opponent, j) => ({
				opponent,
				cell: data.matrix.cells[idx][j],
			}))
			.filter((m) => m.opponent !== archetypeName && m.cell.total > 0);
	});

	// ── Matchup sort state ──
	type MatchupSortCol = 'opponent' | 'winrate' | 'matches';
	let matchupSortCol = $state<MatchupSortCol>('matches');
	let matchupSortAsc = $state(false);

	function toggleMatchupSort(col: MatchupSortCol) {
		if (matchupSortCol === col) {
			matchupSortAsc = !matchupSortAsc;
		} else {
			matchupSortCol = col;
			matchupSortAsc = col === 'opponent'; // alphabetical asc by default, numbers desc
		}
	}

	const matchups = $derived.by(() => {
		const rows = [...matchupsRaw];
		const dir = matchupSortAsc ? 1 : -1;
		rows.sort((a, b) => {
			switch (matchupSortCol) {
				case 'opponent':
					return dir * a.opponent.localeCompare(b.opponent);
				case 'winrate':
					return dir * ((a.cell.winrate ?? 0) - (b.cell.winrate ?? 0));
				case 'matches':
					return dir * (a.cell.total - b.cell.total);
			}
		});
		return rows;
	});

	// Enriched decklists for this archetype (with metadata)
	const enrichedDecklists = $derived.by(() => {
		return collectArchetypeDecklists(
			getAllTournaments(),
			$globalPlayerArchetypes,
			archetypeName,
		);
	});

	// Raw decklists for aggregation & composition
	const rawDecklists = $derived(enrichedDecklists.map((e) => e.decklist));

	// ── Tab state ──
	type Tab = 'matchups' | 'aggregate' | 'composition' | 'splitter' | 'decklists';
	let activeTab = $state<Tab>('matchups');

	const tabs: { id: Tab; label: string }[] = [
		{ id: 'matchups', label: 'Matchups' },
		{ id: 'aggregate', label: 'Aggregate' },
		{ id: 'composition', label: 'Composition' },
		{ id: 'splitter', label: 'Winrate Splitter' },
		{ id: 'decklists', label: 'Decklists' },
	];

	// ── Aggregate tab state ──
	let order = $state<1 | 2 | 3>(1);
	let aggregateResult: AggregatedDeck | null = $state(null);
	let aggregating = $state(false);
	let aggregateError = $state('');

	// Auto-calculate when archetype changes or order changes
	let lastCalcKey = $state('');

	$effect(() => {
		const key = `${archetypeName}:${order}`;
		if (key !== lastCalcKey && rawDecklists.length > 0 && activeTab === 'aggregate') {
			lastCalcKey = key;
			calculateAggregate();
		}
	});

	async function calculateAggregate() {
		aggregating = true;
		aggregateResult = null;
		aggregateError = '';

		await new Promise((r) => requestAnimationFrame(r));

		try {
			if (rawDecklists.length === 0) {
				aggregateError = 'No decklists found for this archetype.';
				return;
			}
			aggregateResult = aggregateDecks(rawDecklists, order);
		} catch (e) {
			aggregateError = e instanceof Error ? e.message : 'Aggregation failed.';
		} finally {
			aggregating = false;
		}
	}

	const aggregateAsDecklistInfo = $derived.by((): DecklistInfo | null => {
		if (!aggregateResult) return null;
		return {
			playerId: '',
			mainboard: aggregateResult.mainboard,
			sideboard: aggregateResult.sideboard,
			companion: null,
			reportedArchetype: null,
		};
	});

	// Decklist picker for comparison
	const bestDecklist = $derived(findBestDecklist(enrichedDecklists));
	let selectedDecklistId = $state('');

	// Pre-select best decklist when enriched list changes
	$effect(() => {
		if (bestDecklist && !selectedDecklistId) {
			selectedDecklistId = bestDecklist.decklistId;
		}
	});

	const selectedEnriched = $derived(
		enrichedDecklists.find((e) => e.decklistId === selectedDecklistId) ?? null,
	);

	const selectedLabel = $derived(selectedEnriched ? 'Selected' : '');

	// Dropdown options sorted by rank
	const decklistOptions = $derived.by(() => {
		return [...enrichedDecklists]
			.sort((a, b) => a.playerRank - b.playerRank || a.tournamentName.localeCompare(b.tournamentName))
			.map((e) => ({
				id: e.decklistId,
				label: `${e.tournamentName} — ${e.playerName} (Rank #${e.playerRank})`,
			}));
	});

	// ── Composition tab ──
	const composition = $derived.by(() => {
		return computeCardComposition(rawDecklists);
	});

	// ── Splitter tab ──
	const allCardNames = $derived.by(() => {
		const names = new Set<string>();
		for (const deck of rawDecklists) {
			for (const c of deck.mainboard) names.add(c.cardName);
			for (const c of deck.sideboard) names.add(c.cardName);
		}
		return [...names].sort();
	});

	const tournaments = $derived(getAllTournaments());

	// ── Decklists tab ──
	let showAllDecklists = $state(false);
	const visibleDecklists = $derived(showAllDecklists ? enrichedDecklists : enrichedDecklists.slice(0, 6));

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
			<span class="stat-value">
				{pct(stats.metagameShare)}
				{#if rankBadge(metaShareRank)}
					<span class="rank-badge">{rankBadge(metaShareRank)}</span>
				{/if}
			</span>
		</div>
		<div class="stat-card">
			<span class="stat-label">Win Rate</span>
			<span class="stat-value" class:above50={stats.overallWinrate >= 0.5} class:below50={stats.overallWinrate < 0.5}>
				{pct(stats.overallWinrate)}
				{#if rankBadge(winrateRank)}
					<span class="rank-badge">{rankBadge(winrateRank)}</span>
				{/if}
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

	<!-- Tab Bar -->
	<div class="tab-bar" role="tablist">
		{#each tabs as tab}
			<button
				class="tab-btn"
				class:active={activeTab === tab.id}
				onclick={() => (activeTab = tab.id)}
				role="tab"
				aria-selected={activeTab === tab.id}
			>
				{tab.label}
			</button>
		{/each}
	</div>

	<!-- Tab Content -->
	<div class="tab-content">
		{#if activeTab === 'matchups'}
			{#if matchups.length > 0}
				<div class="table-wrap">
					<table>
						<thead>
							<tr>
								<th class="sortable" onclick={() => toggleMatchupSort('opponent')}>
									Opponent {matchupSortCol === 'opponent' ? (matchupSortAsc ? '▲' : '▼') : ''}
								</th>
								<th class="num sortable" onclick={() => toggleMatchupSort('winrate')}>
									Win Rate {matchupSortCol === 'winrate' ? (matchupSortAsc ? '▲' : '▼') : ''}
								</th>
								<th class="num">Record</th>
								<th class="num sortable" onclick={() => toggleMatchupSort('matches')}>
									Matches {matchupSortCol === 'matches' ? (matchupSortAsc ? '▲' : '▼') : ''}
								</th>
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
			{:else}
				<p class="empty-state">No matchup data available.</p>
			{/if}

		{:else if activeTab === 'aggregate'}
			<section class="algorithm-info">
				<p class="tab-description">
					Build a consensus decklist using
					<strong>Nth Order Karsten Aggregation</strong>
					(<a href="https://elvishjerricco.github.io/2015/09/24/automatically-generating-magic-decks.html"
						target="_blank" rel="noopener">Fancher's extension</a>
					of <a href="https://strategy.channelfireball.com/all-strategy/tag/frank-karstens-magic-math/"
						target="_blank" rel="noopener">Karsten's original</a>).
					Each <em>nth copy</em> of a card is treated as an independent candidate &mdash;
					the 1st copy of a staple ranks higher than the 4th copy of a flex slot.
					The top 60 card-copies become the mainboard; top 15 the sideboard.
				</p>
				<div class="orders">
					<div class="order-card" class:active={order === 1}>
						<h3>Order 1</h3>
						<p>Pure popularity. Each card-copy scored by how many decklists include it.</p>
						<p class="formula">score = freq <span class="op">&times;</span> &frac12;</p>
					</div>
					<div class="order-card" class:active={order === 2}>
						<h3>Order 2</h3>
						<p>Adds pair synergy &mdash; cards that appear together get a boost.</p>
						<p class="formula">score = freq <span class="op">&times;</span> &frac12; <span class="op">+</span> avg pair freq <span class="op">&times;</span> &frac14;</p>
					</div>
					<div class="order-card" class:active={order === 3}>
						<h3>Order 3</h3>
						<p>Adds triple synergy on top of pairs.</p>
						<p class="formula">score = freq <span class="op">&times;</span> &frac12; <span class="op">+</span> avg pair freq <span class="op">&times;</span> &frac14; <span class="op">+</span> avg triple freq <span class="op">&times;</span> &frac18;</p>
					</div>
				</div>
			</section>
			<div class="aggregate-controls">
				<div class="field">
					<!-- svelte-ignore a11y_label_has_associated_control -->
					<label>Order</label>
					<div class="order-buttons" role="group" aria-label="Aggregation order">
						{#each [1, 2, 3] as n}
							<button
								class="order-btn"
								class:active={order === n}
								onclick={() => (order = n as 1 | 2 | 3)}
							>
								{n}
							</button>
						{/each}
					</div>
				</div>

				<div class="field compare-field">
					<label for="decklist-picker">Compare with</label>
					<select id="decklist-picker" bind:value={selectedDecklistId}>
						<option value="">— Select decklist —</option>
						{#each decklistOptions as opt}
							<option value={opt.id}>{opt.label}</option>
						{/each}
					</select>
				</div>
			</div>

			{#if aggregating}
				<div class="loading">
					<div class="spinner"></div>
					<span>Aggregating decklists (order {order})...</span>
				</div>
			{/if}

			{#if aggregateError}
				<p class="error">{aggregateError}</p>
			{/if}

			{#if aggregateAsDecklistInfo}
				<div class="result-meta">
					Aggregate <strong>{archetypeName}</strong> — Order {order}, from {aggregateResult?.deckCount ?? 0} decklists
				</div>
				<DecklistComparison
					aggregateDecklist={aggregateAsDecklistInfo}
					selectedDecklist={selectedEnriched?.decklist ?? null}
					aggregateLabel="Aggregate (Order {order})"
					selectedLabel={selectedLabel}
				/>
			{/if}

		{:else if activeTab === 'composition'}
			<p class="tab-description">
				Shows how frequently each card appears across all decklists.
				The <strong>1+, 2+, 3+, 4+</strong> columns show the percentage of decks running at least that many copies.
				<strong>Avg</strong> is the mean number of copies across all decklists, including those that don't play the card.
			</p>
			{#if composition.deckCount > 0}
				<CardCompositionTable
					rows={composition.mainboard}
					title="Mainboard"
					deckCount={composition.deckCount}
				/>
				<CardCompositionTable
					rows={composition.sideboard}
					title="Sideboard"
					deckCount={composition.deckCount}
				/>
			{:else}
				<p class="empty-state">No decklists found for composition analysis.</p>
			{/if}

		{:else if activeTab === 'splitter'}
			<p class="tab-description">
				Splits players of this archetype by how many copies of a card they run and compares matchup performance across groups.
				<strong>Binary</strong> divides players into two groups: those with at least N copies vs. those with fewer.
				<strong>Per Copy</strong> creates a separate group for each exact copy count (0, 1, 2, 3, 4).
			</p>
			<WinrateSplitterPanel
				{archetypeName}
				{allCardNames}
				{tournaments}
				playerArchetypes={$globalPlayerArchetypes}
			/>

		{:else if activeTab === 'decklists'}
			{#if enrichedDecklists.length > 0}
				<div class="decklist-grid">
					{#each visibleDecklists as d}
						<DecklistView
							decklist={d.decklist}
							playerName={d.playerName}
							archetype={d.tournamentName}
						/>
					{/each}
				</div>
				{#if enrichedDecklists.length > 6 && !showAllDecklists}
					<button class="show-more" onclick={() => (showAllDecklists = true)}>
						Show all {enrichedDecklists.length} decklists
					</button>
				{/if}
			{:else}
				<p class="empty-state">No decklists found.</p>
			{/if}
		{/if}
	</div>
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
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.rank-badge {
		font-size: 0.85rem;
		line-height: 1;
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

	.above50 {
		color: #16a34a;
	}

	.below50 {
		color: #dc2626;
	}

	/* Tab bar */
	.tab-bar {
		display: flex;
		gap: 0;
		margin-bottom: 1.5rem;
		border-bottom: 2px solid var(--color-border);
	}

	.tab-btn {
		padding: 0.6rem 1.25rem;
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		margin-bottom: -2px;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text-muted);
		cursor: pointer;
		transition: color 0.15s, border-color 0.15s;
	}

	.tab-btn:hover {
		color: var(--color-text);
	}

	.tab-btn.active {
		color: var(--color-accent);
		border-bottom-color: var(--color-accent);
		font-weight: 600;
	}

	.tab-content {
		min-height: 200px;
	}

	/* Aggregate tab */
	.aggregate-controls {
		display: flex;
		gap: 1.25rem;
		align-items: flex-end;
		flex-wrap: wrap;
		margin-bottom: 1.25rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.compare-field {
		flex: 1;
		min-width: 250px;
	}

	label {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--color-text-muted);
	}

	select {
		padding: 0.45rem 0.6rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		background: var(--color-surface);
		color: var(--color-text);
		font-size: 0.85rem;
		width: 100%;
	}

	.order-buttons {
		display: flex;
	}

	.order-btn {
		padding: 0.45rem 0.85rem;
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		color: var(--color-text);
		font-size: 0.875rem;
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
	}

	.order-btn:first-child {
		border-radius: var(--radius) 0 0 var(--radius);
	}

	.order-btn:last-child {
		border-radius: 0 var(--radius) var(--radius) 0;
	}

	.order-btn:not(:first-child) {
		border-left: none;
	}

	.order-btn.active {
		background: var(--color-accent);
		color: #fff;
		border-color: var(--color-accent);
	}

	.order-btn.active + .order-btn {
		border-left-color: var(--color-accent);
	}

	.loading {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		color: var(--color-text-muted);
		font-size: 0.875rem;
		margin-bottom: 1rem;
	}

	.spinner {
		width: 1.25rem;
		height: 1.25rem;
		border: 2px solid var(--color-border);
		border-top-color: var(--color-accent);
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.error {
		color: #dc2626;
		font-size: 0.875rem;
	}

	.result-meta {
		font-size: 0.85rem;
		color: var(--color-text-muted);
		margin-bottom: 0.75rem;
	}

	/* Algorithm info */
	.algorithm-info {
		margin-bottom: 1.25rem;
	}

	.algorithm-info a {
		color: var(--color-accent);
		text-decoration: underline;
		text-decoration-color: rgba(79, 70, 229, 0.3);
		text-underline-offset: 2px;
	}

	.algorithm-info a:hover {
		text-decoration-color: var(--color-accent);
	}

	.orders {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 0.75rem;
	}

	.order-card {
		padding: 0.75rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		opacity: 0.5;
		transition: opacity 0.15s;
	}

	.order-card.active {
		opacity: 1;
	}

	.order-card h3 {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--color-text);
		margin-bottom: 0.3rem;
	}

	.order-card p {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		line-height: 1.5;
		margin-bottom: 0.35rem;
	}

	.order-card p:last-child {
		margin-bottom: 0;
	}

	.formula {
		font-family: var(--font-mono);
		font-size: 0.75rem;
	}

	.formula .op {
		color: var(--color-accent);
		font-weight: 600;
	}

	/* Decklists tab */
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

	.empty-state {
		color: var(--color-text-muted);
		font-size: 0.875rem;
		font-style: italic;
	}

	.tab-description {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		line-height: 1.5;
		margin-bottom: 1.25rem;
		max-width: 720px;
	}

	.not-found {
		color: var(--color-text-muted);
		margin-top: 1rem;
	}
</style>
