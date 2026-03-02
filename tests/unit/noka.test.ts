import { describe, it, expect } from 'vitest';
import { aggregateDecks } from '../../src/lib/algorithms/noka';
import type { DecklistInfo } from '../../src/lib/types/decklist';

function makeDeck(
	mainboard: [string, number][],
	sideboard: [string, number][] = [],
): DecklistInfo {
	return {
		playerId: crypto.randomUUID(),
		mainboard: mainboard.map(([cardName, quantity]) => ({ cardName, quantity })),
		sideboard: sideboard.map(([cardName, quantity]) => ({ cardName, quantity })),
		companion: null,
		reportedArchetype: null,
	};
}

/** Helper: total quantity across a card list */
function totalCards(cards: { quantity: number }[]): number {
	return cards.reduce((sum, c) => sum + c.quantity, 0);
}

/** Helper: find a card's quantity in a list */
function qty(cards: { cardName: string; quantity: number }[], name: string): number {
	return cards.find((c) => c.cardName === name)?.quantity ?? 0;
}

describe('NOKA — 1st order', () => {
	it('returns empty for no decks', () => {
		const result = aggregateDecks([], 1);
		expect(result.mainboard).toEqual([]);
		expect(result.sideboard).toEqual([]);
		expect(result.deckCount).toBe(0);
	});

	it('returns the same deck for a single input', () => {
		const deck = makeDeck(
			[['Lightning Bolt', 4], ['Mountain', 20], ['Goblin Guide', 4], ['Monastery Swiftspear', 4],
			 ['Eidolon of the Great Revel', 4], ['Lava Spike', 4], ['Rift Bolt', 4],
			 ['Searing Blaze', 4], ['Inspiring Vantage', 4], ['Sacred Foundry', 4], ['Shard Volley', 4]],
			[['Smash to Smithereens', 4], ['Path to Exile', 4], ['Rest in Peace', 3], ['Kor Firewalker', 4]],
		);
		const result = aggregateDecks([deck], 1);
		expect(result.mainboard).toEqual(deck.mainboard);
		expect(result.sideboard).toEqual(deck.sideboard);
		expect(result.deckCount).toBe(1);
	});

	it('aggregates mainboards to 60 cards', () => {
		// 3 decks with overlapping but different cards
		const cards60 = (extras: [string, number][]): [string, number][] => {
			const base: [string, number][] = [
				['Lightning Bolt', 4], ['Mountain', 20], ['Goblin Guide', 4],
				['Monastery Swiftspear', 4], ['Eidolon of the Great Revel', 4],
				['Lava Spike', 4], ['Rift Bolt', 4], ['Searing Blaze', 4],
			];
			const baseTotal = base.reduce((s, [, q]) => s + q, 0); // 48
			const extrasTotal = extras.reduce((s, [, q]) => s + q, 0);
			// Pad remaining with filler
			const remaining = 60 - baseTotal - extrasTotal;
			return [...base, ...extras, ['Filler Land', remaining]];
		};

		const decks = [
			makeDeck(cards60([['Shard Volley', 4], ['Skullcrack', 4], ['Fiery Islet', 4]])),
			makeDeck(cards60([['Shard Volley', 4], ['Skullcrack', 2], ['Inspiring Vantage', 4], ['Light Up the Stage', 2]])),
			makeDeck(cards60([['Shard Volley', 3], ['Light Up the Stage', 4], ['Inspiring Vantage', 4], ['Fiery Islet', 1]])),
		];

		const result = aggregateDecks(decks, 1);
		expect(totalCards(result.mainboard)).toBe(60);
		expect(result.deckCount).toBe(3);

		// Shard Volley appears in all 3 decks; most play 4 → expect ≥ 3
		expect(qty(result.mainboard, 'Shard Volley')).toBeGreaterThanOrEqual(3);
	});

	it('cards played in more decks rank higher', () => {
		// Card A in all 3 decks (4 copies), Card B in 1 deck (4 copies)
		// With a tight 60-card budget, Card A's copies should outrank Card B's
		const base: [string, number][] = [
			['Card A', 4], ['Filler 1', 4], ['Filler 2', 4], ['Filler 3', 4],
			['Filler 4', 4], ['Filler 5', 4], ['Filler 6', 4], ['Filler 7', 4],
			['Filler 8', 4], ['Filler 9', 4], ['Filler 10', 4], ['Filler 11', 4],
			['Filler 12', 4], ['Filler 13', 4],
		]; // 56 cards

		const deck1 = makeDeck([...base, ['Card B', 4]]);
		const deck2 = makeDeck([...base, ['Card C', 4]]);
		const deck3 = makeDeck([...base, ['Card D', 4]]);

		const result = aggregateDecks([deck1, deck2, deck3], 1);
		expect(totalCards(result.mainboard)).toBe(60);
		// Card A (in 3 decks) should be included at 4 copies
		expect(qty(result.mainboard, 'Card A')).toBe(4);
	});

	it('aggregates sideboards to 15 cards', () => {
		const main: [string, number][] = [
			['Card A', 4], ['Card B', 4], ['Card C', 4], ['Card D', 4],
			['Card E', 4], ['Card F', 4], ['Card G', 4], ['Card H', 4],
			['Card I', 4], ['Card J', 4], ['Card K', 4], ['Card L', 4],
			['Card M', 4], ['Card N', 4], ['Card O', 4],
		];
		const decks = [
			makeDeck(main, [['SB Card 1', 4], ['SB Card 2', 4], ['SB Card 3', 4], ['SB Card 4', 3]]),
			makeDeck(main, [['SB Card 1', 4], ['SB Card 2', 3], ['SB Card 3', 4], ['SB Card 5', 4]]),
			makeDeck(main, [['SB Card 1', 3], ['SB Card 2', 4], ['SB Card 3', 4], ['SB Card 4', 4]]),
		];

		const result = aggregateDecks(decks, 1);
		expect(totalCards(result.sideboard)).toBe(15);
		// SB Card 1 is in all 3 sideboards
		expect(qty(result.sideboard, 'SB Card 1')).toBeGreaterThanOrEqual(3);
	});

	it('identical decks return the same decklist', () => {
		const main: [string, number][] = [
			['Card A', 4], ['Card B', 4], ['Card C', 4], ['Card D', 4],
			['Card E', 4], ['Card F', 4], ['Card G', 4], ['Card H', 4],
			['Card I', 4], ['Card J', 4], ['Card K', 4], ['Card L', 4],
			['Card M', 4], ['Card N', 4], ['Card O', 4],
		];
		const side: [string, number][] = [
			['SB 1', 4], ['SB 2', 4], ['SB 3', 4], ['SB 4', 3],
		];
		const decks = [makeDeck(main, side), makeDeck(main, side), makeDeck(main, side)];

		const result = aggregateDecks(decks, 1);
		for (const [name, quantity] of main) {
			expect(qty(result.mainboard, name)).toBe(quantity);
		}
		for (const [name, quantity] of side) {
			expect(qty(result.sideboard, name)).toBe(quantity);
		}
	});
});

describe('NOKA — 2nd order', () => {
	it('produces a 60-card mainboard', () => {
		const base: [string, number][] = [
			['Card A', 4], ['Card B', 4], ['Card C', 4], ['Card D', 4],
			['Card E', 4], ['Card F', 4], ['Card G', 4], ['Card H', 4],
			['Card I', 4], ['Card J', 4], ['Card K', 4], ['Card L', 4],
			['Card M', 4], ['Card N', 4], ['Card O', 4],
		];
		const decks = [
			makeDeck([...base]),
			makeDeck([...base]),
			makeDeck([...base]),
		];

		const result = aggregateDecks(decks, 2);
		expect(totalCards(result.mainboard)).toBe(60);
	});

	it('synergy cards stay together over isolated popular cards', () => {
		// Synergy pair: "Combo A" + "Combo B" always appear together (in 2/3 decks)
		// Isolated card: "Solo X" appears in 2/3 decks but never with the combo
		// At order 2, the combo pair should get a boost from their pair frequency
		const shared: [string, number][] = [
			['Land 1', 4], ['Land 2', 4], ['Land 3', 4], ['Land 4', 4],
			['Land 5', 4], ['Land 6', 4], ['Land 7', 4], ['Land 8', 4],
			['Staple 1', 4], ['Staple 2', 4], ['Staple 3', 4], ['Staple 4', 4],
			['Staple 5', 4],
		]; // 52 cards

		const deck1 = makeDeck([...shared, ['Combo A', 4], ['Combo B', 4]]);
		const deck2 = makeDeck([...shared, ['Combo A', 4], ['Combo B', 4]]);
		const deck3 = makeDeck([...shared, ['Solo X', 4], ['Solo Y', 4]]);

		const result = aggregateDecks([deck1, deck2, deck3], 2);
		expect(totalCards(result.mainboard)).toBe(60);

		// Both combo cards appear together (pair frequency = 2, solo has no pair synergy with staples beyond what combo has)
		const hasComboA = qty(result.mainboard, 'Combo A') > 0;
		const hasComboB = qty(result.mainboard, 'Combo B') > 0;
		// If one combo piece is included, both should be (synergy boost)
		if (hasComboA || hasComboB) {
			expect(hasComboA).toBe(true);
			expect(hasComboB).toBe(true);
		}
	});
});

describe('NOKA — 3rd order', () => {
	it('produces a 60-card mainboard', () => {
		const base: [string, number][] = [
			['Card A', 4], ['Card B', 4], ['Card C', 4], ['Card D', 4],
			['Card E', 4], ['Card F', 4], ['Card G', 4], ['Card H', 4],
			['Card I', 4], ['Card J', 4], ['Card K', 4], ['Card L', 4],
			['Card M', 4], ['Card N', 4], ['Card O', 4],
		];
		const decks = [
			makeDeck([...base]),
			makeDeck([...base]),
		];

		const result = aggregateDecks(decks, 3);
		expect(totalCards(result.mainboard)).toBe(60);
	});
});
