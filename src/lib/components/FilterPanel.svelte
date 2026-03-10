<script lang="ts">
	import { onMount } from 'svelte';
	import { settings, type OtherMode } from '../stores/settings';
	import { tournamentList, availableFormats } from '../stores/tournaments';
	import { getInitialExcludeIds } from '../stores/url-settings';
	import {
		savedConfigs,
		activeConfigId,
		setActiveConfig,
		BUILTIN_CONFIGS,
	} from '../stores/archetype-configs';

	const allTournaments = $derived($tournamentList);
	const formats = $derived($availableFormats);

	/** Tournaments filtered by the currently selected format. */
	const tournaments = $derived(
		$settings.format
			? allTournaments.filter((t) => t.formats.includes($settings.format))
			: allTournaments,
	);

	onMount(() => {
		const excludeIds = getInitialExcludeIds();
		settings.update((s) => ({
			...s,
			selectedTournamentIds: tournaments
				.filter(
					(t) =>
						(!s.dateFrom || t.date >= s.dateFrom) &&
						(!s.dateTo || t.date <= s.dateTo) &&
						!excludeIds.has(t.id),
				)
				.map((t) => t.id),
		}));
	});

	// Debounce timer for numeric inputs
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	function debounceUpdate(fn: () => void, delay = 300) {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(fn, delay);
	}

	function handleFormatChange(e: Event) {
		const value = (e.target as HTMLSelectElement).value;
		const matching = value
			? allTournaments.filter((t) => t.formats.includes(value))
			: allTournaments;
		const matchingInRange = matching
			.filter((t) => {
				const s = $settings;
				return (!s.dateFrom || t.date >= s.dateFrom) && (!s.dateTo || t.date <= s.dateTo);
			})
			.map((t) => t.id);
		settings.update((s) => ({ ...s, format: value, selectedTournamentIds: matchingInRange }));
	}

	let datePreset = $state('30');

	function toDateString(d: Date): string {
		return d.toISOString().slice(0, 10);
	}

	function tournamentsInRange(from: string, to: string): string[] {
		return tournaments.filter((t) => (!from || t.date >= from) && (!to || t.date <= to)).map(
			(t) => t.id,
		);
	}

	function handleDatePresetChange(e: Event) {
		const value = (e.target as HTMLSelectElement).value;
		datePreset = value;
		if (!value) return;
		const today = new Date();
		const from = new Date(today);
		const days = { '7': 7, '14': 14, '30': 30, '60': 60 }[value];
		if (!days) return;
		from.setDate(today.getDate() - days);
		const dateFrom = toDateString(from);
		const dateTo = toDateString(today);
		settings.update((s) => ({
			...s,
			dateFrom,
			dateTo,
			selectedTournamentIds: tournamentsInRange(dateFrom, dateTo),
		}));
	}

	function handleDateFromChange(e: Event) {
		datePreset = '';
		const dateFrom = (e.target as HTMLInputElement).value;
		settings.update((s) => ({
			...s,
			dateFrom,
			selectedTournamentIds: tournamentsInRange(dateFrom, s.dateTo),
		}));
	}

	function handleDateToChange(e: Event) {
		datePreset = '';
		const dateTo = (e.target as HTMLInputElement).value;
		settings.update((s) => ({
			...s,
			dateTo,
			selectedTournamentIds: tournamentsInRange(s.dateFrom, dateTo),
		}));
	}

	function handleTournamentToggle(id: string, checked: boolean) {
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
		settings.update((s) => ({ ...s, selectedTournamentIds: tournaments.map((t) => t.id) }));
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

		<div class="filter-row">
			<label>
				Quick range
				<select onchange={handleDatePresetChange} value={datePreset}>
					<option value="">Custom</option>
					<option value="7">Last week</option>
					<option value="14">Last 2 weeks</option>
					<option value="30">Last month</option>
					<option value="60">Last 2 months</option>
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
				{#if $settings.selectedTournamentIds.length < tournaments.length}
					<button class="link-btn" onclick={selectAllTournaments}>Select all</button>
				{/if}
			</div>
			<div class="tournament-checks">
				{#each tournaments as t}
					<label class="tournament-check" title={t.cleanName}>
						<input
							type="checkbox"
							checked={$settings.selectedTournamentIds.includes(t.id)}
							onchange={(e) =>
								handleTournamentToggle(t.id, (e.target as HTMLInputElement).checked)}
						/>
						<span class="t-name">{t.cleanName}</span>
						<span class="t-date">{t.date}</span>
					</label>
				{/each}
			</div>
		</div>
	</div>

	<div class="filter-section">
		<h3>Options</h3>

		<div class="filter-row">
			<label class="stacked">
				Archetype config
				<select onchange={handleConfigChange} value={$activeConfigId}>
					{#each BUILTIN_CONFIGS as cfg}
						<option value={cfg.id}>Built-in: {cfg.displayName}</option>
					{/each}
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
		font-size: 0.85rem;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.filter-section {
		width: 100%;
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

	label.stacked {
		flex-direction: column;
		align-items: flex-start;
		gap: 0.2rem;
	}

	label.stacked select {
		width: 100%;
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

	input[type='date'] {
		width: 100%;
	}

	input[type='number'] {
		width: 4rem;
	}

	.dates {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
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
