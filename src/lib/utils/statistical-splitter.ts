import type { SplitResult, SplitRow } from './winrate-splitter';
import type {
	StatisticalSplitResult,
	StatisticalSplitRow,
	PairwiseComparison,
	AutoScanResult,
} from '../types/statistics';
import type { CredibleInterval } from '../algorithms/statistics';
import type { TournamentData } from '../types/tournament';
import {
	credibleInterval,
	fisherExactTest,
	probAGreaterThanB,
	benjaminiHochberg,
	significanceLevel,
} from '../algorithms/statistics';
import { splitByCard } from './winrate-splitter';
import type { SplitMode } from './winrate-splitter';

/**
 * Enrich a SplitResult with credible intervals, Fisher's exact test
 * significance per cell, and pairwise P(A > B) comparisons.
 */
export function computeStatistics(split: SplitResult): StatisticalSplitResult {
	const baseline = split.baselineRow;
	const rows: StatisticalSplitRow[] = split.groupRows.map((row) => {
		const overallCI = credibleInterval(row.totalWins, row.totalLosses);
		const cellCIs = new Map<string, CredibleInterval>();
		const cellSignificance = new Map<string, import('../types/statistics').CellSignificance>();

		for (const opponent of split.opponents) {
			const cell = row.cells.get(opponent);
			const baseCell = baseline.cells.get(opponent);

			if (cell && cell.total > 0) {
				cellCIs.set(opponent, credibleInterval(cell.wins, cell.losses));

				if (baseCell && baseCell.total > 0) {
					// Fisher's test: compare this group vs the complement
					// complement = baseline - group
					const compW = baseCell.wins - cell.wins;
					const compL = baseCell.losses - cell.losses;
					if (compW >= 0 && compL >= 0 && (compW + compL) > 0) {
						const p = fisherExactTest(cell.wins, cell.losses, compW, compL);
						cellSignificance.set(opponent, {
							pValue: p,
							level: significanceLevel(p),
						});
					}
				}
			}
		}

		return { label: row.label, overallCI, cellCIs, cellSignificance };
	});

	// Pairwise comparisons: P(group A overall > group B overall)
	const pairwise: PairwiseComparison[] = [];
	for (let i = 0; i < split.groupRows.length; i++) {
		for (let j = i + 1; j < split.groupRows.length; j++) {
			const a = split.groupRows[i];
			const b = split.groupRows[j];
			const prob = probAGreaterThanB(a.totalWins, a.totalLosses, b.totalWins, b.totalLosses);
			pairwise.push({
				groupA: a.label,
				groupB: b.label,
				probABetter: prob,
			});
		}
	}

	return { rows, pairwise };
}

/**
 * Scan all candidate cards, compute splits, find the most significant effects,
 * and apply BH correction. Yields to the UI periodically.
 */
export async function autoScanCards(
	tournaments: TournamentData[],
	playerArchetypes: Map<string, string>,
	archetypeName: string,
	allCardNames: string[],
	mode: SplitMode,
	options: {
		minMatches?: number;
		threshold?: number;
		topN?: number;
		minMetagameShare?: number;
		onProgress?: (done: number, total: number) => void;
	} = {},
): Promise<AutoScanResult[]> {
	const minMatches = options.minMatches ?? 10;
	const candidates: {
		cardName: string;
		effectSize: number;
		rawP: number;
		bestGroup: string;
		worstGroup: string;
		totalMatches: number;
	}[] = [];

	for (let i = 0; i < allCardNames.length; i++) {
		const cardName = allCardNames[i];

		const split = splitByCard(tournaments, playerArchetypes, archetypeName, cardName, mode, {
			threshold: options.threshold,
			topN: options.topN,
			minMetagameShare: options.minMetagameShare,
		});

		// Skip cards where groups don't have enough data
		if (split.groupRows.length < 2) continue;
		const totalMatches = split.groupRows.reduce((s, r) => s + r.totalMatches, 0);
		if (totalMatches < minMatches) continue;

		// Find best/worst group by overall winrate and best Fisher p-value
		const stats = computeStatistics(split);
		let bestWR = -1, worstWR = 2;
		let bestGroup = '', worstGroup = '';

		for (const row of split.groupRows) {
			const wr = row.overallWinrate ?? 0.5;
			if (wr > bestWR) { bestWR = wr; bestGroup = row.label; }
			if (wr < worstWR) { worstWR = wr; worstGroup = row.label; }
		}

		const effectSize = bestWR - worstWR;

		// Collect the minimum p-value across all cells and groups
		let minP = 1;
		for (const statRow of stats.rows) {
			for (const [, sig] of statRow.cellSignificance) {
				if (sig.pValue < minP) minP = sig.pValue;
			}
		}

		candidates.push({ cardName, effectSize, rawP: minP, bestGroup, worstGroup, totalMatches });

		// Yield to UI every 5 cards
		if (i % 5 === 4) {
			options.onProgress?.(i + 1, allCardNames.length);
			await new Promise((r) => setTimeout(r, 0));
		}
	}

	options.onProgress?.(allCardNames.length, allCardNames.length);

	if (candidates.length === 0) return [];

	// BH correction across all scanned cards
	const rawPs = candidates.map((c) => c.rawP);
	const adjustedPs = benjaminiHochberg(rawPs);

	const results: AutoScanResult[] = candidates.map((c, i) => ({
		cardName: c.cardName,
		effectSize: c.effectSize,
		rawP: c.rawP,
		adjustedP: adjustedPs[i],
		level: significanceLevel(adjustedPs[i]),
		bestGroup: c.bestGroup,
		worstGroup: c.worstGroup,
		totalMatches: c.totalMatches,
	}));

	// Sort by adjusted p-value ascending (most significant first)
	results.sort((a, b) => a.adjustedP - b.adjustedP);

	return results;
}
