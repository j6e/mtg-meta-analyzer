<script lang="ts">
	import '../app.css';
	import { base } from '$app/paths';
	import { page } from '$app/state';

	let { children } = $props();

	const navLinks = [
		{ href: '/metagame', label: 'Metagame' },
		{ href: '/tournaments', label: 'Tournaments' },
		{ href: '/archetypes', label: 'Archetypes' },
	];

	function isActive(href: string): boolean {
		return page.url.pathname.startsWith(base + href);
	}
</script>

<div class="app">
	<header>
		<nav>
			<a href="{base}/" class="logo">MTG Meta Analyzer</a>
			<div class="nav-links">
				{#each navLinks as link}
					<a href="{base}{link.href}" class:active={isActive(link.href)}>{link.label}</a>
				{/each}
			</div>
		</nav>
	</header>
	<main>
		{@render children()}
	</main>
	<footer>
		<div class="footer-inner">
			<p>
				&copy; 2026 Joan G.E. &mdash;
				Code: <a href="https://opensource.org/licenses/MIT" target="_blank" rel="noopener">MIT</a>,
				Content: <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>
			</p>
			<p class="disclaimer">
				Data from <a href="https://melee.gg" target="_blank" rel="noopener">melee.gg</a>
				&amp; <a href="https://scryfall.com" target="_blank" rel="noopener">Scryfall</a>.
				Magic: The Gathering is &trade; &amp; &copy; Wizards of the Coast.
				Not affiliated with or endorsed by WotC.
			</p>
		</div>
	</footer>
</div>

<style>
	.app {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
	}

	header {
		background: var(--color-header-bg);
		color: var(--color-header-text);
		padding: 0 1.5rem;
		position: sticky;
		top: 0;
		z-index: 100;
	}

	nav {
		max-width: var(--max-width);
		margin: 0 auto;
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 3.25rem;
		gap: 2rem;
	}

	.logo {
		font-weight: 700;
		font-size: 1.05rem;
		color: var(--color-header-text);
		text-decoration: none;
		white-space: nowrap;
	}

	.logo:hover {
		color: #fff;
		text-decoration: none;
	}

	.nav-links {
		display: flex;
		gap: 0.25rem;
	}

	.nav-links a {
		color: rgba(240, 240, 245, 0.7);
		padding: 0.375rem 0.75rem;
		border-radius: var(--radius);
		font-size: 0.875rem;
		transition: color 0.15s, background 0.15s;
		text-decoration: none;
	}

	.nav-links a:hover {
		color: #fff;
		background: rgba(255, 255, 255, 0.08);
		text-decoration: none;
	}

	.nav-links a.active {
		color: #fff;
		background: rgba(255, 255, 255, 0.12);
	}

	main {
		flex: 1;
		max-width: var(--max-width);
		margin: 0 auto;
		padding: 2rem 1.5rem;
		width: 100%;
	}

	footer {
		background: var(--color-header-bg);
		color: rgba(240, 240, 245, 0.5);
		padding: 1rem 1.5rem;
		font-size: 0.75rem;
		line-height: 1.6;
	}

	.footer-inner {
		max-width: var(--max-width);
		margin: 0 auto;
		text-align: center;
	}

	.footer-inner a {
		color: rgba(240, 240, 245, 0.7);
		text-decoration: underline;
		text-decoration-color: rgba(240, 240, 245, 0.25);
		text-underline-offset: 2px;
	}

	.footer-inner a:hover {
		color: #fff;
		text-decoration-color: rgba(255, 255, 255, 0.5);
	}

	.disclaimer {
		margin-top: 0.25rem;
	}

	@media (max-width: 600px) {
		nav {
			flex-direction: column;
			height: auto;
			padding: 0.75rem 0;
			gap: 0.5rem;
		}
	}
</style>
