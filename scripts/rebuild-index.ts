/**
 * Rebuild per-format index.json files from tournament data on disk.
 * Preserves existing cleanName/importance overrides from current indexes.
 *
 * Usage:
 *   bun run scripts/rebuild-index.ts [--format <slug>]
 */
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TournamentData, TournamentIndexEntry } from "../src/lib/types/tournament";
import { cleanTournamentName, inferImportance } from "./lib/importance";

const DATA_DIR = join(import.meta.dir, "../data");

async function main() {
	const args = process.argv.slice(2);
	const formatFilter = args.includes("--format")
		? args[args.indexOf("--format") + 1]
		: null;

	// Find all format directories (directories in data/ that have an index.json or year-month subdirs)
	const entries = readdirSync(DATA_DIR, { withFileTypes: true });
	const formatDirs = entries
		.filter((e) => e.isDirectory() && e.name !== "archetypes")
		.map((e) => e.name)
		.filter((name) => !formatFilter || name === formatFilter);

	if (formatDirs.length === 0) {
		console.log("No format directories found.");
		return;
	}

	for (const formatSlug of formatDirs) {
		const formatDir = join(DATA_DIR, formatSlug);

		// Load existing index for preserving overrides
		const indexPath = join(formatDir, "index.json");
		const existingIndex = new Map<string, TournamentIndexEntry>();
		if (existsSync(indexPath)) {
			const existing: TournamentIndexEntry[] = JSON.parse(
				await Bun.file(indexPath).text(),
			);
			for (const e of existing) {
				existingIndex.set(e.id, e);
			}
		}

		// Scan year-month subdirectories for tournament files
		const newEntries: TournamentIndexEntry[] = [];
		const subdirs = readdirSync(formatDir, { withFileTypes: true })
			.filter((e) => e.isDirectory())
			.map((e) => e.name);

		for (const ym of subdirs) {
			const ymDir = join(formatDir, ym);
			const files = readdirSync(ymDir).filter((f) => f.endsWith(".json"));

			for (const filename of files) {
				const filePath = join(ymDir, filename);
				const data: TournamentData = await Bun.file(filePath).json();
				const existing = existingIndex.get(data.meta.id);

				const autoImportance = inferImportance(data.meta.name);
				// Preserve cleanName if manually edited (differs from both raw name and auto-cleaned)
				const autoCleaned = cleanTournamentName(data.meta.name);
				const wasManuallyEdited =
					existing &&
					existing.cleanName !== existing.name &&
					existing.cleanName !== cleanTournamentName(existing.name);
				const cleanName = wasManuallyEdited ? existing.cleanName : autoCleaned;
				// Preserve importance if manually overridden
				const importance =
					existing && existing.importance !== inferImportance(existing.name)
						? existing.importance
						: autoImportance;

				newEntries.push({
					id: data.meta.id,
					name: data.meta.name,
					cleanName,
					date: data.meta.date,
					format: data.meta.formats[0] ?? "Unknown",
					source: data.meta.source,
					url: data.meta.url,
					playerCount: data.meta.playerCount,
					roundCount: data.meta.roundCount,
					importance,
					tabletop: data.meta.tabletop,
					pairings: Object.keys(data.rounds).length > 0,
					path: `${ym}/${filename}`,
				});
			}
		}

		// Sort by date descending
		newEntries.sort((a, b) => b.date.localeCompare(a.date));
		writeFileSync(indexPath, JSON.stringify(newEntries, null, 2));
		console.log(`${formatSlug}/index.json: ${newEntries.length} entries`);
	}

	console.log("\nDone.");
}

main().catch(console.error);
