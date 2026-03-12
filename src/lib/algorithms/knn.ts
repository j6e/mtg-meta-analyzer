import type { SparseVector } from "./tfidf";

export interface LabeledPoint {
	vector: SparseVector;
	label: string;
}

export interface ClassificationResult {
	label: string;
	confidence: number; // average similarity of k nearest neighbors with winning label
	neighbors: { label: string; similarity: number }[];
}

/**
 * Dot product of a pre-built target map against a sparse vector.
 * Both vectors must be unit-length (pre-normalized) for this to equal cosine similarity.
 */
function dotWithMap(targetMap: Map<number, number>, b: SparseVector): number {
	let dot = 0;
	for (const [idx, val] of b) {
		const other = targetMap.get(idx);
		if (other !== undefined) {
			dot += val * other;
		}
	}
	return dot;
}

/**
 * Classify a target vector using K-Nearest Neighbors with cosine similarity.
 *
 * Returns the majority label among the k nearest neighbors.
 * Ties are broken by selecting the label with the highest average similarity.
 *
 * Returns null if there are no labeled points.
 */
export function knnClassify(
	target: SparseVector,
	labeled: LabeledPoint[],
	k: number,
): ClassificationResult | null {
	if (labeled.length === 0) return null;

	const effectiveK = Math.min(k, labeled.length);

	// Build target map once, reuse for all labeled point comparisons
	const targetMap = new Map<number, number>();
	for (const [idx, val] of target) {
		targetMap.set(idx, val);
	}

	// Min-heap of size k: maintains the k highest similarities.
	// Each entry is [similarity, index into labeled[]].
	// heap[0] is always the smallest similarity in the heap.
	const heap: [number, number][] = [];

	for (let i = 0; i < labeled.length; i++) {
		const sim = dotWithMap(targetMap, labeled[i].vector);

		if (heap.length < effectiveK) {
			heap.push([sim, i]);
			// Bubble up
			let ci = heap.length - 1;
			while (ci > 0) {
				const pi = (ci - 1) >> 1;
				if (heap[ci][0] < heap[pi][0]) {
					[heap[ci], heap[pi]] = [heap[pi], heap[ci]];
					ci = pi;
				} else break;
			}
		} else if (sim > heap[0][0]) {
			// Replace the smallest element and sift down
			heap[0] = [sim, i];
			let pi = 0;
			while (true) {
				let smallest = pi;
				const li = 2 * pi + 1;
				const ri = 2 * pi + 2;
				if (li < effectiveK && heap[li][0] < heap[smallest][0]) smallest = li;
				if (ri < effectiveK && heap[ri][0] < heap[smallest][0]) smallest = ri;
				if (smallest === pi) break;
				[heap[pi], heap[smallest]] = [heap[smallest], heap[pi]];
				pi = smallest;
			}
		}
	}

	// Extract neighbors from heap
	const neighbors = heap.map(([sim, idx]) => ({
		label: labeled[idx].label,
		similarity: sim,
	}));

	// Count votes and track total similarity per label
	const votes = new Map<string, { count: number; totalSimilarity: number }>();
	for (const n of neighbors) {
		const existing = votes.get(n.label) ?? { count: 0, totalSimilarity: 0 };
		existing.count++;
		existing.totalSimilarity += n.similarity;
		votes.set(n.label, existing);
	}

	// Find label with most votes, breaking ties by average similarity
	let bestLabel = "";
	let bestCount = 0;
	let bestAvgSim = 0;

	for (const [label, { count, totalSimilarity }] of votes) {
		const avgSim = totalSimilarity / count;
		if (count > bestCount || (count === bestCount && avgSim > bestAvgSim)) {
			bestLabel = label;
			bestCount = count;
			bestAvgSim = avgSim;
		}
	}

	return { label: bestLabel, confidence: bestAvgSim, neighbors };
}
