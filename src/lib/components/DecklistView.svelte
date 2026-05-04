<script lang="ts">
	import type { DecklistInfo } from '../types/decklist';
	import type { ClassificationResult } from '../algorithms/archetype-classifier';
	import CardTooltip from './CardTooltip.svelte';

	let {
		decklist,
		playerName = '',
		archetype = '',
		playerRank,
		classificationResult,
	}: {
		decklist: DecklistInfo;
		playerName?: string;
		archetype?: string;
		playerRank?: number;
		classificationResult?: ClassificationResult;
	} = $props();

	const sortByName = (cards: DecklistInfo['mainboard']) =>
		[...cards].sort((a, b) => a.cardName.localeCompare(b.cardName));

	const sortedCommanders = $derived(sortByName(decklist.commanders ?? []));
	const sortedCompanion = $derived(sortByName(decklist.companion ?? []));
	const sortedMainboard = $derived(sortByName(decklist.mainboard));
	const sortedSideboard = $derived(sortByName(decklist.sideboard));

	const mainboardCount = $derived(
		decklist.mainboard.reduce((sum, c) => sum + c.quantity, 0),
	);
	const sideboardCount = $derived(
		decklist.sideboard.reduce((sum, c) => sum + c.quantity, 0),
	);
</script>

<div class="decklist">
	{#if playerName || archetype || playerRank != null}
		<div class="meta">
			{#if playerRank != null}<span class="rank">#{playerRank}</span>{/if}
			{#if playerName}<span class="player">{playerName}</span>{/if}
			{#if archetype}<span class="archetype">{archetype}</span>{/if}
			{#if classificationResult?.method === 'signature'}
				<span class="method-badge method-rules" title="Classified by signature cards">By rules</span>
			{:else if classificationResult?.method === 'reported'}
				<span class="method-badge method-reported" title="Self-reported by player">Self-reported</span>
			{:else if classificationResult?.method === 'centroid'}
				<span class="method-badge method-centroid" title="Classified by nearest centroid (confidence: {classificationResult.confidence.toFixed(2)})">
					By similarity
				</span>
			{:else if classificationResult?.method === 'unknown' && classificationResult.nearestArchetype}
				<span class="method-badge method-unknown" title="Below confidence threshold — nearest: {classificationResult.nearestArchetype} ({classificationResult.confidence.toFixed(2)})">
					Unknown
				</span>
			{/if}
		</div>
	{/if}

	{#if decklist.commanders && decklist.commanders.length > 0}
		<section>
			<h3>Commander</h3>
			<ul>
				{#each sortedCommanders as card}
					<li>
						<span class="qty">{card.quantity}x</span>
						<CardTooltip cardName={card.cardName}>
							<span class="card-name">{card.cardName}</span>
						</CardTooltip>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if decklist.companion && decklist.companion.length > 0}
		<section>
			<h3>Companion</h3>
			<ul>
				{#each sortedCompanion as card}
					<li>
						<span class="qty">{card.quantity}x</span>
						<CardTooltip cardName={card.cardName}>
							<span class="card-name">{card.cardName}</span>
						</CardTooltip>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<section>
		<h3>Mainboard <span class="count">({mainboardCount})</span></h3>
		<ul>
			{#each sortedMainboard as card}
				<li>
					<span class="qty">{card.quantity}x</span>
					<CardTooltip cardName={card.cardName}>
						<span class="card-name">{card.cardName}</span>
					</CardTooltip>
				</li>
			{/each}
		</ul>
	</section>

	{#if decklist.sideboard.length > 0}
		<section>
			<h3>Sideboard <span class="count">({sideboardCount})</span></h3>
			<ul>
				{#each sortedSideboard as card}
					<li>
						<span class="qty">{card.quantity}x</span>
						<CardTooltip cardName={card.cardName}>
							<span class="card-name">{card.cardName}</span>
						</CardTooltip>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>

<style>
	.decklist {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		padding: 1rem 1.25rem;
		font-size: 0.85rem;
		max-width: 360px;
	}

	.meta {
		margin-bottom: 0.75rem;
		display: flex;
		gap: 0.5rem;
		align-items: center;
		flex-wrap: wrap;
	}

	.rank {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text-muted);
		background: var(--color-surface-alt, rgba(0, 0, 0, 0.05));
		padding: 0.1rem 0.4rem;
		border-radius: 4px;
		font-variant-numeric: tabular-nums;
	}

	.player {
		font-weight: 600;
	}

	.archetype {
		font-size: 0.75rem;
		color: var(--color-accent);
		background: rgba(79, 70, 229, 0.08);
		padding: 0.15rem 0.5rem;
		border-radius: 9999px;
	}

	.method-badge {
		font-size: 0.7rem;
		padding: 0.1rem 0.45rem;
		border-radius: 9999px;
		font-weight: 500;
		white-space: nowrap;
	}

	.method-rules {
		color: var(--color-text-muted);
		background: var(--color-surface-alt, rgba(0, 0, 0, 0.05));
	}

	.method-centroid {
		color: #1d6fb8;
		background: rgba(29, 111, 184, 0.08);
	}

	.method-reported {
		color: #6a3fb0;
		background: rgba(106, 63, 176, 0.08);
	}

	.method-unknown {
		color: var(--color-text-muted);
		background: var(--color-surface-alt, rgba(0, 0, 0, 0.05));
		cursor: help;
	}

	section {
		margin-bottom: 0.75rem;
	}

	section:last-child {
		margin-bottom: 0;
	}

	h3 {
		font-size: 0.8rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--color-text-muted);
		margin-bottom: 0.35rem;
	}

	.count {
		font-weight: 400;
	}

	ul {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	li {
		display: flex;
		gap: 0.35rem;
		padding: 0.1rem 0;
		line-height: 1.5;
	}

	.qty {
		color: var(--color-text-muted);
		min-width: 1.75rem;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.card-name {
		color: var(--color-text);
	}
</style>
