import type { SparseVector } from './tfidf';
import { cosineSimilaritySparse } from './cosine-similarity';

export interface LabeledPoint {
	vector: SparseVector;
	label: string;
}

export interface ClassificationResult {
	label: string;
	confidence: number; // average similarity of k nearest neighbors with winning label
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

	// Compute similarity to all labeled points
	const similarities = labeled.map((point) => ({
		label: point.label,
		similarity: cosineSimilaritySparse(target, point.vector),
	}));

	// Sort by descending similarity
	similarities.sort((a, b) => b.similarity - a.similarity);

	// Take top k
	const neighbors = similarities.slice(0, effectiveK);

	// Count votes and track total similarity per label
	const votes = new Map<string, { count: number; totalSimilarity: number }>();
	for (const n of neighbors) {
		const existing = votes.get(n.label) ?? { count: 0, totalSimilarity: 0 };
		existing.count++;
		existing.totalSimilarity += n.similarity;
		votes.set(n.label, existing);
	}

	// Find label with most votes, breaking ties by average similarity
	let bestLabel = '';
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

	return { label: bestLabel, confidence: bestAvgSim };
}
