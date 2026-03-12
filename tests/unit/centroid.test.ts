import { describe, expect, it } from "vitest";
import {
	buildCentroids,
	type Centroid,
	classifyCentroid,
} from "../../src/lib/algorithms/centroid";
import type { SparseVector } from "../../src/lib/algorithms/tfidf";

describe("buildCentroids", () => {
	it("returns empty array for empty input", () => {
		expect(buildCentroids([])).toEqual([]);
	});

	it("builds one centroid per label", () => {
		const labeled = [
			{ label: "A", vector: [[0, 1]] as SparseVector },
			{ label: "A", vector: [[0, 0.5]] as SparseVector },
			{ label: "B", vector: [[1, 1]] as SparseVector },
		];

		const centroids = buildCentroids(labeled);
		expect(centroids).toHaveLength(2);

		const a = centroids.find((c) => c.label === "A")!;
		const b = centroids.find((c) => c.label === "B")!;

		expect(a.count).toBe(2);
		expect(b.count).toBe(1);
	});

	it("normalizes centroids to unit length", () => {
		const labeled = [
			{
				label: "A",
				vector: [
					[0, 3],
					[1, 4],
				] as SparseVector,
			},
		];

		const centroids = buildCentroids(labeled);
		const c = centroids[0];

		// Mean = [3, 4], norm = 5, unit = [0.6, 0.8]
		let norm = 0;
		for (const [, val] of c.vector) {
			norm += val * val;
		}
		expect(Math.sqrt(norm)).toBeCloseTo(1.0, 10);
	});

	it("averages vectors within the same label", () => {
		const labeled = [
			{
				label: "A",
				vector: [
					[0, 1],
					[1, 0],
				] as SparseVector,
			},
			{
				label: "A",
				vector: [
					[0, 0],
					[1, 1],
				] as SparseVector,
			},
		];

		const centroids = buildCentroids(labeled);
		const c = centroids[0];
		// Mean = [0.5, 0.5], normalized to unit length
		const v0 = c.vector.get(0)!;
		const v1 = c.vector.get(1)!;
		expect(v0).toBeCloseTo(v1, 10);
	});
});

describe("classifyCentroid", () => {
	it("returns null for empty centroids", () => {
		const target: SparseVector = [[0, 1]];
		expect(classifyCentroid(target, [])).toBeNull();
	});

	it("returns the nearest centroid label", () => {
		const centroids: Centroid[] = [
			{ label: "A", vector: new Map([[0, 1]]), count: 1 },
			{ label: "B", vector: new Map([[1, 1]]), count: 1 },
		];

		// Target aligns with centroid A (index 0)
		const target: SparseVector = [[0, 1]];
		const result = classifyCentroid(target, centroids)!;

		expect(result.label).toBe("A");
		expect(result.confidence).toBeCloseTo(1.0, 5);
	});

	it("returns confidence as cosine similarity", () => {
		const centroids: Centroid[] = [
			{
				label: "A",
				vector: new Map([
					[0, 0.6],
					[1, 0.8],
				]),
				count: 1,
			},
		];

		// Unit vector [1, 0]
		const target: SparseVector = [[0, 1]];
		const result = classifyCentroid(target, centroids)!;

		expect(result.label).toBe("A");
		expect(result.confidence).toBeCloseTo(0.6, 5);
	});

	it("handles single centroid", () => {
		const centroids: Centroid[] = [
			{ label: "Only", vector: new Map([[0, 1]]), count: 5 },
		];
		const target: SparseVector = [[0, 0.5]];
		const result = classifyCentroid(target, centroids)!;

		expect(result.label).toBe("Only");
		expect(result.confidence).toBeCloseTo(0.5, 5);
	});
});
