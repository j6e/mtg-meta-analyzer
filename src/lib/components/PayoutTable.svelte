<script lang="ts">
	import type { ParsedEvent, ValuationParams } from '../algorithms/ev-calculator';
	import { rewardValue, entryCost } from '../algorithms/ev-calculator';

	let { event, valuation, currencySymbol = '€' }: { event: ParsedEvent; valuation: ValuationParams; currencySymbol?: string } = $props();

	const cost = $derived(entryCost(event, valuation));

	/** All unique reward type keys across all tiers (for dynamic columns). */
	const rewardTypes = $derived(() => {
		const types = new Set<string>();
		for (const tier of event.rewards) {
			for (const key of Object.keys(tier.items)) {
				types.add(key);
			}
		}
		return [...types];
	});

	function formatLabel(type: string): string {
		return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
	}

	function formatNumber(n: number): string {
		return n.toLocaleString('en-US');
	}

	function formatCurrency(n: number): string {
		return n.toFixed(2);
	}
</script>

<div class="payout-table-wrapper">
	<div class="table-header">
		<h3>Reward Breakdown</h3>
		<span class="entry-cost">Entry: {currencySymbol}{formatCurrency(cost)}</span>
	</div>
	<table class="payout-table">
		<thead>
			<tr>
				<th>Wins</th>
				{#each rewardTypes() as type}
					<th>{formatLabel(type)}</th>
				{/each}
				<th class="value-col">Value ({currencySymbol})</th>
				<th class="net-col">Net ({currencySymbol})</th>
			</tr>
		</thead>
		<tbody>
			{#each event.rewards as tier}
				{@const value = rewardValue(tier, valuation)}
				{@const net = value - cost}
				<tr class:positive={net > 0} class:negative={net < 0}>
					<td class="wins-cell">{tier.wins}</td>
					{#each rewardTypes() as type}
						<td>{tier.items[type] ? formatNumber(tier.items[type]) : '—'}</td>
					{/each}
					<td class="value-col">{formatCurrency(value)}</td>
					<td class="net-col" class:win={net > 0} class:loss={net < 0}>
						{net >= 0 ? '+' : ''}{formatCurrency(net)}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.payout-table-wrapper {
		margin: 1.5rem 0;
	}

	.table-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.75rem;
	}

	.table-header h3 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
	}

	.entry-cost {
		font-size: 0.9rem;
		color: var(--color-text-muted);
		font-weight: 500;
	}

	.payout-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
	}

	.payout-table th,
	.payout-table td {
		padding: 0.4rem 0.75rem;
		text-align: right;
		border-bottom: 1px solid var(--color-border);
	}

	.payout-table th {
		font-weight: 600;
		color: var(--color-text-muted);
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.payout-table th:first-child,
	.payout-table td:first-child {
		text-align: center;
	}

	.wins-cell {
		font-weight: 600;
	}

	.value-col {
		font-weight: 500;
	}

	.net-col {
		font-weight: 600;
	}

	.win {
		color: var(--color-win);
	}

	.loss {
		color: var(--color-loss);
	}

	.payout-table tbody tr:hover {
		background: rgba(79, 70, 229, 0.04);
	}
</style>
