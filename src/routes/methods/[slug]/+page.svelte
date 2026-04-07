<script lang="ts">
	import { page } from "$app/state";
	import { base } from "$app/paths";
	import { getArticleBySlug } from "$lib/data/methods-articles";

	const slug = $derived(page.params.slug ?? "");
	const article = $derived(getArticleBySlug(slug));
</script>

<svelte:head>
	<title>{article?.title ?? "Not Found"} — Methods — MTG Meta Analyzer</title>
</svelte:head>

{#if article}
	<div class="breadcrumb">
		<a href="{base}/methods">Methods</a> / {article.title}
	</div>

	<article class="method-article">
		<h1>{article.title}</h1>

		<p class="used-on">
			Used on:
			{#each article.usedOn as tag, i}
				<a href="{base}{tag.href}">{tag.label}</a>{#if i < article.usedOn.length - 1},{/if}
			{/each}
		</p>

		{#each article.sections as section}
			<section>
				<h2>{section.heading}</h2>
				{@html section.content}
			</section>
		{/each}
	</article>
{:else}
	<div class="breadcrumb">
		<a href="{base}/methods">Methods</a> / Not Found
	</div>
	<p class="not-found">Article not found.</p>
{/if}

<style>
	.breadcrumb {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		margin-bottom: 1rem;
	}

	.breadcrumb a {
		color: var(--color-text-muted);
		text-decoration: none;
	}

	.breadcrumb a:hover {
		color: var(--color-accent);
		text-decoration: underline;
	}

	.method-article {
		max-width: 720px;
	}

	.method-article h1 {
		font-size: 1.5rem;
		font-weight: 700;
		margin-bottom: 0.5rem;
	}

	.used-on {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		margin-bottom: 2rem;
	}

	.used-on a {
		color: var(--color-accent);
		text-decoration: none;
	}

	.used-on a:hover {
		text-decoration: underline;
	}

	.method-article h2 {
		font-size: 1.15rem;
		font-weight: 600;
		margin-top: 2rem;
		margin-bottom: 0.75rem;
	}

	.method-article section {
		font-size: 0.9rem;
		color: var(--color-text);
		line-height: 1.75;
	}

	.method-article section :global(p) {
		margin-bottom: 0.75rem;
	}

	.method-article section :global(ul),
	.method-article section :global(ol) {
		margin-bottom: 0.75rem;
		padding-left: 1.5rem;
	}

	.method-article section :global(li) {
		margin-bottom: 0.35rem;
	}

	.method-article section :global(a) {
		color: var(--color-accent);
		text-decoration: none;
	}

	.method-article section :global(a:hover) {
		text-decoration: underline;
	}

	.method-article section :global(code) {
		font-family: var(--font-mono);
		font-size: 0.85em;
		background: var(--color-bg);
		padding: 0.1rem 0.35rem;
		border-radius: 3px;
	}

	/* Formula blocks — monospace, centered, with spacing */
	.method-article section :global(.formula-block) {
		font-family: var(--font-mono);
		font-size: 0.95em;
		text-align: center;
		padding: 0.75rem 1rem;
		margin: 0.75rem 0;
		background: var(--color-bg);
		border-radius: var(--radius);
		line-height: 2;
	}

	/* Fraction rendering */
	.method-article section :global(.frac) {
		display: inline-flex;
		flex-direction: column;
		align-items: stretch;
		vertical-align: middle;
		font-size: 0.85em;
		line-height: 1.2;
	}

	.method-article section :global(.frac .num) {
		border-bottom: 1px solid var(--color-text);
		text-align: center;
		padding-bottom: 2px;
	}

	.method-article section :global(.frac .den) {
		text-align: center;
		padding-top: 2px;
	}

	/* Tables within articles */
	.method-article section :global(.method-table) {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
		margin: 0.75rem 0;
	}

	.method-article section :global(.method-table th),
	.method-article section :global(.method-table td) {
		padding: 0.4rem 0.6rem;
		border-bottom: 1px solid var(--color-border);
		text-align: left;
	}

	.method-article section :global(.method-table th) {
		font-weight: 600;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-muted);
	}

	.method-article section :global(.method-table tbody tr:hover) {
		background: rgba(79, 70, 229, 0.04);
	}

	.not-found {
		color: var(--color-text-muted);
		margin-top: 1rem;
	}
</style>
