/**
 * Tournament data loading. Per-format indexes are small and eagerly bundled
 * via import.meta.glob; full tournament JSON is fetched at runtime as static
 * assets (served by the serve-tournament-data Vite plugin / build/data).
 *
 * Directory structure:
 *   data/{format}/{year-month}/{source}-{id}.json  — tournament data
 *   data/{format}/index.json                       — per-format index with metadata
 */
import { base } from "$app/paths";
import type { TournamentData, TournamentIndexEntry } from "../types/tournament";

const indexModules = import.meta.glob<TournamentIndexEntry[]>("/data/*/index.json", {
	eager: true,
	import: "default",
});

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

/**
 * Fetch all tournaments of one format as static assets, driven by its index
 * entries, with bounded concurrency. Individual failures are logged and
 * skipped so one corrupt/missing file doesn't break the whole format.
 */
export async function fetchFormatTournaments(
	slug: string,
	entries: TournamentIndexEntry[],
	{ concurrency = 24 }: { concurrency?: number } = {},
): Promise<TournamentData[]> {
	const results: TournamentData[] = [];
	let next = 0;
	async function worker(): Promise<void> {
		while (next < entries.length) {
			const entry = entries[next++];
			const url = `${base}/data/${slug}/${entry.path}`;
			try {
				const res = await fetch(url);
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				results.push(await res.json());
			} catch (e) {
				console.warn(`Skipping tournament ${entry.id} (${url}):`, e);
			}
		}
	}
	const workers = Array.from(
		{ length: Math.min(concurrency, entries.length) },
		() => worker(),
	);
	await Promise.all(workers);
	return results;
}
