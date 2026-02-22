import { describe, it, expect } from 'vitest';
import { knnClassify } from '../../src/lib/algorithms/knn';
import type { LabeledPoint } from '../../src/lib/algorithms/knn';
import type { SparseVector } from '../../src/lib/algorithms/tfidf';

describe('knnClassify', () => {
	it('returns nearest neighbor label when k=1', () => {
		const labeled: LabeledPoint[] = [
			{ vector: [[0, 1], [1, 0]], label: 'A' },   // [1, 0]
			{ vector: [[0, 0], [1, 1]], label: 'B' },   // [0, 1]
		];
		const target: SparseVector = [[0, 0.9], [1, 0.1]]; // close to A

		const result = knnClassify(target, labeled, 1);
		expect(result).not.toBeNull();
		expect(result!.label).toBe('A');
	});

	it('returns majority label among k neighbors', () => {
		const labeled: LabeledPoint[] = [
			{ vector: [[0, 1]], label: 'A' },
			{ vector: [[0, 0.9]], label: 'A' },
			{ vector: [[0, 0.8]], label: 'B' },
		];
		const target: SparseVector = [[0, 1]]; // identical to first A

		const result = knnClassify(target, labeled, 3);
		expect(result!.label).toBe('A');
	});

	it('breaks ties by highest average similarity', () => {
		// Two labels each with 1 vote, but label A has higher similarity
		const labeled: LabeledPoint[] = [
			{ vector: [[0, 1], [1, 0]], label: 'A' },   // very similar to target
			{ vector: [[0, 0], [1, 1]], label: 'B' },   // orthogonal to target
		];
		const target: SparseVector = [[0, 1], [1, 0.01]]; // very close to A

		const result = knnClassify(target, labeled, 2);
		expect(result!.label).toBe('A');
	});

	it('handles fewer labeled points than k', () => {
		const labeled: LabeledPoint[] = [
			{ vector: [[0, 1]], label: 'A' },
		];
		const target: SparseVector = [[0, 1]];

		const result = knnClassify(target, labeled, 10);
		expect(result!.label).toBe('A');
	});

	it('returns null for empty labeled set', () => {
		const target: SparseVector = [[0, 1]];
		const result = knnClassify(target, [], 3);
		expect(result).toBeNull();
	});

	it('returns confidence as average similarity of winning label neighbors', () => {
		const labeled: LabeledPoint[] = [
			{ vector: [[0, 1]], label: 'A' }, // similarity 1.0 to target
		];
		const target: SparseVector = [[0, 1]]; // identical

		const result = knnClassify(target, labeled, 1);
		expect(result!.confidence).toBeCloseTo(1.0, 5);
	});

	it('classifies correctly in a multi-class scenario', () => {
		// 3 classes in 2D space: A near (1,0), B near (0,1), C near (1,1)
		const labeled: LabeledPoint[] = [
			{ vector: [[0, 1], [1, 0.05]], label: 'A' },
			{ vector: [[0, 0.95], [1, 0.1]], label: 'A' },
			{ vector: [[0, 0.05], [1, 1]], label: 'B' },
			{ vector: [[0, 0.1], [1, 0.95]], label: 'B' },
			{ vector: [[0, 1], [1, 1]], label: 'C' },
			{ vector: [[0, 0.95], [1, 0.9]], label: 'C' },
		];

		// Target near (1, 0) → should be A
		const result = knnClassify([[0, 1], [1, 0]], labeled, 3);
		expect(result!.label).toBe('A');
	});
});
