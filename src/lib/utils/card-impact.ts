/**
 * Domain bridge: extract match-level training data from tournaments,
 * select flex features, and run Bayesian logistic regression.
 */

import { fromArray, type Matrix } from "../algorithms/linalg";
import {
	fitLogisticRegression,
	type LogisticRegressionResult,
} from "../algorithms/logistic-regression";
import type { DecklistInfo } from "../types/decklist";
import type { TournamentData } from "../types/tournament";
import {
	countPlayerRoundResults,
	hasIncompleteRounds,
	parseMatchRecord,
} from "./standings";

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
	"Plains",
	"Island",
	"Swamp",
	"Mountain",
	"Forest",
	"Snow-Covered Plains",
	"Snow-Covered Island",
	"Snow-Covered Swamp",
	"Snow-Covered Mountain",
	"Snow-Covered Forest",
	"Wastes",
]);

// ── Extract training data ──

/**
 * Build a decklist lookup: decklistId → card counts (main + side).
 * Each decklist is treated as an independent entity — no merging across tournaments.
 */
function getDecklistCards(dl: DecklistInfo): Map<string, number> {
	const counts = new Map<string, number>();
	for (const entry of dl.mainboard) {
		counts.set(entry.cardName, (counts.get(entry.cardName) ?? 0) + entry.quantity);
	}
	for (const entry of dl.sideboard) {
		counts.set(entry.cardName, (counts.get(entry.cardName) ?? 0) + entry.quantity);
	}
	return counts;
}

/**
 * Extract training observations from match results.
 * Each match where the target archetype player has a win or loss
 * against the specified opponent archetype becomes one observation.
 * The decklist used is resolved per tournament (not merged across events).
 * Byes, IDs, draws, and mirrors are excluded.
 */
export function extractTrainingData(
	tournaments: TournamentData[],
	playerArchetypes: Map<string, string>,
	archetypeName: string,
	opponent?: string,
	useStandings?: boolean,
): TrainingObservation[] {
	const observations: TrainingObservation[] = [];

	for (const t of tournaments) {
		// Build per-tournament playerId → card counts lookup
		const playerDecks = new Map<string, Map<string, number>>();
		for (const [playerId, player] of Object.entries(t.players)) {
			if (playerArchetypes.get(playerId) !== archetypeName) continue;
			// Use the first decklist for this player in this tournament
			const dlId = player.decklistIds[0];
			const dl = dlId ? t.decklists[dlId] : undefined;
			if (dl) {
				playerDecks.set(playerId, getDecklistCards(dl));
			}
		}

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

	// Add observations from standings remainder for "all opponents" mode
	if (useStandings && !opponent) {
		for (const t of tournaments) {
			if (!hasIncompleteRounds(t)) continue;

			for (const [playerId, player] of Object.entries(t.players)) {
				if (playerArchetypes.get(playerId) !== archetypeName) continue;
				const dlId = player.decklistIds[0];
				const dl = dlId ? t.decklists[dlId] : undefined;
				if (!dl) continue;

				const total = parseMatchRecord(player.matchRecord);
				const recorded = countPlayerRoundResults(t, playerId);
				const extraW = Math.max(0, total.w - recorded.w);
				const extraL = Math.max(0, total.l - recorded.l);

				if (extraW + extraL === 0) continue;

				const deck = getDecklistCards(dl);
				for (let i = 0; i < extraW; i++) {
					observations.push({ cardCounts: deck, outcome: 1 });
				}
				for (let i = 0; i < extraL; i++) {
					observations.push({ cardCounts: deck, outcome: 0 });
				}
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
		for (const card of obs.cardCounts.keys()) {
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
		const variance = counts.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);

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

	const featureNames = ["intercept", ...features.map((f) => f.cardName)];
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
		useStandings?: boolean;
	} = {},
): CardImpactResult | CardImpactError {
	const minObs = options.minObservations ?? 30;

	const observations = extractTrainingData(
		tournaments,
		playerArchetypes,
		archetypeName,
		options.opponent,
		options.useStandings,
	);

	if (observations.length < minObs) {
		return {
			error: `Insufficient data: ${observations.length} matches (need ${minObs})`,
		};
	}

	const features = selectFlexFeatures(observations, {
		maxFeatures: options.maxFeatures,
	});

	if (features.length === 0) {
		return {
			error: "No flex cards found — all cards have identical counts across decklists",
		};
	}

	const { X, y, featureNames } = buildDesignMatrix(observations, features);

	const regression = fitLogisticRegression({
		X,
		y,
		featureNames,
		priorVariance: 1.0,
		interceptPriorVariance: 100,
	});

	return { regression, features };
}
