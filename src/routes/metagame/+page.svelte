<script lang="ts">
	import MatchupMatrix from '$lib/components/MatchupMatrix.svelte';
	import MetagameEvolution from '$lib/components/MetagameEvolution.svelte';
	import MetagameScatter from '$lib/components/MetagameScatter.svelte';
	import {
		archetypeCardMap,
		archetypeStats,
		filteredTournaments,
		metagameData,
		playerArchetypes,
	} from '$lib/stores/tournaments';
	import { settings } from '$lib/stores/settings';
	import type { MatrixOptions } from '$lib/utils/winrate-calculator';

	const noTournamentsSelected = $derived($settings.selectedTournamentIds.length === 0);
	const matrixOpts = $derived<MatrixOptions>({
		excludeMirrors: $settings.excludeMirrors,
		topN: $settings.otherMode === 'topN' ? $settings.topN : 0,
		minMetagameShare: $settings.otherMode === 'minShare' ? $settings.minMetagameShare / 100 : 0,
		useStandings: $settings.useStandings,
	});
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
		<h2>Matchup Matrix <span class="info-icon" title="Win rates = wins / (wins + losses + draws). Draws count against both sides, so opposing win rates may not sum to 100%. Byes and intentional draws (0-0-3) are excluded.">?</span></h2>
		<MatchupMatrix matrix={$metagameData.matrix} stats={$metagameData.stats} />
	</section>

	<section>
		<h2>Metagame Share Evolution</h2>
		<MetagameEvolution
			tournaments={$filteredTournaments}
			playerArchetypes={$playerArchetypes}
			matrixOptions={matrixOpts}
			archetypeCardMap={$archetypeCardMap}
		/>
	</section>
{:else if noTournamentsSelected}
	<p class="no-data warning">No tournaments selected. Select at least one tournament to run the analysis.</p>
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
		color: var(--color-warning);
	}

	.info-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.1rem;
		height: 1.1rem;
		border-radius: 50%;
		border: 1px solid var(--color-text-muted);
		color: var(--color-text-muted);
		font-size: 0.65rem;
		font-weight: 600;
		cursor: help;
		vertical-align: middle;
		margin-left: 0.25rem;
	}

	.no-data {
		color: var(--color-text-muted);
		margin-top: 1rem;
	}

	.no-data.warning {
		color: var(--color-warning);
	}
</style>
