export interface CredibleInterval {
	mean: number;
	lower: number;
	upper: number;
}

export interface CellSignificance {
	/** Fisher's exact test p-value comparing this group's cell vs baseline */
	pValue: number;
	/** 0=ns, 1=*, 2=**, 3=*** */
	level: number;
	/** Adjusted p-value after BH correction (only set during auto-scan) */
	adjustedP?: number;
}

export interface StatisticalSplitRow {
	label: string;
	overallCI: CredibleInterval;
	cellCIs: Map<string, CredibleInterval>;
	cellSignificance: Map<string, CellSignificance>;
}

export interface PairwiseComparison {
	groupA: string;
	groupB: string;
	/** P(A's winrate > B's winrate) */
	probABetter: number;
}

export interface StatisticalSplitResult {
	rows: StatisticalSplitRow[];
	pairwise: PairwiseComparison[];
}

export interface AutoScanResult {
	cardName: string;
	/** Largest absolute effect size across groups */
	effectSize: number;
	/** Raw Fisher p-value for the most significant cell */
	rawP: number;
	/** BH-adjusted p-value */
	adjustedP: number;
	/** Significance level after BH correction */
	level: number;
	bestGroup: string;
	worstGroup: string;
	totalMatches: number;
	/** Match count of the smallest group (limits statistical power) */
	minGroupSize: number;
}
