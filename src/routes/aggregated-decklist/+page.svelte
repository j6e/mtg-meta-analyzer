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

<section class="algorithm-info">
	<p>
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
		<div class="order-card">
			<h3>Order 1</h3>
			<p>Pure popularity. Each card-copy scored by how many decklists include it.</p>
			<p class="formula">score = freq <span class="op">&times;</span> &frac12;</p>
		</div>
		<div class="order-card">
			<h3>Order 2</h3>
			<p>Adds pair synergy &mdash; cards that appear together get a boost, keeping coherent packages intact.</p>
			<p class="formula">score = freq <span class="op">&times;</span> &frac12; <span class="op">+</span> avg pair freq <span class="op">&times;</span> &frac14;</p>
		</div>
		<div class="order-card">
			<h3>Order 3</h3>
			<p>Adds triple synergy on top of pairs, capturing deeper three-card interactions.</p>
			<p class="formula">score = freq <span class="op">&times;</span> &frac12; <span class="op">+</span> avg pair freq <span class="op">&times;</span> &frac14; <span class="op">+</span> avg triple freq <span class="op">&times;</span> &frac18;</p>
		</div>
	</div>
</section>

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
		margin-bottom: 0.5rem;
	}

	.algorithm-info {
		margin-bottom: 1.75rem;
	}

	.algorithm-info > p {
		color: var(--color-text-muted);
		font-size: 0.875rem;
		line-height: 1.6;
		max-width: 720px;
		margin-bottom: 1rem;
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
