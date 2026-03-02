<script lang="ts">
	import { base } from "$app/paths";
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
		This project is in beta — data may be incomplete or inaccurate. Found a
		bug or have feedback?
		<a
			href="https://github.com/j6e/mtg-meta-analyzer/issues"
			target="_blank"
			rel="noopener">Open an issue on GitHub</a
		>.
	</p>

	<div class="cards">
		<a href="{base}/metagame" class="card">
			<h2>Metagame</h2>
			<p>
				Archetype win rates, matchup matrices, and metagame share
				breakdowns.
			</p>
		</a>
		<a href="{base}/tournaments" class="card">
			<h2>Tournaments</h2>
			<p>Browse tournament results and round-by-round match data.</p>
		</a>
		<a href="{base}/archetypes" class="card">
			<h2>Archetypes</h2>
			<p>
				Browse archetype stats, matchups, decklists, and composition.
			</p>
		</a>
		<a href="{base}/archetype-cleaner" class="card">
			<h2>Archetype Cleaner</h2>
			<p>
				Edit signature card definitions and review classification attribution.
			</p>
		</a>
	</div>

	<section class="manifesto">
		<h2>Open data, open community</h2>
		<p>
			MTG Meta Analyzer will <strong>never</strong> be monetized, paywalled,
			or gated behind a subscription. No ads, no premium tiers, no "sign up
			to see winrates." All data and source code are freely available under
			open licenses.
		</p>
		<p>
			I believe metagame data belongs to the community that generates it.
			When players share their results, everyone benefits — from the
			first-time FNM player looking up matchups to the seasoned grinder
			tuning a sideboard. Locking that knowledge behind a paywall
			undermines the very community that makes it possible.
		</p>
		<p>
			This project is built from the community, for the community.
			<a
				href="https://github.com/j6e/mtg-meta-analyzer"
				target="_blank"
				rel="noopener">Contribute on GitHub</a
			>
			— whether it's reporting data issues, improving classification rules,
			or whatever else you can think of.
		</p>
	</section>
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
		transition:
			border-color 0.15s,
			box-shadow 0.15s;
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

	.manifesto {
		margin-top: 2.5rem;
		border-top: 1px solid var(--color-border);
		padding-top: 2rem;
	}

	.manifesto h2 {
		font-size: 1.15rem;
		font-weight: 600;
		margin-bottom: 0.75rem;
	}

	.manifesto p {
		font-size: 0.9rem;
		color: var(--color-text-muted);
		line-height: 1.65;
		margin-bottom: 0.75rem;
	}

	.manifesto p:last-child {
		margin-bottom: 0;
	}
</style>
