<script lang="ts">
	import { globalAttributionMatrix } from '$lib/stores/tournaments';
	import AttributionMatrix from '$lib/components/AttributionMatrix.svelte';
	import ArchetypeEditor from '$lib/components/ArchetypeEditor.svelte';
</script>

<svelte:head>
	<title>Archetypes — MTG Meta Analyzer</title>
</svelte:head>

<h1>Archetypes</h1>

<section class="editor-section">
	<h2>Archetype Configuration</h2>
	<p class="section-desc">
		View and edit archetype signature card definitions. Save custom configs
		and set one as active to re-run classification across all tournaments.
	</p>
	<ArchetypeEditor />
</section>

{#if $globalAttributionMatrix}
	<section class="attribution-section">
		<h2>Classification Attribution</h2>
		<p class="section-desc">
			Compares classifier-assigned archetypes (rows) vs player self-reported archetypes (columns). Cells show decklist counts.
		</p>
		<AttributionMatrix matrix={$globalAttributionMatrix} />
	</section>
{/if}

<style>
	h1 {
		font-size: 1.5rem;
		margin-bottom: 1rem;
	}

	.editor-section {
		margin-bottom: 2rem;
	}

	.attribution-section {
		margin-top: 0.5rem;
	}

	h2 {
		font-size: 1.15rem;
		font-weight: 600;
		margin-bottom: 0.5rem;
	}

	.section-desc {
		font-size: 0.85rem;
		color: var(--color-text-muted);
		margin-bottom: 1rem;
	}
</style>
