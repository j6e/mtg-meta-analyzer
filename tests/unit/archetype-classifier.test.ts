import { describe, expect, it } from "vitest";
import {
	classifyAll,
	classifyAllPooled,
	classifyBySignatureCards,
	parseArchetypeYaml,
} from "../../src/lib/algorithms/archetype-classifier";
import type { ArchetypeDefinition } from "../../src/lib/types/archetype";
import type { CardEntry, DecklistInfo } from "../../src/lib/types/decklist";

const sampleYaml = `
format: Standard
date: "2026-01-10"
archetypes:
  - name: Mono Red
    signatureCards:
      - name: Lightning Bolt
        minCopies: 4
      - name: Goblin Guide
        minCopies: 3
  - name: Control
    signatureCards:
      - name: Counterspell
        minCopies: 3
      - name: Wrath of God
        minCopies: 2
`;

const archetypeDefs: ArchetypeDefinition[] = [
	{
		name: "Mono Red",
		signatureCards: [
			{ name: "Lightning Bolt", minCopies: 4 },
			{ name: "Goblin Guide", minCopies: 3 },
		],
	},
	{
		name: "Control",
		signatureCards: [
			{ name: "Counterspell", minCopies: 3 },
			{ name: "Wrath of God", minCopies: 2 },
		],
	},
];

function makeDecklist(
	mainboard: CardEntry[],
	id = "player1",
	commanders: CardEntry[] | null = null,
): DecklistInfo {
	return {
		playerId: id,
		mainboard,
		sideboard: [],
		commanders,
		companion: null,
		reportedArchetype: null,
	};
}

function cards(...entries: [string, number][]): CardEntry[] {
	return entries.map(([cardName, quantity]) => ({ cardName, quantity }));
}

describe("parseArchetypeYaml", () => {
	it("parses YAML into archetype definitions", () => {
		const result = parseArchetypeYaml(sampleYaml);
		expect(result.archetypes).toHaveLength(2);
		expect(result.archetypes[0].name).toBe("Mono Red");
		expect(result.archetypes[0].signatureCards).toHaveLength(2);
		expect(result.archetypes[0].signatureCards[0]).toEqual({
			name: "Lightning Bolt",
			minCopies: 4,
		});
		expect(result.archetypes[1].name).toBe("Control");
	});

	it("returns empty array for YAML with no archetypes", () => {
		const result = parseArchetypeYaml('format: Standard\ndate: "2026-01-01"');
		expect(result.archetypes).toEqual([]);
	});

	it("parses exactCopies and strictMode fields", () => {
		const yaml = `
format: Standard
date: "2026-01-10"
archetypes:
  - name: Combo
    strictMode: true
    signatureCards:
      - name: Combo Piece
        exactCopies: 4
      - name: Enabler
        minCopies: 2
`;
		const result = parseArchetypeYaml(yaml);
		expect(result.archetypes).toHaveLength(1);
		expect(result.archetypes[0].strictMode).toBe(true);
		expect(result.archetypes[0].signatureCards[0]).toEqual({
			name: "Combo Piece",
			exactCopies: 4,
		});
		expect(result.archetypes[0].signatureCards[1]).toEqual({
			name: "Enabler",
			minCopies: 2,
		});
	});

	it("defaults nameEqualsCommander to false", () => {
		const result = parseArchetypeYaml(sampleYaml);
		expect(result.nameEqualsCommander).toBe(false);
	});

	it("parses nameEqualsCommander: true", () => {
		const yaml = `
format: Duel Commander
date: "2026-03-11"
nameEqualsCommander: true
archetypes: []
`;
		const result = parseArchetypeYaml(yaml);
		expect(result.nameEqualsCommander).toBe(true);
		expect(result.archetypes).toEqual([]);
	});

	it("parses usedAsCommander on signature cards", () => {
		const yaml = `
format: Duel Commander
date: "2026-03-11"
archetypes:
  - name: Aragorn Voltron
    signatureCards:
      - name: "Aragorn, King of Gondor"
        usedAsCommander: true
      - name: Lightning Greaves
        minCopies: 1
`;
		const result = parseArchetypeYaml(yaml);
		expect(result.archetypes[0].signatureCards[0]).toEqual({
			name: "Aragorn, King of Gondor",
			usedAsCommander: true,
		});
		expect(result.archetypes[0].signatureCards[1]).toEqual({
			name: "Lightning Greaves",
			minCopies: 1,
		});
	});
});

describe("classifyBySignatureCards", () => {
	it("matches decklist with all signature cards at minimum copies", () => {
		const mainboard = cards(
			["Lightning Bolt", 4],
			["Goblin Guide", 4],
			["Mountain", 16],
		);
		const result = classifyBySignatureCards(mainboard, null, archetypeDefs);
		expect(result).toBe("Mono Red");
	});

	it("returns null when a signature card is below minimum copies", () => {
		const mainboard = cards(
			["Lightning Bolt", 4],
			["Goblin Guide", 2], // needs 3
			["Mountain", 16],
		);
		const result = classifyBySignatureCards(mainboard, null, archetypeDefs);
		expect(result).toBeNull();
	});

	it("returns null when a signature card is missing", () => {
		const mainboard = cards(["Lightning Bolt", 4], ["Mountain", 20]);
		const result = classifyBySignatureCards(mainboard, null, archetypeDefs);
		expect(result).toBeNull();
	});

	it("returns null for empty mainboard", () => {
		const result = classifyBySignatureCards([], null, archetypeDefs);
		expect(result).toBeNull();
	});

	it("matches the archetype with the most signature cards if multiple match", () => {
		const defs: ArchetypeDefinition[] = [
			{
				name: "Red Aggro",
				signatureCards: [{ name: "Lightning Bolt", minCopies: 4 }],
			},
			{
				name: "Mono Red",
				signatureCards: [
					{ name: "Lightning Bolt", minCopies: 4 },
					{ name: "Goblin Guide", minCopies: 3 },
				],
			},
		];

		const mainboard = cards(
			["Lightning Bolt", 4],
			["Goblin Guide", 4],
			["Mountain", 16],
		);

		const result = classifyBySignatureCards(mainboard, null, defs);
		expect(result).toBe("Mono Red"); // more signature cards
	});

	it("matches when deck has exactly the specified exactCopies", () => {
		const defs: ArchetypeDefinition[] = [
			{
				name: "Exact Combo",
				signatureCards: [
					{ name: "Combo Piece", exactCopies: 4 },
					{ name: "Enabler", minCopies: 2 },
				],
			},
		];
		const mainboard = cards(["Combo Piece", 4], ["Enabler", 3], ["Land", 17]);
		expect(classifyBySignatureCards(mainboard, null, defs)).toBe("Exact Combo");
	});

	it("rejects when deck has more copies than exactCopies", () => {
		const defs: ArchetypeDefinition[] = [
			{
				name: "Exact Combo",
				signatureCards: [{ name: "Combo Piece", exactCopies: 3 }],
			},
		];
		const mainboard = cards(["Combo Piece", 4], ["Land", 20]);
		expect(classifyBySignatureCards(mainboard, null, defs)).toBeNull();
	});

	it("rejects when deck has fewer copies than exactCopies", () => {
		const defs: ArchetypeDefinition[] = [
			{
				name: "Exact Combo",
				signatureCards: [{ name: "Combo Piece", exactCopies: 4 }],
			},
		];
		const mainboard = cards(["Combo Piece", 3], ["Land", 21]);
		expect(classifyBySignatureCards(mainboard, null, defs)).toBeNull();
	});

	it("exactCopies 0 matches when card is absent from deck", () => {
		const defs: ArchetypeDefinition[] = [
			{
				name: "No Combo",
				signatureCards: [
					{ name: "Key Card", minCopies: 4 },
					{ name: "Banned Card", exactCopies: 0 },
				],
			},
		];
		const mainboard = cards(["Key Card", 4], ["Land", 20]);
		expect(classifyBySignatureCards(mainboard, null, defs)).toBe("No Combo");
	});

	it("exactCopies 0 rejects when card is present in deck", () => {
		const defs: ArchetypeDefinition[] = [
			{
				name: "No Combo",
				signatureCards: [
					{ name: "Key Card", minCopies: 4 },
					{ name: "Banned Card", exactCopies: 0 },
				],
			},
		];
		const mainboard = cards(["Key Card", 4], ["Banned Card", 1], ["Land", 19]);
		expect(classifyBySignatureCards(mainboard, null, defs)).toBeNull();
	});

	// --- usedAsCommander tests ---

	it("usedAsCommander matches when card is in commanders", () => {
		const defs: ArchetypeDefinition[] = [
			{
				name: "Aragorn Deck",
				signatureCards: [{ name: "Aragorn, King of Gondor", usedAsCommander: true }],
			},
		];
		const commanders = cards(["Aragorn, King of Gondor", 1]);
		const result = classifyBySignatureCards([], commanders, defs);
		expect(result).toBe("Aragorn Deck");
	});

	it("usedAsCommander rejects when card is not in commanders", () => {
		const defs: ArchetypeDefinition[] = [
			{
				name: "Aragorn Deck",
				signatureCards: [{ name: "Aragorn, King of Gondor", usedAsCommander: true }],
			},
		];
		const commanders = cards(["Lumra, Bellow of the Woods", 1]);
		const result = classifyBySignatureCards([], commanders, defs);
		expect(result).toBeNull();
	});

	it("usedAsCommander handles null commanders", () => {
		const defs: ArchetypeDefinition[] = [
			{
				name: "Aragorn Deck",
				signatureCards: [{ name: "Aragorn, King of Gondor", usedAsCommander: true }],
			},
		];
		const result = classifyBySignatureCards([], null, defs);
		expect(result).toBeNull();
	});

	it("usedAsCommander handles empty commanders array", () => {
		const defs: ArchetypeDefinition[] = [
			{
				name: "Aragorn Deck",
				signatureCards: [{ name: "Aragorn, King of Gondor", usedAsCommander: true }],
			},
		];
		const result = classifyBySignatureCards([], [], defs);
		expect(result).toBeNull();
	});

	it("usedAsCommander normalizes DFC names via getFrontFace", () => {
		const defs: ArchetypeDefinition[] = [
			{
				name: "Aclazotz Deck",
				signatureCards: [{ name: "Aclazotz, Deepest Betrayal", usedAsCommander: true }],
			},
		];
		const commanders = cards(["Aclazotz, Deepest Betrayal // Temple of the Dead", 1]);
		const result = classifyBySignatureCards([], commanders, defs);
		expect(result).toBe("Aclazotz Deck");
	});

	it("mixed usedAsCommander and minCopies signature cards", () => {
		const defs: ArchetypeDefinition[] = [
			{
				name: "Aragorn Voltron",
				signatureCards: [
					{ name: "Aragorn, King of Gondor", usedAsCommander: true },
					{ name: "Lightning Greaves", minCopies: 1 },
				],
			},
		];
		const commanders = cards(["Aragorn, King of Gondor", 1]);

		// Has commander but missing mainboard card
		expect(classifyBySignatureCards([], commanders, defs)).toBeNull();

		// Has both commander and mainboard card
		const mainboard = cards(["Lightning Greaves", 1], ["Land", 98]);
		expect(classifyBySignatureCards(mainboard, commanders, defs)).toBe(
			"Aragorn Voltron",
		);
	});
});

describe("classifyAll", () => {
	it("classifies decklists by signature cards first", () => {
		const decklists: Record<string, DecklistInfo> = {
			d1: makeDecklist(
				cards(["Lightning Bolt", 4], ["Goblin Guide", 4], ["Mountain", 16]),
			),
			d2: makeDecklist(cards(["Counterspell", 4], ["Wrath of God", 3], ["Island", 17])),
		};

		const results = classifyAll(decklists, archetypeDefs);
		const d1Result = results.find((r) => r.decklistId === "d1");
		const d2Result = results.find((r) => r.decklistId === "d2");

		expect(d1Result!.archetype).toBe("Mono Red");
		expect(d1Result!.method).toBe("signature");
		expect(d1Result!.confidence).toBe(1.0);

		expect(d2Result!.archetype).toBe("Control");
		expect(d2Result!.method).toBe("signature");
	});

	it("uses KNN for decklists that do not match signature cards", () => {
		const decklists: Record<string, DecklistInfo> = {
			// Labeled as Mono Red via signature cards
			d1: makeDecklist(
				cards(
					["Lightning Bolt", 4],
					["Goblin Guide", 4],
					["Mountain", 16],
					["Shock", 4],
				),
			),
			d2: makeDecklist(
				cards(
					["Lightning Bolt", 4],
					["Goblin Guide", 3],
					["Mountain", 17],
					["Shock", 3],
				),
			),
			// Labeled as Control via signature cards
			d3: makeDecklist(
				cards(["Counterspell", 4], ["Wrath of God", 3], ["Island", 17], ["Opt", 4]),
			),
			d4: makeDecklist(
				cards(["Counterspell", 3], ["Wrath of God", 2], ["Island", 19], ["Opt", 3]),
			),
			// Unclassified — similar to Mono Red (has Shock, Mountain) but missing sig card Goblin Guide
			d5: makeDecklist(
				cards(
					["Lightning Bolt", 4],
					["Goblin Guide", 2],
					["Mountain", 18],
					["Shock", 4],
				),
			),
		};

		const results = classifyAll(decklists, archetypeDefs, {
			k: 3,
			minConfidence: 0,
		});
		const d5Result = results.find((r) => r.decklistId === "d5");

		expect(d5Result!.archetype).toBe("Mono Red");
		expect(d5Result!.method).toBe("knn");
		expect(d5Result!.confidence).toBeGreaterThan(0);
	});

	it("marks unclassifiable decklists as Unknown", () => {
		const decklists: Record<string, DecklistInfo> = {
			// No signature match possible
			d1: makeDecklist(cards(["Totally Unique Card", 60])),
		};

		const results = classifyAll(decklists, archetypeDefs);
		expect(results[0].archetype).toBe("Unknown");
		expect(results[0].method).toBe("unknown");
	});

	it("handles empty decklists record", () => {
		const results = classifyAll({}, archetypeDefs);
		expect(results).toEqual([]);
	});

	it("marks low-confidence KNN results as Unknown", () => {
		const decklists: Record<string, DecklistInfo> = {
			// One labeled deck
			d1: makeDecklist(
				cards(["Lightning Bolt", 4], ["Goblin Guide", 4], ["Mountain", 16]),
			),
			// Completely different deck
			d2: makeDecklist(cards(["Island", 20], ["Forest", 20])),
		};

		const results = classifyAll(decklists, archetypeDefs, {
			minConfidence: 0.99,
		});
		const d2Result = results.find((r) => r.decklistId === "d2");
		expect(d2Result!.archetype).toBe("Unknown");
	});

	it("strict-mode archetype matches via signature cards normally", () => {
		const strictDefs: ArchetypeDefinition[] = [
			{
				name: "Strict Combo",
				strictMode: true,
				signatureCards: [
					{ name: "Combo Piece", minCopies: 4 },
					{ name: "Enabler", minCopies: 2 },
				],
			},
		];
		const decklists: Record<string, DecklistInfo> = {
			d1: makeDecklist(cards(["Combo Piece", 4], ["Enabler", 3], ["Land", 17])),
		};

		const results = classifyAll(decklists, strictDefs);
		const d1Result = results.find((r) => r.decklistId === "d1");
		expect(d1Result!.archetype).toBe("Strict Combo");
		expect(d1Result!.method).toBe("signature");
	});

	it("strict-mode archetype is not assigned via KNN", () => {
		const strictDefs: ArchetypeDefinition[] = [
			{
				name: "Strict Combo",
				strictMode: true,
				signatureCards: [
					{ name: "Combo Piece", minCopies: 4 },
					{ name: "Enabler", minCopies: 3 },
				],
			},
		];
		const decklists: Record<string, DecklistInfo> = {
			// Matches Strict Combo via signature cards
			d1: makeDecklist(cards(["Combo Piece", 4], ["Enabler", 3], ["Land", 17])),
			d2: makeDecklist(cards(["Combo Piece", 4], ["Enabler", 3], ["Land", 17])),
			// Very similar but missing one copy of Enabler — would KNN to Strict Combo if allowed
			d3: makeDecklist(cards(["Combo Piece", 4], ["Enabler", 2], ["Land", 18])),
		};

		const results = classifyAll(decklists, strictDefs, {
			k: 3,
			minConfidence: 0,
		});
		const d3Result = results.find((r) => r.decklistId === "d3");
		// KNN cannot assign Strict Combo because it's excluded from training set
		expect(d3Result!.archetype).toBe("Unknown");
		expect(d3Result!.method).toBe("unknown");
	});

	// --- nameEqualsCommander tests ---

	it("nameEqualsCommander uses full commander name for single commanders", () => {
		const decklists: Record<string, DecklistInfo> = {
			d1: makeDecklist(
				cards(["Sol Ring", 1], ["Land", 98]),
				"player1",
				cards(["Aragorn, King of Gondor", 1]),
			),
		};

		const results = classifyAll(decklists, [], { nameEqualsCommander: true });
		const d1Result = results.find((r) => r.decklistId === "d1");
		expect(d1Result!.archetype).toBe("Aragorn, King of Gondor");
		expect(d1Result!.method).toBe("commander");
		expect(d1Result!.confidence).toBe(1.0);
		expect(d1Result!.representativeCard).toBe("Aragorn, King of Gondor");
	});

	it("signature match takes priority over commander name", () => {
		const defs: ArchetypeDefinition[] = [
			{
				name: "Aragorn Voltron",
				signatureCards: [
					{ name: "Aragorn, King of Gondor", usedAsCommander: true },
					{ name: "Lightning Greaves", minCopies: 1 },
				],
			},
		];
		const decklists: Record<string, DecklistInfo> = {
			d1: makeDecklist(
				cards(["Lightning Greaves", 1], ["Land", 98]),
				"player1",
				cards(["Aragorn, King of Gondor", 1]),
			),
		};

		const results = classifyAll(decklists, defs, { nameEqualsCommander: true });
		const d1Result = results.find((r) => r.decklistId === "d1");
		expect(d1Result!.archetype).toBe("Aragorn Voltron");
		expect(d1Result!.method).toBe("signature");
	});

	it("null commanders fall through to Unknown with nameEqualsCommander", () => {
		const decklists: Record<string, DecklistInfo> = {
			d1: makeDecklist(cards(["Unique Card", 60])),
		};

		const results = classifyAll(decklists, [], { nameEqualsCommander: true });
		const d1Result = results.find((r) => r.decklistId === "d1");
		expect(d1Result!.archetype).toBe("Unknown");
		expect(d1Result!.method).toBe("unknown");
	});

	it("partner commanders are joined with & (sorted)", () => {
		const decklists: Record<string, DecklistInfo> = {
			d1: makeDecklist(
				cards(["Sol Ring", 1], ["Land", 97]),
				"player1",
				cards(["Yoshimaru, Ever Faithful", 1], ["Ludevic, Necro-Alchemist", 1]),
			),
		};

		const results = classifyAll(decklists, [], { nameEqualsCommander: true });
		const d1Result = results.find((r) => r.decklistId === "d1");
		// Sorted alphabetically, short names
		expect(d1Result!.archetype).toBe("Ludevic & Yoshimaru");
		expect(d1Result!.method).toBe("commander");
	});

	it("nameEqualsCommander normalizes DFC commander names", () => {
		const decklists: Record<string, DecklistInfo> = {
			d1: makeDecklist(
				cards(["Sol Ring", 1], ["Land", 98]),
				"player1",
				cards(["Aclazotz, Deepest Betrayal // Temple of the Dead", 1]),
			),
		};

		const results = classifyAll(decklists, [], { nameEqualsCommander: true });
		const d1Result = results.find((r) => r.decklistId === "d1");
		expect(d1Result!.archetype).toBe("Aclazotz, Deepest Betrayal");
	});

	it("nameEqualsCommander false preserves existing KNN behavior", () => {
		const decklists: Record<string, DecklistInfo> = {
			d1: makeDecklist(
				cards(["Lightning Bolt", 4], ["Goblin Guide", 4], ["Mountain", 16]),
				"player1",
				cards(["Some Commander", 1]),
			),
			// Unclassified deck with commander
			d2: makeDecklist(
				cards(["Unique Card", 60]),
				"player2",
				cards(["Another Commander", 1]),
			),
		};

		const results = classifyAll(decklists, archetypeDefs, {
			nameEqualsCommander: false,
		});
		const d2Result = results.find((r) => r.decklistId === "d2");
		// Without nameEqualsCommander, should NOT use commander name
		expect(d2Result!.archetype).toBe("Unknown");
		expect(d2Result!.method).toBe("unknown");
	});
});

describe("classifyAllPooled", () => {
	// Mono Red signature: Lightning Bolt ×4, Goblin Guide ×3
	const monoRedDeck = cards(
		["Lightning Bolt", 4],
		["Goblin Guide", 3],
		["Mountain", 20],
		["Monastery Swiftspear", 4],
		["Searing Blaze", 4],
	);

	// A deck similar to Mono Red but missing exact signature copies
	// (has Bolt ×3 instead of ×4, no Goblin Guide) — won't match signature
	// but should KNN-match to Mono Red due to shared cards
	const monoRedLikeDeck = cards(
		["Lightning Bolt", 3],
		["Mountain", 20],
		["Monastery Swiftspear", 4],
		["Searing Blaze", 4],
		["Rift Bolt", 4],
	);

	// A completely different deck
	const controlDeck = cards(
		["Counterspell", 3],
		["Wrath of God", 2],
		["Island", 20],
		["Plains", 5],
		["Teferi, Hero of Dominaria", 3],
	);

	it("classifies across tournaments via pooled KNN", () => {
		// Tournament A: has a proper Mono Red deck (signature match)
		const tournamentA: Record<string, DecklistInfo> = {
			a1: makeDecklist(monoRedDeck, "pA1"),
			a2: makeDecklist(controlDeck, "pA2"),
		};
		// Tournament B: has a Mono-Red-like deck that won't match signature
		// but should be KNN-classified from Tournament A's training data
		const tournamentB: Record<string, DecklistInfo> = {
			b1: makeDecklist(monoRedLikeDeck, "pB1"),
		};

		const pool = new Map([
			["tA", tournamentA],
			["tB", tournamentB],
		]);
		const results = classifyAllPooled(pool, archetypeDefs, {
			k: 5,
			minConfidence: 0.1,
		});

		expect(results.get("tA")).toBeDefined();
		expect(results.get("tB")).toBeDefined();

		// Tournament A: both decks classified by signature
		const a1 = results.get("tA")!.find((r) => r.decklistId === "a1");
		expect(a1!.method).toBe("signature");
		expect(a1!.archetype).toBe("Mono Red");

		const a2 = results.get("tA")!.find((r) => r.decklistId === "a2");
		expect(a2!.method).toBe("signature");
		expect(a2!.archetype).toBe("Control");

		// Tournament B: KNN-classified using pooled training set from Tournament A
		const b1 = results.get("tB")!.find((r) => r.decklistId === "b1");
		expect(b1!.method).toBe("knn");
		expect(b1!.archetype).toBe("Mono Red");
	});

	it("produces identical results to classifyAll for a single tournament", () => {
		const decklists: Record<string, DecklistInfo> = {
			d1: makeDecklist(monoRedDeck, "p1"),
			d2: makeDecklist(controlDeck, "p2"),
			d3: makeDecklist(monoRedLikeDeck, "p3"),
		};

		const singleResults = classifyAll(decklists, archetypeDefs, {
			k: 5,
			minConfidence: 0.3,
		});
		const pooledResults = classifyAllPooled(
			new Map([["t1", decklists]]),
			archetypeDefs,
			{ k: 5, minConfidence: 0.3 },
		);

		const pooled = pooledResults.get("t1")!;
		expect(pooled).toHaveLength(singleResults.length);

		for (const single of singleResults) {
			const match = pooled.find((r) => r.decklistId === single.decklistId);
			expect(match).toBeDefined();
			expect(match!.archetype).toBe(single.archetype);
			expect(match!.method).toBe(single.method);
		}
	});

	it("returns empty map for empty input", () => {
		const results = classifyAllPooled(new Map(), archetypeDefs);
		expect(results.size).toBe(0);
	});

	it("marks all decks as Unknown when no signature matches exist", () => {
		const unknownDeck = cards(["Raging Goblin", 4], ["Mountain", 20]);
		const pool = new Map([
			["t1", { d1: makeDecklist(unknownDeck, "p1") }],
			["t2", { d2: makeDecklist(unknownDeck, "p2") }],
		]);

		const results = classifyAllPooled(pool, archetypeDefs);
		for (const [, tournamentResults] of results) {
			for (const r of tournamentResults) {
				expect(r.archetype).toBe("Unknown");
				expect(r.method).toBe("unknown");
			}
		}
	});

	it("respects strictMode across the pool", () => {
		const strictDefs: ArchetypeDefinition[] = [
			{
				name: "Mono Red",
				signatureCards: [
					{ name: "Lightning Bolt", minCopies: 4 },
					{ name: "Goblin Guide", minCopies: 3 },
				],
				strictMode: true, // KNN cannot produce this label
			},
			{
				name: "Control",
				signatureCards: [
					{ name: "Counterspell", minCopies: 3 },
					{ name: "Wrath of God", minCopies: 2 },
				],
			},
		];

		// Tournament A has a strict Mono Red signature match
		const tournamentA: Record<string, DecklistInfo> = {
			a1: makeDecklist(monoRedDeck, "pA1"),
		};
		// Tournament B has a Mono-Red-like deck — should NOT get KNN'd to Mono Red
		const tournamentB: Record<string, DecklistInfo> = {
			b1: makeDecklist(monoRedLikeDeck, "pB1"),
		};

		const results = classifyAllPooled(
			new Map([
				["tA", tournamentA],
				["tB", tournamentB],
			]),
			strictDefs,
			{ k: 5, minConfidence: 0.1 },
		);

		const b1 = results.get("tB")!.find((r) => r.decklistId === "b1");
		// Mono Red is strict, so KNN cannot assign it — should be Unknown
		expect(b1!.archetype).not.toBe("Mono Red");
	});

	it("handles tournaments with empty decklists", () => {
		const pool = new Map<string, Record<string, DecklistInfo>>([
			["tEmpty", {}],
			["tReal", { d1: makeDecklist(monoRedDeck, "p1") }],
		]);

		const results = classifyAllPooled(pool, archetypeDefs);
		expect(results.get("tEmpty")).toEqual([]);
		expect(results.get("tReal")).toHaveLength(1);
		expect(results.get("tReal")![0].archetype).toBe("Mono Red");
	});

	it("skips KNN when nameEqualsCommander classifies all decks", () => {
		const decklists: Record<string, DecklistInfo> = {
			d1: makeDecklist(
				cards(["Sol Ring", 1], ["Forest", 30]),
				"p1",
				cards(["Atraxa, Praetors' Voice", 1]),
			),
			d2: makeDecklist(
				cards(["Sol Ring", 1], ["Island", 30]),
				"p2",
				cards(["Kinnan, Bonder Prodigy", 1]),
			),
		};

		const results = classifyAllPooled(
			new Map([["t1", decklists]]),
			[], // no archetype defs — signature pass matches nothing
			{ nameEqualsCommander: true },
		);

		const tournamentResults = results.get("t1")!;
		expect(tournamentResults).toHaveLength(2);
		for (const r of tournamentResults) {
			expect(r.method).toBe("commander");
			expect(r.method).not.toBe("knn");
		}
	});
});
