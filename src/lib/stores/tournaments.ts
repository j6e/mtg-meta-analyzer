/**
 * Tournament data store — loads all tournament JSON at build time and provides
 * reactive derived data (player lists, decklists, classifications, metagame stats).
 */
import { derived, get } from "svelte/store";
import type { ClassificationResult } from "../algorithms/archetype-classifier";
import {
	classifyAllPooled,
	classifyAllSelfReported,
} from "../algorithms/archetype-classifier";
import { loadIndexes, loadTournaments } from "../data/loader";
import type { ArchetypeDefinition } from "../types/archetype";
import type { ArchetypeStats } from "../types/metagame";
import type {
	TournamentData,
	TournamentImportance,
	TournamentIndexEntry,
	TournamentMeta,
} from "../types/tournament";
import {
	buildAttributionMatrix,
	buildMatchupMatrix,
	buildPlayerArchetypeMap,
	correctWinrates,
	type MatrixOptions,
} from "../utils/winrate-calculator";
import { activeArchetypeConfig, activeArchetypeDefs } from "./archetype-configs";
import { settings } from "./settings";

// --- Raw data (loaded once at build time) ---

const allTournaments = loadTournaments();
const allIndexes = loadIndexes();

/** Flat lookup of index entries by tournament ID (merged across all formats). */
const indexById = new Map<string, TournamentIndexEntry>();
for (const entries of allIndexes.values()) {
	for (const entry of entries) {
		indexById.set(entry.id, entry);
	}
}

// --- Derived stores ---

export type TournamentListEntry = TournamentMeta & {
	matchCount: number;
	cleanName: string;
	importance: TournamentImportance;
};

/** List of all tournament metadata (with computed match count + index data), sorted by date descending. */
export const tournamentList = derived([], (): TournamentListEntry[] => {
	return [...allTournaments.values()]
		.map((t) => {
			const idx = indexById.get(t.meta.id);
			return {
				...t.meta,
				matchCount: Object.values(t.rounds).reduce(
					(sum, r) => sum + r.matches.length,
					0,
				),
				cleanName: idx?.cleanName ?? t.meta.name,
				importance: idx?.importance ?? "other",
			};
		})
		.sort((a, b) => b.date.localeCompare(a.date));
});

/** All unique formats across all tournaments. */
export const availableFormats = derived([], (): string[] => {
	const formats = new Set<string>();
	for (const t of allTournaments.values()) {
		for (const f of t.meta.formats) {
			formats.add(f);
		}
	}
	return [...formats].sort();
});

/** Tournaments filtered by the current settings (format, date range, selection). */
export const filteredTournaments = derived(
	[settings],
	([$settings]): TournamentData[] => {
		let tournaments = [...allTournaments.values()];

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
