<script lang="ts">
	import type { TournamentData } from '../types/tournament';
	import { analyzeCardImpact, type CardImpactResult, type CardImpactError } from '../utils/card-impact';
	import { pct } from '../utils/format';

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
			});
		} finally {
			calculating = false;
		}
	}

	// Bar chart dimensions
	const BAR_HEIGHT = 24;
	const LABEL_WIDTH = 160;
	const BAR_AREA_WIDTH = 300;
	const CHART_WIDTH = LABEL_WIDTH + BAR_AREA_WIDTH + 80;

	function barProps(coef: number, maxAbsCoef: number) {
		const scale = maxAbsCoef > 0 ? Math.abs(coef) / maxAbsCoef : 0;
		const width = scale * (BAR_AREA_WIDTH / 2);
		const isPositive = coef >= 0;
		return {
			x: isPositive ? LABEL_WIDTH + BAR_AREA_WIDTH / 2 : LABEL_WIDTH + BAR_AREA_WIDTH / 2 - width,
			width,
			fill: isPositive ? '#16a34a' : '#dc2626',
		};
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
			{@const maxAbs = Math.max(...reg.coefficients.map((c) => Math.abs(c.coefficient)), 0.01)}

			<!-- Summary -->
			<div class="summary">
				<div class="summary-item">
					<span class="summary-label">Matches</span>
					<span class="summary-value">{reg.nObservations}</span>
				</div>
				<div class="summary-item">
					<span class="summary-label">Flex cards</span>
					<span class="summary-value">{reg.nFeatures}</span>
				</div>
				<div class="summary-item">
					<span class="summary-label">Baseline win</span>
					<span class="summary-value">{pct(reg.baselineWinProb)}</span>
				</div>
				<div class="summary-item">
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

			<!-- Bar chart -->
			{#if reg.coefficients.length > 0}
				{@const chartHeight = reg.coefficients.length * (BAR_HEIGHT + 6) + 30}
				<div class="chart-wrap">
					<svg width={CHART_WIDTH} height={chartHeight} class="bar-chart">
						<!-- Center line -->
						<line
							x1={LABEL_WIDTH + BAR_AREA_WIDTH / 2}
							y1="0"
							x2={LABEL_WIDTH + BAR_AREA_WIDTH / 2}
							y2={chartHeight}
							stroke="var(--color-border)"
							stroke-width="1"
						/>

						{#each reg.coefficients as coef, i}
							{@const y = i * (BAR_HEIGHT + 6) + 3}
							{@const bar = barProps(coef.coefficient, maxAbs)}

							<!-- Label -->
							<text
								x={LABEL_WIDTH - 8}
								y={y + BAR_HEIGHT / 2 + 4}
								text-anchor="end"
								font-size="12"
								fill="var(--color-text)"
							>
								{coef.name.length > 20 ? coef.name.slice(0, 18) + '...' : coef.name}
							</text>

							<!-- Bar -->
							<rect
								x={bar.x}
								{y}
								width={bar.width}
								height={BAR_HEIGHT}
								fill={bar.fill}
								opacity="0.8"
								rx="2"
							/>

							<!-- Error bars (CI) -->
							{@const ciLeftX = LABEL_WIDTH + BAR_AREA_WIDTH / 2 + (coef.lower / maxAbs) * (BAR_AREA_WIDTH / 2)}
							{@const ciRightX = LABEL_WIDTH + BAR_AREA_WIDTH / 2 + (coef.upper / maxAbs) * (BAR_AREA_WIDTH / 2)}
							{@const ciY = y + BAR_HEIGHT / 2}
							<line
								x1={Math.max(LABEL_WIDTH, ciLeftX)}
								y1={ciY}
								x2={Math.min(LABEL_WIDTH + BAR_AREA_WIDTH, ciRightX)}
								y2={ciY}
								stroke="var(--color-text)"
								stroke-width="1.5"
								opacity="0.5"
							/>
							<!-- CI caps -->
							<line
								x1={Math.max(LABEL_WIDTH, ciLeftX)}
								y1={ciY - 4}
								x2={Math.max(LABEL_WIDTH, ciLeftX)}
								y2={ciY + 4}
								stroke="var(--color-text)"
								stroke-width="1.5"
								opacity="0.5"
							/>
							<line
								x1={Math.min(LABEL_WIDTH + BAR_AREA_WIDTH, ciRightX)}
								y1={ciY - 4}
								x2={Math.min(LABEL_WIDTH + BAR_AREA_WIDTH, ciRightX)}
								y2={ciY + 4}
								stroke="var(--color-text)"
								stroke-width="1.5"
								opacity="0.5"
							/>

							<!-- Coefficient value -->
							<text
								x={LABEL_WIDTH + BAR_AREA_WIDTH + 8}
								y={y + BAR_HEIGHT / 2 + 4}
								font-size="11"
								fill="var(--color-text-muted)"
							>
								{coef.coefficient > 0 ? '+' : ''}{coef.coefficient.toFixed(2)}
							</text>
						{/each}

						<!-- Axis labels -->
						<text
							x={LABEL_WIDTH + BAR_AREA_WIDTH / 2}
							y={chartHeight - 4}
							text-anchor="middle"
							font-size="10"
							fill="var(--color-text-muted)"
						>
							Hurts ← Coefficient → Helps
						</text>
					</svg>
				</div>
			{/if}

			<!-- Coefficient details table -->
			{#if reg.coefficients.length > 0}
				<details class="details-table">
					<summary>Coefficient details</summary>
					<div class="table-wrap">
						<table>
							<thead>
								<tr>
									<th>Card</th>
									<th class="num">Coef</th>
									<th class="num">SE</th>
									<th class="num">95% CI</th>
									<th class="num">Marginal</th>
								</tr>
							</thead>
							<tbody>
								{#each reg.coefficients as coef}
									<tr>
										<td>{coef.name}</td>
										<td class="num" class:positive={coef.coefficient > 0} class:negative={coef.coefficient < 0}>
											{coef.coefficient > 0 ? '+' : ''}{coef.coefficient.toFixed(3)}
										</td>
										<td class="num">{coef.se.toFixed(3)}</td>
										<td class="num">[{coef.lower.toFixed(2)}, {coef.upper.toFixed(2)}]</td>
										<td class="num" class:positive={coef.marginalEffect > 0} class:negative={coef.marginalEffect < 0}>
											{coef.marginalEffect > 0 ? '+' : ''}{(coef.marginalEffect * 100).toFixed(1)}%
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

	.bar-chart {
		display: block;
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
