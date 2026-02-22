import type { CardEntry } from '../types/decklist';

/**
 * TF-IDF corpus built from a collection of decklists.
 * Stores the vocabulary (card name → index) and IDF values.
 */
export interface TfIdfCorpus {
	/** Map from card name to vocabulary index */
	vocabulary: Map<string, number>;
	/** IDF value for each vocabulary index */
	idf: Float64Array;
	/** Total number of documents (decklists) in the corpus */
	documentCount: number;
}

/**
 * Sparse TF-IDF vector: array of [vocabIndex, tfidfValue] pairs.
 */
export type SparseVector = [number, number][];

/**
 * Build a TF-IDF corpus from a collection of decklists.
 *
 * IDF(term) = ln(N / df(term))
 * where N = total documents, df = number of documents containing the term.
 */
export function buildCorpus(decklists: CardEntry[][]): TfIdfCorpus {
	const vocabulary = new Map<string, number>();
	const documentFrequency = new Map<string, number>();

	// First pass: build vocabulary and count document frequency
	for (const decklist of decklists) {
		const seen = new Set<string>();
		for (const entry of decklist) {
			const card = entry.cardName;

			if (!vocabulary.has(card)) {
				vocabulary.set(card, vocabulary.size);
			}

			if (!seen.has(card)) {
				seen.add(card);
				documentFrequency.set(card, (documentFrequency.get(card) ?? 0) + 1);
			}
		}
	}

	// Compute IDF for each term
	const N = decklists.length;
	const idf = new Float64Array(vocabulary.size);

	for (const [card, idx] of vocabulary) {
		const df = documentFrequency.get(card) ?? 0;
		idf[idx] = Math.log(N / df);
	}

	return { vocabulary, idf, documentCount: N };
}

/**
 * Vectorize a single decklist into a sparse TF-IDF vector.
 *
 * TF(term, doc) = quantity of card / total cards in deck
 * TF-IDF = TF * IDF
 */
export function vectorize(decklist: CardEntry[], corpus: TfIdfCorpus): SparseVector {
	const totalCards = decklist.reduce((sum, e) => sum + e.quantity, 0);
	if (totalCards === 0) return [];

	const vector: SparseVector = [];

	for (const entry of decklist) {
		const idx = corpus.vocabulary.get(entry.cardName);
		if (idx === undefined) continue;

		const tf = entry.quantity / totalCards;
		const tfidf = tf * corpus.idf[idx];

		if (tfidf > 0) {
			vector.push([idx, tfidf]);
		}
	}

	return vector;
}

/**
 * Convert a sparse vector to a dense array (for cosine similarity).
 */
export function toDense(sparse: SparseVector, size: number): Float64Array {
	const dense = new Float64Array(size);
	for (const [idx, val] of sparse) {
		dense[idx] = val;
	}
	return dense;
}
