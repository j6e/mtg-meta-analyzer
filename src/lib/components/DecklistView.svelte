<script lang="ts">
	import type { DecklistInfo, DecklistPlayer, DecklistTournament } from '../types/decklist';
	import type { ClassificationResult } from '../algorithms/archetype-classifier';
	import CardTooltip from './CardTooltip.svelte';
	import {
		type CardKind,
		cardImageIndex,
		ensureCardImagesLoaded,
		lookupCardType,
	} from '../stores/card-images';

	let {
		decklist,
		player,
		tournament,
		archetype = '',
		classificationResult,
	}: {
		decklist: DecklistInfo;
		player?: DecklistPlayer;
		tournament?: DecklistTournament;
		archetype?: string;
		classificationResult?: ClassificationResult;
	} = $props();

	const playerCountSuffix = $derived(
		tournament && tournament.playerCount > 0 ? `, ${tournament.playerCount} players` : '',
	);

	const sortByName = (cards: DecklistInfo['mainboard']) =>
		[...cards].sort((a, b) => a.cardName.localeCompare(b.cardName));

	const sortedCommanders = $derived(sortByName(decklist.commanders ?? []));
	const sortedCompanion = $derived(sortByName(decklist.companion ?? []));
	const sortedMainboard = $derived(sortByName(decklist.mainboard));
	const sortedSideboard = $derived(sortByName(decklist.sideboard));

	$effect(() => {
		void ensureCardImagesLoaded();
	});

	const MAINBOARD_GROUPS: { kind: CardKind; label: string }[] = [
		{ kind: 'land', label: 'Lands' },
		{ kind: 'creature', label: 'Creatures' },
		{ kind: 'other', label: 'Other cards' },
	];

	// Without a usable index (loading, or failed) show one ungrouped list.
	const mainboardGroups = $derived.by(() => {
		const cardsWithType = sortedMainboard.map((card) => ({
			card,
			type: lookupCardType($cardImageIndex, card.cardName),
		}));
		if (cardsWithType.some(({ type }) => type === null)) {
			return [{ label: 'Mainboard', cards: sortedMainboard }];
		}
		return MAINBOARD_GROUPS.map(({ kind, label }) => ({
			label,
			cards: cardsWithType.filter(({ type }) => type?.kind === kind).map(({ card }) => card),
		})).filter((group) => group.cards.length > 0);
	});

	const mainboardCount = $derived(
		decklist.mainboard.reduce((sum, c) => sum + c.quantity, 0),
	);
	const sideboardCount = $derived(
		decklist.sideboard.reduce((sum, c) => sum + c.quantity, 0),
	);
</script>

<div class="decklist">
	{#snippet tournamentLink(t: DecklistTournament)}
		{#if t.url}
			<a href={t.url} target="_blank" rel="noopener">{t.name}</a>
		{:else}
			{t.name}
		{/if}
	{/snippet}

	{#if player || archetype || tournament}
		<div class="meta">
			{#if tournament}
				<div class="tournament-row">
					<span class="tournament">{@render tournamentLink(tournament)}{playerCountSuffix}</span>
					{#if tournament.date}
						<time class="date" datetime={tournament.date}>{tournament.date}</time>
					{/if}
				</div>
			{/if}
			{#if player}
				<span class="player">{player.name}</span>
				<span class="rank">#{player.rank}{player.record ? ` (${player.record})` : ''}</span>
			{/if}
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
		{#each mainboardGroups as group}
			<ul aria-label={group.label}>
				{#each group.cards as card}
					<li>
						<span class="qty">{card.quantity}x</span>
						<CardTooltip cardName={card.cardName}>
							<span class="card-name">{card.cardName}</span>
						</CardTooltip>
					</li>
				{/each}
			</ul>
		{/each}
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
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--color-border);
		display: flex;
		gap: 0.5rem;
		align-items: center;
		flex-wrap: wrap;
	}

	.tournament-row {
		flex-basis: 100%;
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.5rem;
	}

	.tournament {
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.tournament a {
		font-weight: 600;
	}

	.date {
		white-space: nowrap;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	.rank {
		white-space: nowrap;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text-muted);
		background: var(--color-surface-alt, rgba(0, 0, 0, 0.05));
		padding: 0.1rem 0.4rem;
		border-radius: 4px;
		font-variant-numeric: tabular-nums;
	}

	.player {
		flex: 1;
		min-width: 0;
		font-weight: 600;
		overflow-wrap: anywhere;
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

	ul + ul {
		margin-top: 0.75rem;
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
