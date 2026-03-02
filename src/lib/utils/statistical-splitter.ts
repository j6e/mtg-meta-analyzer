import type { SplitResult, SplitRow } from './winrate-splitter';
import type {
	StatisticalSplitResult,
	StatisticalSplitRow,
	PairwiseComparison,
	AutoScanResult,
	AutoScanPair,
	CellSignificance,
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
import { splitByCard, countCardCopies } from './winrate-splitter';
import type { SplitMode } from './winrate-splitter';

/**
 * Enrich a SplitResult with credible intervals, Fisher's exact test
 * significance per cell, and pairwise P(A > B) comparisons.
 *
 * Groups with fewer than `minGroupSize` total matches still get CIs
 * but are excluded from significance testing and pairwise comparisons.
 */
export function computeStatistics(
	split: SplitResult,
	options?: { minGroupSize?: number; mode?: SplitMode },
): StatisticalSplitResult {
	const minGS = options?.minGroupSize ?? 0;
	const mode = options?.mode;
	const baseline = split.baselineRow;

	// First pass: compute CIs and collect raw p-values for BH correction
	const rawTests: { groupIdx: number; opponent: string; p: number }[] = [];
	const perRow: { overallCI: CredibleInterval; cellCIs: Map<string, CredibleInterval>; rawPs: Map<string, number> }[] = [];

	for (let gi = 0; gi < split.groupRows.length; gi++) {
		const row = split.groupRows[gi];
		const overallCI = credibleInterval(row.totalWins, row.totalLosses);
		const cellCIs = new Map<string, CredibleInterval>();
		const rawPs = new Map<string, number>();
		const groupTooSmall = row.totalMatches < minGS;

		for (const opponent of split.opponents) {
			const cell = row.cells.get(opponent);
			const baseCell = baseline.cells.get(opponent);

			if (cell && cell.total > 0) {
				cellCIs.set(opponent, credibleInterval(cell.wins, cell.losses));

				if (!groupTooSmall && baseCell && baseCell.total > 0) {
					const compW = baseCell.wins - cell.wins;
					const compL = baseCell.losses - cell.losses;
					if (compW >= 0 && compL >= 0 && (compW + compL) > 0) {
						const p = fisherExactTest(cell.wins, cell.losses, compW, compL);
						rawPs.set(opponent, p);
						rawTests.push({ groupIdx: gi, opponent, p });
					}
				}
			}
		}

		perRow.push({ overallCI, cellCIs, rawPs });
	}

	// BH correction across all per-cell tests
	const adjustedPs = rawTests.length > 0
		? benjaminiHochberg(rawTests.map((t) => t.p))
		: [];

	// Build final rows with corrected significance
	const rows: StatisticalSplitRow[] = split.groupRows.map((row, gi) => {
		const { overallCI, cellCIs } = perRow[gi];
		const cellSignificance = new Map<string, CellSignificance>();

		for (let i = 0; i < rawTests.length; i++) {
			if (rawTests[i].groupIdx === gi) {
				cellSignificance.set(rawTests[i].opponent, {
					pValue: rawTests[i].p,
					adjustedP: adjustedPs[i],
					level: significanceLevel(adjustedPs[i]),
				});
			}
		}

		return { label: row.label, overallCI, cellCIs, cellSignificance };
	});

	// Pairwise comparisons
	const pairwise: PairwiseComparison[] = [];
	if (mode === 'cumulative') {
		// Cumulative groups overlap (≥N is a superset of ≥N+1), so compare
		// each group against its complement derived from the baseline.
		for (const row of split.groupRows) {
			if (row.totalMatches < minGS) continue;
			const compW = baseline.totalWins - row.totalWins;
			const compL = baseline.totalLosses - row.totalLosses;
			if (compW + compL < minGS) continue;
			const prob = probAGreaterThanB(row.totalWins, row.totalLosses, compW, compL);
			pairwise.push({
				groupA: row.label,
				groupB: `not ${row.label}`,
				probABetter: prob,
			});
		}
	} else {
		// Binary / per-copy: groups are non-overlapping, compare adjacent pairs
		for (let i = 0; i < split.groupRows.length - 1; i++) {
			const a = split.groupRows[i];
			const b = split.groupRows[i + 1];
			if (a.totalMatches >= minGS && b.totalMatches >= minGS) {
				const prob = probAGreaterThanB(a.totalWins, a.totalLosses, b.totalWins, b.totalLosses);
				pairwise.push({
					groupA: a.label,
					groupB: b.label,
					probABetter: prob,
				});
			}
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
		minGroupSize?: number;
		threshold?: number;
		topN?: number;
		minMetagameShare?: number;
		autoIncludeThreshold?: number;
		minEffectSize?: number;
		onProgress?: (done: number, total: number) => void;
	} = {},
): Promise<AutoScanResult[]> {
	const minGroupSize = options.minGroupSize ?? 10;
	const autoIncludeThreshold = options.autoIncludeThreshold ?? 0.9;
	const minEffectSize = options.minEffectSize ?? 0.05;

	// Collect all pairwise candidates across all cards.
	// BH correction is applied across ALL pairs, not per-card.
	interface PairCandidate {
		cardName: string;
		groupA: string;   // higher WR
		groupB: string;   // lower WR
		effectSize: number;
		rawP: number;
		minN: number;
		totalMatches: number;
		isBestWorst: boolean;
	}
	const allPairs: PairCandidate[] = [];

	for (let i = 0; i < allCardNames.length; i++) {
		const cardName = allCardNames[i];

		// Pre-filter: skip low-variance cards where ≥threshold% of players
		// have the same copy count — no meaningful split to test.
		if (autoIncludeThreshold < 1) {
			const playerCopies = countCardCopies(tournaments, playerArchetypes, archetypeName, cardName);
			const n = playerCopies.size;
			if (n > 0) {
				const countFreq = new Map<number, number>();
				for (const copies of playerCopies.values()) {
					countFreq.set(copies, (countFreq.get(copies) ?? 0) + 1);
				}
				const maxFreq = Math.max(...countFreq.values());
				if (maxFreq / n >= autoIncludeThreshold) continue;
			}
		}

		const split = splitByCard(tournaments, playerArchetypes, archetypeName, cardName, mode, {
			threshold: options.threshold,
			topN: options.topN,
			minMetagameShare: options.minMetagameShare,
		});

		// Filter to groups that meet the minimum size
		const eligibleRows = split.groupRows.filter((r) => r.totalMatches >= minGroupSize);
		if (eligibleRows.length < 2) continue;

		// Find best/worst for the primary row
		let bestWR = -1, worstWR = 2;
		let bestLabel = '', worstLabel = '';
		for (const row of eligibleRows) {
			const wr = row.overallWinrate ?? 0.5;
			if (wr > bestWR) { bestWR = wr; bestLabel = row.label; }
			if (wr < worstWR) { worstWR = wr; worstLabel = row.label; }
		}

		// Enumerate all C(k,2) pairwise comparisons
		const totalMatches = eligibleRows.reduce((s, r) => s + r.totalMatches, 0);

		for (let a = 0; a < eligibleRows.length; a++) {
			for (let b = a + 1; b < eligibleRows.length; b++) {
				const rowA = eligibleRows[a];
				const rowB = eligibleRows[b];
				const wrA = rowA.overallWinrate ?? 0.5;
				const wrB = rowB.overallWinrate ?? 0.5;

				// Order so groupA has higher winrate
				const [higher, lower] = wrA >= wrB ? [rowA, rowB] : [rowB, rowA];
				const effect = (higher.overallWinrate ?? 0.5) - (lower.overallWinrate ?? 0.5);

				if (effect < minEffectSize) continue;

				const rawP = fisherExactTest(
					higher.totalWins, higher.totalLosses,
					lower.totalWins, lower.totalLosses,
				);
				const minN = Math.min(higher.totalMatches, lower.totalMatches);
				const isBestWorst = higher.label === bestLabel && lower.label === worstLabel;

				allPairs.push({
					cardName, groupA: higher.label, groupB: lower.label,
					effectSize: effect, rawP, minN, totalMatches, isBestWorst,
				});
			}
		}

		// Yield to UI every 5 cards
		if (i % 5 === 4) {
			options.onProgress?.(i + 1, allCardNames.length);
			await new Promise((r) => setTimeout(r, 0));
		}
	}

	options.onProgress?.(allCardNames.length, allCardNames.length);

	if (allPairs.length === 0) return [];

	// BH correction across ALL pairs from ALL cards
	const rawPs = allPairs.map((c) => c.rawP);
	const adjustedPs = benjaminiHochberg(rawPs);

	// Attach adjusted p-values
	const correctedPairs = allPairs.map((p, i) => ({
		...p,
		adjustedP: adjustedPs[i],
		level: significanceLevel(adjustedPs[i]),
	}));

	// Group by card: primary row = best/worst pair, extras = other pairs
	const byCard = new Map<string, typeof correctedPairs>();
	for (const pair of correctedPairs) {
		if (!byCard.has(pair.cardName)) byCard.set(pair.cardName, []);
		byCard.get(pair.cardName)!.push(pair);
	}

	const results: AutoScanResult[] = [];
	for (const [cardName, pairs] of byCard) {
		// Primary = best/worst pair; fallback to lowest adjusted p
		const primary = pairs.find((p) => p.isBestWorst)
			?? pairs.reduce((best, p) => p.adjustedP < best.adjustedP ? p : best);

		const extras: AutoScanPair[] = pairs
			.filter((p) => p !== primary)
			.sort((a, b) => a.adjustedP - b.adjustedP)
			.map((p) => ({
				groupA: p.groupA,
				groupB: p.groupB,
				effectSize: p.effectSize,
				rawP: p.rawP,
				adjustedP: p.adjustedP,
				level: p.level,
				minN: p.minN,
			}));

		results.push({
			cardName,
			effectSize: primary.effectSize,
			rawP: primary.rawP,
			adjustedP: primary.adjustedP,
			level: primary.level,
			bestGroup: primary.groupA,
			worstGroup: primary.groupB,
			totalMatches: primary.totalMatches,
			minGroupSize: primary.minN,
			extraPairs: extras,
		});
	}

	// Sort by adjusted p-value ascending (most significant first)
	results.sort((a, b) => a.adjustedP - b.adjustedP);

	return results;
}
