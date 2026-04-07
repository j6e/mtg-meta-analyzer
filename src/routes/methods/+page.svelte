<script lang="ts">
	import { base } from "$app/paths";
	import { methodArticles } from "$lib/data/methods-articles";
</script>

<svelte:head>
	<title>Methods — MTG Meta Analyzer</title>
</svelte:head>

<div class="breadcrumb">
	<a href="{base}/">Home</a> / Methods
</div>

<h1>Methods</h1>
<p class="subtitle">
	Mathematical methods and operative decisions behind the data on this site.
	Each article explains what we compute, how, and why.
</p>

<div class="methods-grid">
	{#each methodArticles as article}
		<a href="{base}/methods/{article.slug}" class="method-card">
			<h2>{article.title}</h2>
			<p class="card-desc">{article.description}</p>
			<div class="tags">
				{#each article.usedOn as tag}
					<span class="tag">{tag.label}</span>
				{/each}
			</div>
		</a>
	{/each}
</div>

<style>
	h1 {
		font-size: 1.5rem;
		margin-bottom: 0.5rem;
	}

	.subtitle {
		color: var(--color-text-muted);
		font-size: 0.9rem;
		line-height: 1.5;
		margin-bottom: 2rem;
		max-width: 640px;
	}

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

	.methods-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 0.75rem;
	}

	.method-card {
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

	.method-card:hover {
		border-color: var(--color-accent);
		box-shadow: 0 1px 4px rgba(79, 70, 229, 0.1);
		text-decoration: none;
		color: inherit;
	}

	.method-card h2 {
		font-size: 1.05rem;
		font-weight: 600;
		margin-bottom: 0.35rem;
		color: var(--color-text);
	}

	.card-desc {
		font-size: 0.85rem;
		color: var(--color-text-muted);
		line-height: 1.5;
		margin-bottom: 0.75rem;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}

	.tag {
		display: inline-block;
		font-size: 0.7rem;
		padding: 0.15rem 0.5rem;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: 9999px;
		color: var(--color-text-muted);
	}
</style>
