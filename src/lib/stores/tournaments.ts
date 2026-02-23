/**
 * Tournament data store — loads all tournament JSON at build time and provides
 * reactive derived data (player lists, decklists, classifications, metagame stats).
 */
import { writable, derived } from 'svelte/store';
import { loadTournaments } from '../data/loader';
import type { TournamentData, TournamentMeta } from '../types/tournament';
import type { DecklistInfo } from '../types/decklist';
import type { ArchetypeStats } from '../types/metagame';
import type { ClassificationResult } from '../algorithms/archetype-classifier';
import { parseArchetypeYaml, classifyAll } from '../algorithms/archetype-classifier';
import { buildPlayerArchetypeMap, buildMatchupMatrix, type MatrixOptions } from '../utils/winrate-calculator';
import { settings } from './settings';
import archetypeYaml from '/data/archetypes/standard.yaml?raw';

// --- Raw data (loaded once at build time) ---

const allTournaments = loadTournaments();

/** Writable store for the currently selected tournament ID (single-select for decklist view). */
export const selectedTournamentId = writable<number | null>(
	allTournaments.size > 0 ? [...allTournaments.keys()][0] : null,
);

// --- Derived stores ---

/** List of all tournament metadata, sorted by date descending. */
export const tournamentList = derived([], (): TournamentMeta[] => {
	return [...allTournaments.values()]
		.map((t) => t.meta)
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
		if ($settings.selectedTournamentIds.length > 0) {
			const idSet = new Set($settings.selectedTournamentIds);
			tournaments = tournaments.filter((t) => idSet.has(t.meta.id));
		}

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

/** The currently selected single tournament (for decklist/player views). */
export const currentTournament = derived(selectedTournamentId, ($id): TournamentData | null => {
	if ($id === null) return null;
	return allTournaments.get($id) ?? null;
});

/** All players in the current tournament, sorted by rank. */
export const playerList = derived(currentTournament, ($tournament) => {
	if (!$tournament) return [];
	return Object.entries($tournament.players)
		.map(([id, info]) => ({ id, ...info }))
		.sort((a, b) => a.rank - b.rank);
});

/** All decklists in the current tournament, keyed by decklist ID. */
export const decklistMap = derived(
	currentTournament,
	($tournament): Record<string, DecklistInfo> => {
		return $tournament?.decklists ?? {};
	},
);

/** Archetype definitions parsed from YAML. */
const archetypeDefs = parseArchetypeYaml(archetypeYaml);

/** Classification results for all filtered tournaments. */
export const classificationResults = derived(
	filteredTournaments,
	($tournaments): Map<number, ClassificationResult[]> => {
		const map = new Map<number, ClassificationResult[]>();
		for (const t of $tournaments) {
			map.set(
				t.meta.id,
				classifyAll(t.decklists, archetypeDefs, { k: 5, minConfidence: 0.3 }),
			);
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
			const map = buildPlayerArchetypeMap(t, results);
			for (const [playerId, archetype] of map) {
				combined.set(playerId, archetype);
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
			excludePlayoffs: $settings.excludePlayoffs,
			topN: $settings.otherMode === 'topN' ? $settings.topN : 0,
			minMetagameShare:
				$settings.otherMode === 'minShare' ? $settings.minMetagameShare / 100 : 0,
		};

		return buildMatchupMatrix($tournaments, $playerArchetypes, options);
	},
);

/** Just the archetype stats from the metagame data. */
export const archetypeStats = derived(
	metagameData,
	($data): ArchetypeStats[] => $data?.stats ?? [],
);

/** Player ID → archetype for the currently selected single tournament. */
export const currentTournamentArchetypes = derived(
	currentTournament,
	($tournament): Map<string, string> => {
		if (!$tournament) return new Map();
		const results = classifyAll($tournament.decklists, archetypeDefs, {
			k: 5,
			minConfidence: 0.3,
		});
		return buildPlayerArchetypeMap($tournament, results);
	},
);

/** Look up a tournament by ID (non-reactive). */
export function getTournament(id: number): TournamentData | null {
	return allTournaments.get(id) ?? null;
}

// --- Global stores (all tournaments, independent of metagame page filters) ---

/** All tournaments as an array. */
const allTournamentArray = [...allTournaments.values()];

/** Player ID → archetype across ALL tournaments. */
export const globalPlayerArchetypes = derived([], (): Map<string, string> => {
	const combined = new Map<string, string>();
	for (const t of allTournamentArray) {
		const results = classifyAll(t.decklists, archetypeDefs, { k: 5, minConfidence: 0.3 });
		const map = buildPlayerArchetypeMap(t, results);
		for (const [playerId, archetype] of map) {
			combined.set(playerId, archetype);
		}
	}
	return combined;
});

/** Matchup matrix and stats across ALL tournaments (no "Other" collapsing). */
export const globalMetagameData = derived(
	globalPlayerArchetypes,
	($archetypes) => {
		if (allTournamentArray.length === 0 || $archetypes.size === 0) return null;
		return buildMatchupMatrix(allTournamentArray, $archetypes, {
			excludeMirrors: true,
			excludePlayoffs: true,
		});
	},
);

/** All tournament data values (for player pages). */
export function getAllTournaments(): TournamentData[] {
	return allTournamentArray;
}
