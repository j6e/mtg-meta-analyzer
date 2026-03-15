// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { TournamentData } from "../../src/lib/types/tournament";
import {
	computeStandingsRemainder,
	countPlayerRoundResults,
	hasIncompleteRounds,
	parseMatchRecord,
} from "../../src/lib/utils/standings";

describe("parseMatchRecord", () => {
	it("parses a normal record", () => {
		expect(parseMatchRecord("7-2-0")).toEqual({ w: 7, l: 2, d: 0 });
	});

	it("parses a record with draws", () => {
		expect(parseMatchRecord("5-1-1")).toEqual({ w: 5, l: 1, d: 1 });
	});

	it("parses a zero record", () => {
		expect(parseMatchRecord("0-0-0")).toEqual({ w: 0, l: 0, d: 0 });
	});
});

function makeTournament(overrides: {
	roundCount: number;
	players: Record<string, { matchRecord: string; decklistIds?: string[] }>;
	rounds: TournamentData["rounds"];
}): TournamentData {
	const players: TournamentData["players"] = {};
	for (const [id, p] of Object.entries(overrides.players)) {
		players[id] = {
			name: id,
			username: id,
			rank: 1,
			points: 0,
			matchRecord: p.matchRecord,
			decklistIds: p.decklistIds ?? [],
			reportedArchetypes: [],
		};
	}
	return {
		meta: {
			id: "test-1",
			name: "Test",
			date: "2026-01-01",
			formats: ["Standard"],
			url: "",
			fetchedAt: "",
			playerCount: Object.keys(players).length,
			roundCount: overrides.roundCount,
			source: "mtgo",
			tabletop: false,
		},
		players,
		decklists: {},
		rounds: overrides.rounds,
	};
}

describe("hasIncompleteRounds", () => {
	it("returns true when recorded rounds < roundCount", () => {
		const t = makeTournament({
			roundCount: 8,
			players: {},
			rounds: {
				"playoffs-qf": { name: "QF", number: 900, isPlayoff: true, matches: [] },
				"playoffs-sf": { name: "SF", number: 950, isPlayoff: true, matches: [] },
				"playoffs-f": { name: "F", number: 999, isPlayoff: true, matches: [] },
			},
		});
		expect(hasIncompleteRounds(t)).toBe(true);
	});

	it("returns false when all rounds are present", () => {
		const t = makeTournament({
			roundCount: 2,
			players: {},
			rounds: {
				r1: { name: "Round 1", number: 1, isPlayoff: false, matches: [] },
				r2: { name: "Round 2", number: 2, isPlayoff: false, matches: [] },
			},
		});
		expect(hasIncompleteRounds(t)).toBe(false);
	});
});

describe("countPlayerRoundResults", () => {
	it("counts wins, losses and draws from recorded matches", () => {
		const t = makeTournament({
			roundCount: 8,
			players: { p1: { matchRecord: "5-2-0" } },
			rounds: {
				qf: {
					name: "QF",
					number: 900,
					isPlayoff: true,
					matches: [
						{ player1Id: "p1", player2Id: "p2", result: "2-1-0", winnerId: "p1" },
					],
				},
				sf: {
					name: "SF",
					number: 950,
					isPlayoff: true,
					matches: [
						{ player1Id: "p3", player2Id: "p1", result: "2-0-0", winnerId: "p3" },
					],
				},
			},
		});
		expect(countPlayerRoundResults(t, "p1")).toEqual({ w: 1, l: 1, d: 0 });
	});

	it("counts byes as wins", () => {
		const t = makeTournament({
			roundCount: 8,
			players: { p1: { matchRecord: "6-1-0" } },
			rounds: {
				qf: {
					name: "QF",
					number: 900,
					isPlayoff: true,
					matches: [
						{ player1Id: "p1", player2Id: null, result: "bye", winnerId: null },
					],
				},
			},
		});
		expect(countPlayerRoundResults(t, "p1")).toEqual({ w: 1, l: 0, d: 0 });
	});

	it("counts intentional draws as draws", () => {
		const t = makeTournament({
			roundCount: 8,
			players: { p1: { matchRecord: "5-1-1" } },
			rounds: {
				r1: {
					name: "R1",
					number: 1,
					isPlayoff: false,
					matches: [
						{ player1Id: "p1", player2Id: "p2", result: "0-0-3", winnerId: null },
					],
				},
			},
		});
		expect(countPlayerRoundResults(t, "p1")).toEqual({ w: 0, l: 0, d: 1 });
	});
});

describe("computeStandingsRemainder", () => {
	it("computes remainder for a tournament with incomplete rounds", () => {
		const t = makeTournament({
			roundCount: 8,
			players: {
				p1: { matchRecord: "5-2-0" },
				p2: { matchRecord: "3-4-0" },
			},
			rounds: {
				qf: {
					name: "QF",
					number: 900,
					isPlayoff: true,
					matches: [
						// p1 beats p2 in QF
						{ player1Id: "p1", player2Id: "p2", result: "2-1-0", winnerId: "p1" },
					],
				},
				sf: {
					name: "SF",
					number: 950,
					isPlayoff: true,
					matches: [
						// p1 loses in SF
						{ player1Id: "p3", player2Id: "p1", result: "2-0-0", winnerId: "p3" },
					],
				},
			},
		});

		const archetypes = new Map([
			["p1", "Deck A"],
			["p2", "Deck B"],
		]);

		const result = computeStandingsRemainder([t], archetypes);

		// p1: total 5-2-0, recorded 1-1-0 → remainder 4-1-0
		expect(result.extraWins.get("Deck A")).toBe(4);
		expect(result.extraLosses.get("Deck A")).toBe(1);

		// p2: total 3-4-0, recorded 0-1-0 → remainder 3-3-0
		expect(result.extraWins.get("Deck B")).toBe(3);
		expect(result.extraLosses.get("Deck B")).toBe(3);

		expect(result.totalExtraRecords).toBe(4 + 1 + 3 + 3);
	});

	it("returns zero remainder for complete tournaments", () => {
		const t = makeTournament({
			roundCount: 1,
			players: { p1: { matchRecord: "1-0-0" } },
			rounds: {
				r1: {
					name: "R1",
					number: 1,
					isPlayoff: false,
					matches: [
						{ player1Id: "p1", player2Id: "p2", result: "2-0-0", winnerId: "p1" },
					],
				},
			},
		});

		const archetypes = new Map([["p1", "Deck A"]]);
		const result = computeStandingsRemainder([t], archetypes);

		expect(result.extraWins.get("Deck A")).toBeUndefined();
		expect(result.totalExtraRecords).toBe(0);
	});

	it("clamps negative remainders to zero", () => {
		// Edge case: matchRecord says 0-1-0 but recorded shows 1-0-0 (inconsistent data)
		const t = makeTournament({
			roundCount: 5,
			players: { p1: { matchRecord: "0-1-0" } },
			rounds: {
				qf: {
					name: "QF",
					number: 900,
					isPlayoff: true,
					matches: [
						{ player1Id: "p1", player2Id: "p2", result: "2-0-0", winnerId: "p1" },
					],
				},
			},
		});

		const archetypes = new Map([["p1", "Deck A"]]);
		const result = computeStandingsRemainder([t], archetypes);

		// total 0-1-0, recorded 1-0-0 → remainder: wins clamped to 0, losses = 1
		expect(result.extraWins.get("Deck A")).toBe(0);
		expect(result.extraLosses.get("Deck A")).toBe(1);
	});

	it("skips players not in playerArchetypes map", () => {
		const t = makeTournament({
			roundCount: 8,
			players: {
				p1: { matchRecord: "5-2-0" },
				p2: { matchRecord: "3-4-0" },
			},
			rounds: {},
		});

		// Only p1 has an archetype
		const archetypes = new Map([["p1", "Deck A"]]);
		const result = computeStandingsRemainder([t], archetypes);

		expect(result.extraWins.get("Deck A")).toBe(5);
		expect(result.extraLosses.get("Deck A")).toBe(2);
		expect(result.extraWins.get("Deck B")).toBeUndefined();
	});
});
