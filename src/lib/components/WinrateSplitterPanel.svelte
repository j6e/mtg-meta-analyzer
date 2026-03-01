<script lang="ts">
	import type { TournamentData } from '../types/tournament';
	import type { MatchupCell } from '../types/metagame';
	import { splitByCard, type SplitMode, type SplitResult, type SplitRow } from '../utils/winrate-splitter';

	let {
		archetypeName,
		allCardNames,
		tournaments,
		playerArchetypes,
	}: {
		archetypeName: string;
		allCardNames: string[];
		tournaments: TournamentData[];
		playerArchetypes: Map<string, string>;
	} = $props();

	let selectedCard = $state('');
	let mode = $state<SplitMode>('binary');
	let threshold = $state(4);
	let splitResult = $state<SplitResult | null>(null);
	let calculating = $state(false);
	let searchQuery = $state('');

	const filteredCards = $derived.by(() => {
		if (!searchQuery) return allCardNames.slice(0, 20);
		const q = searchQuery.toLowerCase();
		return allCardNames.filter((name) => name.toLowerCase().includes(q)).slice(0, 20);
	});

	let showDropdown = $state(false);

	function selectCard(name: string) {
		selectedCard = name;
		searchQuery = name;
		showDropdown = false;
	}

	async function doSplit() {
		if (!selectedCard) return;
		calculating = true;
		splitResult = null;

		await new Promise((r) => requestAnimationFrame(r));

		try {
			splitResult = splitByCard(
				tournaments,
				playerArchetypes,
				archetypeName,
				selectedCard,
				mode,
				mode === 'binary' ? { threshold } : undefined,
			);
		} finally {
			calculating = false;
		}
	}

	function winrateColor(wr: number): string {
		const red: [number, number, number] = [220, 160, 160];
		const neutral: [number, number, number] = [245, 245, 245];
		const green: [number, number, number] = [160, 220, 165];

		let from: [number, number, number];
		let to: [number, number, number];
		let t: number;

		if (wr <= 0.30) {
			return `rgb(${red[0]}, ${red[1]}, ${red[2]})`;
		} else if (wr <= 0.48) {
			from = red; to = neutral;
			t = (wr - 0.30) / 0.18;
		} else if (wr <= 0.52) {
			return `rgb(${neutral[0]}, ${neutral[1]}, ${neutral[2]})`;
		} else if (wr <= 0.70) {
			from = neutral; to = green;
			t = (wr - 0.52) / 0.18;
		} else {
			return `rgb(${green[0]}, ${green[1]}, ${green[2]})`;
		}

		const r = Math.round(from[0] + (to[0] - from[0]) * t);
		const g = Math.round(from[1] + (to[1] - from[1]) * t);
		const b = Math.round(from[2] + (to[2] - from[2]) * t);
		return `rgb(${r}, ${g}, ${b})`;
	}

	function pct(n: number | null): string {
		if (n === null) return '—';
		return (n * 100).toFixed(1) + '%';
	}

	function deltaBar(baseline: number | null, group: number | null): { width: string; color: string; label: string } | null {
		if (baseline === null || group === null) return null;
		const delta = group - baseline;
		if (Math.abs(delta) < 0.001) return null;
		const maxDelta = 0.30; // 30% is full width
		const width = Math.min(Math.abs(delta) / maxDelta, 1) * 100;
		return {
			width: width + '%',
			color: delta > 0 ? '#16a34a' : '#dc2626',
			label: (delta > 0 ? '+' : '') + (delta * 100).toFixed(1) + '%',
		};
	}
</script>

<div class="splitter">
	<div class="controls">
		<div class="field card-search">
			<label for="card-search-input">Card</label>
			<div class="search-wrap">
				<input
					id="card-search-input"
					type="text"
					placeholder="Search card..."
					bind:value={searchQuery}
					onfocus={() => (showDropdown = true)}
					onblur={() => setTimeout(() => (showDropdown = false), 200)}
				/>
				{#if showDropdown && filteredCards.length > 0}
					<ul class="dropdown" role="listbox">
						{#each filteredCards as name}
							<li role="option" aria-selected={name === selectedCard}>
								<button onmousedown={() => selectCard(name)}>{name}</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>

		<div class="field">
			<!-- svelte-ignore a11y_label_has_associated_control -->
			<label>Mode</label>
			<div class="mode-buttons" role="group" aria-label="Split mode">
				<button
					class="mode-btn"
					class:active={mode === 'binary'}
					onclick={() => (mode = 'binary')}
				>
					Binary
				</button>
				<button
					class="mode-btn"
					class:active={mode === 'per-copy'}
					onclick={() => (mode = 'per-copy')}
				>
					Per Copy
				</button>
			</div>
		</div>

		{#if mode === 'binary'}
			<div class="field">
				<label for="threshold-input">Threshold</label>
				<input
					id="threshold-input"
					type="number"
					min="1"
					max="4"
					bind:value={threshold}
				/>
			</div>
		{/if}

		<button class="split-btn" onclick={doSplit} disabled={!selectedCard || calculating}>
			{calculating ? 'Splitting...' : 'Split'}
		</button>
	</div>

	{#if calculating}
		<div class="loading">
			<div class="spinner"></div>
			<span>Computing splits...</span>
		</div>
	{/if}

	{#snippet deltaBarSnippet(baseline: number | null, group: number | null)}
		{@const d = deltaBar(baseline, group)}
		{#if d}
			<div class="delta-bar" style="background: {d.color}; width: {d.width};" title={d.label}>
				<span class="delta-label">{d.label}</span>
			</div>
		{/if}
	{/snippet}

	{#if splitResult}
		<div class="results">
			<div class="table-wrap">
				<table>
					<thead>
						<tr>
							<th class="group-col">Group</th>
							<th class="num-col">Players</th>
							<th class="num-col">Overall</th>
							{#each splitResult.opponents as opp}
								<th class="num-col opp-col" title={opp}>{opp}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						<!-- Baseline row -->
						<tr class="baseline-row">
							<td class="group-col"><strong>{splitResult.baselineRow.label}</strong></td>
							<td class="num-col">{splitResult.baselineRow.playerCount}</td>
							<td class="num-col" style="background: {splitResult.baselineRow.overallWinrate !== null ? winrateColor(splitResult.baselineRow.overallWinrate) : 'transparent'}">
								{pct(splitResult.baselineRow.overallWinrate)}
							</td>
							{#each splitResult.opponents as opp}
								{@const cell = splitResult.baselineRow.cells.get(opp)}
								<td class="num-col" style="background: {cell?.winrate != null ? winrateColor(cell.winrate) : 'transparent'}">
									{pct(cell?.winrate ?? null)}
								</td>
							{/each}
						</tr>

						<!-- Group rows with delta bars -->
						{#each splitResult.groupRows as group}
							<!-- Delta bar row -->
							<tr class="delta-row">
								<td class="group-col"></td>
								<td class="num-col"></td>
								<td class="num-col">
									{@render deltaBarSnippet(splitResult.baselineRow.overallWinrate, group.overallWinrate)}
								</td>
								{#each splitResult.opponents as opp}
									{@const baseCell = splitResult.baselineRow.cells.get(opp)}
									{@const groupCell = group.cells.get(opp)}
									<td class="num-col">
										{@render deltaBarSnippet(baseCell?.winrate ?? null, groupCell?.winrate ?? null)}
									</td>
								{/each}
							</tr>

							<!-- Group data row -->
							<tr>
								<td class="group-col">{group.label}</td>
								<td class="num-col">{group.playerCount}</td>
								<td class="num-col" style="background: {group.overallWinrate !== null ? winrateColor(group.overallWinrate) : 'transparent'}">
									{pct(group.overallWinrate)}
								</td>
								{#each splitResult.opponents as opp}
									{@const cell = group.cells.get(opp)}
									<td class="num-col" style="background: {cell?.winrate != null ? winrateColor(cell.winrate) : 'transparent'}">
										{pct(cell?.winrate ?? null)}
										{#if cell && cell.total > 0}
											<span class="match-count">({cell.total})</span>
										{/if}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}
</div>

<style>
	.splitter {
		font-size: 0.85rem;
	}

	.controls {
		display: flex;
		gap: 1rem;
		align-items: flex-end;
		flex-wrap: wrap;
		margin-bottom: 1rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	label {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--color-text-muted);
	}

	.card-search {
		min-width: 220px;
	}

	.search-wrap {
		position: relative;
	}

	.search-wrap input {
		width: 100%;
		padding: 0.45rem 0.6rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		background: var(--color-surface);
		color: var(--color-text);
		font-size: 0.875rem;
	}

	.dropdown {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		max-height: 200px;
		overflow-y: auto;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
		z-index: 10;
		list-style: none;
		padding: 0;
		margin: 2px 0 0;
	}

	.dropdown button {
		width: 100%;
		text-align: left;
		padding: 0.35rem 0.6rem;
		background: none;
		border: none;
		cursor: pointer;
		font-size: 0.85rem;
		color: var(--color-text);
	}

	.dropdown button:hover {
		background: rgba(79, 70, 229, 0.06);
	}

	.mode-buttons {
		display: flex;
	}

	.mode-btn {
		padding: 0.45rem 0.75rem;
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		color: var(--color-text);
		font-size: 0.85rem;
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
	}

	.mode-btn:first-child {
		border-radius: var(--radius) 0 0 var(--radius);
	}

	.mode-btn:last-child {
		border-radius: 0 var(--radius) var(--radius) 0;
	}

	.mode-btn:not(:first-child) {
		border-left: none;
	}

	.mode-btn.active {
		background: var(--color-accent);
		color: #fff;
		border-color: var(--color-accent);
	}

	.mode-btn.active + .mode-btn {
		border-left-color: var(--color-accent);
	}

	.field input[type='number'] {
		width: 4rem;
		padding: 0.45rem 0.6rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		background: var(--color-surface);
		color: var(--color-text);
		font-size: 0.875rem;
	}

	.split-btn {
		padding: 0.45rem 1.25rem;
		border: 1px solid var(--color-accent);
		border-radius: var(--radius);
		background: var(--color-accent);
		color: #fff;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.15s;
	}

	.split-btn:hover:not(:disabled) {
		opacity: 0.85;
	}

	.split-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.loading {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		color: var(--color-text-muted);
		font-size: 0.875rem;
		margin-bottom: 1rem;
	}

	.spinner {
		width: 1.25rem;
		height: 1.25rem;
		border: 2px solid var(--color-border);
		border-top-color: var(--color-accent);
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.results {
		margin-top: 0.5rem;
	}

	.table-wrap {
		overflow-x: auto;
	}

	table {
		border-collapse: collapse;
		width: 100%;
	}

	th,
	td {
		padding: 0.35rem 0.5rem;
		border-bottom: 1px solid var(--color-border);
		white-space: nowrap;
	}

	th {
		font-weight: 600;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-muted);
		background: var(--color-surface);
		position: sticky;
		top: 0;
	}

	.group-col {
		text-align: left;
		min-width: 6rem;
	}

	.num-col {
		text-align: center;
		font-variant-numeric: tabular-nums;
		min-width: 4rem;
	}

	.opp-col {
		max-width: 8rem;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.baseline-row {
		font-weight: 600;
		border-bottom: 2px solid var(--color-border);
	}

	.delta-row td {
		padding: 0.15rem 0.5rem;
		border-bottom: none;
		height: 1.2rem;
	}

	.delta-bar {
		height: 0.6rem;
		border-radius: 2px;
		margin: 0 auto;
		position: relative;
		min-width: 1.5rem;
	}

	.delta-label {
		position: absolute;
		top: -0.1rem;
		left: 50%;
		transform: translateX(-50%);
		font-size: 0.6rem;
		font-weight: 600;
		color: #fff;
		white-space: nowrap;
		line-height: 0.8rem;
	}

	.match-count {
		font-size: 0.7rem;
		color: var(--color-text-muted);
		margin-left: 0.15rem;
	}

	tbody tr:hover:not(.delta-row) {
		outline: 1px solid rgba(79, 70, 229, 0.15);
		outline-offset: -1px;
	}
</style>
