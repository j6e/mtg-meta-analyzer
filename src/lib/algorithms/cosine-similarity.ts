import type { SparseVector } from './tfidf';

/**
 * Compute cosine similarity between two dense vectors.
 * Returns a value in [0, 1] for non-negative vectors (like TF-IDF).
 * Returns 0 for zero vectors.
 */
export function cosineSimilarity(a: Float64Array, b: Float64Array): number {
	let dot = 0;
	let normA = 0;
	let normB = 0;

	const len = Math.min(a.length, b.length);
	for (let i = 0; i < len; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}

	// Handle remaining elements if lengths differ
	for (let i = len; i < a.length; i++) {
		normA += a[i] * a[i];
	}
	for (let i = len; i < b.length; i++) {
		normB += b[i] * b[i];
	}

	const denom = Math.sqrt(normA) * Math.sqrt(normB);
	if (denom === 0) return 0;

	return dot / denom;
}

/**
 * Compute cosine similarity between two sparse vectors.
 * More efficient when vectors are very sparse.
 */
export function cosineSimilaritySparse(a: SparseVector, b: SparseVector): number {
	// Build a map for the shorter vector
	const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
	const map = new Map<number, number>();
	let normShorter = 0;

	for (const [idx, val] of shorter) {
		map.set(idx, val);
		normShorter += val * val;
	}

	let dot = 0;
	let normLonger = 0;

	for (const [idx, val] of longer) {
		normLonger += val * val;
		const other = map.get(idx);
		if (other !== undefined) {
			dot += val * other;
		}
	}

	const denom = Math.sqrt(normShorter) * Math.sqrt(normLonger);
	if (denom === 0) return 0;

	return dot / denom;
}
