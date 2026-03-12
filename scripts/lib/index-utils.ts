import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TournamentIndexEntry } from "../../src/lib/types/tournament";
import { cleanTournamentName, inferImportance } from "./importance";

/** Update or create a per-format index.json, preserving manual overrides. */
export function updateFormatIndex(
	formatSlug: string,
	newEntry: TournamentIndexEntry,
): void {
	const indexPath = join("data", formatSlug, "index.json");
	let entries: TournamentIndexEntry[] = [];

	if (existsSync(indexPath)) {
		entries = JSON.parse(readFileSync(indexPath, "utf-8"));
	}

	// Find existing entry and preserve manual overrides
	const existingIdx = entries.findIndex((e) => e.id === newEntry.id);
	if (existingIdx >= 0) {
		const existing = entries[existingIdx];
		// Preserve cleanName if it was manually edited (differs from both raw and auto-cleaned)
		const wasManuallyEdited =
			existing.cleanName !== existing.name &&
			existing.cleanName !== cleanTournamentName(existing.name);
		if (wasManuallyEdited) {
			newEntry.cleanName = existing.cleanName;
		}
		// Preserve importance if it was manually overridden
		if (existing.importance !== inferImportance(existing.name)) {
			newEntry.importance = existing.importance;
		}
		entries[existingIdx] = newEntry;
	} else {
		entries.push(newEntry);
	}

	// Sort by date descending
	entries.sort((a, b) => b.date.localeCompare(a.date));
	writeFileSync(indexPath, JSON.stringify(entries, null, 2));
	console.log(`Updated ${indexPath} (${entries.length} entries)`);
}
