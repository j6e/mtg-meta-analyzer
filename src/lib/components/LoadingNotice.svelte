<script lang="ts">
	import { settings } from '$lib/stores/settings';
</script>

<p class="loading-notice" data-testid="loading-notice">
	<span class="spinner"></span>
	Loading {$settings.format} tournament data…
</p>

<style>
	.loading-notice {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--color-text-muted);
		margin: 2rem 0;
	}

	.spinner {
		width: 1rem;
		height: 1rem;
		border: 2px solid var(--color-border);
		border-top-color: var(--color-text-muted);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
