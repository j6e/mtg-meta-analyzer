/**
 * Analyze copy-count variance across decklists for a given archetype.
 * Outputs the distribution of "dominant frequency" to help choose a
 * good auto-include threshold for the auto-scan pre-filter.
 *
 * Usage: bun scripts/analyze-variance.ts
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { classifyAll } from "../src/lib/algorithms/archetype-classifier";
import type { ArchetypeDefinition } from "../src/lib/types/archetype";
import type { TournamentData } from "../src/lib/types/tournament";

// Load tournaments
const tournamentsDir = join(import.meta.dir, "..", "data", "tournaments");
const tournaments: TournamentData[] = [];
for (const file of readdirSync(tournamentsDir)) {
	if (!file.endsWith(".json")) continue;
	const data = JSON.parse(readFileSync(join(tournamentsDir, file), "utf-8"));
	tournaments.push(data);
}

// Load archetype definitions
const yamlContent = readFileSync(
	join(import.meta.dir, "..", "data", "archetypes", "standard.yaml"),
	"utf-8",
);
const parsed = parseYaml(yamlContent) as { archetypes: ArchetypeDefinition[] };
const archetypeDefs = parsed.archetypes;

// Classify players across all tournaments
const playerArchetypes = new Map<string, string>();
for (const t of tournaments) {
	const results = classifyAll(t.decklists, archetypeDefs, {
		minConfidence: 0.4,
	});
	for (const r of results) {
		const playerId = t.decklists[r.decklistId]?.playerId;
		if (playerId && r.archetype !== "Unknown") {
			playerArchetypes.set(playerId, r.archetype);
		}
	}
}

// Count archetypes
const archetypeCounts = new Map<string, number>();
for (const arch of playerArchetypes.values()) {
	archetypeCounts.set(arch, (archetypeCounts.get(arch) ?? 0) + 1);
}

// Pick the largest archetype for analysis
const sortedArchetypes = [...archetypeCounts.entries()].sort((a, b) => b[1] - a[1]);
console.log("=== Archetype sizes ===");
for (const [name, count] of sortedArchetypes.slice(0, 10)) {
	console.log(`  ${name}: ${count} players`);
}

// Analyze the top 3 archetypes
const BASIC_LANDS = new Set([
	"Plains",
	"Island",
	"Swamp",
	"Mountain",
	"Forest",
	"Snow-Covered Plains",
	"Snow-Covered Island",
	"Snow-Covered Swamp",
	"Snow-Covered Mountain",
	"Snow-Covered Forest",
	"Wastes",
]);

for (const [archetypeName, playerCount] of sortedArchetypes.slice(0, 3)) {
	console.log(`\n=== ${archetypeName} (${playerCount} players) ===`);

	// Build player → card counts (same as countCardCopies but for all cards)
	const playerCards = new Map<string, Map<string, number>>();
	for (const t of tournaments) {
		for (const [_dlId, dl] of Object.entries(t.decklists)) {
			const playerId = dl.playerId;
			if (playerArchetypes.get(playerId) !== archetypeName) continue;

			const counts = new Map<string, number>();
			for (const entry of dl.mainboard) {
				counts.set(entry.cardName, (counts.get(entry.cardName) ?? 0) + entry.quantity);
			}
			for (const entry of dl.sideboard) {
				counts.set(entry.cardName, (counts.get(entry.cardName) ?? 0) + entry.quantity);
			}

			const existing = playerCards.get(playerId);
			if (!existing) {
				playerCards.set(playerId, counts);
			} else {
				for (const [card, qty] of counts) {
					existing.set(card, Math.max(existing.get(card) ?? 0, qty));
				}
			}
		}
	}

	// For each card, compute the dominant frequency (max % of players with same count)
	const allCards = new Set<string>();
	for (const counts of playerCards.values()) {
		for (const card of counts.keys()) allCards.add(card);
	}

	const n = playerCards.size;
	const cardStats: {
		card: string;
		dominantFreq: number;
		dominantCount: number;
		uniqueCounts: number;
		isBasicLand: boolean;
	}[] = [];

	for (const card of allCards) {
		const countFreq = new Map<number, number>();
		// Include players who don't have the card (count = 0)
		let _withCard = 0;
		for (const [, counts] of playerCards) {
			const qty = counts.get(card) ?? 0;
			countFreq.set(qty, (countFreq.get(qty) ?? 0) + 1);
			if (qty > 0) _withCard++;
		}

		let maxFreq = 0;
		let dominantCount = 0;
		for (const [count, freq] of countFreq) {
			if (freq > maxFreq) {
				maxFreq = freq;
				dominantCount = count;
			}
		}

		cardStats.push({
			card,
			dominantFreq: maxFreq / n,
			dominantCount,
			uniqueCounts: countFreq.size,
			isBasicLand: BASIC_LANDS.has(card),
		});
	}

	// Distribution of dominant frequency
	const buckets = [0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 1.0];
	console.log(
		"\nDominant frequency distribution (% of players with most common count):",
	);
	let prev = 0;
	for (const threshold of buckets) {
		const count = cardStats.filter(
			(c) => c.dominantFreq > prev && c.dominantFreq <= threshold,
		).length;
		const basics = cardStats.filter(
			(c) => c.dominantFreq > prev && c.dominantFreq <= threshold && c.isBasicLand,
		).length;
		console.log(
			`  ${(prev * 100).toFixed(0)}%-${(threshold * 100).toFixed(0)}%: ${count} cards (${basics} basic lands)`,
		);
		prev = threshold;
	}

	const total = cardStats.length;
	const _totalBasics = cardStats.filter((c) => c.isBasicLand).length;

	// How many cards would be filtered at each threshold
	console.log("\nCards filtered at each threshold:");
	for (const t of [0.8, 0.85, 0.9, 0.95]) {
		const filtered = cardStats.filter((c) => c.dominantFreq >= t);
		const remaining = total - filtered.length;
		const filteredBasics = filtered.filter((c) => c.isBasicLand).length;
		console.log(
			`  >=${(t * 100).toFixed(0)}%: ${filtered.length}/${total} filtered (${filteredBasics} basics), ${remaining} remaining for testing`,
		);
	}

	// Show some examples near the 90% boundary
	console.log("\nCards with dominant freq 85%-95% (near boundary):");
	const boundary = cardStats
		.filter((c) => c.dominantFreq >= 0.85 && c.dominantFreq < 0.95)
		.sort((a, b) => a.dominantFreq - b.dominantFreq);
	for (const c of boundary.slice(0, 15)) {
		console.log(
			`  ${c.card}: ${(c.dominantFreq * 100).toFixed(1)}% at ${c.dominantCount} copies, ${c.uniqueCounts} unique counts${c.isBasicLand ? " [BASIC]" : ""}`,
		);
	}

	// Show the most variable cards (lowest dominant freq)
	console.log("\nMost variable cards (lowest dominant freq):");
	const variable = cardStats
		.filter((c) => !c.isBasicLand)
		.sort((a, b) => a.dominantFreq - b.dominantFreq);
	for (const c of variable.slice(0, 10)) {
		console.log(
			`  ${c.card}: ${(c.dominantFreq * 100).toFixed(1)}% at ${c.dominantCount} copies, ${c.uniqueCounts} unique counts`,
		);
	}
}
