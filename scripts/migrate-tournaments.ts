/**
 * Migration script: moves tournament data from flat data/tournaments/{id}.json
 * to per-format/year-month structure: data/{format}/{year-month}/melee-{id}.json
 * Also generates per-format index.json files.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
	TournamentData,
	TournamentIndexEntry,
	TournamentSource,
} from "../src/lib/types/tournament";
import { inferImportance } from "./lib/importance";

const DATA_DIR = join(import.meta.dir, "../data");
const TOURNAMENTS_DIR = join(DATA_DIR, "tournaments");

/** Slugify a format name for use as a directory name. */
function formatSlug(format: string): string {
	return format.toLowerCase().replace(/\s+/g, "-");
}

/** Extract the primary constructed format from a tournament's format list. */
function primaryFormat(formats: string[]): string {
	// Filter out non-constructed formats (Draft, Sealed, etc.)
	const constructed = formats.filter((f) => !/\b(draft|sealed|limited)\b/i.test(f));
	return constructed[0] ?? formats[0] ?? "unknown";
}

/** Extract year-month from an ISO date string. */
function yearMonth(date: string): string {
	return date.slice(0, 7); // "2026-03-07" → "2026-03"
}

async function main() {
	const files = readdirSync(TOURNAMENTS_DIR).filter((f) => /^\d+\.json$/.test(f));

	if (files.length === 0) {
		console.log("No tournament files to migrate.");
		return;
	}

	console.log(`Found ${files.length} tournament file(s) to migrate.\n`);

	// Collect index entries per format
	const indexes = new Map<string, TournamentIndexEntry[]>();

	for (const filename of files) {
		const filePath = join(TOURNAMENTS_DIR, filename);
		const data: TournamentData = await Bun.file(filePath).json();
		const numericId = data.meta.id;
		const newId = `melee-${numericId}`;
		const source: TournamentSource = "melee";

		// Update meta
		(data.meta as Record<string, unknown>).id = newId;
		(data.meta as Record<string, unknown>).source = source;
		(data.meta as Record<string, unknown>).tabletop = true;

		// Determine target path
		const format = primaryFormat(data.meta.formats);
		const slug = formatSlug(format);
		const ym = yearMonth(data.meta.date);
		const targetDir = join(DATA_DIR, slug, ym);
		const targetFile = join(targetDir, `melee-${numericId}.json`);

		// Create directory
		mkdirSync(targetDir, { recursive: true });

		// Write migrated file
		writeFileSync(targetFile, JSON.stringify(data, null, 2));
		console.log(`  ${filename} → ${slug}/${ym}/melee-${numericId}.json`);

		// Build index entry
		const relativePath = `${ym}/melee-${numericId}.json`;
		const entry: TournamentIndexEntry = {
			id: newId,
			name: data.meta.name,
			cleanName: data.meta.name,
			date: data.meta.date,
			format: format,
			source,
			url: data.meta.url,
			playerCount: data.meta.playerCount,
			roundCount: data.meta.roundCount,
			importance: inferImportance(data.meta.name),
			tabletop: true,
			pairings: true,
			path: relativePath,
		};

		if (!indexes.has(slug)) indexes.set(slug, []);
		indexes.get(slug)!.push(entry);

		// Remove old file
		rmSync(filePath);
	}

	// Write per-format index.json files
	for (const [slug, entries] of indexes) {
		// Sort by date descending
		entries.sort((a, b) => b.date.localeCompare(a.date));
		const indexPath = join(DATA_DIR, slug, "index.json");
		writeFileSync(indexPath, JSON.stringify(entries, null, 2));
		console.log(`\n  Wrote ${slug}/index.json (${entries.length} entries)`);
	}

	// Clean up empty tournaments directory if all files were migrated
	const remaining = readdirSync(TOURNAMENTS_DIR);
	if (remaining.length === 0) {
		rmSync(TOURNAMENTS_DIR, { recursive: true });
		console.log("\n  Removed empty data/tournaments/ directory.");
	}

	console.log("\nMigration complete.");
}

main().catch(console.error);
