import type { SplitResult, SplitRow } from './winrate-splitter';
import type {
	StatisticalSplitResult,
	StatisticalSplitRow,
	PairwiseComparison,
	AutoScanResult,
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
	options?: { minGroupSize?: number },
): StatisticalSplitResult {
	const minGS = options?.minGroupSize ?? 0;
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

	// Pairwise comparisons: adjacent groups only (avoids invalid
	// overlapping-group comparisons in cumulative mode)
	const pairwise: PairwiseComparison[] = [];
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
	const candidates: {
		cardName: string;
		effectSize: number;
		rawP: number;
		bestGroup: string;
		worstGroup: string;
		totalMatches: number;
		minGroupSize: number;
	}[] = [];

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

		// Find best/worst among eligible groups by overall winrate
		let bestRow: SplitRow | null = null;
		let worstRow: SplitRow | null = null;
		let bestWR = -1, worstWR = 2;
		let smallestGroup = Infinity;

		for (const row of eligibleRows) {
			const wr = row.overallWinrate ?? 0.5;
			if (wr > bestWR) { bestWR = wr; bestRow = row; }
			if (wr < worstWR) { worstWR = wr; worstRow = row; }
			if (row.totalMatches < smallestGroup) smallestGroup = row.totalMatches;
		}

		const effectSize = bestWR - worstWR;
		if (effectSize < minEffectSize) continue;

		const totalMatches = eligibleRows.reduce((s, r) => s + r.totalMatches, 0);

		// Single Fisher's test: best group vs worst group on overall record.
		// One test per card — avoids cherry-picking across per-opponent cells.
		const rawP = fisherExactTest(
			bestRow!.totalWins, bestRow!.totalLosses,
			worstRow!.totalWins, worstRow!.totalLosses,
		);

		candidates.push({
			cardName, effectSize, rawP,
			bestGroup: bestRow!.label, worstGroup: worstRow!.label,
			totalMatches, minGroupSize: smallestGroup,
		});

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
		minGroupSize: c.minGroupSize,
	}));

	// Sort by adjusted p-value ascending (most significant first)
	results.sort((a, b) => a.adjustedP - b.adjustedP);

	return results;
}
