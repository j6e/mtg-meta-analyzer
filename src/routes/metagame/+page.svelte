<script lang="ts">
	import MatchupMatrix from '$lib/components/MatchupMatrix.svelte';
	import MetagameScatter from '$lib/components/MetagameScatter.svelte';
	import FilterPanel from '$lib/components/FilterPanel.svelte';
	import {
		metagameData,
		filteredTournaments,
		tournamentList,
		availableFormats,
		archetypeStats,
	} from '$lib/stores/tournaments';

	const playerCount = $derived(
		$filteredTournaments.reduce((sum, t) => sum + Object.keys(t.players).length, 0),
	);
	const decklistCount = $derived(
		$filteredTournaments.reduce((sum, t) => sum + Object.keys(t.decklists).length, 0),
	);
	const unknownCount = $derived(
		$archetypeStats.find((s) => s.name === 'Unknown')?.playerCount ?? 0,
	);
</script>

<svelte:head>
	<title>Metagame — MTG Meta Analyzer</title>
</svelte:head>

<h1>Metagame</h1>

<FilterPanel tournaments={$tournamentList} formats={$availableFormats} />

{#if $filteredTournaments.length > 0}
	<p class="tournament-info">
		{$filteredTournaments.length} tournament{$filteredTournaments.length !== 1 ? 's' : ''} —
		{playerCount} players, {decklistCount} decklists{#if unknownCount > 0}
			<span class="warning"> ({unknownCount} unclassified)</span>
		{/if}
	</p>
{/if}

{#if $metagameData}
	<section>
		<h2>Metagame Share vs Win Rate</h2>
		<MetagameScatter stats={$metagameData.stats} />
	</section>

	<section>
		<h2>Matchup Matrix</h2>
		<MatchupMatrix matrix={$metagameData.matrix} stats={$metagameData.stats} />
	</section>
{:else}
	<p class="no-data">No data available for the current filters.</p>
{/if}

<style>
	h1 {
		font-size: 1.5rem;
		margin-bottom: 1rem;
	}

	.tournament-info {
		color: var(--color-text-muted);
		font-size: 0.85rem;
		margin: 1rem 0;
	}

	section {
		margin-bottom: 2rem;
	}

	h2 {
		font-size: 1.15rem;
		font-weight: 600;
		margin-bottom: 0.75rem;
	}

	.warning {
		color: #b45309;
	}

	.no-data {
		color: var(--color-text-muted);
		margin-top: 1rem;
	}
</style>
