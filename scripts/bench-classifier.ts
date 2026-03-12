/**
 * Benchmark: measure classifyAllPooled performance across different dataset sizes.
 *
 * Usage: bun run scripts/bench-classifier.ts [iterations]
 *   iterations — number of runs per scenario (default: 10)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
	classifyAllPooled,
	parseArchetypeYaml,
} from "../src/lib/algorithms/archetype-classifier";
import type { DecklistInfo } from "../src/lib/types/decklist";
import type {
	TournamentData,
	TournamentImportance,
	TournamentIndexEntry,
} from "../src/lib/types/tournament";
import { importanceRank } from "../src/lib/types/tournament";

// ---------------------------------------------------------------------------
// Data loading (replaces Vite import.meta.glob)
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
	const indexPath = join(DATA_DIR, format, "index.json");
	return JSON.parse(readFileSync(indexPath, "utf-8")) as TournamentIndexEntry[];
}

// ---------------------------------------------------------------------------
// Filtering (mirrors src/lib/stores/url-settings.ts eligibleIds)
// ---------------------------------------------------------------------------

interface Scenario {
	label: string;
	format: string;
	dateFrom: string;
	dateTo: string;
	minTier: TournamentImportance;
}

function filterTournaments(
	tournaments: TournamentData[],
	index: TournamentIndexEntry[],
	scenario: Scenario,
): TournamentData[] {
	const indexById = new Map(index.map((e) => [e.id, e]));
	const minRank = importanceRank(scenario.minTier);

	return tournaments.filter((t) => {
		if (!t.meta.formats.includes(scenario.format)) return false;
		if (scenario.dateFrom && t.meta.date < scenario.dateFrom) return false;
		if (scenario.dateTo && t.meta.date > scenario.dateTo) return false;
		if (minRank > 0) {
			const entry = indexById.get(t.meta.id);
			const rank = importanceRank(entry?.importance ?? "other");
			if (rank < minRank) return false;
		}
		return true;
	});
}

// ---------------------------------------------------------------------------
// Benchmark runner
// ---------------------------------------------------------------------------

function buildDecklistMap(
	tournaments: TournamentData[],
): Map<string, Record<string, DecklistInfo>> {
	return new Map(tournaments.map((t) => [t.meta.id, t.decklists]));
}

function runBenchmark(
	tournaments: TournamentData[],
	archetypeDefs: ReturnType<typeof parseArchetypeYaml>,
	iterations: number,
): { mean: number; stdDev: number; min: number; max: number } {
	const decklistMap = buildDecklistMap(tournaments);
	const times: number[] = [];

	for (let i = 0; i < iterations; i++) {
		const start = performance.now();
		classifyAllPooled(decklistMap, archetypeDefs.archetypes, {
			minConfidence: 0.4,
			nameEqualsCommander: archetypeDefs.nameEqualsCommander,
		});
		times.push(performance.now() - start);
	}

	const mean = times.reduce((a, b) => a + b, 0) / times.length;
	const variance = times.reduce((sum, t) => sum + (t - mean) ** 2, 0) / times.length;
	const stdDev = Math.sqrt(variance);
	const min = Math.min(...times);
	const max = Math.max(...times);

	return { mean, stdDev, min, max };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const iterations = Number(process.argv[2]) || 5;

const scenarios: Scenario[] = [
	{
		label: "Standard, Feb 09 → Mar 11, Premier",
		format: "Standard",
		dateFrom: "2026-02-09",
		dateTo: "2026-03-11",
		minTier: "premier",
	},
	{
		label: "Standard, Feb 09 → Mar 11, All",
		format: "Standard",
		dateFrom: "2026-02-09",
		dateTo: "2026-03-11",
		minTier: "other",
	},
	{
		label: "Standard, Jan 01 → Mar 11, Premier",
		format: "Standard",
		dateFrom: "2026-01-01",
		dateTo: "2026-03-11",
		minTier: "premier",
	},
];

// Load data once
console.log("Loading tournament data...");
const allTournaments = loadAllTournaments("standard");
const index = loadIndex("standard");
const yamlContent = readFileSync(
	join(DATA_DIR, "archetypes", "standard.yaml"),
	"utf-8",
);
const archetypeConfig = parseArchetypeYaml(yamlContent);

console.log(
	`Loaded ${allTournaments.length} tournaments, ${archetypeConfig.archetypes.length} archetype definitions`,
);
console.log(`Running ${iterations} iterations per scenario\n`);

// Run benchmarks and collect results
const results: {
	label: string;
	tournaments: number;
	decklists: number;
	mean: number;
	stdDev: number;
	min: number;
	max: number;
}[] = [];

for (const scenario of scenarios) {
	const filtered = filterTournaments(allTournaments, index, scenario);
	const totalDecklists = filtered.reduce(
		(sum, t) => sum + Object.keys(t.decklists).length,
		0,
	);

	process.stdout.write(`Benchmarking: ${scenario.label} ... `);
	const result = runBenchmark(filtered, archetypeConfig, iterations);
	console.log(`${result.mean.toFixed(1)}ms ± ${result.stdDev.toFixed(1)}ms`);

	results.push({
		label: scenario.label,
		tournaments: filtered.length,
		decklists: totalDecklists,
		...result,
	});
}

// Pretty-print markdown table
console.log("\n## Classification Benchmark Results\n");
console.log(
	"| Scenario | Tournaments | Decklists | Mean (ms) | Std Dev (ms) | Min (ms) | Max (ms) |",
);
console.log("|---|---:|---:|---:|---:|---:|---:|");
for (const r of results) {
	console.log(
		`| ${r.label} | ${r.tournaments} | ${r.decklists} | ${r.mean.toFixed(1)} | ${r.stdDev.toFixed(1)} | ${r.min.toFixed(1)} | ${r.max.toFixed(1)} |`,
	);
}
