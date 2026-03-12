import { describe, expect, it } from "vitest";
import type { DecklistInfo } from "../../src/lib/types/decklist";
import type {
	MatchResult,
	PlayerInfo,
	TournamentData,
} from "../../src/lib/types/tournament";
import {
	analyzeCardImpact,
	buildDesignMatrix,
	extractTrainingData,
	selectFlexFeatures,
	type TrainingObservation,
} from "../../src/lib/utils/card-impact";

function makePlayer(name: string, decklistIds: string[], rank = 1): PlayerInfo {
	return {
		name,
		username: name.toLowerCase(),
		rank,
		points: 0,
		matchRecord: "0-0-0",
		decklistIds,
		reportedArchetypes: [],
	};
}

function makeDeck(
	playerId: string,
	mainboard: [string, number][],
	sideboard: [string, number][] = [],
): DecklistInfo {
	return {
		playerId,
		mainboard: mainboard.map(([cardName, quantity]) => ({
			cardName,
			quantity,
		})),
		sideboard: sideboard.map(([cardName, quantity]) => ({
			cardName,
			quantity,
		})),
		commanders: null,
		companion: null,
		reportedArchetype: null,
	};
}

function makeMatch(p1: string, p2: string, winnerId: string | null): MatchResult {
	return {
		player1Id: p1,
		player2Id: p2,
		result: winnerId ? "2-1-0" : "1-1-0",
		winnerId,
	};
}

function makeBye(p1: string): MatchResult {
	return { player1Id: p1, player2Id: null, result: "bye", winnerId: p1 };
}

function makeTournament(overrides: {
	players: Record<string, PlayerInfo>;
	decklists: Record<string, DecklistInfo>;
	matches: MatchResult[];
}): TournamentData {
	return {
		meta: {
			id: "melee-1",
			name: "Test",
			date: "2026-01-01",
			formats: ["Standard"],
			url: "https://melee.gg/Tournament/View/1",
			fetchedAt: "2026-01-01T00:00:00Z",
			playerCount: Object.keys(overrides.players).length,
			roundCount: 1,
			source: "melee",
			tabletop: true,
		},
		players: overrides.players,
		decklists: overrides.decklists,
		rounds: {
			r1: {
				name: "Round 1",
				number: 1,
				isPlayoff: false,
				matches: overrides.matches,
			},
		},
	};
}

// ── Fixtures ──

// 6 Aggro players with varying Bolt/Shock counts, 3 Control opponents
const tournament = makeTournament({
	players: {
		a1: makePlayer("A1", ["da1"]),
		a2: makePlayer("A2", ["da2"]),
		a3: makePlayer("A3", ["da3"]),
		a4: makePlayer("A4", ["da4"]),
		a5: makePlayer("A5", ["da5"]),
		a6: makePlayer("A6", ["da6"]),
		c1: makePlayer("C1", ["dc1"]),
		c2: makePlayer("C2", ["dc2"]),
		c3: makePlayer("C3", ["dc3"]),
	},
	decklists: {
		da1: makeDeck("a1", [
			["Lightning Bolt", 4],
			["Shock", 0],
			["Mountain", 20],
		]),
		da2: makeDeck("a2", [
			["Lightning Bolt", 4],
			["Shock", 0],
			["Mountain", 20],
		]),
		da3: makeDeck("a3", [
			["Lightning Bolt", 2],
			["Shock", 2],
			["Mountain", 20],
		]),
		da4: makeDeck("a4", [
			["Lightning Bolt", 2],
			["Shock", 2],
			["Mountain", 20],
		]),
		da5: makeDeck("a5", [
			["Lightning Bolt", 0],
			["Shock", 4],
			["Mountain", 20],
		]),
		da6: makeDeck("a6", [
			["Lightning Bolt", 0],
			["Shock", 4],
			["Mountain", 20],
		]),
		dc1: makeDeck("c1", [
			["Island", 20],
			["Counterspell", 4],
		]),
		dc2: makeDeck("c2", [
			["Island", 20],
			["Counterspell", 4],
		]),
		dc3: makeDeck("c3", [
			["Island", 20],
			["Counterspell", 4],
		]),
	},
	matches: [
		// Bolt users win more
		makeMatch("a1", "c1", "a1"),
		makeMatch("a2", "c2", "a2"),
		makeMatch("a3", "c1", "a3"),
		makeMatch("a4", "c2", "c2"),
		makeMatch("a5", "c3", "c3"),
		makeMatch("a6", "c1", "c1"),
		// A bye (should be excluded)
		makeBye("a1"),
		// A draw (no winner — should be excluded)
		{ player1Id: "a2", player2Id: "c3", result: "draw", winnerId: null },
	],
});

const archetypes = new Map([
	["a1", "Aggro"],
	["a2", "Aggro"],
	["a3", "Aggro"],
	["a4", "Aggro"],
	["a5", "Aggro"],
	["a6", "Aggro"],
	["c1", "Control"],
	["c2", "Control"],
	["c3", "Control"],
]);

// ── extractTrainingData ──

describe("extractTrainingData", () => {
	it("produces correct number of observations", () => {
		const obs = extractTrainingData([tournament], archetypes, "Aggro");
		// 6 matches with winners (excludes bye and draw)
		expect(obs).toHaveLength(6);
	});

	it("win/loss labels match winnerId", () => {
		const obs = extractTrainingData([tournament], archetypes, "Aggro");
		// a1 beat c1 → outcome 1
		const a1obs = obs.find(
			(o) => o.cardCounts.get("Lightning Bolt") === 4 && o.outcome === 1,
		);
		expect(a1obs).toBeDefined();
		// a5 lost to c3 → outcome 0
		const a5obs = obs.find((o) => o.cardCounts.get("Shock") === 4 && o.outcome === 0);
		expect(a5obs).toBeDefined();
	});

	it("excludes byes and draws", () => {
		// Total matches: 6 real + 1 bye + 1 draw = 8
		// Only 6 should be included
		const obs = extractTrainingData([tournament], archetypes, "Aggro");
		expect(obs).toHaveLength(6);
	});

	it("excludes mirrors", () => {
		// Add a mirror match
		const mirrorTournament = makeTournament({
			players: {
				a1: makePlayer("A1", ["da1"]),
				a2: makePlayer("A2", ["da2"]),
			},
			decklists: {
				da1: makeDeck("a1", [["Mountain", 20]]),
				da2: makeDeck("a2", [["Mountain", 20]]),
			},
			matches: [makeMatch("a1", "a2", "a1")],
		});
		const mirrorArch = new Map([
			["a1", "Aggro"],
			["a2", "Aggro"],
		]);
		const obs = extractTrainingData([mirrorTournament], mirrorArch, "Aggro");
		expect(obs).toHaveLength(0);
	});

	it("opponent filter works", () => {
		const obs = extractTrainingData([tournament], archetypes, "Aggro", "Control");
		expect(obs).toHaveLength(6); // All matches are vs Control
	});
});

// ── selectFlexFeatures ──

describe("selectFlexFeatures", () => {
	it("card with identical counts across all decks is excluded", () => {
		const obs: TrainingObservation[] = [
			{
				cardCounts: new Map([
					["Same", 4],
					["Varies", 1],
				]),
				outcome: 1,
			},
			{
				cardCounts: new Map([
					["Same", 4],
					["Varies", 3],
				]),
				outcome: 0,
			},
			{
				cardCounts: new Map([
					["Same", 4],
					["Varies", 2],
				]),
				outcome: 1,
			},
		];
		const features = selectFlexFeatures(obs);
		const names = features.map((f) => f.cardName);
		expect(names).not.toContain("Same");
		expect(names).toContain("Varies");
	});

	it("basic lands are excluded", () => {
		const obs: TrainingObservation[] = [
			{
				cardCounts: new Map([
					["Mountain", 20],
					["Bolt", 4],
				]),
				outcome: 1,
			},
			{
				cardCounts: new Map([
					["Mountain", 18],
					["Bolt", 2],
				]),
				outcome: 0,
			},
		];
		const features = selectFlexFeatures(obs);
		const names = features.map((f) => f.cardName);
		expect(names).not.toContain("Mountain");
	});

	it("respects maxFeatures limit", () => {
		const obs: TrainingObservation[] = [];
		for (let i = 0; i < 20; i++) {
			const counts = new Map<string, number>();
			for (let j = 0; j < 15; j++) {
				counts.set(`Card${j}`, Math.floor(Math.random() * 4));
			}
			obs.push({ cardCounts: counts, outcome: i % 2 });
		}
		const features = selectFlexFeatures(obs, { maxFeatures: 5 });
		expect(features.length).toBeLessThanOrEqual(5);
	});

	it("auto-include cards (>90% same count) are excluded", () => {
		const obs: TrainingObservation[] = [];
		for (let i = 0; i < 20; i++) {
			// 19 out of 20 have count=4, 1 has count=3 → 95% same → excluded
			const autoCount = i === 0 ? 3 : 4;
			obs.push({
				cardCounts: new Map([
					["AutoInclude", autoCount],
					["Flex", i % 4],
				]),
				outcome: i % 2,
			});
		}
		const features = selectFlexFeatures(obs);
		const names = features.map((f) => f.cardName);
		expect(names).not.toContain("AutoInclude");
		expect(names).toContain("Flex");
	});
});

// ── buildDesignMatrix ──

describe("buildDesignMatrix", () => {
	it("column 0 is all 1s (intercept)", () => {
		const obs: TrainingObservation[] = [
			{ cardCounts: new Map([["A", 1]]), outcome: 1 },
			{ cardCounts: new Map([["A", 3]]), outcome: 0 },
		];
		const features = [{ cardName: "A", variance: 1, mean: 2, std: 1, min: 1, max: 3 }];
		const { X } = buildDesignMatrix(obs, features);

		for (let i = 0; i < X.rows; i++) {
			expect(X.data[i * X.cols]).toBe(1);
		}
	});

	it("features are standardized (mean≈0, std≈1)", () => {
		const obs: TrainingObservation[] = [];
		for (let i = 0; i < 100; i++) {
			obs.push({
				cardCounts: new Map([["A", i % 4]]),
				outcome: i % 2,
			});
		}
		const features = selectFlexFeatures(obs);
		if (features.length > 0) {
			const { X } = buildDesignMatrix(obs, features);
			// Column 1 (first feature) should be standardized
			let sum = 0,
				sumSq = 0;
			for (let i = 0; i < X.rows; i++) {
				const val = X.data[i * X.cols + 1];
				sum += val;
				sumSq += val * val;
			}
			const mean = sum / X.rows;
			const variance = sumSq / X.rows - mean * mean;
			expect(Math.abs(mean)).toBeLessThan(0.1);
			expect(Math.abs(variance - 1)).toBeLessThan(0.2);
		}
	});

	it("y matches observation outcomes", () => {
		const obs: TrainingObservation[] = [
			{ cardCounts: new Map([["A", 1]]), outcome: 1 },
			{ cardCounts: new Map([["A", 2]]), outcome: 0 },
			{ cardCounts: new Map([["A", 3]]), outcome: 1 },
		];
		const features = [{ cardName: "A", variance: 1, mean: 2, std: 1, min: 1, max: 3 }];
		const { y } = buildDesignMatrix(obs, features);
		expect(Array.from(y)).toEqual([1, 0, 1]);
	});
});

// ── analyzeCardImpact end-to-end ──

describe("analyzeCardImpact", () => {
	it("insufficient data returns error", () => {
		const result = analyzeCardImpact([tournament], archetypes, "Aggro", {
			minObservations: 100,
		});
		expect("error" in result).toBe(true);
		if ("error" in result) {
			expect(result.error).toContain("Insufficient data");
		}
	});

	it("no flex cards returns error", () => {
		// All players have identical decks
		const uniformTournament = makeTournament({
			players: {
				a1: makePlayer("A1", ["d1"]),
				a2: makePlayer("A2", ["d2"]),
				c1: makePlayer("C1", ["dc1"]),
			},
			decklists: {
				d1: makeDeck("a1", [["Card", 4]]),
				d2: makeDeck("a2", [["Card", 4]]),
				dc1: makeDeck("c1", [["Other", 4]]),
			},
			matches: Array.from({ length: 30 }, (_, i) =>
				makeMatch(
					i % 2 === 0 ? "a1" : "a2",
					"c1",
					i % 3 === 0 ? "c1" : i % 2 === 0 ? "a1" : "a2",
				),
			),
		});
		const uniformArch = new Map([
			["a1", "X"],
			["a2", "X"],
			["c1", "Y"],
		]);
		const result = analyzeCardImpact([uniformTournament], uniformArch, "X", {
			minObservations: 1,
		});
		expect("error" in result).toBe(true);
	});

	it("card correlating with wins has positive coefficient", () => {
		// Create a larger tournament where Bolt clearly correlates with winning
		const players: Record<string, PlayerInfo> = {};
		const decklists: Record<string, DecklistInfo> = {};
		const matches: MatchResult[] = [];

		for (let i = 0; i < 30; i++) {
			const pid = `a${i}`;
			const did = `d${i}`;
			const hasBolt = i < 15;
			players[pid] = makePlayer(`A${i}`, [did]);
			decklists[did] = makeDeck(pid, [
				["Lightning Bolt", hasBolt ? 4 : 0],
				["Shock", hasBolt ? 0 : 4],
				["Mountain", 20],
			]);
		}
		players.c1 = makePlayer("C1", ["dc1"]);
		decklists.dc1 = makeDeck("c1", [["Island", 20]]);

		// Bolt users win 80%, non-bolt win 20%
		for (let i = 0; i < 30; i++) {
			const pid = `a${i}`;
			const hasBolt = i < 15;
			const wins = hasBolt ? i % 5 !== 0 : i % 5 === 0; // 80% vs 20%
			matches.push(makeMatch(pid, "c1", wins ? pid : "c1"));
		}

		const bigTournament = makeTournament({ players, decklists, matches });
		const bigArchetypes = new Map<string, string>();
		for (let i = 0; i < 30; i++) bigArchetypes.set(`a${i}`, "Aggro");
		bigArchetypes.set("c1", "Control");

		const result = analyzeCardImpact([bigTournament], bigArchetypes, "Aggro", {
			minObservations: 1,
		});

		expect("regression" in result).toBe(true);
		if ("regression" in result) {
			// Lightning Bolt should have a positive coefficient (correlates with winning)
			const boltCoef = result.regression.coefficients.find(
				(c) => c.name === "Lightning Bolt",
			);
			if (boltCoef) {
				expect(boltCoef.coefficient).toBeGreaterThan(0);
			}
			expect(result.regression.nObservations).toBe(30);
			expect(result.regression.converged).toBe(true);
		}
	});

	it("features include min/max copy counts", () => {
		// Setup: 40 players, half with 4 copies of "Good Card", half with 0.
		const players: Record<string, PlayerInfo> = {};
		const decklists: Record<string, DecklistInfo> = {};
		const matches: MatchResult[] = [];

		for (let i = 0; i < 40; i++) {
			const pid = `p${i}`;
			const did = `d${i}`;
			const hasCard = i < 20;
			players[pid] = makePlayer(`P${i}`, [did]);
			decklists[did] = makeDeck(pid, [
				["Good Card", hasCard ? 4 : 0],
				["Filler", hasCard ? 0 : 4],
			]);
		}
		players.opp = makePlayer("Opp", ["dopp"]);
		decklists.dopp = makeDeck("opp", [["Other", 4]]);

		for (let i = 0; i < 40; i++) {
			const pid = `p${i}`;
			const hasCard = i < 20;
			const wins = hasCard ? i % 5 !== 0 : i % 5 === 0;
			matches.push(makeMatch(pid, "opp", wins ? pid : "opp"));
		}

		const t = makeTournament({ players, decklists, matches });
		const arch = new Map<string, string>();
		for (let i = 0; i < 40; i++) arch.set(`p${i}`, "A");
		arch.set("opp", "B");

		const result = analyzeCardImpact([t], arch, "A", { minObservations: 1 });
		expect("regression" in result).toBe(true);
		if ("regression" in result) {
			const goodFeat = result.features.find((f) => f.cardName === "Good Card");
			expect(goodFeat).toBeDefined();
			expect(goodFeat!.min).toBe(0);
			expect(goodFeat!.max).toBe(4);

			// Predicted winrate at max copies should be higher than at min copies
			// (since Good Card correlates with winning)
			const goodCoef = result.regression.coefficients.find(
				(c) => c.name === "Good Card",
			);
			expect(goodCoef).toBeDefined();
			expect(goodCoef!.coefficient).toBeGreaterThan(0);

			// Impact score should be positive and bounded
			expect(goodCoef!.impactScore).toBeGreaterThan(0);
			expect(goodCoef!.impactScore).toBeLessThanOrEqual(100);
		}
	});

	it("pseudo-R² is between 0 and 1", () => {
		const result = analyzeCardImpact([tournament], archetypes, "Aggro", {
			minObservations: 1,
		});
		if ("regression" in result) {
			expect(result.regression.pseudoR2).toBeGreaterThanOrEqual(0);
			expect(result.regression.pseudoR2).toBeLessThanOrEqual(1);
		}
	});

	it("CI contains the coefficient and has positive width", () => {
		const result = analyzeCardImpact([tournament], archetypes, "Aggro", {
			minObservations: 1,
		});
		if ("regression" in result) {
			for (const c of result.regression.coefficients) {
				expect(c.lower).toBeLessThanOrEqual(c.coefficient);
				expect(c.upper).toBeGreaterThanOrEqual(c.coefficient);
				expect(c.upper - c.lower).toBeGreaterThan(0);
			}
		}
	});

	it("impact score is bounded [-100, +100] and matches coefficient sign", () => {
		const result = analyzeCardImpact([tournament], archetypes, "Aggro", {
			minObservations: 1,
		});
		if ("regression" in result) {
			for (const c of result.regression.coefficients) {
				expect(c.impactScore).toBeGreaterThanOrEqual(-100);
				expect(c.impactScore).toBeLessThanOrEqual(100);
				// Impact score should match coefficient sign (or be zero)
				if (c.coefficient > 0) expect(c.impactScore).toBeGreaterThanOrEqual(0);
				if (c.coefficient < 0) expect(c.impactScore).toBeLessThanOrEqual(0);
				// Verify formula: tanh(β/2) * 100, rounded
				const expected = Math.round(Math.tanh(c.coefficient / 2) * 100);
				expect(c.impactScore).toBe(expected);
			}
		}
	});
});
