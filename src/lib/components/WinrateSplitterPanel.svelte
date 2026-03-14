<script lang="ts">
	import type { TournamentData } from '../types/tournament';
	import { splitByCard, type SplitMode, type SplitResult } from '../utils/winrate-splitter';
	import { computeStatistics, autoScanCards } from '../utils/statistical-splitter';
	import type { StatisticalSplitResult, AutoScanResult } from '../types/statistics';
	import { significanceStars } from '../algorithms/statistics';
	import { winrateColor, pct } from '../utils/format';
	import { settings } from '../stores/settings';
	import CardTooltip from './CardTooltip.svelte';

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
	let mode = $state<SplitMode>('per-copy');
	let threshold = $state(4);
	let otherMode = $state<'topN' | 'minShare'>('minShare');
	let topN = $state(0);
	let minMetagameShare = $state(2);
	let splitResult = $state<SplitResult | null>(null);
	let statsResult = $state<StatisticalSplitResult | null>(null);
	let calculating = $state(false);
	let searchQuery = $state('');

	// Auto-scan state
	let autoScanMinGroupSize = $state(50);
	let autoIncludeThreshold = $state(90);
	let autoMinEffect = $state(5);
	let autoScanResults = $state<AutoScanResult[] | null>(null);
	let autoScanning = $state(false);
	let autoScanProgress = $state(0);
	let autoScanTotal = $state(0);

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

	function splitOptions() {
		return {
			...(mode === 'binary' ? { threshold } : {}),
			...(otherMode === 'topN' && topN > 0 ? { topN } : {}),
			...(otherMode === 'minShare' && minMetagameShare > 0
				? { minMetagameShare: minMetagameShare / 100 }
				: {}),
			useStandings: $settings.useStandings,
		};
	}

	async function doSplit() {
		if (!selectedCard) return;
		calculating = true;
		splitResult = null;
		statsResult = null;

		await new Promise((r) => requestAnimationFrame(r));

		try {
			const split = splitByCard(
				tournaments, playerArchetypes, archetypeName,
				selectedCard, mode, splitOptions(),
			);
			splitResult = split;
			statsResult = computeStatistics(split, { minGroupSize: autoScanMinGroupSize });
		} finally {
			calculating = false;
		}
	}

	async function doAutoScan() {
		autoScanning = true;
		autoScanResults = null;
		autoScanProgress = 0;
		autoScanTotal = allCardNames.length;

		try {
			autoScanResults = await autoScanCards(
				tournaments, playerArchetypes, archetypeName,
				allCardNames, mode,
				{
					minGroupSize: autoScanMinGroupSize,
					autoIncludeThreshold: autoIncludeThreshold / 100,
					minEffectSize: autoMinEffect / 100,
					...splitOptions(),
					onProgress: (done, total) => {
						autoScanProgress = done;
						autoScanTotal = total;
					},
				},
			);
		} finally {
			autoScanning = false;
		}
	}

	function selectAutoScanCard(cardName: string) {
		selectedCard = cardName;
		searchQuery = cardName;
		doSplit();
	}

	function deltaBar(baseline: number | null, group: number | null): { width: string; color: string; label: string } | null {
		if (baseline === null || group === null) return null;
		const delta = group - baseline;
		if (Math.abs(delta) < 0.001) return null;
		const maxDelta = 0.30;
		const width = Math.min(Math.abs(delta) / maxDelta, 1) * 100;
		return {
			width: width + '%',
			color: delta > 0 ? '#16a34a' : '#dc2626',
			label: (delta > 0 ? '+' : '') + (delta * 100).toFixed(1) + '%',
		};
	}

	function sigColor(level: number): string {
		switch (level) {
			case 1: return '#d97706';
			case 2: return '#ea580c';
			case 3: return '#dc2626';
			default: return 'transparent';
		}
	}
</script>

<div class="splitter">
	<!-- Shared controls: mode + opponent filtering -->
	<div class="shared-controls">
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
				<button
					class="mode-btn"
					class:active={mode === 'cumulative'}
					onclick={() => (mode = 'cumulative')}
				>
					Cumulative
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

		<div class="field other-field">
			<!-- svelte-ignore a11y_label_has_associated_control -->
			<label>"Other" column</label>
			<div class="mode-buttons" role="group" aria-label="Other threshold mode">
				<button
					class="mode-btn"
					class:active={otherMode === 'topN'}
					onclick={() => (otherMode = 'topN')}
				>
					Top N
				</button>
				<button
					class="mode-btn"
					class:active={otherMode === 'minShare'}
					onclick={() => (otherMode = 'minShare')}
				>
					Min %
				</button>
			</div>
			{#if otherMode === 'topN'}
				<div class="threshold-row">
					<input
						type="number"
						min="0"
						max="20"
						bind:value={topN}
					/>
					<span class="hint">0 = all</span>
				</div>
			{:else}
				<div class="threshold-row">
					<input
						type="number"
						min="0"
						max="100"
						step="0.5"
						bind:value={minMetagameShare}
					/>
					<span class="hint">%</span>
				</div>
			{/if}
		</div>
	</div>

	{#snippet deltaBarSnippet(baseline: number | null, group: number | null)}
		{@const d = deltaBar(baseline, group)}
		{#if d}
			<div class="delta-bar" style="background: {d.color}; width: {d.width};" title={d.label}>
				<span class="delta-label">{d.label}</span>
			</div>
		{/if}
	{/snippet}

	<!-- Section 1: Card Split -->
	<details class="section" open>
		<summary>Card Split</summary>
		<div class="section-body">
			<div class="section-controls">
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

				<button class="split-btn" onclick={doSplit} disabled={!selectedCard || calculating}>
					{calculating ? 'Splitting...' : 'Split'}
				</button>
			</div>

			<p class="scan-explanation">
				<a href="https://en.wikipedia.org/wiki/Credible_interval" target="_blank" rel="noopener">Credible intervals</a>
				[in brackets] show the 95% Bayesian range for each winrate.
				Stars (* p&lt;0.05, ** p&lt;0.01, *** p&lt;0.001) indicate
				<a href="https://en.wikipedia.org/wiki/Benjamini%E2%80%93Hochberg_procedure" target="_blank" rel="noopener">BH-corrected</a>
				<a href="https://en.wikipedia.org/wiki/Fisher%27s_exact_test" target="_blank" rel="noopener">Fisher's exact test</a>
				significance vs the complement group.
				P(A &gt; B) is the Bayesian probability that group A's true overall winrate exceeds group B's.
			</p>

			{#if calculating}
				<div class="loading">
					<div class="spinner"></div>
					<span>Computing splits...</span>
				</div>
			{/if}

			{#if splitResult && statsResult}
				<div class="results">
					<div class="table-wrap">
						<table>
							<thead>
								<tr>
									<th class="group-col">Group</th>
									<th class="num-col opp-col" title="Players">
										<div class="vertical-header"># Players</div>
									</th>
									<th class="num-col opp-col" title="Overall">
										<div class="vertical-header">Overall</div>
									</th>
									{#each splitResult.opponents as opp}
										<th class="num-col opp-col" title={opp}>
											<div class="vertical-header">{opp}</div>
										</th>
									{/each}
								</tr>
							</thead>
							<tbody>
								<!-- Baseline row -->
								<tr class="baseline-row">
									<td class="group-col"><strong>{splitResult.baselineRow.label}</strong></td>
									<td class="num-col">{splitResult.baselineRow.playerCount}</td>
									<td class="num-col" style="background: {splitResult.baselineRow.overallWinrate !== null ? winrateColor(splitResult.baselineRow.overallWinrate) : 'transparent'}">
										<span class="winrate">{pct(splitResult.baselineRow.overallWinrate)}</span>
										{#if splitResult.baselineRow.totalMatches > 0}
											<span class="match-count">({splitResult.baselineRow.totalMatches})</span>
										{/if}
									</td>
									{#each splitResult.opponents as opp}
										{@const cell = splitResult.baselineRow.cells.get(opp)}
										<td class="num-col" style="background: {cell?.winrate != null ? winrateColor(cell.winrate) : 'transparent'}">
											<span class="winrate">{pct(cell?.winrate ?? null)}</span>
											{#if cell && cell.total > 0}
												<span class="match-count">({cell.total})</span>
											{/if}
										</td>
									{/each}
								</tr>

								<!-- Group rows with delta bars -->
								{#each splitResult.groupRows as group, gi}
									{@const statRow = statsResult.rows[gi]}
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
											<span class="winrate">{pct(group.overallWinrate)}</span>
											{#if group.totalMatches > 0}
												<span class="match-count">({group.totalMatches})</span>
											{/if}
											<span class="ci-text">[{pct(statRow.overallCI.lower, 0)} — {pct(statRow.overallCI.upper, 0)}]</span>
										</td>
										{#each splitResult.opponents as opp}
											{@const cell = group.cells.get(opp)}
											{@const cellCI = statRow.cellCIs.get(opp)}
											{@const cellSig = statRow.cellSignificance.get(opp)}
											<td class="num-col" style="background: {cell?.winrate != null ? winrateColor(cell.winrate) : 'transparent'}">
												<span class="winrate">
													{pct(cell?.winrate ?? null)}
													{#if cellSig && cellSig.level > 0}
														<span class="sig-stars" style="color: {sigColor(cellSig.level)}">{significanceStars(cellSig.level)}</span>
													{/if}
												</span>
												{#if cell && cell.total > 0}
													<span class="match-count">({cell.total})</span>
												{/if}
												{#if cellCI}
													<span class="ci-text">[{pct(cellCI.lower, 0)} — {pct(cellCI.upper, 0)}]</span>
												{/if}
											</td>
										{/each}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>

					<!-- Pairwise comparisons -->
					{#if statsResult.pairwise.length > 0}
						<div class="pairwise-section">
							{#each statsResult.pairwise as pair}
								<div class="pairwise-item">
									P({pair.groupA} &gt; {pair.groupB}) = <strong>{(pair.probABetter * 100).toFixed(1)}%</strong>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</details>

	<!-- Section 2: Auto-Scan -->
	<details class="section" open>
		<summary>Auto-Scan</summary>
		<div class="section-body">
			<div class="section-controls">
				<div class="field">
					<label for="auto-scan-min">Min matches <span class="info-hint" title="Minimum number of matches a group must have to be included in the test. Higher values give more reliable results but may exclude fringe cards.">?</span></label>
					<input
						id="auto-scan-min"
						type="number"
						min="1"
						max="200"
						bind:value={autoScanMinGroupSize}
					/>
				</div>
				<div class="field">
					<label for="auto-scan-threshold">Skip % <span class="info-hint" title="Cards where this % or more of players run the same count are skipped as auto-includes (no meaningful split possible).">?</span></label>
					<input
						id="auto-scan-threshold"
						type="number"
						min="50"
						max="100"
						bind:value={autoIncludeThreshold}
					/>
				</div>
				<div class="field">
					<label for="auto-scan-effect">Min effect % <span class="info-hint" title="Only show cards where the winrate difference between the best and worst groups exceeds this threshold. Filters out noise from tiny effects.">?</span></label>
					<input
						id="auto-scan-effect"
						type="number"
						min="0"
						max="50"
						bind:value={autoMinEffect}
					/>
				</div>
				<button class="scan-btn" onclick={doAutoScan} disabled={autoScanning}>
					{autoScanning ? 'Scanning...' : 'Scan All Cards'}
				</button>
			</div>

			<p class="scan-explanation">
				Each card is split using the selected mode. The best and worst groups (by overall winrate) are compared
				with <a href="https://en.wikipedia.org/wiki/Fisher%27s_exact_test" target="_blank" rel="noopener">Fisher's exact test</a>.
				P-values are adjusted for multiple comparisons
				(<a href="https://en.wikipedia.org/wiki/Benjamini%E2%80%93Hochberg_procedure" target="_blank" rel="noopener">Benjamini-Hochberg</a>).
				Click a row to view the full split.
			</p>

			{#if autoScanning}
				<div class="progress-section">
					<div class="progress-bar-track">
						<div class="progress-bar-fill" style="width: {autoScanTotal > 0 ? (autoScanProgress / autoScanTotal * 100) : 0}%"></div>
					</div>
					<span class="progress-text">{autoScanProgress} / {autoScanTotal} cards</span>
				</div>
			{/if}

			{#if autoScanResults}
				<div class="auto-scan-results">
					<h4>Results ({autoScanResults.length} cards tested)</h4>
					{#if autoScanResults.length === 0}
						<p class="empty-msg">No cards had enough data in at least 2 groups to test.</p>
					{:else}
						<div class="table-wrap">
							<table>
								<thead>
									<tr>
										<th class="card-name-col">Card</th>
										<th class="num-col" title="Winrate difference between the best and worst performing groups">Effect</th>
										<th class="num-col" title="Raw p-value from Fisher's exact test before multiple-testing correction">Raw p</th>
										<th class="num-col" title="P-value after Benjamini-Hochberg correction for multiple testing. Lower = more significant.">Adj. p</th>
										<th class="num-col" title="Statistical significance: * p<0.05, ** p<0.01, *** p<0.001, ns = not significant">Sig</th>
										<th title="The group with the highest overall winrate">Best</th>
										<th title="The group with the lowest overall winrate">Worst</th>
										<th class="num-col" title="Match count of the smallest group included in the test. Larger = more reliable.">Min N</th>
									</tr>
								</thead>
								<tbody>
									{#each autoScanResults as row}
										<tr class="scan-row" class:significant={row.level > 0} onclick={() => selectAutoScanCard(row.cardName)}>
											<td class="card-name-col"><CardTooltip cardName={row.cardName}><span class="card-name">{row.cardName}</span></CardTooltip></td>
											<td class="num-col">{(row.effectSize * 100).toFixed(1)}%</td>
											<td class="num-col">{row.rawP < 0.001 ? '<0.001' : row.rawP.toFixed(3)}</td>
											<td class="num-col">{row.adjustedP < 0.001 ? '<0.001' : row.adjustedP.toFixed(3)}</td>
											<td class="num-col">
												{#if row.level > 0}
													<span class="sig-stars" style="color: {sigColor(row.level)}">{significanceStars(row.level)}</span>
												{:else}
													<span class="ns-label">ns</span>
												{/if}
											</td>
											<td>{row.bestGroup}</td>
											<td>{row.worstGroup}</td>
											<td class="num-col">{row.minGroupSize}</td>
										</tr>
										{#each row.extraPairs as pair}
											<tr class="scan-row sub-row" class:significant={pair.level > 0} onclick={() => selectAutoScanCard(row.cardName)}>
												<td class="card-name-col"></td>
												<td class="num-col">{(pair.effectSize * 100).toFixed(1)}%</td>
												<td class="num-col">{pair.rawP < 0.001 ? '<0.001' : pair.rawP.toFixed(3)}</td>
												<td class="num-col">{pair.adjustedP < 0.001 ? '<0.001' : pair.adjustedP.toFixed(3)}</td>
												<td class="num-col">
													{#if pair.level > 0}
														<span class="sig-stars" style="color: {sigColor(pair.level)}">{significanceStars(pair.level)}</span>
													{:else}
														<span class="ns-label">ns</span>
													{/if}
												</td>
												<td>{pair.groupA}</td>
												<td>{pair.groupB}</td>
												<td class="num-col">{pair.minN}</td>
											</tr>
										{/each}
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</details>
</div>

<style>
	.splitter {
		font-size: 0.85rem;
	}

	/* Shared controls bar */
	.shared-controls {
		display: flex;
		gap: 1rem;
		align-items: flex-end;
		flex-wrap: wrap;
		margin-bottom: 1rem;
	}

	/* Collapsible sections */
	.section {
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		margin-bottom: 0.75rem;
	}

	.section summary {
		padding: 0.5rem 0.75rem;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-muted);
		cursor: pointer;
		user-select: none;
		background: var(--color-surface);
		border-radius: var(--radius);
	}

	.section[open] summary {
		border-bottom: 1px solid var(--color-border);
		border-radius: var(--radius) var(--radius) 0 0;
	}

	.section-body {
		padding: 0.75rem;
	}

	.section-controls {
		display: flex;
		gap: 1rem;
		align-items: flex-end;
		flex-wrap: wrap;
		margin-bottom: 0.75rem;
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

	.info-hint {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1rem;
		height: 1rem;
		font-size: 0.6rem;
		font-weight: 700;
		border-radius: 50%;
		border: 1px solid var(--color-text-muted);
		color: var(--color-text-muted);
		cursor: help;
		text-transform: none;
		letter-spacing: 0;
		vertical-align: middle;
		margin-left: 0.15rem;
	}

	.info-hint:hover {
		color: var(--color-accent);
		border-color: var(--color-accent);
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

	.other-field {
		min-width: 120px;
	}

	.threshold-row {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		margin-top: 0.35rem;
	}

	.hint {
		font-size: 0.75rem;
		color: var(--color-text-muted);
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

	.scan-btn {
		padding: 0.45rem 0.75rem;
		border: 1px solid var(--color-accent);
		border-radius: var(--radius);
		background: var(--color-accent);
		color: #fff;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.15s;
	}

	.scan-btn:hover:not(:disabled) {
		opacity: 0.85;
	}

	.scan-btn:disabled {
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

	.progress-section {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.progress-bar-track {
		flex: 1;
		height: 0.5rem;
		background: var(--color-border);
		border-radius: 4px;
		overflow: hidden;
		max-width: 300px;
	}

	.progress-bar-fill {
		height: 100%;
		background: var(--color-accent);
		transition: width 0.1s;
	}

	.progress-text {
		font-size: 0.75rem;
		color: var(--color-text-muted);
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
		padding: 0.15rem 0.25rem;
		border-bottom: 1px solid var(--color-border);
		white-space: nowrap;
		line-height: 1.2;
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
		min-width: 3rem;
	}

	.opp-col {
		height: 8rem;
		vertical-align: bottom;
		min-width: 2.5rem;
		padding: 0.25rem;
	}

	.vertical-header {
		writing-mode: vertical-rl;
		transform: rotate(180deg);
		white-space: nowrap;
		margin: 0 auto;
	}

	.baseline-row {
		font-weight: 600;
		border-bottom: 2px solid var(--color-border);
	}

	.delta-row td {
		padding: 0.1rem 0.25rem;
		border-bottom: none;
		height: 1rem;
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

	.winrate {
		display: block;
		font-weight: 600;
		font-size: 0.75rem;
	}

	.match-count {
		display: block;
		font-size: 0.6rem;
		color: var(--color-text-muted);
		line-height: 1;
	}

	.ci-text {
		display: block;
		font-size: 0.55rem;
		color: var(--color-text-muted);
		font-weight: 400;
		line-height: 1.1;
	}

	.sig-stars {
		font-weight: 700;
		margin-left: 0.15rem;
	}

	.pairwise-section {
		margin-top: 0.75rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1.5rem;
	}

	.pairwise-item {
		font-size: 0.8rem;
		color: var(--color-text-muted);
	}

	.auto-scan-results {
		margin-top: 0.5rem;
	}

	.auto-scan-results h4 {
		font-size: 0.8rem;
		font-weight: 600;
		margin: 0 0 0.35rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--color-text-muted);
	}

	.scan-explanation {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		line-height: 1.5;
		margin: 0 0 0.75rem;
		max-width: 640px;
	}

	.scan-explanation a {
		color: var(--color-text-muted);
		text-decoration: underline;
		text-decoration-style: dotted;
		text-underline-offset: 2px;
	}

	.scan-explanation a:hover {
		color: var(--color-accent);
	}

	.empty-msg {
		font-size: 0.8rem;
		color: var(--color-text-muted);
	}

	.card-name-col {
		text-align: left;
		min-width: 10rem;
	}

	.scan-row {
		cursor: pointer;
	}

	.scan-row:hover {
		background: rgba(79, 70, 229, 0.04);
	}

	.scan-row.significant {
		background: rgba(79, 70, 229, 0.06);
	}

	.sub-row {
		opacity: 0.6;
		font-size: 0.75rem;
	}

	.sub-row td {
		border-bottom: 1px solid transparent;
		padding-top: 0.05rem;
		padding-bottom: 0.05rem;
	}

	.ns-label {
		font-size: 0.65rem;
		color: var(--color-text-muted);
	}

	tbody tr:hover:not(.delta-row) {
		outline: 1px solid rgba(79, 70, 229, 0.15);
		outline-offset: -1px;
	}
</style>
