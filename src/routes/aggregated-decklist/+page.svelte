<script lang="ts">
	import { base } from '$app/paths';
	import { globalPlayerArchetypes, getAllTournaments } from '$lib/stores/tournaments';
	import { aggregateDecks, type AggregatedDeck } from '$lib/algorithms/noka';
	import type { DecklistInfo } from '$lib/types/decklist';
	import DecklistView from '$lib/components/DecklistView.svelte';

	let selectedArchetype = $state('');
	let order = $state<1 | 2 | 3>(1);
	let calculating = $state(false);
	let result: AggregatedDeck | null = $state(null);
	let error = $state('');

	const archetypeNames = $derived.by(() => {
		const names = new Set<string>();
		for (const arch of $globalPlayerArchetypes.values()) {
			names.add(arch);
		}
		return [...names].sort();
	});

	function collectDecklists(archetype: string): DecklistInfo[] {
		const archetypes = $globalPlayerArchetypes;
		const tournaments = getAllTournaments();
		const decks: DecklistInfo[] = [];

		for (const t of tournaments) {
			for (const [playerId, player] of Object.entries(t.players)) {
				if (archetypes.get(playerId) !== archetype) continue;
				for (const deckId of player.decklistIds) {
					const deck = t.decklists[deckId];
					if (deck) decks.push(deck);
				}
			}
		}
		return decks;
	}

	async function calculate() {
		if (!selectedArchetype) return;

		calculating = true;
		result = null;
		error = '';

		// Yield to UI so the spinner renders before heavy computation
		await new Promise((r) => requestAnimationFrame(r));

		try {
			const decks = collectDecklists(selectedArchetype);
			if (decks.length === 0) {
				error = 'No decklists found for this archetype.';
				return;
			}
			result = aggregateDecks(decks, order);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Aggregation failed.';
		} finally {
			calculating = false;
		}
	}

	// Fake DecklistInfo wrapper so DecklistView can render the result
	const resultAsDecklistInfo = $derived.by(() => {
		if (!result) return null;
		return {
			playerId: '',
			mainboard: result.mainboard,
			sideboard: result.sideboard,
			companion: null,
			reportedArchetype: null,
		} satisfies DecklistInfo;
	});
</script>

<svelte:head>
	<title>Aggregated Decklist — MTG Meta Analyzer</title>
</svelte:head>

<h1>Aggregated Decklist</h1>
<p class="description">
	Build a consensus decklist from all decklists of an archetype using
	<strong>Nth Order Karsten Aggregation</strong>. Order 1 ranks each card copy by popularity.
	Higher orders also consider card synergies (pairs at order 2, triplets at order 3).
</p>

<div class="controls">
	<div class="field">
		<label for="archetype-select">Archetype</label>
		<select id="archetype-select" bind:value={selectedArchetype}>
			<option value="">— Select archetype —</option>
			{#each archetypeNames as name}
				<option value={name}>{name}</option>
			{/each}
		</select>
	</div>

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

	<button class="calculate-btn" onclick={calculate} disabled={!selectedArchetype || calculating}>
		{calculating ? 'Calculating...' : 'Calculate'}
	</button>
</div>

{#if calculating}
	<div class="loading">
		<div class="spinner"></div>
		<span>Aggregating decklists (order {order})...</span>
	</div>
{/if}

{#if error}
	<p class="error">{error}</p>
{/if}

{#if result && resultAsDecklistInfo}
	<div class="result">
		<div class="result-meta">
			Aggregate <strong>{selectedArchetype}</strong> — Order {order}, from {result.deckCount} decklists
		</div>
		<DecklistView decklist={resultAsDecklistInfo} archetype={selectedArchetype} />
	</div>
{/if}

<style>
	h1 {
		margin-bottom: 0.25rem;
	}

	.description {
		color: var(--color-text-muted);
		font-size: 0.875rem;
		margin-bottom: 1.5rem;
		max-width: 640px;
		line-height: 1.5;
	}

	.controls {
		display: flex;
		gap: 1.25rem;
		align-items: flex-end;
		flex-wrap: wrap;
		margin-bottom: 1.5rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
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
		font-size: 0.875rem;
		min-width: 220px;
	}

	.order-buttons {
		display: flex;
		gap: 0;
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

	.calculate-btn {
		padding: 0.45rem 1.25rem;
		border: 1px solid var(--color-accent);
		border-radius: var(--radius);
		background: var(--color-accent);
		color: #fff;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.15s;
	}

	.calculate-btn:hover:not(:disabled) {
		opacity: 0.85;
	}

	.calculate-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.loading {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		color: var(--color-text-muted);
		font-size: 0.875rem;
		margin-bottom: 1.5rem;
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

	.result {
		margin-top: 0.5rem;
	}

	.result-meta {
		font-size: 0.85rem;
		color: var(--color-text-muted);
		margin-bottom: 0.75rem;
	}
</style>
