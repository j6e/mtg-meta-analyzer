/**
 * Demo: run archetype classifier against real tournament data.
 * Usage: bun run scripts/demo-classifier.ts
 */
import { readFileSync } from "node:fs";
import {
	classifyAll,
	parseArchetypeYaml,
} from "../src/lib/algorithms/archetype-classifier";
import type { TournamentData } from "../src/lib/types/tournament";

const data: TournamentData = JSON.parse(
	readFileSync("data/tournaments/392401.json", "utf-8"),
);
const yaml = readFileSync("data/archetypes/standard.yaml", "utf-8");
const { archetypes: archetypeDefs, nameEqualsCommander } = parseArchetypeYaml(yaml);

console.log(`Tournament: ${data.meta.name}`);
console.log(`Decklists: ${Object.keys(data.decklists).length}`);
console.log(`Archetypes defined: ${archetypeDefs.map((a) => a.name).join(", ")}`);
console.log();

const results = classifyAll(data.decklists, archetypeDefs, {
	nameEqualsCommander,
	minConfidence: 0.4,
});

// Summarize by archetype
const summary: Record<string, { signature: number; centroid: number; total: number }> =
	{};
for (const r of results) {
	if (!summary[r.archetype])
		summary[r.archetype] = { signature: 0, centroid: 0, total: 0 };
	summary[r.archetype].total++;
	if (r.method === "signature") summary[r.archetype].signature++;
	if (r.method === "centroid") summary[r.archetype].centroid++;
}

const sorted = Object.entries(summary).sort((a, b) => b[1].total - a[1].total);
console.log("=== Classification Results ===");
console.log(
	`${"Archetype".padEnd(25)} ${"Total".padStart(6)} ${"Sig".padStart(5)} ${"Cent".padStart(5)} ${"Share".padStart(7)}`,
);
console.log("-".repeat(50));
for (const [name, counts] of sorted) {
	const share = ((counts.total / results.length) * 100).toFixed(1);
	console.log(
		`${name.padEnd(25)} ${String(counts.total).padStart(6)} ${String(counts.signature).padStart(5)} ${String(counts.centroid).padStart(5)} ${(`${share}%`).padStart(7)}`,
	);
}
console.log("-".repeat(50));
console.log(`${"TOTAL".padEnd(25)} ${String(results.length).padStart(6)}`);

// Show a few centroid classification examples
console.log("\n=== Sample Centroid Classifications ===");
const centroidResults = results.filter((r) => r.method === "centroid").slice(0, 10);
for (const r of centroidResults) {
	const deck = data.decklists[r.decklistId];
	const topCards = deck.mainboard
		.sort((a, b) => b.quantity - a.quantity)
		.filter(
			(c) => !["Plains", "Island", "Swamp", "Mountain", "Forest"].includes(c.cardName),
		)
		.slice(0, 5)
		.map((c) => `${c.quantity}x ${c.cardName}`)
		.join(", ");
	console.log(`  ${r.archetype} (conf=${r.confidence.toFixed(3)}) — ${topCards}`);
}
