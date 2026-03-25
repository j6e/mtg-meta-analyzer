<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { parseEventYaml, type ParsedEvent, type ValuationParams } from '$lib/algorithms/ev-calculator';
	import { validateEventYaml } from '$lib/utils/event-validator';
	import {
		BUILTIN_EVENT_CONFIGS,
		DEFAULT_EVENT_ID,
		savedEventConfigs,
		activeEventId,
		activeEventYaml,
		saveEventConfig,
		updateEventConfig,
		deleteEventConfig,
		setActiveEvent,
		type SavedEventConfig,
	} from '$lib/stores/event-configs';
	import PayoutTable from '$lib/components/PayoutTable.svelte';
	import EvCurveChart from '$lib/components/EvCurveChart.svelte';

	// --- Currency ---

	const CURRENCIES = [
		{ code: 'USD', symbol: '$' },
		{ code: 'EUR', symbol: '€' },
	] as const;

	// Arena store gem bundles (prices in USD, converted by currency rate)
	const GEM_BUNDLES = [
		{ gems: 750,   usd: 4.99,  label: '750 gems' },
		{ gems: 1600,  usd: 9.99,  label: '1,600 gems' },
		{ gems: 3400,  usd: 19.99, label: '3,400 gems' },
		{ gems: 9200,  usd: 49.99, label: '9,200 gems' },
		{ gems: 20000, usd: 99.99, label: '20,000 gems' },
	] as const;

	// Approximate USD conversion rates
	const CURRENCY_RATES: Record<string, number> = {
		USD: 1,
		EUR: 0.92,
	};

	let currency = $state('USD');
	let selectedBundleIdx = $state(4); // default: best rate (20,000 gems)

	const currencySymbol = $derived(CURRENCIES.find(c => c.code === currency)?.symbol ?? '€');
	const rate = $derived(CURRENCY_RATES[currency] ?? 1);

	/** Price per 1000 gems for the selected bundle, in chosen currency. */
	const gemsValue = $derived(() => {
		const bundle = GEM_BUNDLES[selectedBundleIdx];
		const priceInCurrency = bundle.usd * rate;
		return (priceInCurrency / bundle.gems) * 1000;
	});

	// --- URL params ---

	let packsValue = $state(1);     // per pack
	let boxValue = $state(120);     // per booster box
	let minWrPct = $state(0);       // min win rate %
	let maxWrPct = $state(100);     // max win rate %
	let nRuns = $state(1);          // number of event entries

	// --- Editor state ---

	let editorYaml = $state('');
	let showEditor = $state(false);
	let showSaveForm = $state(false);
	let saveName = $state('');
	let validationErrors = $state<string[]>([]);

	// --- Derived ---

	const selectedId = $derived($activeEventId);
	const yaml = $derived($activeEventYaml);
	const isBuiltin = $derived(BUILTIN_EVENT_CONFIGS.some(c => c.id === selectedId));

	const allConfigs = $derived([
		...BUILTIN_EVENT_CONFIGS.map(c => ({ id: c.id, name: c.displayName, builtin: true })),
		...$savedEventConfigs.map(c => ({ id: c.id, name: c.name, builtin: false })),
	]);

	const parsedEvent = $derived.by((): ParsedEvent | null => {
		try {
			return parseEventYaml(showEditor ? editorYaml : yaml);
		} catch {
			return null;
		}
	});

	const valuation = $derived((): ValuationParams => ({
		gems: gemsValue() / 1000,     // convert per-1000-gems to per-gem
		packs: packsValue,
		booster_boxes: boxValue,
	}));

	// --- URL state sync ---

	function readUrlParams() {
		const params = page.url.searchParams;
		const eventParam = params.get('event');
		if (eventParam) setActiveEvent(eventParam);
		const cur = params.get('cur');
		if (cur && CURRENCIES.some(c => c.code === cur)) currency = cur;
		const bi = params.get('bundle');
		if (bi != null) {
			const idx = Number(bi);
			if (Number.isInteger(idx) && idx >= 0 && idx < GEM_BUNDLES.length) selectedBundleIdx = idx;
		}
		const p = params.get('packs');
		if (p != null && Number.isFinite(Number(p))) packsValue = Number(p);
		const b = params.get('box');
		if (b != null && Number.isFinite(Number(b))) boxValue = Number(b);
		const mn = params.get('minWr');
		if (mn != null && Number.isFinite(Number(mn))) minWrPct = Number(mn);
		const mx = params.get('maxWr');
		if (mx != null && Number.isFinite(Number(mx))) maxWrPct = Number(mx);
		const nr = params.get('runs');
		if (nr != null && Number.isFinite(Number(nr)) && Number(nr) >= 1) nRuns = Math.round(Number(nr));
	}

	function buildQueryString(): string {
		const params = new URLSearchParams();
		if (selectedId !== DEFAULT_EVENT_ID) params.set('event', selectedId);
		if (currency !== 'USD') params.set('cur', currency);
		if (selectedBundleIdx !== 4) params.set('bundle', String(selectedBundleIdx));
		if (packsValue !== 1) params.set('packs', String(packsValue));
		if (boxValue !== 120) params.set('box', String(boxValue));
		if (minWrPct !== 0) params.set('minWr', String(minWrPct));
		if (maxWrPct !== 100) params.set('maxWr', String(maxWrPct));
		if (nRuns !== 1) params.set('runs', String(nRuns));
		const str = params.toString();
		return str ? `?${str}` : '';
	}

	// Read URL on mount
	readUrlParams();

	let initialized = false;
	onMount(() => {
		requestAnimationFrame(() => { initialized = true; });
	});

	$effect(() => {
		// Trigger on all reactive params
		void selectedId;
		void currency;
		void selectedBundleIdx;
		void packsValue;
		void boxValue;
		void minWrPct;
		void maxWrPct;
		void nRuns;
		if (!initialized) return;
		replaceState(`${page.url.pathname}${buildQueryString()}`, {});
	});

	// Sync editor YAML when active config changes
	$effect(() => {
		editorYaml = yaml;
		validateEditor();
	});

	// --- Actions ---

	function onConfigChange(e: Event) {
		const id = (e.target as HTMLSelectElement).value;
		setActiveEvent(id);
		showEditor = false;
		showSaveForm = false;
	}

	function validateEditor() {
		const result = validateEventYaml(editorYaml);
		validationErrors = result.errors;
	}

	function onEditorInput(e: Event) {
		editorYaml = (e.target as HTMLTextAreaElement).value;
		validateEditor();
	}

	function onSave() {
		if (!saveName.trim()) return;
		const id = saveEventConfig(saveName.trim(), editorYaml);
		setActiveEvent(id);
		showSaveForm = false;
		saveName = '';
	}

	function onUpdate() {
		if (isBuiltin) return;
		updateEventConfig(selectedId, editorYaml);
	}

	function onDelete() {
		if (isBuiltin) return;
		deleteEventConfig(selectedId);
		showEditor = false;
	}

	function toggleEditor() {
		showEditor = !showEditor;
		if (showEditor) {
			editorYaml = yaml;
			validateEditor();
		}
	}
</script>

<svelte:head>
	<title>Payout Calculator — MTG Meta Analyzer</title>
</svelte:head>

<div class="payout-page">
	<h1>Payout Calculator</h1>

	<!-- Event selector -->
	<section class="event-selector">
		<div class="selector-row">
			<label>
				Event
				<select value={selectedId} onchange={onConfigChange}>
					<optgroup label="Built-in">
						{#each BUILTIN_EVENT_CONFIGS as config}
							<option value={config.id}>{config.displayName}</option>
						{/each}
					</optgroup>
					{#if $savedEventConfigs.length > 0}
						<optgroup label="Custom">
							{#each $savedEventConfigs as config}
								<option value={config.id}>{config.name}</option>
							{/each}
						</optgroup>
					{/if}
				</select>
			</label>
			<div class="selector-actions">
				<button class="btn-secondary" onclick={toggleEditor}>
					{showEditor ? 'Hide YAML' : 'Edit YAML'}
				</button>
				{#if !isBuiltin}
					<button class="btn-secondary btn-danger" onclick={onDelete}>Delete</button>
				{/if}
			</div>
		</div>
	</section>

	<!-- YAML editor (collapsible) -->
	{#if showEditor}
		<section class="editor-section">
			<textarea
				class="yaml-editor"
				value={editorYaml}
				oninput={onEditorInput}
				spellcheck="false"
				rows="16"
			></textarea>
			{#if validationErrors.length > 0}
				<div class="validation-errors">
					{#each validationErrors as err}
						<p class="error">{err}</p>
					{/each}
				</div>
			{/if}
			<div class="editor-actions">
				{#if !isBuiltin}
					<button class="btn-primary" onclick={onUpdate} disabled={validationErrors.length > 0}>
						Update
					</button>
				{/if}
				<button class="btn-secondary" onclick={() => { showSaveForm = !showSaveForm; }}>
					Save As…
				</button>
			</div>
			{#if showSaveForm}
				<div class="save-form">
					<input
						type="text"
						bind:value={saveName}
						placeholder="Event name"
					/>
					<button class="btn-primary" onclick={onSave} disabled={!saveName.trim() || validationErrors.length > 0}>
						Save
					</button>
				</div>
			{/if}
		</section>
	{/if}

	<!-- Valuation parameters -->
	<section class="params-section">
		<h3>Valuation Parameters</h3>
		<div class="params-grid">
			<label>
				<span>Currency</span>
				<select bind:value={currency}>
					{#each CURRENCIES as cur}
						<option value={cur.code}>{cur.symbol} {cur.code}</option>
					{/each}
				</select>
			</label>
			<label>
				<span>Gem bundle</span>
				<select bind:value={selectedBundleIdx}>
					{#each GEM_BUNDLES as bundle, i}
						<option value={i}>{bundle.label} — {currencySymbol}{(bundle.usd * rate).toFixed(2)} ({currencySymbol}{((bundle.usd * rate / bundle.gems) * 1000).toFixed(2)}/1k)</option>
					{/each}
				</select>
			</label>
		</div>
	</section>

	<section class="params-section">
		<h3>Prices</h3>
		<div class="params-grid">
			<label>
				<span>Arena pack value</span>
				<div class="input-with-unit">
					<input type="number" bind:value={packsValue} min="0" step="0.25" />
					<span class="unit">{currencySymbol} / pack</span>
				</div>
			</label>
			<label>
				<span>Box price</span>
				<div class="input-with-unit">
					<input type="number" bind:value={boxValue} min="0" step="5" />
					<span class="unit">{currencySymbol} / box</span>
				</div>
			</label>
		</div>
	</section>

	<!-- Results -->
	{#if parsedEvent}
		<PayoutTable event={parsedEvent} valuation={valuation()} {currencySymbol} />

		<section class="params-section">
			<div class="chart-params">
				<label>
					<span class="param-label">Win rate range</span>
					<div class="range-inputs">
						<input type="number" bind:value={minWrPct} min="0" max="100" step="5" />
						<span>–</span>
						<input type="number" bind:value={maxWrPct} min="0" max="100" step="5" />
						<span class="unit">%</span>
					</div>
				</label>
				<label>
					<span class="param-label">Number of runs</span>
					<div class="input-with-unit">
						<input type="number" bind:value={nRuns} min="1" max="1000" step="1" />
					</div>
				</label>
			</div>
		</section>

		<EvCurveChart
			event={parsedEvent}
			valuation={valuation()}
			minWinRate={minWrPct / 100}
			maxWinRate={maxWrPct / 100}
			{currencySymbol}
			{nRuns}
		/>
	{:else}
		<div class="error-box">
			<p>Could not parse event definition. Check the YAML for errors.</p>
		</div>
	{/if}
</div>

<style>
	.payout-page {
		max-width: 800px;
	}

	h1 {
		font-size: 1.5rem;
		font-weight: 700;
		margin: 0 0 1.5rem;
	}

	/* --- Event selector --- */

	.event-selector {
		margin-bottom: 1.25rem;
	}

	.selector-row {
		display: flex;
		align-items: flex-end;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.selector-row label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.85rem;
		font-weight: 500;
		flex: 1;
		min-width: 200px;
	}

	.selector-row select {
		padding: 0.375rem 0.5rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		font-size: 0.85rem;
		background: var(--color-bg);
	}

	.selector-actions {
		display: flex;
		gap: 0.5rem;
	}

	/* --- Buttons --- */

	.btn-primary,
	.btn-secondary {
		padding: 0.375rem 0.75rem;
		border-radius: var(--radius);
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		border: 1px solid var(--color-border);
		transition: background 0.15s, color 0.15s;
	}

	.btn-primary {
		background: var(--color-accent);
		color: #fff;
		border-color: var(--color-accent);
	}

	.btn-primary:hover:not(:disabled) {
		background: var(--color-accent-hover);
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-secondary {
		background: var(--color-surface);
		color: var(--color-text);
	}

	.btn-secondary:hover {
		background: var(--color-bg);
	}

	.btn-danger {
		color: var(--color-error);
		border-color: var(--color-error);
	}

	.btn-danger:hover {
		background: rgba(220, 38, 38, 0.06);
	}

	/* --- Editor --- */

	.editor-section {
		margin-bottom: 1.25rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		padding: 0.75rem;
		background: var(--color-bg);
	}

	.yaml-editor {
		width: 100%;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		line-height: 1.5;
		padding: 0.5rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		background: var(--color-surface);
		resize: vertical;
		tab-size: 2;
	}

	.validation-errors {
		margin-top: 0.5rem;
	}

	.validation-errors .error {
		color: var(--color-error);
		font-size: 0.8rem;
		margin: 0.125rem 0;
	}

	.editor-actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}

	.save-form {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}

	.save-form input {
		flex: 1;
		padding: 0.375rem 0.5rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		font-size: 0.85rem;
	}

	/* --- Parameters --- */

	.params-section {
		margin-bottom: 1.25rem;
	}

	.params-section h3 {
		font-size: 0.95rem;
		font-weight: 600;
		margin: 0 0 0.75rem;
	}

	.params-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 0.75rem;
	}

	.params-grid label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.85rem;
		font-weight: 500;
	}

	.params-grid select {
		padding: 0.25rem 0.5rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		font-size: 0.85rem;
		background: var(--color-bg);
	}

	.input-with-unit {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.input-with-unit input {
		width: 80px;
		padding: 0.25rem 0.5rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		font-size: 0.85rem;
		background: var(--color-bg);
	}

	.unit {
		font-size: 0.8rem;
		color: var(--color-text-muted);
	}

	.chart-params {
		display: flex;
		gap: 1.5rem;
		align-items: flex-end;
		flex-wrap: wrap;
	}

	.param-label {
		font-size: 0.85rem;
		font-weight: 500;
	}

	.range-inputs {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.range-inputs input {
		width: 60px;
		padding: 0.25rem 0.5rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		font-size: 0.85rem;
		background: var(--color-bg);
	}

	/* --- Error --- */

	.error-box {
		padding: 1rem;
		border: 1px solid var(--color-error);
		border-radius: var(--radius);
		background: rgba(220, 38, 38, 0.04);
		color: var(--color-error);
		font-size: 0.9rem;
	}
</style>
