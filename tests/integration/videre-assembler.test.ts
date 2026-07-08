import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { assembleVidereTournament } from "../../scripts/lib/videre-assembler";
import type { VidereRawEvent } from "../../scripts/lib/videre-client";

// Trimmed from the real event 12846504 (Pauper Challenge 32, 2026-07-05,
// 53 players, 6 Swiss rounds + Top 8). The round-2 draw is synthetic (the
// real event had none).
const raw: VidereRawEvent = JSON.parse(
	readFileSync(resolve(__dirname, "../fixtures/videre-raw-event.json"), "utf-8"),
);

describe("assembleVidereTournament", () => {
	const result = assembleVidereTournament(raw);

	describe("meta", () => {
		it("sets id with videre prefix", () => {
			expect(result.meta.id).toBe("videre-12846504");
		});

		it("sets source to videre and tabletop to false", () => {
			expect(result.meta.source).toBe("videre");
			expect(result.meta.tabletop).toBe(false);
		});

		it("copies name, date and format from the event", () => {
			expect(result.meta.name).toBe("Pauper Challenge 32");
			expect(result.meta.date).toBe("2026-07-05");
			expect(result.meta.formats).toEqual(["Pauper"]);
		});

		it("points url at the videre API", () => {
			expect(result.meta.url).toBe(
				"https://api.videreproject.com/events?event_id=12846504",
			);
		});

		it("takes playerCount from the event", () => {
			expect(result.meta.playerCount).toBe(53);
		});

		it("counts Swiss + playoff rounds (events.rounds is Swiss only)", () => {
			// event.rounds = 6, matches go up to round 9 (Top 8)
			expect(result.meta.roundCount).toBe(9);
		});
	});

	describe("players", () => {
		it("creates one player per standings row, keyed by player name", () => {
			expect(Object.keys(result.players)).toHaveLength(5);
			expect(result.players.kuldothared).toBeDefined();
			expect(result.players.Justsome_guy).toBeDefined();
		});

		it("maps rank, points and matchRecord from standings", () => {
			const winner = result.players.kuldothared;
			expect(winner.rank).toBe(1);
			expect(winner.points).toBe(24);
			// standings.record is match-level including playoffs
			expect(winner.matchRecord).toBe("8-1-0");
		});

		it("links players to their decklists", () => {
			expect(result.players.kuldothared.decklistIds).toEqual(["videre-deck-58591530"]);
		});

		it("leaves decklistIds empty for players without a published deck", () => {
			expect(result.players.Justsome_guy.decklistIds).toEqual([]);
		});

		it("sets reportedArchetypes to empty array", () => {
			expect(result.players.kuldothared.reportedArchetypes).toEqual([]);
		});
	});

	describe("decklists", () => {
		it("creates decklists with stable videre-deck- ids", () => {
			expect(result.decklists["videre-deck-58591530"]).toBeDefined();
			expect(result.decklists["videre-deck-58591496"]).toBeDefined();
		});

		it("sets playerId to the player name", () => {
			expect(result.decklists["videre-deck-58591530"].playerId).toBe("kuldothared");
		});

		it("maps card name and quantity", () => {
			const deck = result.decklists["videre-deck-58591496"];
			for (const entry of [...deck.mainboard, ...deck.sideboard]) {
				expect(typeof entry.cardName).toBe("string");
				expect(entry.quantity).toBeGreaterThan(0);
			}
		});

		it("normalizes split cards via getFrontFace", () => {
			const deck = result.decklists["videre-deck-58591496"];
			const names = deck.sideboard.map((c) => c.cardName);
			expect(names).toContain("Alive");
			expect(names.some((n) => n.includes("//"))).toBe(false);
		});

		it("sets commanders, companion and reportedArchetype to null", () => {
			const deck = result.decklists["videre-deck-58591530"];
			expect(deck.commanders).toBeNull();
			expect(deck.companion).toBeNull();
			expect(deck.reportedArchetype).toBeNull();
		});
	});

	describe("rounds", () => {
		it("maps Swiss rounds by number and playoff rounds from the end", () => {
			// fixture has rows for rounds 1, 2 (Swiss) and 7, 8, 9 (Top 8)
			expect(Object.keys(result.rounds).sort()).toEqual([
				"1",
				"2",
				"playoffs-f",
				"playoffs-qf",
				"playoffs-sf",
			]);
		});

		it("names Swiss rounds and marks them non-playoff", () => {
			expect(result.rounds["1"].name).toBe("Round 1");
			expect(result.rounds["1"].number).toBe(1);
			expect(result.rounds["1"].isPlayoff).toBe(false);
		});

		it("maps rounds 7/8/9 of a 6-round event to qf/sf/f", () => {
			expect(result.rounds["playoffs-qf"].name).toBe("Quarterfinals");
			expect(result.rounds["playoffs-qf"].number).toBe(900);
			expect(result.rounds["playoffs-sf"].name).toBe("Semifinals");
			expect(result.rounds["playoffs-sf"].number).toBe(950);
			expect(result.rounds["playoffs-f"].name).toBe("Finals");
			expect(result.rounds["playoffs-f"].number).toBe(999);
			for (const key of ["playoffs-qf", "playoffs-sf", "playoffs-f"]) {
				expect(result.rounds[key].isPlayoff).toBe(true);
			}
		});

		it("collapses mirrored rows to one match per pairing, winner first", () => {
			// round 1 fixture rows: kuldothared 2-0 win + Arbitation mirrored loss
			const r1Pairings = result.rounds["1"].matches.filter((m) => m.player2Id !== null);
			expect(r1Pairings).toHaveLength(1);
			expect(r1Pairings[0]).toEqual({
				player1Id: "kuldothared",
				player2Id: "Arbitation",
				result: "2-0-0",
				winnerId: "kuldothared",
			});
		});

		it("converts bye rows (win + null opponent) to explicit byes", () => {
			const byes = result.rounds["1"].matches.filter((m) => m.player2Id === null);
			expect(byes).toEqual([
				{
					player1Id: "Justsome_guy",
					player2Id: null,
					result: "bye",
					winnerId: "Justsome_guy",
				},
			]);
		});

		it("keeps draws exactly once with winnerId null", () => {
			expect(result.rounds["2"].matches).toEqual([
				{
					player1Id: "Brvnx",
					player2Id: "kuldothared",
					result: "1-1-1",
					winnerId: null,
				},
			]);
		});

		it("collapses the full Top 8 bracket to 4 + 2 + 1 matches", () => {
			expect(result.rounds["playoffs-qf"].matches).toHaveLength(4);
			expect(result.rounds["playoffs-sf"].matches).toHaveLength(2);
			expect(result.rounds["playoffs-f"].matches).toHaveLength(1);
		});

		it("resolves the finals winner", () => {
			const finals = result.rounds["playoffs-f"].matches[0];
			expect(finals.player1Id).toBe("kuldothared");
			expect(finals.player2Id).toBe("Brvnx");
			expect(finals.result).toBe("2-0-0");
			expect(finals.winnerId).toBe("kuldothared");
		});
	});
});
