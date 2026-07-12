<script lang="ts">
	import type { CardImageEntry } from '../stores/card-images';

	let {
		art,
		name,
		color,
	}: { art: CardImageEntry | null; name: string; color: string } = $props();
</script>

{#if art?.art_crop}
	<!-- crossorigin keeps the browser cache coherent with the CORS-mode
	     plugin loads of the same URL (else Chrome blocks the second use) -->
	<img class="legend-art" crossorigin="anonymous" src={art.art_crop} alt={name} />
{:else}
	<span class="dot" style="background: {color}"></span>
{/if}

<style>
	.legend-art {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		object-fit: cover;
		border: 1px solid var(--color-border);
	}

	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		display: inline-block;
	}
</style>
