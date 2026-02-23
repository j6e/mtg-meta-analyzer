<script lang="ts">
	import {
		BUILTIN_CONFIG_ID,
		builtinArchetypeYaml,
		savedConfigs,
		activeConfigId,
		saveConfig,
		updateConfig,
		deleteConfig,
		setActiveConfig,
		type SavedArchetypeConfig,
	} from '../stores/archetype-configs';
	import { validateArchetypeYaml, type ValidationResult } from '../utils/yaml-validator';

	let selectedConfigId = $state(BUILTIN_CONFIG_ID);
	let editorYaml = $state(builtinArchetypeYaml);
	let validationResult = $state<ValidationResult | null>(null);
	let showSaveForm = $state(false);
	let saveName = $state('');
	let saveFormat = $state('Standard');
	let cageEl = $state<HTMLElement | null>(null);
	let lineNumEl = $state<HTMLElement | null>(null);
	let highlightEl = $state<HTMLElement | null>(null);

	const isBuiltin = $derived(selectedConfigId === BUILTIN_CONFIG_ID);
	const isActive = $derived(selectedConfigId === $activeConfigId);

	// --- YAML syntax highlighting ---

	function escapeHtml(text: string): string {
		return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	function highlightYamlLine(line: string): string {
		// Comment line (possibly indented)
		const commentMatch = line.match(/^(\s*)(#.*)$/);
		if (commentMatch) {
			return escapeHtml(commentMatch[1]) + '<span class="hl-comment">' + escapeHtml(commentMatch[2]) + '</span>';
		}

		// Key: value line
		const kvMatch = line.match(/^(\s*-?\s*)([\w][\w\s.]*?)(\s*:\s*)(.*)?$/);
		if (kvMatch) {
			const [, indent, key, colon, value = ''] = kvMatch;
			let result = escapeHtml(indent) + '<span class="hl-key">' + escapeHtml(key) + '</span>' + escapeHtml(colon);
			if (value) result += highlightValue(value);
			return result;
		}

		// List item without key (bare value like "- value")
		const listMatch = line.match(/^(\s*-\s+)(.+)$/);
		if (listMatch) {
			return '<span class="hl-punct">' + escapeHtml(listMatch[1]) + '</span>' + highlightValue(listMatch[2]);
		}

		return escapeHtml(line);
	}

	function highlightValue(value: string): string {
		// Check for inline comment
		const commentIdx = value.indexOf(' #');
		let main = value;
		let comment = '';
		if (commentIdx >= 0) {
			main = value.substring(0, commentIdx);
			comment = value.substring(commentIdx);
		}

		let result = '';
		const trimmed = main.trim();

		if (/^".*"$/.test(trimmed) || /^'.*'$/.test(trimmed)) {
			result = '<span class="hl-string">' + escapeHtml(main) + '</span>';
		} else if (/^(true|false|null|~)$/i.test(trimmed)) {
			result = '<span class="hl-bool">' + escapeHtml(main) + '</span>';
		} else if (/^-?\d[\d.]*$/.test(trimmed)) {
			result = '<span class="hl-number">' + escapeHtml(main) + '</span>';
		} else {
			result = escapeHtml(main);
		}

		if (comment) {
			result += '<span class="hl-comment">' + escapeHtml(comment) + '</span>';
		}
		return result;
	}

	function highlightYaml(text: string): string {
		return text.split('\n').map(highlightYamlLine).join('\n') + '\n';
	}

	const highlightedHtml = $derived(highlightYaml(editorYaml));
	const lineCount = $derived(editorYaml.split('\n').length);
	const lineNumbers = $derived(Array.from({ length: lineCount }, (_, i) => i + 1).join('\n') + '\n');

	// --- Scroll sync ---

	function handleScroll(e: Event) {
		const textarea = e.target as HTMLTextAreaElement;
		if (lineNumEl) lineNumEl.scrollTop = textarea.scrollTop;
		if (highlightEl) highlightEl.scrollTop = textarea.scrollTop;
	}

	// --- Config management ---

	function loadConfig(id: string) {
		selectedConfigId = id;
		validationResult = null;
		showSaveForm = false;
		if (id === BUILTIN_CONFIG_ID) {
			editorYaml = builtinArchetypeYaml;
		} else {
			const config = $savedConfigs.find((c) => c.id === id);
			editorYaml = config?.yamlContent ?? builtinArchetypeYaml;
		}
	}

	function handleConfigChange(e: Event) {
		loadConfig((e.target as HTMLSelectElement).value);
	}

	function handleCheck() {
		validationResult = validateArchetypeYaml(editorYaml);
	}

	function handleSaveAs() {
		if (!saveName.trim()) return;
		const result = validateArchetypeYaml(editorYaml);
		validationResult = result;
		const id = saveConfig(saveName.trim(), saveFormat.trim() || 'Standard', editorYaml);
		selectedConfigId = id;
		showSaveForm = false;
		saveName = '';
	}

	function handleUpdate() {
		if (isBuiltin) return;
		validationResult = validateArchetypeYaml(editorYaml);
		updateConfig(selectedConfigId, editorYaml);
	}

	function handleDelete() {
		if (isBuiltin) return;
		if (!confirm('Delete this configuration?')) return;
		deleteConfig(selectedConfigId);
		loadConfig(BUILTIN_CONFIG_ID);
	}

	function handleSetActive() {
		setActiveConfig(selectedConfigId);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Tab') {
			e.preventDefault();
			const textarea = e.target as HTMLTextAreaElement;
			const start = textarea.selectionStart;
			const end = textarea.selectionEnd;
			editorYaml = editorYaml.substring(0, start) + '  ' + editorYaml.substring(end);
			// Restore cursor after Svelte re-renders
			requestAnimationFrame(() => {
				textarea.selectionStart = textarea.selectionEnd = start + 2;
			});
		}
	}
</script>

<div class="editor-layout">
	<div class="editor-panel">
		<div class="editor-header">
			<label class="config-select">
				Config
				<select onchange={handleConfigChange} value={selectedConfigId}>
					<option value={BUILTIN_CONFIG_ID}>Built-in: Standard</option>
					{#each $savedConfigs as config}
						<option value={config.id}>{config.name} ({config.format})</option>
					{/each}
				</select>
			</label>
			{#if isActive}
				<span class="active-badge">Active</span>
			{:else}
				<button class="btn btn-accent" onclick={handleSetActive}>Set as Active</button>
			{/if}
		</div>

		<div class="textarea-cage" bind:this={cageEl}>
			<div class="line-numbers" bind:this={lineNumEl}><pre>{lineNumbers}</pre></div>
			<div class="code-area">
				<pre class="highlight-pre" bind:this={highlightEl} aria-hidden="true">{@html highlightedHtml}</pre>
				<textarea
					bind:value={editorYaml}
					onkeydown={handleKeydown}
					onscroll={handleScroll}
					spellcheck="false"
					autocomplete="off"
					autocorrect="off"
					autocapitalize="off"
				></textarea>
			</div>
		</div>

		<div class="actions">
			<button class="btn" onclick={handleCheck}>Check</button>
			<button class="btn" onclick={() => (showSaveForm = !showSaveForm)}>Save As…</button>
			<button class="btn" onclick={handleUpdate} disabled={isBuiltin}>Update</button>
			<button class="btn btn-danger" onclick={handleDelete} disabled={isBuiltin}>Delete</button>
		</div>

		{#if showSaveForm}
			<div class="save-form">
				<label>
					Name
					<input type="text" bind:value={saveName} placeholder="My Custom Config" />
				</label>
				<label>
					Format
					<input type="text" bind:value={saveFormat} placeholder="Standard" />
				</label>
				<button class="btn btn-accent" onclick={handleSaveAs} disabled={!saveName.trim()}>
					Save
				</button>
			</div>
		{/if}

		{#if validationResult}
			<div class="validation" class:valid={validationResult.ok} class:invalid={!validationResult.ok}>
				{#if validationResult.ok}
					<p class="msg ok">Parsed successfully: {validationResult.archetypeCount} archetypes</p>
				{/if}
				{#each validationResult.errors as err}
					<p class="msg error">{err}</p>
				{/each}
				{#each validationResult.warnings as warn}
					<p class="msg warn">{warn}</p>
				{/each}
			</div>
		{/if}
	</div>

	<div class="spec-panel">
		<h3>Specification</h3>
		<p class="yaml-note">Uses <a href="https://yaml.org/" target="_blank" rel="noopener">YAML</a> syntax</p>

		<table class="spec-table">
			<thead>
				<tr><th>Field</th><th>Type</th><th>Description</th></tr>
			</thead>
			<tbody>
				<tr><td><code>format</code></td><td>string</td><td>Format name (e.g. "Standard")</td></tr>
				<tr><td><code>date</code></td><td>string</td><td>Date of definition (ISO)</td></tr>
				<tr><td><code>archetypes[]</code></td><td>array</td><td>List of archetype definitions</td></tr>
				<tr><td><code>&nbsp;&nbsp;.name</code></td><td>string*</td><td>Archetype display name</td></tr>
				<tr><td><code>&nbsp;&nbsp;.signatureCards[]</code></td><td>array*</td><td>Cards that identify this archetype</td></tr>
				<tr><td><code>&nbsp;&nbsp;&nbsp;&nbsp;.name</code></td><td>string*</td><td>Card name</td></tr>
				<tr><td><code>&nbsp;&nbsp;&nbsp;&nbsp;.minCopies</code></td><td>number</td><td>Deck must have &ge; N copies</td></tr>
				<tr><td><code>&nbsp;&nbsp;&nbsp;&nbsp;.exactCopies</code></td><td>number</td><td>Exactly N copies (0 = absent)</td></tr>
				<tr><td><code>&nbsp;&nbsp;.strictMode</code></td><td>boolean</td><td>If true, KNN cannot produce this label</td></tr>
			</tbody>
		</table>

		<section>
			<h4>Rules</h4>
			<ul>
				<li><code>minCopies</code>: &ge; N copies required; <code>exactCopies</code>: exactly N (0 = card absent)</li>
				<li>Neither set → defaults to <code>minCopies: 1</code></li>
				<li>ALL signature cards must match (AND); most cards wins ties</li>
				<li>Unmatched decks go to KNN (k=5, min confidence 0.3)</li>
			</ul>
		</section>

		<pre class="example">{`archetypes:
  - name: Izzet Lessons
    signatureCards:
      - name: Gran-Gran
        minCopies: 4
  - name: Mono-Green
    signatureCards:
      - name: Stomping Ground
        exactCopies: 0  # absent`}</pre>
	</div>
</div>

<style>
	.editor-layout {
		display: grid;
		grid-template-columns: 3fr 2fr;
		gap: 1.5rem;
		align-items: start;
		margin-bottom: 2rem;
	}

	@media (max-width: 900px) {
		.editor-layout {
			grid-template-columns: 1fr;
		}
	}

	.editor-panel,
	.spec-panel {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		padding: 1rem 1.25rem;
	}

	.editor-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
		flex-wrap: wrap;
	}

	.config-select {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.85rem;
		flex: 1;
		min-width: 0;
	}

	.config-select select {
		flex: 1;
		min-width: 0;
		padding: 0.25rem 0.5rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		font-size: 0.85rem;
		background: var(--color-bg);
	}

	.active-badge {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		background: #dcfce7;
		color: #166534;
		padding: 0.2rem 0.5rem;
		border-radius: var(--radius);
		white-space: nowrap;
	}

	.textarea-cage {
		display: flex;
		max-height: 60vh;
		overflow: hidden;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		background: var(--color-bg);
	}

	.line-numbers {
		flex-shrink: 0;
		overflow: hidden;
		padding: 0.75rem 0;
		user-select: none;
		pointer-events: none;
		border-right: 1px solid var(--color-border);
		background: var(--color-surface);
	}

	.line-numbers pre {
		margin: 0;
		padding: 0 0.5rem;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		line-height: 1.5;
		color: var(--color-text-muted);
		text-align: right;
		white-space: pre;
	}

	.code-area {
		position: relative;
		flex: 1;
		min-width: 0;
		overflow: hidden;
	}

	.highlight-pre {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		margin: 0;
		padding: 0.75rem;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		line-height: 1.5;
		tab-size: 2;
		white-space: pre;
		pointer-events: none;
		overflow: hidden;
		color: var(--color-text);
		background: transparent;
	}

	textarea {
		position: relative;
		display: block;
		width: 100%;
		min-height: 550px;
		padding: 0.75rem;
		border: none;
		background: transparent;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		line-height: 1.5;
		tab-size: 2;
		white-space: pre;
		resize: none;
		color: transparent;
		caret-color: var(--color-text);
		overflow-y: auto;
	}

	textarea:focus {
		outline: none;
	}

	textarea::selection {
		background: rgba(79, 70, 229, 0.2);
	}

	/* Syntax highlighting tokens */
	:global(.hl-comment) { color: var(--color-text-muted); font-style: italic; }
	:global(.hl-key) { color: var(--color-accent); }
	:global(.hl-string) { color: #059669; }
	:global(.hl-number) { color: #d97706; }
	:global(.hl-bool) { color: #d97706; }
	:global(.hl-punct) { color: var(--color-text-muted); }

	.actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.75rem;
		flex-wrap: wrap;
	}

	.btn {
		padding: 0.3rem 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		background: var(--color-surface);
		font-size: 0.8rem;
		cursor: pointer;
		color: var(--color-text);
	}

	.btn:hover:not(:disabled) {
		background: var(--color-bg);
	}

	.btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.btn-accent {
		background: var(--color-accent);
		color: white;
		border-color: var(--color-accent);
	}

	.btn-accent:hover:not(:disabled) {
		opacity: 0.9;
		background: var(--color-accent);
	}

	.btn-danger {
		color: #dc2626;
		border-color: #fca5a5;
	}

	.btn-danger:hover:not(:disabled) {
		background: #fef2f2;
	}

	.save-form {
		display: flex;
		align-items: end;
		gap: 0.5rem;
		margin-top: 0.75rem;
		flex-wrap: wrap;
	}

	.save-form label {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-size: 0.8rem;
	}

	.save-form input {
		padding: 0.25rem 0.5rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		font-size: 0.85rem;
		background: var(--color-bg);
	}

	.validation {
		margin-top: 0.75rem;
		padding: 0.5rem 0.75rem;
		border-radius: var(--radius);
		font-size: 0.8rem;
	}

	.validation.valid {
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
	}

	.validation.invalid {
		background: #fef2f2;
		border: 1px solid #fecaca;
	}

	.msg {
		margin: 0.15rem 0;
	}

	.msg.ok {
		color: #166534;
	}

	.msg.error {
		color: #dc2626;
	}

	.msg.warn {
		color: #a16207;
	}

	/* Spec panel */

	.spec-panel {
		font-size: 0.78rem;
	}

	.spec-panel h3 {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-muted);
		margin-bottom: 0.25rem;
	}

	.yaml-note {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin-bottom: 0.5rem;
	}

	.yaml-note a {
		color: var(--color-accent);
		text-decoration: none;
	}

	.yaml-note a:hover {
		text-decoration: underline;
	}

	.spec-panel h4 {
		font-size: 0.8rem;
		font-weight: 600;
		margin-bottom: 0.3rem;
	}

	.spec-panel section {
		margin-bottom: 0.75rem;
	}

	.spec-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.7rem;
		margin-bottom: 0.75rem;
	}

	.spec-table th,
	.spec-table td {
		padding: 0.2rem 0.4rem;
		text-align: left;
		border-bottom: 1px solid var(--color-border);
	}

	.spec-table th {
		font-weight: 600;
		font-size: 0.6rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-muted);
	}

	.spec-table code {
		font-size: 0.7rem;
		white-space: nowrap;
	}

	.spec-panel ul {
		margin: 0;
		padding-left: 1.1rem;
	}

	.spec-panel li {
		margin-bottom: 0.2rem;
	}

	.spec-panel code {
		background: var(--color-bg);
		padding: 0.05rem 0.25rem;
		border-radius: 3px;
		font-size: 0.7rem;
	}

	pre.example {
		background: var(--color-bg);
		padding: 0.5rem 0.75rem;
		border-radius: var(--radius);
		font-size: 0.7rem;
		line-height: 1.4;
		overflow-x: auto;
		margin: 0;
	}
</style>
