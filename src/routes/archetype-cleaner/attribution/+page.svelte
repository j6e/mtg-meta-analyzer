<script lang="ts">
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import {
		globalClassificationResults,
		getAllTournaments,
	} from '$lib/stores/tournaments';
	import { activeArchetypeDefs } from '$lib/stores/archetype-configs';
	import DecklistView from '$lib/components/DecklistView.svelte';
	import CardTooltip from '$lib/components/CardTooltip.svelte';
	import type { DecklistInfo } from '$lib/types/decklist';

	const classifiedName = $derived(page.url.searchParams.get('classified') ?? '');
	const reportedName = $derived(page.url.searchParams.get('reported') ?? '');

	const archetypeDef = $derived(
		$activeArchetypeDefs.find((d) => d.name === classifiedName) ?? null,
	);

	// Find decklists where classified === classifiedName AND reported === reportedName
	const decklists = $derived.by(() => {
		const resultsMap = $globalClassificationResults;
		const tournaments = getAllTournaments();
		const result: {
			playerName: string;
			tournamentName: string;
			decklistId: string;
			decklist: DecklistInfo;
		}[] = [];

		for (const t of tournaments) {
			const classResults = resultsMap.get(t.meta.id) ?? [];
			const deckClassified = new Map<string, string>();
			for (const r of classResults) {
				deckClassified.set(r.decklistId, r.archetype);
			}

			for (const [playerId, player] of Object.entries(t.players)) {
				for (const deckId of player.decklistIds) {
					const deck = t.decklists[deckId];
					if (!deck) continue;

					if (deckClassified.get(deckId) !== classifiedName) continue;

					const raw = deck.reportedArchetype?.trim();
					const reported = raw ? raw : 'No Report';
					if (reported !== reportedName) continue;

					result.push({
						playerName: player.name,
						tournamentName: t.meta.name,
						decklistId: deckId,
						decklist: deck,
					});
				}
			}
		}
		return result;
	});

	let showAllDecklists = $state(false);
	const visibleDecklists = $derived(showAllDecklists ? decklists : decklists.slice(0, 6));

	const hasValidParams = $derived(classifiedName !== '' && reportedName !== '');
</script>

<svelte:head>
	<title>Classification Assessment — MTG Meta Analyzer</title>
</svelte:head>

<div class="breadcrumb">
	<a href="{base}/archetype-cleaner">Archetype Cleaner</a> / Classification Assessment
</div>

{#if !hasValidParams}
	<p class="not-found">Missing classification parameters.</p>
{:else}
	<h1>Archetype Classification Assessment</h1>
	<p class="subtitle">
		Classified as <strong>{classifiedName}</strong>, reported as <strong>{reportedName}</strong>
	</p>

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
					{#each archetypeDef.signatureCards as card}
						<tr>
							<td>
								<CardTooltip cardName={card.name}>
									<span class="card-name">{card.name}</span>
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
				</tbody>
			</table>
		</section>
	{:else if classifiedName !== 'Unknown'}
		<p class="no-def">No archetype definition found for "{classifiedName}" (classified via KNN).</p>
	{/if}

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

	.definition-section {
		margin-bottom: 2rem;
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
</style>
