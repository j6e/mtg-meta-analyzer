/**
 * Build-time data loading via Vite's import.meta.glob.
 * Tournament JSON files are eagerly imported at build time — no runtime fetches needed.
 *
 * Directory structure:
 *   data/{format}/{year-month}/{source}-{id}.json  — tournament data
 *   data/{format}/index.json                       — per-format index with metadata
 */
import type { TournamentData, TournamentIndexEntry } from "../types/tournament";

const tournamentModules = import.meta.glob<TournamentData>("/data/*/*/*.json", {
	eager: true,
	import: "default",
});

const indexModules = import.meta.glob<TournamentIndexEntry[]>("/data/*/index.json", {
	eager: true,
	import: "default",
});

/** All loaded tournaments, keyed by tournament ID (e.g. "melee-339227"). */
export function loadTournaments(): Map<string, TournamentData> {
	const map = new Map<string, TournamentData>();
	for (const data of Object.values(tournamentModules)) {
		map.set(String(data.meta.id), data);
	}
	return map;
}

/** Per-format indexes, keyed by format slug (e.g. "standard", "modern"). */
export function loadIndexes(): Map<string, TournamentIndexEntry[]> {
	const map = new Map<string, TournamentIndexEntry[]>();
	for (const [path, entries] of Object.entries(indexModules)) {
		// Extract format slug from "/data/{format}/index.json"
		const match = path.match(/\/data\/([^/]+)\/index\.json$/);
		if (match) {
			map.set(match[1], entries);
		}
	}
	return map;
}
