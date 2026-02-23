<script lang="ts">
	import { base } from '$app/paths';
</script>

<svelte:head>
	<title>MTG Meta Analyzer</title>
</svelte:head>

<div class="home">
	<h1>MTG Meta Analyzer</h1>
	<p class="subtitle">
		Tournament metagame analysis for competitive Magic: The Gathering.
	</p>

	<p class="beta-notice">
		This project is in beta — data may be incomplete or inaccurate.
		Found a bug or have feedback?
		<a href="https://github.com/j6e/mtg-meta-analyzer/issues" target="_blank" rel="noopener">Open an issue on GitHub</a>.
	</p>

	<div class="cards">
		<a href="{base}/metagame" class="card">
			<h2>Metagame</h2>
			<p>Archetype win rates, matchup matrices, and metagame share breakdowns.</p>
		</a>
		<a href="{base}/tournaments" class="card">
			<h2>Tournaments</h2>
			<p>Browse tournament results and round-by-round match data.</p>
		</a>
		<a href="{base}/archetypes" class="card">
			<h2>Archetypes</h2>
			<p>View archetype definitions and signature card lists used for classification.</p>
		</a>
	</div>
</div>

<style>
	.home {
		max-width: 720px;
	}

	h1 {
		font-size: 1.75rem;
		font-weight: 700;
		margin-bottom: 0.5rem;
	}

	.subtitle {
		color: var(--color-text-muted);
		margin-bottom: 2rem;
	}

	.beta-notice {
		font-size: 0.85rem;
		color: var(--color-text-muted);
		margin-bottom: 2rem;
	}

	.cards {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.card {
		display: block;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		padding: 1.25rem 1.5rem;
		text-decoration: none;
		color: inherit;
		transition: border-color 0.15s, box-shadow 0.15s;
	}

	.card:hover {
		border-color: var(--color-accent);
		box-shadow: 0 1px 4px rgba(79, 70, 229, 0.1);
		text-decoration: none;
		color: inherit;
	}

	.card h2 {
		font-size: 1.1rem;
		font-weight: 600;
		margin-bottom: 0.25rem;
		color: var(--color-text);
	}

	.card p {
		font-size: 0.9rem;
		color: var(--color-text-muted);
		line-height: 1.5;
	}
</style>
