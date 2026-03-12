import type { LabeledPoint } from "./knn";
import type { SparseVector } from "./tfidf";

export interface Centroid {
	label: string;
	vector: Map<number, number>;
	count: number;
}

/**
 * Build one centroid per archetype label by averaging all labeled vectors
 * in each group and normalizing to unit length.
 */
export function buildCentroids(labeled: LabeledPoint[]): Centroid[] {
	const sums = new Map<string, { values: Map<number, number>; count: number }>();
	for (const { label, vector } of labeled) {
		let entry = sums.get(label);
		if (!entry) {
			entry = { values: new Map(), count: 0 };
			sums.set(label, entry);
		}
		entry.count++;
		for (const [idx, val] of vector) {
			entry.values.set(idx, (entry.values.get(idx) ?? 0) + val);
		}
	}

	const centroids: Centroid[] = [];
	for (const [label, { values, count }] of sums) {
		let norm = 0;
		for (const [idx, val] of values) {
			const mean = val / count;
			values.set(idx, mean);
			norm += mean * mean;
		}
		norm = Math.sqrt(norm);
		if (norm > 0) {
			for (const [idx, val] of values) {
				values.set(idx, val / norm);
			}
		}
		centroids.push({ label, vector: values, count });
	}

	return centroids;
}

/**
 * Classify a target vector by nearest centroid (cosine similarity).
 * Both target and centroid vectors must be unit-length normalized.
 *
 * Returns null if there are no centroids.
 */
export function classifyCentroid(
	target: SparseVector,
	centroids: Centroid[],
): { label: string; confidence: number } | null {
	if (centroids.length === 0) return null;

	const targetMap = new Map<number, number>();
	for (const [idx, val] of target) targetMap.set(idx, val);

	let bestLabel = "";
	let bestSim = -1;
	for (const c of centroids) {
		let dot = 0;
		for (const [idx, val] of c.vector) {
			const other = targetMap.get(idx);
			if (other !== undefined) dot += val * other;
		}
		if (dot > bestSim) {
			bestSim = dot;
			bestLabel = c.label;
		}
	}

	return { label: bestLabel, confidence: bestSim };
}
