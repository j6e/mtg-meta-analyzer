import { describe, it, expect } from 'vitest';
import {
	parseArchetypeYaml,
	classifyBySignatureCards,
	classifyAll,
} from '../../src/lib/algorithms/archetype-classifier';
import type { ArchetypeDefinition } from '../../src/lib/types/archetype';
import type { CardEntry, DecklistInfo } from '../../src/lib/types/decklist';

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
		name: 'Mono Red',
		signatureCards: [
			{ name: 'Lightning Bolt', minCopies: 4 },
			{ name: 'Goblin Guide', minCopies: 3 },
		],
	},
	{
		name: 'Control',
		signatureCards: [
			{ name: 'Counterspell', minCopies: 3 },
			{ name: 'Wrath of God', minCopies: 2 },
		],
	},
];

function makeDecklist(mainboard: CardEntry[], id = 'player1'): DecklistInfo {
	return {
		playerId: id,
		mainboard,
		sideboard: [],
		companion: null,
		reportedArchetype: null,
	};
}

function cards(...entries: [string, number][]): CardEntry[] {
	return entries.map(([cardName, quantity]) => ({ cardName, quantity }));
}

describe('parseArchetypeYaml', () => {
	it('parses YAML into archetype definitions', () => {
		const result = parseArchetypeYaml(sampleYaml);
		expect(result).toHaveLength(2);
		expect(result[0].name).toBe('Mono Red');
		expect(result[0].signatureCards).toHaveLength(2);
		expect(result[0].signatureCards[0]).toEqual({ name: 'Lightning Bolt', minCopies: 4 });
		expect(result[1].name).toBe('Control');
	});

	it('returns empty array for YAML with no archetypes', () => {
		const result = parseArchetypeYaml('format: Standard\ndate: "2026-01-01"');
		expect(result).toEqual([]);
	});

	it('parses exactCopies and strictMode fields', () => {
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
		expect(result).toHaveLength(1);
		expect(result[0].strictMode).toBe(true);
		expect(result[0].signatureCards[0]).toEqual({ name: 'Combo Piece', exactCopies: 4 });
		expect(result[0].signatureCards[1]).toEqual({ name: 'Enabler', minCopies: 2 });
	});
});

describe('classifyBySignatureCards', () => {
	it('matches decklist with all signature cards at minimum copies', () => {
		const mainboard = cards(
			['Lightning Bolt', 4],
			['Goblin Guide', 4],
			['Mountain', 16],
		);
		const result = classifyBySignatureCards(mainboard, archetypeDefs);
		expect(result).toBe('Mono Red');
	});

	it('returns null when a signature card is below minimum copies', () => {
		const mainboard = cards(
			['Lightning Bolt', 4],
			['Goblin Guide', 2], // needs 3
			['Mountain', 16],
		);
		const result = classifyBySignatureCards(mainboard, archetypeDefs);
		expect(result).toBeNull();
	});

	it('returns null when a signature card is missing', () => {
		const mainboard = cards(
			['Lightning Bolt', 4],
			['Mountain', 20],
		);
		const result = classifyBySignatureCards(mainboard, archetypeDefs);
		expect(result).toBeNull();
	});

	it('returns null for empty mainboard', () => {
		const result = classifyBySignatureCards([], archetypeDefs);
		expect(result).toBeNull();
	});

	it('matches the archetype with the most signature cards if multiple match', () => {
		// Create archetypes where a broader one also matches
		const defs: ArchetypeDefinition[] = [
			{
				name: 'Red Aggro',
				signatureCards: [{ name: 'Lightning Bolt', minCopies: 4 }],
			},
			{
				name: 'Mono Red',
				signatureCards: [
					{ name: 'Lightning Bolt', minCopies: 4 },
					{ name: 'Goblin Guide', minCopies: 3 },
				],
			},
		];

		const mainboard = cards(
			['Lightning Bolt', 4],
			['Goblin Guide', 4],
			['Mountain', 16],
		);

		const result = classifyBySignatureCards(mainboard, defs);
		expect(result).toBe('Mono Red'); // more signature cards
	});

	it('matches when deck has exactly the specified exactCopies', () => {
		const defs: ArchetypeDefinition[] = [
			{
				name: 'Exact Combo',
				signatureCards: [
					{ name: 'Combo Piece', exactCopies: 4 },
					{ name: 'Enabler', minCopies: 2 },
				],
			},
		];
		const mainboard = cards(['Combo Piece', 4], ['Enabler', 3], ['Land', 17]);
		expect(classifyBySignatureCards(mainboard, defs)).toBe('Exact Combo');
	});

	it('rejects when deck has more copies than exactCopies', () => {
		const defs: ArchetypeDefinition[] = [
			{
				name: 'Exact Combo',
				signatureCards: [{ name: 'Combo Piece', exactCopies: 3 }],
			},
		];
		const mainboard = cards(['Combo Piece', 4], ['Land', 20]);
		expect(classifyBySignatureCards(mainboard, defs)).toBeNull();
	});

	it('rejects when deck has fewer copies than exactCopies', () => {
		const defs: ArchetypeDefinition[] = [
			{
				name: 'Exact Combo',
				signatureCards: [{ name: 'Combo Piece', exactCopies: 4 }],
			},
		];
		const mainboard = cards(['Combo Piece', 3], ['Land', 21]);
		expect(classifyBySignatureCards(mainboard, defs)).toBeNull();
	});

	it('exactCopies 0 matches when card is absent from deck', () => {
		const defs: ArchetypeDefinition[] = [
			{
				name: 'No Combo',
				signatureCards: [
					{ name: 'Key Card', minCopies: 4 },
					{ name: 'Banned Card', exactCopies: 0 },
				],
			},
		];
		const mainboard = cards(['Key Card', 4], ['Land', 20]);
		expect(classifyBySignatureCards(mainboard, defs)).toBe('No Combo');
	});

	it('exactCopies 0 rejects when card is present in deck', () => {
		const defs: ArchetypeDefinition[] = [
			{
				name: 'No Combo',
				signatureCards: [
					{ name: 'Key Card', minCopies: 4 },
					{ name: 'Banned Card', exactCopies: 0 },
				],
			},
		];
		const mainboard = cards(['Key Card', 4], ['Banned Card', 1], ['Land', 19]);
		expect(classifyBySignatureCards(mainboard, defs)).toBeNull();
	});
});

describe('classifyAll', () => {
	it('classifies decklists by signature cards first', () => {
		const decklists: Record<string, DecklistInfo> = {
			'd1': makeDecklist(cards(['Lightning Bolt', 4], ['Goblin Guide', 4], ['Mountain', 16])),
			'd2': makeDecklist(cards(['Counterspell', 4], ['Wrath of God', 3], ['Island', 17])),
		};

		const results = classifyAll(decklists, archetypeDefs);
		const d1Result = results.find((r) => r.decklistId === 'd1');
		const d2Result = results.find((r) => r.decklistId === 'd2');

		expect(d1Result!.archetype).toBe('Mono Red');
		expect(d1Result!.method).toBe('signature');
		expect(d1Result!.confidence).toBe(1.0);

		expect(d2Result!.archetype).toBe('Control');
		expect(d2Result!.method).toBe('signature');
	});

	it('uses KNN for decklists that do not match signature cards', () => {
		const decklists: Record<string, DecklistInfo> = {
			// Labeled as Mono Red via signature cards
			'd1': makeDecklist(cards(['Lightning Bolt', 4], ['Goblin Guide', 4], ['Mountain', 16], ['Shock', 4])),
			'd2': makeDecklist(cards(['Lightning Bolt', 4], ['Goblin Guide', 3], ['Mountain', 17], ['Shock', 3])),
			// Labeled as Control via signature cards
			'd3': makeDecklist(cards(['Counterspell', 4], ['Wrath of God', 3], ['Island', 17], ['Opt', 4])),
			'd4': makeDecklist(cards(['Counterspell', 3], ['Wrath of God', 2], ['Island', 19], ['Opt', 3])),
			// Unclassified — similar to Mono Red (has Shock, Mountain) but missing sig card Goblin Guide
			'd5': makeDecklist(cards(['Lightning Bolt', 4], ['Goblin Guide', 2], ['Mountain', 18], ['Shock', 4])),
		};

		const results = classifyAll(decklists, archetypeDefs, { k: 3, minConfidence: 0 });
		const d5Result = results.find((r) => r.decklistId === 'd5');

		expect(d5Result!.archetype).toBe('Mono Red');
		expect(d5Result!.method).toBe('knn');
		expect(d5Result!.confidence).toBeGreaterThan(0);
	});

	it('marks unclassifiable decklists as Unknown', () => {
		const decklists: Record<string, DecklistInfo> = {
			// No signature match possible
			'd1': makeDecklist(cards(['Totally Unique Card', 60])),
		};

		const results = classifyAll(decklists, archetypeDefs);
		expect(results[0].archetype).toBe('Unknown');
		expect(results[0].method).toBe('unknown');
	});

	it('handles empty decklists record', () => {
		const results = classifyAll({}, archetypeDefs);
		expect(results).toEqual([]);
	});

	it('marks low-confidence KNN results as Unknown', () => {
		const decklists: Record<string, DecklistInfo> = {
			// One labeled deck
			'd1': makeDecklist(cards(['Lightning Bolt', 4], ['Goblin Guide', 4], ['Mountain', 16])),
			// Completely different deck
			'd2': makeDecklist(cards(['Island', 20], ['Forest', 20])),
		};

		const results = classifyAll(decklists, archetypeDefs, { minConfidence: 0.99 });
		const d2Result = results.find((r) => r.decklistId === 'd2');
		expect(d2Result!.archetype).toBe('Unknown');
	});

	it('strict-mode archetype matches via signature cards normally', () => {
		const strictDefs: ArchetypeDefinition[] = [
			{
				name: 'Strict Combo',
				strictMode: true,
				signatureCards: [
					{ name: 'Combo Piece', minCopies: 4 },
					{ name: 'Enabler', minCopies: 2 },
				],
			},
		];
		const decklists: Record<string, DecklistInfo> = {
			'd1': makeDecklist(cards(['Combo Piece', 4], ['Enabler', 3], ['Land', 17])),
		};

		const results = classifyAll(decklists, strictDefs);
		const d1Result = results.find((r) => r.decklistId === 'd1');
		expect(d1Result!.archetype).toBe('Strict Combo');
		expect(d1Result!.method).toBe('signature');
	});

	it('strict-mode archetype is not assigned via KNN', () => {
		const strictDefs: ArchetypeDefinition[] = [
			{
				name: 'Strict Combo',
				strictMode: true,
				signatureCards: [
					{ name: 'Combo Piece', minCopies: 4 },
					{ name: 'Enabler', minCopies: 3 },
				],
			},
		];
		const decklists: Record<string, DecklistInfo> = {
			// Matches Strict Combo via signature cards
			'd1': makeDecklist(cards(['Combo Piece', 4], ['Enabler', 3], ['Land', 17])),
			'd2': makeDecklist(cards(['Combo Piece', 4], ['Enabler', 3], ['Land', 17])),
			// Very similar but missing one copy of Enabler — would KNN to Strict Combo if allowed
			'd3': makeDecklist(cards(['Combo Piece', 4], ['Enabler', 2], ['Land', 18])),
		};

		const results = classifyAll(decklists, strictDefs, { k: 3, minConfidence: 0 });
		const d3Result = results.find((r) => r.decklistId === 'd3');
		// KNN cannot assign Strict Combo because it's excluded from training set
		expect(d3Result!.archetype).toBe('Unknown');
		expect(d3Result!.method).toBe('unknown');
	});
});
