<script lang="ts">
	import { getScryfallImageUrl } from '../utils/card-normalizer';

	let { cardName, children }: { cardName: string; children: any } = $props();

	let visible = $state(false);
	let loaded = $state(false);
	let error = $state(false);
	let x = $state(0);
	let y = $state(0);

	/** Use 'normal' size (488×680) for good quality without being too large. */
	const imageUrl = $derived(getScryfallImageUrl(cardName, 'normal'));

	function show(e: MouseEvent) {
		visible = true;
		updatePosition(e);
	}

	function hide() {
		visible = false;
	}

	function move(e: MouseEvent) {
		if (visible) updatePosition(e);
	}

	function updatePosition(e: MouseEvent) {
		const padding = 12;
		const tooltipWidth = 252;
		const tooltipHeight = 352;

		let newX = e.clientX + padding;
		let newY = e.clientY + padding;

		// Avoid overflowing right edge
		if (newX + tooltipWidth > window.innerWidth) {
			newX = e.clientX - tooltipWidth - padding;
		}
		// Avoid overflowing bottom edge
		if (newY + tooltipHeight > window.innerHeight) {
			newY = e.clientY - tooltipHeight - padding;
		}

		x = Math.max(0, newX);
		y = Math.max(0, newY);
	}

	function onLoad() {
		loaded = true;
		error = false;
	}

	function onError() {
		error = true;
		loaded = false;
	}
</script>

<span
	class="card-tooltip-trigger"
	onmouseenter={show}
	onmouseleave={hide}
	onmousemove={move}
	role="button"
	tabindex="0"
>
	{@render children?.()}
</span>

{#if visible}
	<div class="card-tooltip" style="left: {x}px; top: {y}px;" role="tooltip">
		{#if !error}
			<img
				src={imageUrl}
				alt={cardName}
				class="card-image"
				class:loading={!loaded}
				onload={onLoad}
				onerror={onError}
			/>
			{#if !loaded}
				<div class="placeholder">Loading...</div>
			{/if}
		{:else}
			<div class="fallback">{cardName}</div>
		{/if}
	</div>
{/if}

<style>
	.card-tooltip-trigger {
		cursor: pointer;
		border-bottom: 1px dotted var(--color-text-muted);
	}

	.card-tooltip {
		position: fixed;
		z-index: 1000;
		width: 252px;
		border-radius: 10px;
		overflow: hidden;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
		background: var(--color-surface);
		pointer-events: none;
	}

	.card-image {
		display: block;
		width: 100%;
		height: auto;
		border-radius: 10px;
	}

	.card-image.loading {
		display: none;
	}

	.placeholder {
		padding: 2rem;
		text-align: center;
		color: var(--color-text-muted);
		font-size: 0.85rem;
		min-height: 352px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.fallback {
		padding: 1rem;
		text-align: center;
		font-size: 0.85rem;
		color: var(--color-text);
		min-height: 3rem;
		display: flex;
		align-items: center;
		justify-content: center;
	}
</style>
