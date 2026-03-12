import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	assembleMtgoTournament,
	formatCodeToName,
} from "../../scripts/lib/mtgo-assembler";
import type { MtgoRawTournament } from "../../scripts/lib/mtgo-client";

const raw: MtgoRawTournament = JSON.parse(
	readFileSync(resolve(__dirname, "../fixtures/mtgo-raw-tournament.json"), "utf-8"),
);

const HREF = "/decklist/pauper-challenge-32-2026-03-0812834527";

describe("formatCodeToName", () => {
	it("maps standard format codes", () => {
		expect(formatCodeToName("CSTANDARD")).toBe("Standard");
		expect(formatCodeToName("CMODERN")).toBe("Modern");
		expect(formatCodeToName("CLEGACY")).toBe("Legacy");
		expect(formatCodeToName("CPAUPER")).toBe("Pauper");
		expect(formatCodeToName("CVINTAGE")).toBe("Vintage");
		expect(formatCodeToName("CPREMODERN")).toBe("Premodern");
	});

	it("maps CHULAHOOP to Premodern", () => {
		expect(formatCodeToName("CHULAHOOP")).toBe("Premodern");
	});

	it("returns Unknown for unrecognized codes", () => {
		expect(formatCodeToName("XUNKNOWN")).toBe("Unknown");
	});
});

describe("assembleMtgoTournament", () => {
	const result = assembleMtgoTournament(raw, HREF);

	describe("meta", () => {
		it("sets id with mtgo prefix", () => {
			expect(result.meta.id).toBe("mtgo-12834527");
		});

		it("sets source to mtgo", () => {
			expect(result.meta.source).toBe("mtgo");
		});

		it("sets tabletop to false", () => {
			expect(result.meta.tabletop).toBe(false);
		});

		it("extracts name from description", () => {
			expect(result.meta.name).toBe("Pauper Challenge 32");
		});

		it("extracts date from starttime", () => {
			expect(result.meta.date).toBe("2026-03-08");
		});

		it("maps format code to name", () => {
			expect(result.meta.formats).toEqual(["Pauper"]);
		});

		it("builds URL from href", () => {
			expect(result.meta.url).toBe(
				"https://www.mtgo.com/decklist/pauper-challenge-32-2026-03-0812834527",
			);
		});

		it("parses playerCount from string", () => {
			expect(result.meta.playerCount).toBe(32);
		});

		it("parses roundCount from final_rank", () => {
			// roundnumber is "7" in fixture
			expect(result.meta.roundCount).toBe(7);
		});
	});

	describe("players", () => {
		it("creates all 4 players", () => {
			expect(Object.keys(result.players)).toHaveLength(4);
		});

		it("uses loginid as player key", () => {
			expect(result.players["181637"]).toBeDefined();
			expect(result.players["667393"]).toBeDefined();
		});

		it("uses final_rank for rank, not standings rank", () => {
			// final_rank: Boin=1, NickNorman=2, xMiMx=3, AnpanMoeMoe=4
			// standings: Boin=1, NickNorman=2, AnpanMoeMoe=3, xMiMx=4
			expect(result.players["181637"].rank).toBe(1); // Boin
			expect(result.players["2386103"].rank).toBe(2); // NickNorman
			expect(result.players["667393"].rank).toBe(3); // xMiMx (final_rank=3, standings=4)
			expect(result.players["3329234"].rank).toBe(4); // AnpanMoeMoe
		});

		it("computes match record with inferred draws", () => {
			// totalRounds=7, brackets=2 → swissRounds=5
			// Boin: 5W-0L → draws = 5-5-0 = 0
			expect(result.players["181637"].matchRecord).toBe("5-0-0");
			// xMiMx: 4W-1L → draws = 5-4-1 = 0
			expect(result.players["667393"].matchRecord).toBe("4-1-0");
			// AnpanMoeMoe: 3W-2L → draws = 5-3-2 = 0
			expect(result.players["3329234"].matchRecord).toBe("3-2-0");
		});

		it("sets reportedArchetypes to empty array", () => {
			expect(result.players["181637"].reportedArchetypes).toEqual([]);
		});

		it("links player to decklist via decklistIds", () => {
			expect(result.players["181637"].decklistIds).toEqual(["mtgo-deck-58471820"]);
		});
	});

	describe("decklists", () => {
		it("creates decklists with stable mtgo-deck- IDs", () => {
			expect(result.decklists["mtgo-deck-58471820"]).toBeDefined();
			expect(result.decklists["mtgo-deck-58471821"]).toBeDefined();
		});

		it("parses mainboard card quantities as numbers", () => {
			const deck = result.decklists["mtgo-deck-58471820"];
			expect(deck.mainboard[0]).toEqual({
				cardName: "Gladecover Scout",
				quantity: 4,
			});
		});

		it("parses sideboard cards", () => {
			const deck = result.decklists["mtgo-deck-58471820"];
			expect(deck.sideboard).toEqual([{ cardName: "Pyroblast", quantity: 2 }]);
		});

		it("handles empty sideboard", () => {
			const deck = result.decklists["mtgo-deck-58471822"];
			expect(deck.sideboard).toEqual([]);
		});

		it("sets reportedArchetype to null", () => {
			const deck = result.decklists["mtgo-deck-58471820"];
			expect(deck.reportedArchetype).toBeNull();
		});

		it("sets commanders and companion to null", () => {
			const deck = result.decklists["mtgo-deck-58471820"];
			expect(deck.commanders).toBeNull();
			expect(deck.companion).toBeNull();
		});

		it("sets playerId to loginid", () => {
			expect(result.decklists["mtgo-deck-58471820"].playerId).toBe("181637");
		});
	});

	describe("rounds (playoffs)", () => {
		it("creates playoff rounds from brackets", () => {
			expect(Object.keys(result.rounds)).toHaveLength(2);
			// Fixture has index 1 (SF) and index 0 (F), no QF
			expect(result.rounds["playoffs-sf"]).toBeDefined();
			expect(result.rounds["playoffs-f"]).toBeDefined();
		});

		it("sets correct round names and numbers", () => {
			expect(result.rounds["playoffs-sf"].name).toBe("Semifinals");
			expect(result.rounds["playoffs-sf"].number).toBe(950);
			expect(result.rounds["playoffs-f"].name).toBe("Finals");
			expect(result.rounds["playoffs-f"].number).toBe(999);
		});

		it("marks all rounds as playoff", () => {
			expect(result.rounds["playoffs-sf"].isPlayoff).toBe(true);
			expect(result.rounds["playoffs-f"].isPlayoff).toBe(true);
		});

		it("builds match results with winner as player1", () => {
			const finals = result.rounds["playoffs-f"].matches[0];
			expect(finals.player1Id).toBe("181637"); // Boin (winner)
			expect(finals.player2Id).toBe("2386103"); // NickNorman (loser)
			expect(finals.result).toBe("2-1-0");
			expect(finals.winnerId).toBe("181637");
		});

		it("builds semifinal matches correctly", () => {
			const semis = result.rounds["playoffs-sf"].matches;
			expect(semis).toHaveLength(2);

			// Match 1: Boin (winner) vs xMiMx
			expect(semis[0].player1Id).toBe("181637");
			expect(semis[0].result).toBe("2-0-0");

			// Match 2: NickNorman (winner) vs AnpanMoeMoe
			expect(semis[1].player1Id).toBe("2386103");
			expect(semis[1].result).toBe("2-1-0");
		});
	});
});
