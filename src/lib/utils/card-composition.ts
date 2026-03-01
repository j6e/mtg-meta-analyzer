import type { CardEntry, DecklistInfo } from '../types/decklist';

export interface CardCompositionRow {
	cardName: string;
	/** % of decklists with at least N copies: [>=1, >=2, >=3, >=4]. Each 0-1. */
	thresholds: [number, number, number, number];
	/** Average quantity across decklists that include at least 1 copy. */
	averageQuantity: number;
	/** Number of decklists that include at least 1 copy. */
	count: number;
}

export interface CardCompositionResult {
	mainboard: CardCompositionRow[];
	sideboard: CardCompositionRow[];
	deckCount: number;
}

function buildRows(cards: Map<string, number[]>, deckCount: number): CardCompositionRow[] {
	if (deckCount === 0) return [];

	const rows: CardCompositionRow[] = [];
	for (const [cardName, quantities] of cards) {
		const count = quantities.length;
		const thresholds: [number, number, number, number] = [
			count / deckCount,
			quantities.filter((q) => q >= 2).length / deckCount,
			quantities.filter((q) => q >= 3).length / deckCount,
			quantities.filter((q) => q >= 4).length / deckCount,
		];
		const averageQuantity = quantities.reduce((a, b) => a + b, 0) / count;
		rows.push({ cardName, thresholds, averageQuantity, count });
	}

	rows.sort((a, b) => {
		const diff = b.thresholds[0] - a.thresholds[0];
		if (diff !== 0) return diff;
		return a.cardName.localeCompare(b.cardName);
	});

	return rows;
}

function collectQuantities(sections: CardEntry[][]): Map<string, number[]> {
	const cards = new Map<string, number[]>();
	for (const section of sections) {
		// Build per-deck quantity for this section
		const deckCards = new Map<string, number>();
		for (const entry of section) {
			deckCards.set(entry.cardName, (deckCards.get(entry.cardName) ?? 0) + entry.quantity);
		}
		for (const [name, qty] of deckCards) {
			let arr = cards.get(name);
			if (!arr) {
				arr = [];
				cards.set(name, arr);
			}
			arr.push(qty);
		}
	}
	return cards;
}

/**
 * Compute card composition stats from a set of decklists.
 * For each card, computes what % of lists include at least 1, 2, 3, 4 copies.
 * Mainboard and sideboard are computed separately.
 */
export function computeCardComposition(decks: DecklistInfo[]): CardCompositionResult {
	const deckCount = decks.length;
	if (deckCount === 0) {
		return { mainboard: [], sideboard: [], deckCount: 0 };
	}

	const mainQuantities = collectQuantities(decks.map((d) => d.mainboard));
	const sideQuantities = collectQuantities(decks.map((d) => d.sideboard));

	return {
		mainboard: buildRows(mainQuantities, deckCount),
		sideboard: buildRows(sideQuantities, deckCount),
		deckCount,
	};
}
