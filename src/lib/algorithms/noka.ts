/**
 * Nth Order Karsten Aggregation (NOKA)
 *
 * Builds a consensus decklist from multiple decklists of the same archetype.
 *
 * Order 1 (Karsten's original): each nth copy of a card is ranked independently
 * by how many input decks include it. Top 60/15 copies become the aggregate list.
 *
 * Order 2+: also considers how often cards appear together in pairs (order 2)
 * or triplets (order 3), weighted by 1/2^combo_size. Iteratively removes the
 * lowest-scored card-copy until the target size is reached.
 *
 * Reference: Frank Karsten (ChannelFireball), elvishjerricco.github.io
 */
import type { CardEntry, DecklistInfo } from '../types/decklist';

export interface AggregatedDeck {
	mainboard: CardEntry[];
	sideboard: CardEntry[];
	deckCount: number;
}

interface Metacard {
	name: string;
	instance: number;
	count: number;
	total: number;
}

interface CardCopy {
	name: string;
	instance: number;
}

const MAINBOARD_SIZE = 60;
const SIDEBOARD_SIZE = 15;

export function aggregateDecks(
	decks: DecklistInfo[],
	order: 1 | 2 | 3 = 1,
): AggregatedDeck {
	if (decks.length === 0) {
		return { mainboard: [], sideboard: [], deckCount: 0 };
	}
	if (decks.length === 1) {
		return {
			mainboard: [...decks[0].mainboard],
			sideboard: [...decks[0].sideboard],
			deckCount: 1,
		};
	}

	const mainboards = decks.map((d) => d.mainboard);
	const sideboards = decks.map((d) => d.sideboard);

	const mainboard = aggregateCardList(mainboards, MAINBOARD_SIZE, order);
	const sideboard = aggregateCardList(sideboards, SIDEBOARD_SIZE, order);

	return { mainboard, sideboard, deckCount: decks.length };
}

function aggregateCardList(
	cardLists: CardEntry[][],
	targetSize: number,
	order: number,
): CardEntry[] {
	if (order === 1) {
		return firstOrderAggregate(cardLists, targetSize);
	}
	return higherOrderAggregate(cardLists, targetSize, order);
}

// --- 1st Order: Karsten's sort-and-cut ---

function firstOrderAggregate(
	cardLists: CardEntry[][],
	targetSize: number,
): CardEntry[] {
	const metacardMap = new Map<string, Metacard>();

	for (const cardList of cardLists) {
		for (const card of cardList) {
			for (let i = 1; i <= card.quantity; i++) {
				const key = `${card.cardName}|${i}`;
				const existing = metacardMap.get(key);
				if (existing) {
					existing.count += 1;
					existing.total += card.quantity;
				} else {
					metacardMap.set(key, {
						name: card.cardName,
						instance: i,
						count: 1,
						total: card.quantity,
					});
				}
			}
		}
	}

	const metacards = [...metacardMap.values()];
	metacards.sort(compareMetacards);

	const resultMap = new Map<string, number>();
	const limit = Math.min(targetSize, metacards.length);
	for (let i = 0; i < limit; i++) {
		const mc = metacards[i];
		resultMap.set(mc.name, (resultMap.get(mc.name) ?? 0) + 1);
	}

	return collapseToCardEntries(resultMap);
}

function compareMetacards(a: Metacard, b: Metacard): number {
	if (a.count !== b.count) return b.count - a.count;
	if (a.total !== b.total) return b.total - a.total;
	if (a.name !== b.name) return a.name < b.name ? -1 : 1;
	return a.instance - b.instance;
}

// --- 2nd+ Order: iterative removal with combo scoring ---

function higherOrderAggregate(
	cardLists: CardEntry[][],
	targetSize: number,
	order: number,
): CardEntry[] {
	// Pre-compute which unique card names each deck contains
	const deckCardSets: Set<string>[] = cardLists.map((cards) => {
		const names = new Set<string>();
		for (const c of cards) names.add(c.cardName);
		return names;
	});

	// Instance frequencies: how many decks include ≥N copies (for scoring individual copies)
	const instanceFreq = new Map<string, number>();
	for (const cardList of cardLists) {
		for (const card of cardList) {
			for (let i = 1; i <= card.quantity; i++) {
				const key = `${card.cardName}|${i}`;
				instanceFreq.set(key, (instanceFreq.get(key) ?? 0) + 1);
			}
		}
	}

	// Pairs (order >= 2)
	let pairFreq: Map<string, number> | null = null;
	if (order >= 2) {
		pairFreq = new Map();
		for (const cardSet of deckCardSets) {
			const names = [...cardSet].sort();
			for (let i = 0; i < names.length; i++) {
				for (let j = i + 1; j < names.length; j++) {
					const key = `${names[i]}|${names[j]}`;
					pairFreq.set(key, (pairFreq.get(key) ?? 0) + 1);
				}
			}
		}
	}

	// Triplets (order >= 3)
	let tripleFreq: Map<string, number> | null = null;
	if (order >= 3) {
		tripleFreq = new Map();
		for (const cardSet of deckCardSets) {
			const names = [...cardSet].sort();
			for (let i = 0; i < names.length; i++) {
				for (let j = i + 1; j < names.length; j++) {
					for (let k = j + 1; k < names.length; k++) {
						const key = `${names[i]}|${names[j]}|${names[k]}`;
						tripleFreq.set(key, (tripleFreq.get(key) ?? 0) + 1);
					}
				}
			}
		}
	}

	// Build merged pool: max quantity of each card across all decks
	const maxQuantities = new Map<string, number>();
	for (const cardList of cardLists) {
		for (const card of cardList) {
			const current = maxQuantities.get(card.cardName) ?? 0;
			if (card.quantity > current) {
				maxQuantities.set(card.cardName, card.quantity);
			}
		}
	}

	const pool: CardCopy[] = [];
	for (const [name, qty] of maxQuantities) {
		for (let i = 1; i <= qty; i++) {
			pool.push({ name, instance: i });
		}
	}

	// Iteratively remove lowest-scored card-copy until target size.
	// Each order's contribution is normalized by the number of combinations
	// so the 1/2^size weight controls relative importance across orders.

	// Track unique card names and their copy counts incrementally
	const nameCounts = new Map<string, number>();
	for (const copy of pool) {
		nameCounts.set(copy.name, (nameCounts.get(copy.name) ?? 0) + 1);
	}

	while (pool.length > targetSize) {
		// Pre-sort unique names once per iteration (for triple key construction)
		const sortedUniqueNames = tripleFreq ? [...nameCounts.keys()].sort() : null;

		let minScore = Infinity;
		let minIdx = 0;

		for (let idx = 0; idx < pool.length; idx++) {
			const copy = pool[idx];
			let score = 0;

			// 1st order component: instance frequency × 1/2
			const instKey = `${copy.name}|${copy.instance}`;
			score += (instanceFreq.get(instKey) ?? 0) * 0.5;

			// 2nd order component: average pair frequency × 1/4
			if (pairFreq) {
				let pairSum = 0;
				let pairCount = 0;
				for (const other of nameCounts.keys()) {
					if (other === copy.name) continue;
					const pairKey =
						copy.name < other
							? `${copy.name}|${other}`
							: `${other}|${copy.name}`;
					pairSum += pairFreq.get(pairKey) ?? 0;
					pairCount++;
				}
				if (pairCount > 0) {
					score += (pairSum / pairCount) * 0.25;
				}
			}

			// 3rd order component: average triple frequency × 1/8
			if (tripleFreq && sortedUniqueNames) {
				let tripleSum = 0;
				let tripleCount = 0;
				for (let i = 0; i < sortedUniqueNames.length; i++) {
					const a = sortedUniqueNames[i];
					if (a === copy.name) continue;
					for (let j = i + 1; j < sortedUniqueNames.length; j++) {
						const b = sortedUniqueNames[j];
						if (b === copy.name) continue;
						// a < b is guaranteed (sorted). Build key with copy.name in correct position.
						let key: string;
						if (copy.name < a) {
							key = `${copy.name}|${a}|${b}`;
						} else if (copy.name < b) {
							key = `${a}|${copy.name}|${b}`;
						} else {
							key = `${a}|${b}|${copy.name}`;
						}
						tripleSum += tripleFreq.get(key) ?? 0;
						tripleCount++;
					}
				}
				if (tripleCount > 0) {
					score += (tripleSum / tripleCount) * 0.125;
				}
			}

			if (score < minScore) {
				minScore = score;
				minIdx = idx;
			}
		}

		// Remove the lowest-scored copy and update name tracking
		const removed = pool[minIdx];
		pool[minIdx] = pool[pool.length - 1];
		pool.pop();
		const remaining = nameCounts.get(removed.name)! - 1;
		if (remaining === 0) {
			nameCounts.delete(removed.name);
		} else {
			nameCounts.set(removed.name, remaining);
		}
	}

	// Collapse copies into quantities
	const resultMap = new Map<string, number>();
	for (const copy of pool) {
		resultMap.set(copy.name, (resultMap.get(copy.name) ?? 0) + 1);
	}

	return collapseToCardEntries(resultMap);
}

// --- Helpers ---

function collapseToCardEntries(
	quantities: Map<string, number>,
): CardEntry[] {
	const entries: CardEntry[] = [];
	for (const [cardName, quantity] of quantities) {
		entries.push({ cardName, quantity });
	}
	entries.sort((a, b) => {
		if (a.quantity !== b.quantity) return b.quantity - a.quantity;
		return a.cardName.localeCompare(b.cardName);
	});
	return entries;
}
