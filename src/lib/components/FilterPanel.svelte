<script lang="ts">
	import type { TournamentMeta } from '../types/tournament';
	import { settings, type OtherMode } from '../stores/settings';
	import {
		savedConfigs,
		activeConfigId,
		setActiveConfig,
		BUILTIN_CONFIG_ID,
	} from '../stores/archetype-configs';

	let {
		tournaments,
		formats,
	}: {
		tournaments: TournamentMeta[];
		formats: string[];
	} = $props();

	// Debounce timer for numeric inputs
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	function debounceUpdate(fn: () => void, delay = 300) {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(fn, delay);
	}

	function handleFormatChange(e: Event) {
		const value = (e.target as HTMLSelectElement).value;
		settings.update((s) => ({ ...s, format: value }));
	}

	function handleDateFromChange(e: Event) {
		const value = (e.target as HTMLInputElement).value;
		settings.update((s) => ({ ...s, dateFrom: value }));
	}

	function handleDateToChange(e: Event) {
		const value = (e.target as HTMLInputElement).value;
		settings.update((s) => ({ ...s, dateTo: value }));
	}

	function handleTournamentToggle(id: number, checked: boolean) {
		settings.update((s) => {
			const ids = new Set(s.selectedTournamentIds);
			if (checked) {
				ids.add(id);
			} else {
				ids.delete(id);
			}
			return { ...s, selectedTournamentIds: [...ids] };
		});
	}

	function selectAllTournaments() {
		settings.update((s) => ({ ...s, selectedTournamentIds: [] }));
	}

	function handleOtherModeChange(mode: OtherMode) {
		settings.update((s) => ({ ...s, otherMode: mode }));
	}

	function handleTopNChange(e: Event) {
		const value = parseInt((e.target as HTMLInputElement).value) || 0;
		debounceUpdate(() => {
			settings.update((s) => ({ ...s, topN: value }));
		});
	}

	function handleMinShareChange(e: Event) {
		const value = parseFloat((e.target as HTMLInputElement).value) || 0;
		debounceUpdate(() => {
			settings.update((s) => ({ ...s, minMetagameShare: value }));
		});
	}

	function handleConfigChange(e: Event) {
		setActiveConfig((e.target as HTMLSelectElement).value);
	}
</script>

<div class="filter-panel" data-testid="filter-panel">
	<div class="filter-section">
		<h3>Tournaments</h3>

		<div class="filter-row">
			<label>
				Format
				<select onchange={handleFormatChange} value={$settings.format}>
					<option value="">All formats</option>
					{#each formats as f}
						<option value={f}>{f}</option>
					{/each}
				</select>
			</label>
		</div>

		<div class="filter-row dates">
			<label>
				From
				<input type="date" value={$settings.dateFrom} onchange={handleDateFromChange} />
			</label>
			<label>
				To
				<input type="date" value={$settings.dateTo} onchange={handleDateToChange} />
			</label>
		</div>

		<div class="filter-row tournament-list">
			<div class="tournament-header">
				<span>Select tournaments</span>
				{#if $settings.selectedTournamentIds.length > 0}
					<button class="link-btn" onclick={selectAllTournaments}>Clear selection</button>
				{/if}
			</div>
			<div class="tournament-checks">
				{#each tournaments as t}
					<label class="tournament-check">
						<input
							type="checkbox"
							checked={$settings.selectedTournamentIds.length === 0 ||
								$settings.selectedTournamentIds.includes(t.id)}
							onchange={(e) =>
								handleTournamentToggle(t.id, (e.target as HTMLInputElement).checked)}
						/>
						<span class="t-name">{t.name}</span>
						<span class="t-date">{t.date}</span>
					</label>
				{/each}
			</div>
		</div>
	</div>

	<div class="filter-section">
		<h3>Options</h3>

		<div class="filter-row">
			<label>
				Archetype config
				<select onchange={handleConfigChange} value={$activeConfigId}>
					<option value={BUILTIN_CONFIG_ID}>Built-in: Standard</option>
					{#each $savedConfigs as config}
						<option value={config.id}>{config.name} ({config.format})</option>
					{/each}
				</select>
			</label>
		</div>

		<div class="filter-row">
			<label class="toggle">
				<input
					type="checkbox"
					bind:checked={$settings.excludeMirrors}
				/>
				Exclude mirror matches
			</label>
		</div>

		<div class="filter-row other-threshold">
			<span class="label">"Other" threshold</span>
			<div class="radio-group">
				<label>
					<input
						type="radio"
						name="otherMode"
						value="topN"
						checked={$settings.otherMode === 'topN'}
						onchange={() => handleOtherModeChange('topN')}
					/>
					Top N archetypes
				</label>
				<label>
					<input
						type="radio"
						name="otherMode"
						value="minShare"
						checked={$settings.otherMode === 'minShare'}
						onchange={() => handleOtherModeChange('minShare')}
					/>
					Min metagame share
				</label>
			</div>

			{#if $settings.otherMode === 'topN'}
				<label class="threshold-input">
					Show top
					<input
						type="number"
						value={$settings.topN}
						oninput={handleTopNChange}
						min="0"
						max="20"
					/>
					archetypes
					<span class="hint">(0 = all)</span>
				</label>
			{:else}
				<label class="threshold-input">
					Min share
					<input
						type="number"
						value={$settings.minMetagameShare}
						oninput={handleMinShareChange}
						min="0"
						max="100"
						step="0.5"
					/>
					%
				</label>
			{/if}
		</div>
	</div>
</div>

<style>
	.filter-panel {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		padding: 1rem 1.25rem;
		font-size: 0.85rem;
		display: flex;
		flex-wrap: wrap;
		gap: 1.5rem;
	}

	.filter-section {
		flex: 1;
		min-width: 240px;
	}

	h3 {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-muted);
		margin-bottom: 0.6rem;
	}

	.filter-row {
		margin-bottom: 0.6rem;
	}

	.filter-row:last-child {
		margin-bottom: 0;
	}

	label {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	select,
	input[type='date'],
	input[type='number'] {
		padding: 0.25rem 0.5rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		font-size: 0.85rem;
		background: var(--color-bg);
	}

	input[type='number'] {
		width: 4rem;
	}

	.dates {
		display: flex;
		gap: 0.75rem;
	}

	.tournament-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.35rem;
	}

	.link-btn {
		background: none;
		border: none;
		color: var(--color-accent);
		cursor: pointer;
		font-size: 0.75rem;
		padding: 0;
	}

	.link-btn:hover {
		text-decoration: underline;
	}

	.tournament-checks {
		max-height: 9rem;
		overflow-y: auto;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		padding: 0.35rem 0.5rem;
		background: var(--color-bg);
	}

	.tournament-check {
		display: flex;
		gap: 0.35rem;
		padding: 0.2rem 0;
		font-size: 0.8rem;
	}

	.t-name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.t-date {
		color: var(--color-text-muted);
		font-size: 0.75rem;
		white-space: nowrap;
	}

	.toggle {
		cursor: pointer;
	}

	.other-threshold .label {
		display: block;
		margin-bottom: 0.35rem;
		font-weight: 500;
	}

	.radio-group {
		display: flex;
		gap: 1rem;
		margin-bottom: 0.4rem;
	}

	.radio-group label {
		cursor: pointer;
		font-size: 0.8rem;
	}

	.threshold-input {
		font-size: 0.8rem;
	}

	.hint {
		color: var(--color-text-muted);
		font-size: 0.75rem;
	}
</style>
