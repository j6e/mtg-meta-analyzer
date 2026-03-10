/**
 * Draft archetype definitions from tournament data.
 *
 * Groups decklists by reported archetype, keeps archetypes with >= N copies (default 8),
 * and picks the 3 most "signature" mainboard cards for each archetype.
 *
 * Usage:
 *   bun run scripts/draft-archetypes.ts <format> [--min-copies N]
 *
 * Example:
 *   bun run scripts/draft-archetypes.ts pauper
 *   bun run scripts/draft-archetypes.ts pauper --min-copies 5
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface DeckEntry {
	cardName: string;
	quantity: number;
}

interface Decklist {
	playerId: string;
	mainboard: DeckEntry[];
	sideboard: DeckEntry[];
}

interface Player {
	name: string;
	rank: number;
	decklistIds: string[];
	reportedArchetypes: string[];
}

interface TournamentData {
	meta: { name: string; date: string; playerCount: number };
	players: Record<string, Player>;
	decklists: Record<string, Decklist>;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const format = args.find((a) => !a.startsWith("--"));
const minCopiesFlag = args.indexOf("--min-copies");
const MIN_COPIES = minCopiesFlag >= 0 ? Number(args[minCopiesFlag + 1]) : 8;

if (!format) {
	console.error("Usage: bun run scripts/draft-archetypes.ts <format> [--min-copies N]");
	process.exit(1);
}

// ---------------------------------------------------------------------------
// Load all tournament JSON files for the format
// ---------------------------------------------------------------------------
const formatDir = join("data", format);
if (!existsSync(formatDir)) {
	console.error(`No data directory found: ${formatDir}`);
	process.exit(1);
}

const tournaments: TournamentData[] = [];
for (const entry of readdirSync(formatDir, { withFileTypes: true })) {
	if (!entry.isDirectory()) continue;
	const monthDir = join(formatDir, entry.name);
	for (const file of readdirSync(monthDir)) {
		if (!file.endsWith(".json")) continue;
		const data = JSON.parse(readFileSync(join(monthDir, file), "utf-8"));
		tournaments.push(data);
	}
}

console.log(`Loaded ${tournaments.length} tournaments for format "${format}"`);

// ---------------------------------------------------------------------------
// Group decklists by reported archetype
// ---------------------------------------------------------------------------
interface ArchetypeGroup {
	name: string;
	decklists: { mainboard: Map<string, number> }[];
}

const groups = new Map<string, ArchetypeGroup>();

for (const t of tournaments) {
	for (const [_pid, player] of Object.entries(t.players)) {
		const archName = player.reportedArchetypes?.[0];
		if (!archName) continue;

		for (const deckId of player.decklistIds) {
			const deck = t.decklists[deckId];
			if (!deck) continue;

			const cardMap = new Map<string, number>();
			for (const c of deck.mainboard) {
				cardMap.set(c.cardName, (cardMap.get(c.cardName) ?? 0) + c.quantity);
			}

			if (!groups.has(archName)) {
				groups.set(archName, { name: archName, decklists: [] });
			}
			groups.get(archName)!.decklists.push({ mainboard: cardMap });
		}
	}
}

// ---------------------------------------------------------------------------
// Filter to archetypes with >= MIN_COPIES decklists
// ---------------------------------------------------------------------------
const qualified = [...groups.values()]
	.filter((g) => g.decklists.length >= MIN_COPIES)
	.sort((a, b) => b.decklists.length - a.decklists.length);

console.log(
	`\nArchetypes with >= ${MIN_COPIES} decklists: ${qualified.length} (of ${groups.size} total)\n`,
);

// ---------------------------------------------------------------------------
// For each archetype, find the 3 most "signature" cards.
//
// Signature score = frequency (% of decks running it) × avg copies when present.
// We exclude basic lands from consideration.
// ---------------------------------------------------------------------------
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
]);

interface CardStats {
	name: string;
	frequency: number; // 0-1
	avgCopies: number; // when present
	score: number;
}

function pickSignatureCards(group: ArchetypeGroup, topN: number): CardStats[] {
	const totalDecks = group.decklists.length;
	const cardAgg = new Map<string, { count: number; totalQty: number }>();

	for (const deck of group.decklists) {
		for (const [card, qty] of deck.mainboard) {
			if (BASIC_LANDS.has(card)) continue;
			const agg = cardAgg.get(card) ?? { count: 0, totalQty: 0 };
			agg.count++;
			agg.totalQty += qty;
			cardAgg.set(card, agg);
		}
	}

	const stats: CardStats[] = [];
	for (const [name, agg] of cardAgg) {
		const frequency = agg.count / totalDecks;
		const avgCopies = agg.totalQty / agg.count;
		// Score: high frequency + high copy count = very signature
		stats.push({ name, frequency, avgCopies, score: frequency * avgCopies });
	}

	// Sort by score descending, then deduplicate "obvious" overlaps
	stats.sort((a, b) => b.score - a.score);
	return stats.slice(0, topN);
}

// ---------------------------------------------------------------------------
// Output YAML
// ---------------------------------------------------------------------------
const today = new Date().toISOString().slice(0, 10);
const lines: string[] = [];
lines.push(`format: ${capitalize(format)}`);
lines.push(`date: "${today}"`);
lines.push("archetypes:");

for (const group of qualified) {
	const sig = pickSignatureCards(group, 3);
	lines.push(`  - name: ${group.name}`);
	lines.push(
		`    # ${group.decklists.length} decklists across ${tournaments.length} tournaments`,
	);
	lines.push("    signatureCards:");
	for (const card of sig) {
		const minCopies = Math.max(1, Math.floor(card.avgCopies - 1));
		lines.push(`      - name: "${card.name}"`);
		lines.push(`        minCopies: ${minCopies}`);
	}
}

const yaml = `${lines.join("\n")}\n`;

// Write to data/archetypes/{format}.yaml
const outPath = join("data", "archetypes", `${format}.yaml`);
writeFileSync(outPath, yaml);
console.log(`Written to ${outPath}`);

// Also print below-threshold archetypes for reference
const disqualified = [...groups.values()]
	.filter((g) => g.decklists.length < MIN_COPIES)
	.sort((a, b) => b.decklists.length - a.decklists.length);

if (disqualified.length > 0) {
	console.log(`\n# --- Below threshold (${MIN_COPIES}) ---`);
	for (const g of disqualified) {
		console.log(`# ${g.name}: ${g.decklists.length} decklists`);
	}
}

function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}
