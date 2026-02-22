import { describe, it, expect } from 'vitest';
import { buildCorpus, vectorize, toDense } from '../../src/lib/algorithms/tfidf';
import type { CardEntry } from '../../src/lib/types/decklist';

function cards(...entries: [string, number][]): CardEntry[] {
	return entries.map(([cardName, quantity]) => ({ cardName, quantity }));
}

describe('buildCorpus', () => {
	it('builds vocabulary from all unique card names', () => {
		const decklists = [
			cards(['Lightning Bolt', 4], ['Mountain', 20]),
			cards(['Counterspell', 4], ['Island', 20]),
		];

		const corpus = buildCorpus(decklists);
		expect(corpus.vocabulary.size).toBe(4);
		expect(corpus.vocabulary.has('Lightning Bolt')).toBe(true);
		expect(corpus.vocabulary.has('Counterspell')).toBe(true);
		expect(corpus.documentCount).toBe(2);
	});

	it('computes IDF = 0 for cards appearing in all documents', () => {
		const decklists = [
			cards(['Mountain', 20], ['Lightning Bolt', 4]),
			cards(['Mountain', 18], ['Goblin Guide', 4]),
		];

		const corpus = buildCorpus(decklists);
		const mountainIdx = corpus.vocabulary.get('Mountain')!;
		// IDF = ln(2/2) = ln(1) = 0
		expect(corpus.idf[mountainIdx]).toBeCloseTo(0, 10);
	});

	it('computes high IDF for cards appearing in one document', () => {
		const decklists = [
			cards(['Lightning Bolt', 4], ['Mountain', 20]),
			cards(['Counterspell', 4], ['Island', 20]),
		];

		const corpus = buildCorpus(decklists);
		const boltIdx = corpus.vocabulary.get('Lightning Bolt')!;
		// IDF = ln(2/1) = ln(2) ≈ 0.693
		expect(corpus.idf[boltIdx]).toBeCloseTo(Math.log(2), 10);
	});

	it('handles empty decklists array', () => {
		const corpus = buildCorpus([]);
		expect(corpus.vocabulary.size).toBe(0);
		expect(corpus.idf.length).toBe(0);
		expect(corpus.documentCount).toBe(0);
	});

	it('handles decklists with duplicate card names (counts doc frequency once)', () => {
		// Shouldn't happen in practice, but handles gracefully
		const decklists = [
			cards(['Mountain', 10], ['Mountain', 10]),
			cards(['Island', 20]),
		];

		const corpus = buildCorpus(decklists);
		const mountainIdx = corpus.vocabulary.get('Mountain')!;
		// Mountain appears in 1 doc, IDF = ln(2/1)
		expect(corpus.idf[mountainIdx]).toBeCloseTo(Math.log(2), 10);
	});
});

describe('vectorize', () => {
	it('produces non-zero values for unique cards', () => {
		const decklists = [
			cards(['Lightning Bolt', 4], ['Mountain', 20]),
			cards(['Counterspell', 4], ['Mountain', 20]),
		];

		const corpus = buildCorpus(decklists);
		const vec = vectorize(decklists[0], corpus);

		// Lightning Bolt: TF = 4/24, IDF = ln(2/1) → TF-IDF > 0
		// Mountain: TF = 20/24, IDF = ln(2/2) = 0 → TF-IDF = 0
		expect(vec.length).toBe(1); // Only Lightning Bolt (Mountain has IDF=0)
		const boltIdx = corpus.vocabulary.get('Lightning Bolt')!;
		expect(vec[0][0]).toBe(boltIdx);
		expect(vec[0][1]).toBeCloseTo((4 / 24) * Math.log(2), 10);
	});

	it('two identical decklists produce identical vectors', () => {
		const deck = cards(['Lightning Bolt', 4], ['Mountain', 20]);
		const corpus = buildCorpus([deck, deck]);

		const vec1 = vectorize(deck, corpus);
		const vec2 = vectorize(deck, corpus);

		expect(vec1).toEqual(vec2);
	});

	it('quantity affects TF proportionally', () => {
		const deck1 = cards(['Unique Card', 1], ['Filler', 59]);
		const deck2 = cards(['Unique Card', 4], ['Filler', 56]);
		const otherDeck = cards(['Other Card', 4], ['Filler', 56]);

		const corpus = buildCorpus([deck1, deck2, otherDeck]);
		const vec1 = vectorize(deck1, corpus);
		const vec2 = vectorize(deck2, corpus);

		// Both have Unique Card, but deck2 has 4x the quantity
		const uniqueIdx = corpus.vocabulary.get('Unique Card')!;
		const val1 = vec1.find(([idx]) => idx === uniqueIdx)?.[1] ?? 0;
		const val2 = vec2.find(([idx]) => idx === uniqueIdx)?.[1] ?? 0;

		// TF1 = 1/60, TF2 = 4/60 → ratio should be 4:1
		expect(val2 / val1).toBeCloseTo(4, 5);
	});

	it('returns empty vector for empty decklist', () => {
		const corpus = buildCorpus([cards(['Mountain', 20])]);
		const vec = vectorize([], corpus);
		expect(vec).toEqual([]);
	});

	it('ignores cards not in corpus vocabulary', () => {
		const corpus = buildCorpus([cards(['Mountain', 20])]);
		const vec = vectorize(cards(['Island', 20]), corpus);
		expect(vec).toEqual([]);
	});
});

describe('toDense', () => {
	it('converts sparse vector to dense Float64Array', () => {
		const sparse: [number, number][] = [[0, 0.5], [3, 1.2]];
		const dense = toDense(sparse, 5);

		expect(dense.length).toBe(5);
		expect(dense[0]).toBeCloseTo(0.5);
		expect(dense[1]).toBe(0);
		expect(dense[2]).toBe(0);
		expect(dense[3]).toBeCloseTo(1.2);
		expect(dense[4]).toBe(0);
	});

	it('returns zero array for empty sparse vector', () => {
		const dense = toDense([], 3);
		expect(dense.length).toBe(3);
		expect(dense[0]).toBe(0);
		expect(dense[1]).toBe(0);
		expect(dense[2]).toBe(0);
	});
});
