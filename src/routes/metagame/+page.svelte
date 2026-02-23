<script lang="ts">
	import MatchupMatrix from '$lib/components/MatchupMatrix.svelte';
	import MetagameScatter from '$lib/components/MetagameScatter.svelte';
	import {
		metagameData,
		currentTournament,
		selectedTournamentId,
		tournamentList,
	} from '$lib/stores/tournaments';
	import { settings } from '$lib/stores/settings';

	function handleTournamentChange(e: Event) {
		const select = e.target as HTMLSelectElement;
		$selectedTournamentId = Number(select.value);
	}
</script>

<svelte:head>
	<title>Metagame — MTG Meta Analyzer</title>
</svelte:head>

<h1>Metagame</h1>

<div class="controls">
	<label>
		Tournament
		<select onchange={handleTournamentChange}>
			{#each $tournamentList as t}
				<option value={t.id} selected={t.id === $selectedTournamentId}>{t.name}</option>
			{/each}
		</select>
	</label>

	<label>
		<input type="checkbox" bind:checked={$settings.excludeMirrors} />
		Exclude mirrors
	</label>

	<label>
		<input type="checkbox" bind:checked={$settings.excludePlayoffs} />
		Exclude playoffs
	</label>

	<label>
		Top N
		<input type="number" bind:value={$settings.topN} min="0" max="20" style="width: 4rem" />
		<span class="hint">(0 = all)</span>
	</label>
</div>

{#if $currentTournament}
	<p class="tournament-info">
		{$currentTournament.meta.name} — {Object.keys($currentTournament.players).length} players, {Object.keys($currentTournament.rounds).length} rounds
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
	<p>No data available.</p>
{/if}

<style>
	h1 {
		font-size: 1.5rem;
		margin-bottom: 1rem;
	}

	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		align-items: center;
		margin-bottom: 1rem;
		padding: 0.75rem 1rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		font-size: 0.875rem;
	}

	.controls label {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.controls select,
	.controls input[type='number'] {
		padding: 0.25rem 0.5rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		font-size: 0.875rem;
	}

	.hint {
		color: var(--color-text-muted);
		font-size: 0.75rem;
	}

	.tournament-info {
		color: var(--color-text-muted);
		font-size: 0.85rem;
		margin-bottom: 1rem;
	}

	section {
		margin-bottom: 2rem;
	}

	h2 {
		font-size: 1.15rem;
		font-weight: 600;
		margin-bottom: 0.75rem;
	}
</style>
