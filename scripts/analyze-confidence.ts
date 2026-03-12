/**
 * Analyze KNN confidence distributions and simulate centroid classification
 * to determine appropriate minConfidence thresholds.
 *
 * Usage: bun run scripts/analyze-confidence.ts
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
	classifyAllPooled,
	parseArchetypeYaml,
} from "../src/lib/algorithms/archetype-classifier";
import { buildCorpus, type SparseVector, vectorize } from "../src/lib/algorithms/tfidf";
import type {
	TournamentData,
	TournamentImportance,
	TournamentIndexEntry,
} from "../src/lib/types/tournament";
import { importanceRank } from "../src/lib/types/tournament";

// ---------------------------------------------------------------------------
// Data loading (same as bench-classifier.ts)
// ---------------------------------------------------------------------------

const DATA_DIR = join(import.meta.dir, "..", "data");

function loadAllTournaments(format: string): TournamentData[] {
	const formatDir = join(DATA_DIR, format);
	const tournaments: TournamentData[] = [];
	for (const entry of readdirSync(formatDir)) {
		if (entry === "index.json") continue;
		const subdir = join(formatDir, entry);
		if (!statSync(subdir).isDirectory()) continue;
		for (const file of readdirSync(subdir)) {
			if (!file.endsWith(".json")) continue;
			const data: TournamentData = JSON.parse(
				readFileSync(join(subdir, file), "utf-8"),
			);
			tournaments.push(data);
		}
	}
	return tournaments;
}

function loadIndex(format: string): TournamentIndexEntry[] {
	return JSON.parse(readFileSync(join(DATA_DIR, format, "index.json"), "utf-8"));
}

function filterTournaments(
	tournaments: TournamentData[],
	index: TournamentIndexEntry[],
	dateFrom: string,
	dateTo: string,
	minTier: TournamentImportance,
): TournamentData[] {
	const indexById = new Map(index.map((e) => [e.id, e]));
	const minRank = importanceRank(minTier);
	return tournaments.filter((t) => {
		if (!t.meta.formats.includes("Standard")) return false;
		if (dateFrom && t.meta.date < dateFrom) return false;
		if (dateTo && t.meta.date > dateTo) return false;
		if (minRank > 0) {
			const entry = indexById.get(t.meta.id);
			if (importanceRank(entry?.importance ?? "other") < minRank) return false;
		}
		return true;
	});
}

// ---------------------------------------------------------------------------
// Centroid helpers
// ---------------------------------------------------------------------------

interface Centroid {
	label: string;
	vector: Map<number, number>; // dense-ish map for dot product
	count: number;
}

function buildCentroids(
	labeledVectors: { label: string; vector: SparseVector }[],
): Centroid[] {
	// Accumulate sums per archetype
	const sums = new Map<string, { values: Map<number, number>; count: number }>();
	for (const { label, vector } of labeledVectors) {
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

	// Compute mean and normalize
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

function classifyWithCentroid(
	target: SparseVector,
	centroids: Centroid[],
): { label: string; confidence: number } {
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log("Loading data...");
const allTournaments = loadAllTournaments("standard");
const index = loadIndex("standard");
const yamlContent = readFileSync(
	join(DATA_DIR, "archetypes", "standard.yaml"),
	"utf-8",
);
const config = parseArchetypeYaml(yamlContent);

const filtered = filterTournaments(
	allTournaments,
	index,
	"2026-02-09",
	"2026-03-11",
	"premier",
);
console.log(`Tournaments: ${filtered.length}`);

// Run current centroid classification (with minConfidence = 0 to see all results)
const tournamentDecklists = new Map(filtered.map((t) => [t.meta.id, t.decklists]));
const centroidPipelineResults = classifyAllPooled(
	tournamentDecklists,
	config.archetypes,
	{
		minConfidence: 0, // capture everything
		nameEqualsCommander: config.nameEqualsCommander,
	},
);

// Collect centroid confidence values
const centroidPipelineConfidences: {
	archetype: string;
	confidence: number;
	method: string;
}[] = [];
for (const results of centroidPipelineResults.values()) {
	for (const r of results) {
		if (r.method === "centroid" || r.method === "unknown") {
			centroidPipelineConfidences.push({
				archetype: r.archetype,
				confidence: r.confidence,
				method: r.method,
			});
		}
	}
}

// Now simulate centroid classification on the same unclassified decks
// First, reproduce the classification pipeline to get labeled/unclassified split
const { classifyBySignatureCards } = await import(
	"../src/lib/algorithms/archetype-classifier"
);

import type { CardEntry } from "../src/lib/types/decklist";

const allDecklists = new Map<string, { mainboard: CardEntry[]; label?: string }>();
const classifiedIds: { id: string; label: string }[] = [];
const unclassifiedIds: string[] = [];

for (const t of filtered) {
	for (const [id, dl] of Object.entries(t.decklists)) {
		const archetype = classifyBySignatureCards(
			dl.mainboard,
			dl.commanders,
			config.archetypes,
		);
		allDecklists.set(id, { mainboard: dl.mainboard });
		if (archetype) {
			classifiedIds.push({ id, label: archetype });
		} else {
			unclassifiedIds.push(id);
		}
	}
}

// Build corpus and vectorize
const allMainboards = [...allDecklists.values()].map((d) => d.mainboard);
const corpus = buildCorpus(allMainboards);

const strictArchetypes = new Set(
	config.archetypes.filter((d) => d.strictMode).map((d) => d.name),
);
const labeledVectors: { label: string; vector: SparseVector }[] = [];
for (const { id, label } of classifiedIds) {
	if (strictArchetypes.has(label)) continue;
	const dl = allDecklists.get(id)!;
	labeledVectors.push({ label, vector: vectorize(dl.mainboard, corpus) });
}

const centroids = buildCentroids(labeledVectors);

// Classify unclassified decks with centroid
const centroidConfidences: { label: string; confidence: number }[] = [];
for (const id of unclassifiedIds) {
	const dl = allDecklists.get(id)!;
	const vector = vectorize(dl.mainboard, corpus);
	const result = classifyWithCentroid(vector, centroids);
	centroidConfidences.push(result);
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

function percentiles(values: number[]): string {
	const sorted = [...values].sort((a, b) => a - b);
	const p = (pct: number) => sorted[Math.floor((pct / 100) * (sorted.length - 1))];
	return `min=${p(0).toFixed(3)} p5=${p(5).toFixed(3)} p25=${p(25).toFixed(3)} p50=${p(50).toFixed(3)} p75=${p(75).toFixed(3)} p95=${p(95).toFixed(3)} max=${p(100).toFixed(3)}`;
}

console.log(
	`\n## Pipeline Confidence Distribution (${centroidPipelineConfidences.length} unclassified decks)\n`,
);
console.log(
	`All: ${percentiles(centroidPipelineConfidences.map((c) => c.confidence))}`,
);

const pipelineClassified = centroidPipelineConfidences.filter(
	(c) => c.method === "centroid",
);
const pipelineUnknown = centroidPipelineConfidences.filter(
	(c) => c.method === "unknown",
);
console.log(
	`Classified (method=centroid, ${pipelineClassified.length}): ${percentiles(pipelineClassified.map((c) => c.confidence))}`,
);
if (pipelineUnknown.length > 0) {
	console.log(
		`Unknown (${pipelineUnknown.length}): ${percentiles(pipelineUnknown.map((c) => c.confidence))}`,
	);
}

console.log(
	`\n## Local Centroid Confidence Distribution (${centroidConfidences.length} unclassified decks)\n`,
);
console.log(`All: ${percentiles(centroidConfidences.map((c) => c.confidence))}`);

// Agreement analysis
console.log(`\n## Pipeline vs Local Centroid Agreement\n`);
// Match them up by index (same unclassified deck order)
const pipelineByMethod = centroidPipelineConfidences.filter(
	(c) => c.method === "centroid" || c.method === "unknown",
);
let agree = 0;
let disagree = 0;
const disagreements: {
	deckId: string;
	pipeline: string;
	local: string;
	pipelineConf: number;
	localConf: number;
}[] = [];

for (
	let i = 0;
	i < Math.min(pipelineByMethod.length, centroidConfidences.length);
	i++
) {
	const pipelineLabel =
		pipelineByMethod[i].archetype === "Unknown"
			? "Unknown"
			: pipelineByMethod[i].archetype;
	const localLabel = centroidConfidences[i].label;
	if (pipelineLabel === localLabel) {
		agree++;
	} else {
		disagree++;
		if (disagreements.length < 20) {
			disagreements.push({
				deckId: unclassifiedIds[i],
				pipeline: pipelineLabel,
				local: localLabel,
				pipelineConf: pipelineByMethod[i].confidence,
				localConf: centroidConfidences[i].confidence,
			});
		}
	}
}

console.log(
	`Agree: ${agree}/${agree + disagree} (${((agree / (agree + disagree)) * 100).toFixed(1)}%)`,
);
console.log(`Disagree: ${disagree}`);

if (disagreements.length > 0) {
	console.log(`\nSample disagreements:`);
	console.log(
		"| Deck ID | Pipeline Label | Pipeline Conf | Local Label | Local Conf |",
	);
	console.log("|---|---|---:|---|---:|");
	for (const d of disagreements) {
		console.log(
			`| ${d.deckId} | ${d.pipeline} | ${d.pipelineConf.toFixed(3)} | ${d.local} | ${d.localConf.toFixed(3)} |`,
		);
	}
}

// Threshold analysis
console.log(`\n## Threshold Analysis (centroid)\n`);
console.log("| Threshold | Classified | Unknown | % Classified |");
console.log("|---:|---:|---:|---:|");
for (const threshold of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]) {
	const classified = centroidConfidences.filter(
		(c) => c.confidence >= threshold,
	).length;
	const unknown = centroidConfidences.length - classified;
	const pct = ((classified / centroidConfidences.length) * 100).toFixed(1);
	console.log(`| ${threshold} | ${classified} | ${unknown} | ${pct}% |`);
}
