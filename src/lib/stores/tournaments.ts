/**
 * Tournament data store — per-format indexes are bundled at build time (a
 * lightweight catalog, available synchronously); full tournament data is
 * fetched lazily per format via ensureFormatLoaded(). Derived data
 * (classifications, metagame stats) recomputes reactively as formats arrive.
 */
import { derived, get, writable } from "svelte/store";
import type { ClassificationResult } from "../algorithms/archetype-classifier";
import {
	classifyAllPooled,
	classifyAllSelfReported,
} from "../algorithms/archetype-classifier";
import { fetchFormatTournaments, loadIndexes } from "../data/loader";
import type { ArchetypeDefinition } from "../types/archetype";
import type { ArchetypeStats } from "../types/metagame";
import type {
	TournamentData,
	TournamentImportance,
	TournamentMeta,
} from "../types/tournament";
import { formatSlug } from "../utils/format-slug";
import {
	buildAttributionMatrix,
	buildMatchupMatrix,
	buildPlayerArchetypeMap,
	correctWinrates,
	type MatrixOptions,
} from "../utils/winrate-calculator";
import { activeArchetypeConfig, activeArchetypeDefs } from "./archetype-configs";
import { settings } from "./settings";

// --- Catalog (per-format indexes, bundled at build time) ---

const allIndexes = loadIndexes();

// --- Lazily fetched tournament data ---

/** Full tournament data fetched so far, keyed by tournament ID. */
const loadedTournaments = writable<Map<string, TournamentData>>(new Map());

/** Fetch state per format slug. */
const formatLoadState = writable<Map<string, "loading" | "loaded" | "error">>(
	new Map(),
);

/**
 * Fetch a format's tournament data unless already loaded/loading.
 * Results are committed in a single store update so downstream derivations
 * (KNN classification, matchup matrices) recompute once per format, not
 * once per file.
 */
export async function ensureFormatLoaded(format: string): Promise<void> {
	const slug = formatSlug(format);
	const state = get(formatLoadState).get(slug);
	if (state === "loading" || state === "loaded") return;
	const entries = allIndexes.get(slug);
	if (!entries) return; // format without indexed data — nothing to fetch
	formatLoadState.update((m) => new Map(m).set(slug, "loading"));
	try {
		const tournaments = await fetchFormatTournaments(slug, entries);
		loadedTournaments.update((map) => {
			const next = new Map(map);
			for (const t of tournaments) {
				next.set(t.meta.id, t);
			}
			return next;
		});
		formatLoadState.update((m) => new Map(m).set(slug, "loaded"));
	} catch (e) {
		console.error(`Failed to load ${format} tournament data:`, e);
		formatLoadState.update((m) => new Map(m).set(slug, "error"));
	}
}

/** Whether the currently selected format's data is still being fetched. */
export const isCurrentFormatLoading = derived(
	[settings, formatLoadState],
	([$settings, $state]) => $state.get(formatSlug($settings.format)) === "loading",
);

// --- Derived stores ---

export type TournamentListEntry = Omit<TournamentMeta, "fetchedAt"> & {
	matchCount: number;
	cleanName: string;
	importance: TournamentImportance;
};

/** List of all tournament metadata (from the bundled indexes), sorted by date descending. */
export const tournamentList = derived([], (): TournamentListEntry[] => {
	const list: TournamentListEntry[] = [];
	for (const entries of allIndexes.values()) {
		for (const e of entries) {
			list.push({
				id: e.id,
				name: e.name,
				date: e.date,
				formats: [e.format],
				url: e.url,
				playerCount: e.playerCount,
				roundCount: e.roundCount,
				source: e.source,
				tabletop: e.tabletop,
				matchCount: e.matchCount,
				cleanName: e.cleanName,
				importance: e.importance,
			});
		}
	}
	return list.sort((a, b) => b.date.localeCompare(a.date));
});

/** All formats with indexed data, sorted alphabetically. */
export const availableFormats = derived([], (): string[] => {
	const formats = new Set<string>();
	for (const entries of allIndexes.values()) {
		for (const e of entries) {
			formats.add(e.format);
		}
	}
	return [...formats].sort();
});

/** Tournaments filtered by the current settings (format, date range, selection). */
export const filteredTournaments = derived(
	[settings, loadedTournaments],
	([$settings, $loaded]): TournamentData[] => {
		let tournaments = [...$loaded.values()];

		// Filter by explicitly selected tournaments
		const idSet = new Set($settings.selectedTournamentIds);
		tournaments = tournaments.filter((t) => idSet.has(t.meta.id));

		// Filter by format
		if ($settings.format) {
			tournaments = tournaments.filter((t) =>
				t.meta.formats.includes($settings.format),
			);
		}

		// Filter by date range
		if ($settings.dateFrom) {
			tournaments = tournaments.filter((t) => t.meta.date >= $settings.dateFrom);
		}
		if ($settings.dateTo) {
			tournaments = tournaments.filter((t) => t.meta.date <= $settings.dateTo);
		}

		return tournaments;
	},
);

/** Sub-store exposing only the classification source toggle, so derived stores
 * downstream don't recompute on unrelated settings changes. */
const useSelfReportedArchetype = derived(settings, ($s) => $s.useSelfReportedArchetype);

/** Classification results for all filtered tournaments (pooled KNN, or self-reported). */
export const classificationResults = derived(
	[filteredTournaments, activeArchetypeConfig, useSelfReportedArchetype],
	([$tournaments, $config, $useSelfReported]): Map<string, ClassificationResult[]> => {
		const tournamentDecklists = new Map(
			$tournaments.map((t) => [t.meta.id, t.decklists]),
		);
		if ($useSelfReported) {
			return classifyAllSelfReported(tournamentDecklists);
		}
		return classifyAllPooled(tournamentDecklists, $config.archetypes, {
			minConfidence: 0.4,
			nameEqualsCommander: $config.nameEqualsCommander,
		});
	},
);

/** Mapping of archetype name → representative card name (for art lookup). */
export const archetypeCardMap = derived(
	[activeArchetypeDefs, classificationResults],
	([$defs, $resultsMap]): Map<string, string> => {
		const map = new Map<string, string>(
			$defs
				.filter((d) => d.signatureCards.length > 0)
				.map((d) => [d.name, d.signatureCards[0].name]),
		);
		// Add commander-classified archetypes (representativeCard → full card name for Scryfall)
		for (const results of $resultsMap.values()) {
			for (const r of results) {
				if (r.representativeCard && !map.has(r.archetype)) {
					map.set(r.archetype, r.representativeCard);
				}
			}
		}
		return map;
	},
);

/** Player ID → archetype mapping across all filtered tournaments. */
export const playerArchetypes = derived(
	[filteredTournaments, classificationResults],
	([$tournaments, $resultsMap]): Map<string, string> => {
		const combined = new Map<string, string>();
		for (const t of $tournaments) {
			const results = $resultsMap.get(t.meta.id) ?? [];
			// Videre (MTGO) events only carry the published top-32 decklists;
			// deckless players there are censored losers, so drop them entirely
			// rather than letting them pollute Other/Unknown winrates.
			const map = buildPlayerArchetypeMap(t, results, {
				skipPlayersWithoutDecklist: t.meta.source === "videre",
			});
			for (const [playerId, archetype] of map) {
				combined.set(`${t.meta.id}:${playerId}`, archetype);
			}
		}
		return combined;
	},
);

/** Matchup matrix and archetype stats, reactive to settings changes. */
export const metagameData = derived(
	[filteredTournaments, playerArchetypes, settings],
	([$tournaments, $playerArchetypes, $settings]) => {
		if ($tournaments.length === 0 || $playerArchetypes.size === 0) {
			return null;
		}

		const options: MatrixOptions = {
			excludeMirrors: $settings.excludeMirrors,
			topN: $settings.otherMode === "topN" ? $settings.topN : 0,
			minMetagameShare:
				$settings.otherMode === "minShare" ? $settings.minMetagameShare / 100 : 0,
			useStandings: $settings.useStandings,
		};

		const result = buildMatchupMatrix($tournaments, $playerArchetypes, options);
		if ($settings.useStandings) {
			return {
				matrix: result.matrix,
				stats: correctWinrates(result.stats, result.roundStats),
			};
		}
		return result;
	},
);

/** Just the archetype stats from the metagame data. */
export const archetypeStats = derived(
	metagameData,
	($data): ArchetypeStats[] => $data?.stats ?? [],
);

/** Attribution matrix scoped to the currently filtered tournaments. */
export const attributionMatrix = derived(
	[filteredTournaments, classificationResults],
	([$tournaments, $resultsMap]) => {
		if ($tournaments.length === 0) return null;
		return buildAttributionMatrix($tournaments, $resultsMap);
	},
);

/** Look up an archetype definition by name (non-reactive snapshot). */
export function getArchetypeDefinition(name: string): ArchetypeDefinition | null {
	return get(activeArchetypeDefs).find((d) => d.name === name) ?? null;
}
