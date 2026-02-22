import { describe, it, expect } from 'vitest';
import { cosineSimilarity, cosineSimilaritySparse } from '../../src/lib/algorithms/cosine-similarity';
import type { SparseVector } from '../../src/lib/algorithms/tfidf';

describe('cosineSimilarity (dense)', () => {
	it('returns 1.0 for identical vectors', () => {
		const a = new Float64Array([1, 2, 3]);
		expect(cosineSimilarity(a, a)).toBeCloseTo(1.0, 10);
	});

	it('returns 0.0 for orthogonal vectors', () => {
		const a = new Float64Array([1, 0, 0]);
		const b = new Float64Array([0, 1, 0]);
		expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 10);
	});

	it('computes known example: [1,2,3] vs [4,5,6]', () => {
		const a = new Float64Array([1, 2, 3]);
		const b = new Float64Array([4, 5, 6]);
		// dot = 4+10+18 = 32, |a| = sqrt(14), |b| = sqrt(77)
		// cos = 32 / sqrt(14*77) = 32 / sqrt(1078) ≈ 0.97463
		const expected = 32 / Math.sqrt(14 * 77);
		expect(cosineSimilarity(a, b)).toBeCloseTo(expected, 10);
	});

	it('returns 0 for zero vectors', () => {
		const zero = new Float64Array([0, 0, 0]);
		const a = new Float64Array([1, 2, 3]);
		expect(cosineSimilarity(zero, a)).toBe(0);
		expect(cosineSimilarity(a, zero)).toBe(0);
		expect(cosineSimilarity(zero, zero)).toBe(0);
	});

	it('handles vectors of different lengths', () => {
		const a = new Float64Array([1, 2]);
		const b = new Float64Array([1, 2, 0, 0]);
		// Effectively the same direction in higher space
		expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 10);
	});

	it('returns 1.0 for parallel vectors of different magnitudes', () => {
		const a = new Float64Array([1, 2, 3]);
		const b = new Float64Array([2, 4, 6]);
		expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 10);
	});
});

describe('cosineSimilaritySparse', () => {
	it('returns 1.0 for identical sparse vectors', () => {
		const a: SparseVector = [[0, 1], [2, 3]];
		expect(cosineSimilaritySparse(a, a)).toBeCloseTo(1.0, 10);
	});

	it('returns 0.0 for orthogonal sparse vectors', () => {
		const a: SparseVector = [[0, 1]];
		const b: SparseVector = [[1, 1]];
		expect(cosineSimilaritySparse(a, b)).toBeCloseTo(0.0, 10);
	});

	it('returns 0 for empty sparse vectors', () => {
		const empty: SparseVector = [];
		const a: SparseVector = [[0, 1]];
		expect(cosineSimilaritySparse(empty, a)).toBe(0);
		expect(cosineSimilaritySparse(a, empty)).toBe(0);
		expect(cosineSimilaritySparse(empty, empty)).toBe(0);
	});

	it('matches dense computation for known example', () => {
		// Sparse representation of [1,0,2,0,3] vs [0,4,0,5,3]
		const a: SparseVector = [[0, 1], [2, 2], [4, 3]];
		const b: SparseVector = [[1, 4], [3, 5], [4, 3]];

		const denseA = new Float64Array([1, 0, 2, 0, 3]);
		const denseB = new Float64Array([0, 4, 0, 5, 3]);

		const sparseSim = cosineSimilaritySparse(a, b);
		const denseSim = cosineSimilarity(denseA, denseB);

		expect(sparseSim).toBeCloseTo(denseSim, 10);
	});
});
