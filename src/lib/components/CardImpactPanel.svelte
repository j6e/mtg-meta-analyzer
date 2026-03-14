<script lang="ts">
	import type { TournamentData } from '../types/tournament';
	import { analyzeCardImpact, type CardImpactResult, type CardImpactError } from '../utils/card-impact';
	import { pct } from '../utils/format';
	import { settings } from '../stores/settings';
	import CardTooltip from './CardTooltip.svelte';

	let {
		archetypeName,
		tournaments,
		playerArchetypes,
		opponents,
	}: {
		archetypeName: string;
		tournaments: TournamentData[];
		playerArchetypes: Map<string, string>;
		opponents: string[];
	} = $props();

	let selectedOpponent = $state('');
	let minObservations = $state(30);
	let maxFeatures = $state(12);
	let calculating = $state(false);
	let result = $state<CardImpactResult | CardImpactError | null>(null);

	async function runAnalysis() {
		calculating = true;
		result = null;

		await new Promise((r) => requestAnimationFrame(r));

		try {
			result = analyzeCardImpact(tournaments, playerArchetypes, archetypeName, {
				opponent: selectedOpponent || undefined,
				minObservations,
				maxFeatures,
				useStandings: $settings.useStandings,
			});
		} finally {
			calculating = false;
		}
	}

</script>

<div class="card-impact">
	<div class="controls">
		<div class="field">
			<label for="opponent-select">Opponent</label>
			<select id="opponent-select" bind:value={selectedOpponent}>
				<option value="">All opponents</option>
				{#each opponents as opp}
					<option value={opp}>{opp}</option>
				{/each}
			</select>
		</div>

		<div class="field">
			<label for="min-obs">Min matches</label>
			<input id="min-obs" type="number" min="5" max="500" bind:value={minObservations} />
		</div>

		<div class="field">
			<label for="max-feat">Max features</label>
			<input id="max-feat" type="number" min="2" max="20" bind:value={maxFeatures} />
		</div>

		<button class="run-btn" onclick={runAnalysis} disabled={calculating}>
			{calculating ? 'Analyzing...' : 'Analyze'}
		</button>
	</div>

	{#if calculating}
		<div class="loading">
			<div class="spinner"></div>
			<span>Fitting model...</span>
		</div>
	{/if}

	{#if result}
		{#if 'error' in result}
			<div class="error-box">{result.error}</div>
		{:else}
			{@const reg = result.regression}
			{@const sorted = [...reg.coefficients].sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient))}
			{@const maxAbs = Math.max(...sorted.map((c) => Math.abs(c.coefficient)), 0.01)}

			<!-- Summary -->
			<div class="summary">
				<div class="summary-item" title="Number of non-mirror, non-draw, non-bye match observations used for fitting">
					<span class="summary-label">Matches</span>
					<span class="summary-value">{reg.nObservations}</span>
				</div>
				<div class="summary-item" title="Cards with meaningful variance in copy counts across decklists (excludes basic lands and auto-includes)">
					<span class="summary-label">Flex cards</span>
					<span class="summary-value">{reg.nFeatures}</span>
				</div>
				<div class="summary-item" title="Predicted win probability at average card counts (sigmoid of the intercept)">
					<span class="summary-label">Baseline win</span>
					<span class="summary-value">{pct(reg.baselineWinProb)}</span>
				</div>
				<div class="summary-item" title="Model fit: 0 means card choices have no predictive power over a coin flip, higher is better. Expect small values — match outcomes depend heavily on opponent, draws, and skill">
					<span class="summary-label">Pseudo-R²</span>
					<span class="summary-value">{reg.pseudoR2.toFixed(3)}</span>
				</div>
			</div>

			<!-- Warnings -->
			{#if reg.warnings.length > 0}
				<div class="warnings">
					{#each reg.warnings as w}
						<div class="warning-item">{w}</div>
					{/each}
				</div>
			{/if}

			<!-- Bar chart (HTML-based for CardTooltip support) -->
			{#if sorted.length > 0}
				<div class="chart-wrap">
					{#each sorted as coef}
						{@const scale = maxAbs > 0 ? Math.abs(coef.coefficient) / maxAbs : 0}
						{@const barPct = scale * 50}
						{@const isPositive = coef.coefficient >= 0}
						{@const ciLeftPct = Math.max(0, 50 + (coef.lower / maxAbs) * 50)}
						{@const ciRightPct = Math.min(100, 50 + (coef.upper / maxAbs) * 50)}
						{@const significant = !(coef.lower <= 0 && coef.upper >= 0)}
						<div class="chart-row" class:faded={!significant}>
							<div class="chart-label">
								<CardTooltip cardName={coef.name}><span class="card-name">{coef.name}</span></CardTooltip>
							</div>
							<div class="chart-bar-area">
								<div class="chart-center-line"></div>
								<div
									class="chart-bar"
									style="left: {isPositive ? 50 : 50 - barPct}%; width: {barPct}%; background: {isPositive ? '#16a34a' : '#dc2626'};"
								></div>
								<!-- Error bar -->
								<div
									class="chart-ci"
									style="left: {ciLeftPct}%; width: {ciRightPct - ciLeftPct}%;"
								></div>
								<div class="chart-ci-cap" style="left: {ciLeftPct}%;"></div>
								<div class="chart-ci-cap" style="left: {ciRightPct}%;"></div>
							</div>
							<div class="chart-value">
								{coef.coefficient > 0 ? '+' : ''}{coef.coefficient.toFixed(2)}
							</div>
						</div>
					{/each}
					<div class="chart-axis-label">Hurts &larr; Coefficient &rarr; Helps</div>
					<p class="chart-note">Faded bars have confidence intervals crossing zero (not statistically reliable).</p>
				</div>

				<p class="methodology">
					Coefficients are from a
					<a href="https://en.wikipedia.org/wiki/Bayesian_logistic_regression">Bayesian logistic regression</a>
					fitted via
					<a href="https://en.wikipedia.org/wiki/Iteratively_reweighted_least_squares">IRLS</a>
					with weakly informative
					<a href="https://en.wikipedia.org/wiki/Normal_distribution">normal priors</a>
					(&sigma;=1.0). Error bars show 95%
					<a href="https://en.wikipedia.org/wiki/Credible_interval">credible intervals</a>
					from
					<a href="https://en.wikipedia.org/wiki/Laplace%27s_approximation">Laplace approximation</a>.
					Impact is a bounded score (−100 to +100) derived from the coefficient,
					where 0 means no effect and ±100 is the theoretical maximum.
				</p>
			{/if}

			<!-- Coefficient details table -->
			{#if sorted.length > 0}
				<details class="details-table">
					<summary>Coefficient details</summary>
					<div class="table-wrap">
						<table>
							<thead>
								<tr>
									<th title="The flex card whose copy count varies across decklists">Card</th>
									<th class="num" title="Log-odds coefficient: positive means more copies correlate with more wins">Coef</th>
									<th class="num" title="Standard error of the coefficient estimate (Laplace approximation)">SE</th>
									<th class="num" title="95% credible interval for the coefficient; crossing zero means the effect is not significant">95% CI</th>
									<th class="num" title="Impact score from −100 to +100: effect strength on a bounded scale. 0 = no effect, ±100 = theoretical maximum">Impact</th>
								</tr>
							</thead>
							<tbody>
								{#each sorted as coef}
									{@const significant = !(coef.lower <= 0 && coef.upper >= 0)}
									<tr class:faded={!significant}>
										<td><CardTooltip cardName={coef.name}><span class="card-name">{coef.name}</span></CardTooltip></td>
										<td class="num" class:positive={coef.coefficient > 0} class:negative={coef.coefficient < 0}>
											{coef.coefficient > 0 ? '+' : ''}{coef.coefficient.toFixed(3)}
										</td>
										<td class="num">{coef.se.toFixed(3)}</td>
										<td class="num">[{coef.lower.toFixed(2)}, {coef.upper.toFixed(2)}]</td>
										<td class="num" class:positive={coef.impactScore > 0} class:negative={coef.impactScore < 0}>
											{coef.impactScore > 0 ? '+' : ''}{coef.impactScore}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</details>
			{/if}
		{/if}
	{/if}
</div>

<style>
	.card-impact {
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

	select {
		padding: 0.45rem 0.6rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		background: var(--color-surface);
		color: var(--color-text);
		font-size: 0.85rem;
		min-width: 160px;
	}

	input[type='number'] {
		width: 4rem;
		padding: 0.45rem 0.6rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		background: var(--color-surface);
		color: var(--color-text);
		font-size: 0.875rem;
	}

	.run-btn {
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

	.run-btn:hover:not(:disabled) {
		opacity: 0.85;
	}

	.run-btn:disabled {
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

	.error-box {
		padding: 0.75rem 1rem;
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: var(--radius);
		color: #dc2626;
		font-size: 0.85rem;
	}

	.summary {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		margin-bottom: 1rem;
	}

	.summary-item {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		padding: 0.5rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		cursor: help;
	}

	.summary-label {
		font-size: 0.65rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-muted);
	}

	.summary-value {
		font-size: 1rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.warnings {
		margin-bottom: 1rem;
	}

	.warning-item {
		padding: 0.5rem 0.75rem;
		background: #fffbeb;
		border: 1px solid #fde68a;
		border-radius: var(--radius);
		color: #92400e;
		font-size: 0.8rem;
		margin-bottom: 0.35rem;
	}

	.chart-wrap {
		overflow-x: auto;
		margin-bottom: 1rem;
	}

	.chart-row {
		display: flex;
		align-items: center;
		height: 30px;
		gap: 0;
	}

	.chart-label {
		width: 220px;
		min-width: 220px;
		text-align: right;
		padding-right: 8px;
		font-size: 0.8rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chart-bar-area {
		position: relative;
		flex: 1;
		min-width: 300px;
		max-width: 400px;
		height: 20px;
	}

	.chart-center-line {
		position: absolute;
		left: 50%;
		top: 0;
		bottom: 0;
		width: 1px;
		background: var(--color-border);
	}

	.chart-bar {
		position: absolute;
		top: 3px;
		height: 14px;
		border-radius: 2px;
		opacity: 0.8;
	}

	.chart-ci {
		position: absolute;
		top: 9px;
		height: 2px;
		background: var(--color-text);
		opacity: 0.5;
	}

	.chart-ci-cap {
		position: absolute;
		top: 5px;
		width: 1.5px;
		height: 10px;
		background: var(--color-text);
		opacity: 0.5;
	}

	.chart-value {
		width: 50px;
		padding-left: 8px;
		font-size: 0.7rem;
		color: var(--color-text-muted);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.chart-row.faded {
		opacity: 0.4;
	}

	.chart-axis-label {
		text-align: center;
		font-size: 0.65rem;
		color: var(--color-text-muted);
		margin-top: 0.25rem;
		padding-left: 220px;
	}

	.chart-note {
		font-size: 0.7rem;
		color: var(--color-text-muted);
		margin: 0.35rem 0 0 220px;
		font-style: italic;
	}

	.methodology {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		line-height: 1.5;
		margin: 0.75rem 0 0.5rem;
	}

	.methodology a {
		color: var(--color-text-muted);
		text-decoration: underline;
		text-decoration-style: dotted;
		text-underline-offset: 2px;
	}

	.methodology a:hover {
		color: var(--color-accent);
	}

	.details-table {
		margin-top: 0.5rem;
	}

	.details-table summary {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-text-muted);
		cursor: pointer;
		margin-bottom: 0.5rem;
	}

	.table-wrap {
		overflow-x: auto;
	}

	table {
		border-collapse: collapse;
		width: 100%;
	}

	th, td {
		padding: 0.3rem 0.5rem;
		border-bottom: 1px solid var(--color-border);
		white-space: nowrap;
	}

	th {
		font-weight: 600;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-muted);
		cursor: help;
	}

	tr.faded {
		opacity: 0.4;
	}

	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.positive {
		color: #16a34a;
	}

	.negative {
		color: #dc2626;
	}
</style>
