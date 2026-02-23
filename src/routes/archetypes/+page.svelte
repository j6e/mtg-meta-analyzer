<script lang="ts">
	import { globalAttributionMatrix } from '$lib/stores/tournaments';
	import AttributionMatrix from '$lib/components/AttributionMatrix.svelte';
</script>

<svelte:head>
	<title>Archetypes — MTG Meta Analyzer</title>
</svelte:head>

<h1>Archetypes</h1>

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

	.attribution-section {
		margin-top: 0.5rem;
	}

	.attribution-section h2 {
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
