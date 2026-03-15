<script lang="ts">
	import FilterPanel from "./FilterPanel.svelte";

	const STORAGE_KEY = "sidebar-collapsed";

	function getInitialCollapsed(): boolean {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored !== null) return stored === "true";
		return window.innerWidth < 768;
	}

	let collapsed = $state(getInitialCollapsed());

	function toggle() {
		collapsed = !collapsed;
		localStorage.setItem(STORAGE_KEY, String(collapsed));
	}
</script>

<aside class:collapsed>
	<button
		class="toggle-btn"
		onclick={toggle}
		title={collapsed ? "Expand filters" : "Collapse filters"}
		aria-label={collapsed ? "Expand filters" : "Collapse filters"}
		aria-expanded={!collapsed}
	>
		{collapsed ? "›" : "‹"}
	</button>
	<div class="sidebar-content" class:hidden={collapsed}>
		<FilterPanel />
	</div>
</aside>

<style>
	aside {
		width: 350px;
		flex-shrink: 0;
		border-right: 1px solid var(--color-border);
		background: var(--color-surface);
		display: flex;
		flex-direction: column;
		transition: width 0.2s ease;
		overflow: hidden;
	}

	aside.collapsed {
		width: 40px;
	}

	.toggle-btn {
		align-self: flex-end;
		margin: 0.5rem;
		width: 1.75rem;
		height: 1.75rem;
		flex-shrink: 0;
		background: none;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		cursor: pointer;
		font-size: 1rem;
		color: var(--color-text-muted);
		display: flex;
		align-items: center;
		justify-content: center;
		line-height: 1;
		transition:
			color 0.15s,
			background 0.15s;
	}

	.toggle-btn:hover {
		color: var(--color-text);
		background: var(--color-bg);
	}

	.sidebar-content {
		padding: 0 0.75rem 1rem;
		overflow-y: auto;
		flex: 1;
	}

	.sidebar-content.hidden {
		display: none;
	}
</style>
