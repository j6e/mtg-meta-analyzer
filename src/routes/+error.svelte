<script lang="ts">
	import { page } from '$app/state';
	import { base } from '$app/paths';
</script>

<svelte:head>
	<title>Not Found — MTG Meta Analyzer</title>
</svelte:head>

<div class="error-page">
	<h1>{page.status}</h1>
	<p class="message">{page.error?.message ?? 'Page not found'}</p>
	<a href="{base}/">Back to home</a>
</div>

<style>
	.error-page {
		text-align: center;
		padding: 4rem 1rem;
	}

	h1 {
		font-size: 3rem;
		font-weight: 700;
		color: var(--color-text-muted);
		margin-bottom: 0.5rem;
	}

	.message {
		color: var(--color-text-muted);
		margin-bottom: 2rem;
		font-size: 1.1rem;
	}

	a {
		color: var(--color-accent);
		text-decoration: none;
		font-size: 0.9rem;
	}

	a:hover {
		text-decoration: underline;
	}
</style>
