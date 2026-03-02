/**
 * Domain bridge: extract match-level training data from tournaments,
 * select flex features, and run Bayesian logistic regression.
 */

import type { TournamentData } from '../types/tournament';
import type { DecklistInfo } from '../types/decklist';
import { fromArray, type Matrix } from '../algorithms/linalg';
import { fitLogisticRegression, type LogisticRegressionResult } from '../algorithms/logistic-regression';

// ── Types ──

export interface TrainingObservation {
	/** Card copy counts for this player's decklist */
	cardCounts: Map<string, number>;
	/** 1 = win, 0 = loss */
	outcome: number;
}

export interface FlexFeature {
	cardName: string;
	variance: number;
	mean: number;
	std: number;
	min: number;
	max: number;
}

export interface CardImpactResult {
	regression: LogisticRegressionResult;
	features: FlexFeature[];
}

export interface CardImpactError {
	error: string;
}

// ── Basic land set ──

const BASIC_LANDS = new Set([
	'Plains', 'Island', 'Swamp', 'Mountain', 'Forest',
	'Snow-Covered Plains', 'Snow-Covered Island', 'Snow-Covered Swamp',
	'Snow-Covered Mountain', 'Snow-Covered Forest',
	'Wastes',
]);

// ── Extract training data ──

/**
 * Build a decklist lookup: playerId → merged card counts (main + side).
 * Takes max across multiple decklists for the same player.
 */
function getPlayerDecklists(
	tournaments: TournamentData[],
	playerArchetypes: Map<string, string>,
	archetypeName: string,
): Map<string, Map<string, number>> {
	const result = new Map<string, Map<string, number>>();

	for (const t of tournaments) {
		for (const [dlId, dl] of Object.entries(t.decklists)) {
			const playerId = dl.playerId;
			if (playerArchetypes.get(playerId) !== archetypeName) continue;

			const counts = new Map<string, number>();
			for (const entry of dl.mainboard) {
				counts.set(entry.cardName, (counts.get(entry.cardName) ?? 0) + entry.quantity);
			}
			for (const entry of dl.sideboard) {
				counts.set(entry.cardName, (counts.get(entry.cardName) ?? 0) + entry.quantity);
			}

			// Merge: take max per card across decklists
			const existing = result.get(playerId);
			if (!existing) {
				result.set(playerId, counts);
			} else {
				for (const [card, qty] of counts) {
					existing.set(card, Math.max(existing.get(card) ?? 0, qty));
				}
			}
		}
	}

	return result;
}

/**
 * Extract training observations from match results.
 * Each match where the target archetype player has a win or loss
 * against the specified opponent archetype becomes one observation.
 * Byes, IDs, draws, and mirrors are excluded.
 */
export function extractTrainingData(
	tournaments: TournamentData[],
	playerArchetypes: Map<string, string>,
	archetypeName: string,
	opponent?: string,
): TrainingObservation[] {
	const playerDecks = getPlayerDecklists(tournaments, playerArchetypes, archetypeName);
	const observations: TrainingObservation[] = [];

	for (const t of tournaments) {
		for (const round of Object.values(t.rounds)) {
			for (const match of round.matches) {
				// Skip byes
				if (!match.player2Id) continue;
				// Skip draws and IDs (no winner)
				if (!match.winnerId) continue;

				const p1Arch = playerArchetypes.get(match.player1Id);
				const p2Arch = playerArchetypes.get(match.player2Id);

				// Find which player is our archetype
				let targetId: string | null = null;
				let opponentArch: string | undefined;

				if (p1Arch === archetypeName && p2Arch !== archetypeName) {
					targetId = match.player1Id;
					opponentArch = p2Arch;
				} else if (p2Arch === archetypeName && p1Arch !== archetypeName) {
					targetId = match.player2Id;
					opponentArch = p1Arch;
				}

				if (!targetId) continue; // Mirror or neither player is our archetype

				// Filter by opponent if specified
				if (opponent && opponentArch !== opponent) continue;

				const deck = playerDecks.get(targetId);
				if (!deck) continue;

				observations.push({
					cardCounts: deck,
					outcome: match.winnerId === targetId ? 1 : 0,
				});
			}
		}
	}

	return observations;
}

// ── Feature selection ──

/**
 * Select flex features: cards that vary across decklists.
 * Excludes basic lands and auto-includes (>90% same count).
 */
export function selectFlexFeatures(
	observations: TrainingObservation[],
	options: { maxFeatures?: number; autoIncludeThreshold?: number } = {},
): FlexFeature[] {
	const maxFeatures = options.maxFeatures ?? 12;
	const autoIncludeThreshold = options.autoIncludeThreshold ?? 0.9;

	// Collect all card names and their counts across observations
	const cardData = new Map<string, number[]>();
	for (const obs of observations) {
		for (const [card, qty] of obs.cardCounts) {
			if (!cardData.has(card)) cardData.set(card, []);
		}
	}
	// Fill in counts (0 for missing)
	for (const [card, counts] of cardData) {
		for (const obs of observations) {
			counts.push(obs.cardCounts.get(card) ?? 0);
		}
	}

	const candidates: FlexFeature[] = [];
	for (const [cardName, counts] of cardData) {
		if (BASIC_LANDS.has(cardName)) continue;

		const n = counts.length;
		const mean = counts.reduce((s, v) => s + v, 0) / n;
		const variance = counts.reduce((s, v) => s + (v - mean) ** 2, 0) / n;

		if (variance < 1e-10) continue; // All same count → auto-include

		// Check if >90% have the same count (auto-include)
		const countFreq = new Map<number, number>();
		for (const c of counts) {
			countFreq.set(c, (countFreq.get(c) ?? 0) + 1);
		}
		const maxFreq = Math.max(...countFreq.values());
		if (maxFreq / n >= autoIncludeThreshold) continue;

		const std = Math.sqrt(variance);
		const min = Math.min(...counts);
		const max = Math.max(...counts);
		candidates.push({ cardName, variance, mean, std, min, max });
	}

	// Sort by variance descending, take top maxFeatures
	candidates.sort((a, b) => b.variance - a.variance);
	return candidates.slice(0, maxFeatures);
}

// ── Build design matrix ──

/**
 * Build standardized design matrix with intercept column.
 */
export function buildDesignMatrix(
	observations: TrainingObservation[],
	features: FlexFeature[],
): { X: Matrix; y: Float64Array; featureNames: string[] } {
	const n = observations.length;
	const p = features.length + 1; // +1 for intercept
	const Xdata: number[] = [];
	const ydata = new Float64Array(n);

	for (let i = 0; i < n; i++) {
		Xdata.push(1); // intercept
		for (const feat of features) {
			const raw = observations[i].cardCounts.get(feat.cardName) ?? 0;
			// Standardize: (x - mean) / std
			Xdata.push(feat.std > 0 ? (raw - feat.mean) / feat.std : 0);
		}
		ydata[i] = observations[i].outcome;
	}

	const featureNames = ['intercept', ...features.map((f) => f.cardName)];
	return { X: fromArray(n, p, Xdata), y: ydata, featureNames };
}

// ── Full pipeline ──

export function analyzeCardImpact(
	tournaments: TournamentData[],
	playerArchetypes: Map<string, string>,
	archetypeName: string,
	options: {
		opponent?: string;
		minObservations?: number;
		maxFeatures?: number;
	} = {},
): CardImpactResult | CardImpactError {
	const minObs = options.minObservations ?? 30;

	const observations = extractTrainingData(
		tournaments, playerArchetypes, archetypeName, options.opponent,
	);

	if (observations.length < minObs) {
		return { error: `Insufficient data: ${observations.length} matches (need ${minObs})` };
	}

	const features = selectFlexFeatures(observations, {
		maxFeatures: options.maxFeatures,
	});

	if (features.length === 0) {
		return { error: 'No flex cards found — all cards have identical counts across decklists' };
	}

	const { X, y, featureNames } = buildDesignMatrix(observations, features);

	const regression = fitLogisticRegression({
		X, y, featureNames,
		priorVariance: 6.25,
		interceptPriorVariance: 100,
	});

	return { regression, features };
}
