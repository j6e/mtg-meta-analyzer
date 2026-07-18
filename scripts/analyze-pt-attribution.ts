/**
 * One-off: compare our classifier vs PT-staff (reported) labels for a single event.
 * Usage: bun run scripts/analyze-pt-attribution.ts data/modern/2026-07/melee-434455.json data/archetypes/modern.yaml
 */
import { readFileSync } from "node:fs";
import {
	classifyAllPooled,
	parseArchetypeYaml,
} from "../src/lib/algorithms/archetype-classifier";
import type { TournamentData } from "../src/lib/types/tournament";

const [jsonPath, yamlPath] = process.argv.slice(2);
const t: TournamentData = JSON.parse(readFileSync(jsonPath, "utf-8"));
const config = parseArchetypeYaml(readFileSync(yamlPath, "utf-8"));

const decklistMap = new Map([[t.meta.id, t.decklists]]);
const resultMap = classifyAllPooled(decklistMap, config.archetypes, {
	minConfidence: 0.4,
	nameEqualsCommander: config.nameEqualsCommander,
});
const results = resultMap.get(t.meta.id) ?? [];

// classified -> reported -> count
const byReported = new Map<string, Map<string, number>>(); // reported -> classified -> count
const byClassified = new Map<string, Map<string, number>>(); // classified -> reported -> count
const methodCount = new Map<string, number>();
let total = 0;

for (const r of results) {
	const d = t.decklists[r.decklistId];
	if (!d) continue;
	const reported = d.reportedArchetype?.trim() || "No Report";
	const classified = r.archetype;
	total++;
	methodCount.set(r.method, (methodCount.get(r.method) ?? 0) + 1);

	if (!byReported.has(reported)) byReported.set(reported, new Map());
	byReported
		.get(reported)!
		.set(classified, (byReported.get(reported)!.get(classified) ?? 0) + 1);
	if (!byClassified.has(classified)) byClassified.set(classified, new Map());
	byClassified
		.get(classified)!
		.set(reported, (byClassified.get(classified)!.get(reported) ?? 0) + 1);
}

const dominant = (m: Map<string, number>) =>
	[...m.entries()].sort((a, b) => b[1] - a[1])[0];
const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
const fmtPct = (n: number, d: number) => `${((100 * n) / d).toFixed(0)}%`;

console.log(`\n=== ${t.meta.name} ===`);
console.log(
	`Decks: ${total}  |  Methods: ${[...methodCount].map(([k, v]) => `${k}=${v}`).join("  ")}`,
);

const unknown = byClassified.get("Unknown");
console.log(
	`\nUnknown (we failed to classify): ${unknown ? sum(unknown) : 0}/${total} (${fmtPct(unknown ? sum(unknown) : 0, total)})`,
);

// --- PER TRUSTED LABEL: do we agree, split, or drop to Unknown? ---
console.log(
	`\n--- Per PT-staff label (trusted, sorted by size) → our classification ---`,
);
const reportedSorted = [...byReported.entries()].sort((a, b) => sum(b[1]) - sum(a[1]));
let cleanCount = 0;
for (const [reported, m] of reportedSorted) {
	const n = sum(m);
	const [domLabel, domN] = dominant(m);
	const purity = domN / n;
	const spread = [...m.entries()].sort((a, b) => b[1] - a[1]);
	const unk = m.get("Unknown") ?? 0;
	let flag = "  ok";
	if (domLabel === "Unknown")
		flag = "MISS"; // majority unclassified
	else if (unk / n >= 0.3)
		flag = "GAP "; // notable Unknown share
	else if (purity < 0.7) flag = "SPLT"; // spread across many of our labels
	if (flag === "  ok") cleanCount += n;
	const breakdown = spread.map(([k, v]) => `${k}:${v}`).join(", ");
	console.log(
		`[${flag}] ${reported} (${n})  →  ${domLabel} ${fmtPct(domN, n)}${flag !== "  ok" ? `  |  ${breakdown}` : ""}`,
	);
}

// --- PER OUR LABEL: are we collapsing distinct trusted labels into one bucket? ---
console.log(
	`\n--- Our labels absorbing MULTIPLE distinct PT-staff labels (collapsing) ---`,
);
const classifiedSorted = [...byClassified.entries()].sort(
	(a, b) => sum(b[1]) - sum(a[1]),
);
for (const [classified, m] of classifiedSorted) {
	if (classified === "Unknown") continue;
	const distinct = [...m.keys()].filter((k) => k !== "No Report");
	const [domLabel, domN] = dominant(m);
	const n = sum(m);
	// Collapsing = we assign one label but the staff meaningfully disagrees (dominant reported < 60% and >=2 distinct staff labels with >=2 decks)
	const bigOthers = [...m.entries()].filter(
		([k, v]) => k !== domLabel && k !== "No Report" && v >= 2,
	);
	if (distinct.length >= 2 && domN / n < 0.85 && bigOthers.length >= 1) {
		const breakdown = [...m.entries()]
			.sort((a, b) => b[1] - a[1])
			.map(([k, v]) => `${k}:${v}`)
			.join(", ");
		console.log(`[COLLAPSE?] ${classified} (${n}) ← ${breakdown}`);
	}
}

console.log(`\n=== Headline ===`);
console.log(
	`Clean agreement (dominant, low-Unknown, high-purity): ${cleanCount}/${total} (${fmtPct(cleanCount, total)})`,
);
