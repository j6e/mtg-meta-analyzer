<script lang="ts">
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import {
		classificationResults,
		filteredTournaments,
	} from '$lib/stores/tournaments';
	import { settingsQueryString } from '$lib/stores/url-settings';

	const qs = $derived($settingsQueryString);
	import { activeArchetypeDefs } from '$lib/stores/archetype-configs';
	import DecklistView from '$lib/components/DecklistView.svelte';
	import CardTooltip from '$lib/components/CardTooltip.svelte';
	import type { DecklistInfo } from '$lib/types/decklist';
	import type { ClassificationResult } from '$lib/algorithms/archetype-classifier';
	import { isAnyOfGroup } from '$lib/types/archetype';
	import { computeCardComposition } from '$lib/utils/card-composition';

	const classifiedName = $derived(page.url.searchParams.get('classified') ?? '');
	const reportedName = $derived(page.url.searchParams.get('reported') ?? '');

	const archetypeDef = $derived(
		$activeArchetypeDefs.find((d) => d.name === classifiedName) ?? null,
	);

	// Find decklists where classified === classifiedName AND reported === reportedName
	const decklists = $derived.by(() => {
		const resultsMap = $classificationResults;
		const tournaments = $filteredTournaments;
		const result: {
			playerName: string;
			playerRank: number;
			tournamentName: string;
			decklistId: string;
			decklist: DecklistInfo;
			classificationResult: ClassificationResult | undefined;
		}[] = [];

		for (const t of tournaments) {
			const classResults = resultsMap.get(t.meta.id) ?? [];
			const deckResultMap = new Map<string, ClassificationResult>();
			for (const r of classResults) {
				deckResultMap.set(r.decklistId, r);
			}

			for (const [playerId, player] of Object.entries(t.players)) {
				for (const deckId of player.decklistIds) {
					const deck = t.decklists[deckId];
					if (!deck) continue;

					const classResult = deckResultMap.get(deckId);
					if (classResult?.archetype !== classifiedName) continue;

					const raw = deck.reportedArchetype?.trim();
					const reported = raw ? raw : 'No Report';
					if (reported !== reportedName) continue;

					result.push({
						playerName: player.name,
						playerRank: player.rank,
						tournamentName: t.meta.name,
						decklistId: deckId,
						decklist: deck,
						classificationResult: classResult,
					});
				}
			}
		}
		result.sort((a, b) => a.playerRank - b.playerRank);
		return result;
	});

	let showAllDecklists = $state(false);
	const visibleDecklists = $derived(showAllDecklists ? decklists : decklists.slice(0, 6));

	const hasValidParams = $derived(classifiedName !== '' && reportedName !== '');

	const filterLabel = $derived.by(() => {
		const ts = $filteredTournaments;
		if (ts.length === 0) return null;
		const formats = [...new Set(ts.flatMap(t => t.meta.formats).filter(Boolean))];
		const fmtStr = formats.length > 0 ? formats.join(', ') : 'All formats';
		return `${ts.length} tournament${ts.length !== 1 ? 's' : ''} · ${fmtStr}`;
	});

	const DEFINING_THRESHOLD = 0.8;

	const definingCards = $derived.by(() => {
		if (decklists.length < 2) return [];
		const composition = computeCardComposition(decklists.map((d) => d.decklist));
		const results: { cardName: string; minCopies: number; inclusion: number }[] = [];
		for (const row of composition.mainboard) {
			if (row.thresholds[0] < DEFINING_THRESHOLD) continue;
			// Find highest copy count shared by 90%+ of decks
			let minCopies = 1;
			if (row.thresholds[3] >= DEFINING_THRESHOLD) minCopies = 4;
			else if (row.thresholds[2] >= DEFINING_THRESHOLD) minCopies = 3;
			else if (row.thresholds[1] >= DEFINING_THRESHOLD) minCopies = 2;
			results.push({
				cardName: row.cardName,
				minCopies,
				inclusion: row.thresholds[0],
			});
		}
		results.sort((a, b) => {
			const diff = b.minCopies - a.minCopies;
			if (diff !== 0) return diff;
			return b.inclusion - a.inclusion;
		});
		return results;
	});
</script>

<svelte:head>
	<title>Classification Assessment — MTG Meta Analyzer</title>
</svelte:head>

<div class="breadcrumb">
	<a href="{base}/archetype-cleaner{qs}">Archetype Cleaner</a> / Classification Assessment
</div>

{#if !hasValidParams}
	<p class="not-found">Missing classification parameters.</p>
{:else}
	<h1>Archetype Classification Assessment</h1>
	{#if filterLabel}
		<p class="filter-notice">Filtered to: {filterLabel}</p>
	{/if}
	<p class="subtitle">
		Classified as <strong>{classifiedName}</strong>, reported as <strong>{reportedName}</strong>
	</p>

	<div class="cards-row">
		{#if archetypeDef}
			<section class="definition-section">
				<h2>Archetype Definition: {classifiedName}</h2>
				<p class="section-desc">Signature cards used for rule-based classification</p>
				<table class="sig-table">
					<thead>
						<tr>
							<th>Card Name</th>
							<th class="num">Copies</th>
						</tr>
					</thead>
					<tbody>
						{#each archetypeDef.signatureCards as entry}
							{#if isAnyOfGroup(entry)}
								{#each entry.anyOf as card, i}
									<tr>
										<td>
											<CardTooltip cardName={card.name}>
												<span class="card-name">{i === 0 ? '' : 'or '}{ card.name}</span>
											</CardTooltip>
										</td>
										<td class="num">
											{#if card.exactCopies !== undefined}
												= {card.exactCopies}
											{:else}
												≥ {card.minCopies ?? 1}
											{/if}
										</td>
									</tr>
								{/each}
							{:else}
								<tr>
									<td>
										<CardTooltip cardName={entry.name}>
											<span class="card-name">{entry.name}</span>
										</CardTooltip>
									</td>
									<td class="num">
										{#if entry.exactCopies !== undefined}
											= {entry.exactCopies}
										{:else}
											≥ {entry.minCopies ?? 1}
										{/if}
									</td>
								</tr>
							{/if}
						{/each}
					</tbody>
				</table>
			</section>
		{:else if classifiedName !== 'Unknown'}
			<p class="no-def">No archetype definition found for "{classifiedName}" (classified via KNN).</p>
		{/if}

		{#if definingCards.length > 0}
			<section class="defining-section">
				<h2>Defining Cards</h2>
				<p class="section-desc">Cards found in 80%+ of the {decklists.length} decklists in this group</p>
				<table class="sig-table">
					<thead>
						<tr>
							<th>Card Name</th>
							<th class="num">Copies</th>
							<th class="num">Inclusion</th>
						</tr>
					</thead>
					<tbody>
						{#each definingCards as card}
							<tr>
								<td>
									<CardTooltip cardName={card.cardName}>
										<span class="card-name">{card.cardName}</span>
									</CardTooltip>
								</td>
								<td class="num">{card.minCopies}+</td>
								<td class="num">{Math.round(card.inclusion * 100)}%</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</section>
		{/if}
	</div>

	{#if decklists.length > 0}
		<section>
			<h2>Decklists ({decklists.length})</h2>
			<div class="decklist-grid">
				{#each visibleDecklists as d}
					<DecklistView
						decklist={d.decklist}
						playerName={d.playerName}
						archetype={classifiedName}
						playerRank={d.playerRank}
						classificationResult={d.classificationResult}
					/>
				{/each}
			</div>
			{#if decklists.length > 6 && !showAllDecklists}
				<button class="show-more" onclick={() => (showAllDecklists = true)}>
					Show all {decklists.length} decklists
				</button>
			{/if}
		</section>
	{:else}
		<p class="empty">No decklists match this classification pair.</p>
	{/if}
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
		margin-bottom: 0.5rem;
	}

	h2 {
		font-size: 1.15rem;
		font-weight: 600;
		margin-bottom: 0.75rem;
	}

	section {
		margin-bottom: 2rem;
	}

	.subtitle {
		font-size: 0.95rem;
		color: var(--color-text-muted);
		margin-bottom: 1.5rem;
	}

	.subtitle strong {
		color: var(--color-text);
	}

	.cards-row {
		display: flex;
		gap: 2rem;
		align-items: flex-start;
		margin-bottom: 2rem;
	}

	.definition-section {
		flex: 0 1 auto;
	}

	.section-desc {
		font-size: 0.85rem;
		color: var(--color-text-muted);
		margin-bottom: 0.75rem;
	}

	.sig-table {
		width: auto;
		border-collapse: collapse;
		font-size: 0.85rem;
	}

	.sig-table th,
	.sig-table td {
		padding: 0.4rem 0.75rem;
		text-align: left;
		border-bottom: 1px solid var(--color-border);
	}

	.sig-table th {
		font-weight: 600;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-muted);
		background: var(--color-surface);
	}

	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.card-name {
		color: var(--color-text);
	}

	.defining-section {
		flex: 0 1 auto;
	}

	.no-def {
		color: var(--color-text-muted);
		font-style: italic;
		margin-bottom: 1.5rem;
	}

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

	.empty {
		color: var(--color-text-muted);
	}

	.filter-notice {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		margin-bottom: 1rem;
	}
</style>
