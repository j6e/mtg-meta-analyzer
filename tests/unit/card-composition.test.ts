import { describe, it, expect } from 'vitest';
import { computeCardComposition } from '../../src/lib/utils/card-composition';
import type { DecklistInfo } from '../../src/lib/types/decklist';

function makeDeck(mainboard: [string, number][], sideboard: [string, number][] = []): DecklistInfo {
	return {
		playerId: 'p1',
		mainboard: mainboard.map(([cardName, quantity]) => ({ cardName, quantity })),
		sideboard: sideboard.map(([cardName, quantity]) => ({ cardName, quantity })),
		companion: null,
		reportedArchetype: null,
	};
}

describe('computeCardComposition', () => {
	it('returns empty result for empty input', () => {
		const result = computeCardComposition([]);
		expect(result.mainboard).toEqual([]);
		expect(result.sideboard).toEqual([]);
		expect(result.deckCount).toBe(0);
	});

	it('single deck: all thresholds 100% up to the quantity', () => {
		const deck = makeDeck([['Lightning Bolt', 4], ['Mountain', 20]]);
		const result = computeCardComposition([deck]);

		expect(result.deckCount).toBe(1);
		expect(result.mainboard).toHaveLength(2);

		const bolt = result.mainboard.find((r) => r.cardName === 'Lightning Bolt')!;
		expect(bolt.thresholds).toEqual([1, 1, 1, 1]);
		expect(bolt.averageQuantity).toBe(4);
		expect(bolt.count).toBe(1);

		const mountain = result.mainboard.find((r) => r.cardName === 'Mountain')!;
		expect(mountain.thresholds).toEqual([1, 1, 1, 1]);
		expect(mountain.averageQuantity).toBe(20);
	});

	it('single deck with 2 copies: thresholds for 3+ and 4+ are 0', () => {
		const deck = makeDeck([['Counterspell', 2]]);
		const result = computeCardComposition([deck]);

		const row = result.mainboard[0];
		expect(row.thresholds).toEqual([1, 1, 0, 0]);
	});

	it('multiple decks: correct percentages', () => {
		const decks = [
			makeDeck([['Lightning Bolt', 4]]),
			makeDeck([['Lightning Bolt', 4]]),
			makeDeck([['Lightning Bolt', 2]]),
			makeDeck([['Mountain', 20]]),
			makeDeck([['Lightning Bolt', 4]]),
		];
		const result = computeCardComposition(decks);

		const bolt = result.mainboard.find((r) => r.cardName === 'Lightning Bolt')!;
		// 4/5 decks have >=1 copy
		expect(bolt.thresholds[0]).toBeCloseTo(0.8);
		// 4/5 decks have >=2 copies
		expect(bolt.thresholds[1]).toBeCloseTo(0.8);
		// 3/5 decks have >=3 copies (only the ones with 4)
		expect(bolt.thresholds[2]).toBeCloseTo(0.6);
		// 3/5 decks have >=4 copies
		expect(bolt.thresholds[3]).toBeCloseTo(0.6);
		expect(bolt.count).toBe(4);
		// avg across all 5 decks: (4+4+2+0+4) / 5 = 2.8
		expect(bolt.averageQuantity).toBeCloseTo(2.8);
	});

	it('separates mainboard and sideboard', () => {
		const deck = makeDeck(
			[['Lightning Bolt', 4]],
			[['Negate', 2]],
		);
		const result = computeCardComposition([deck]);

		expect(result.mainboard).toHaveLength(1);
		expect(result.mainboard[0].cardName).toBe('Lightning Bolt');
		expect(result.sideboard).toHaveLength(1);
		expect(result.sideboard[0].cardName).toBe('Negate');
	});

	it('sorts by inclusion rate descending, then name ascending', () => {
		const decks = [
			makeDeck([['Zebra', 4], ['Alpha', 2]]),
			makeDeck([['Alpha', 3]]),
		];
		const result = computeCardComposition(decks);

		// Alpha appears in 2/2 = 100%, Zebra in 1/2 = 50%
		expect(result.mainboard[0].cardName).toBe('Alpha');
		expect(result.mainboard[1].cardName).toBe('Zebra');
	});

	it('name tiebreak works with same inclusion rate', () => {
		const decks = [
			makeDeck([['Beta', 4], ['Alpha', 4]]),
		];
		const result = computeCardComposition(decks);

		// Both at 100%, alphabetical order
		expect(result.mainboard[0].cardName).toBe('Alpha');
		expect(result.mainboard[1].cardName).toBe('Beta');
	});
});
