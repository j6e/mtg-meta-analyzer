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

/** Writable store for the currently selected tournament ID. */
export const selectedTournamentId = writable<number | null>(
	allTournaments.size > 0 ? [...allTournaments.keys()][0] : null,
);

// --- Derived stores ---

/** List of tournament metadata, sorted by date descending. */
export const tournamentList = derived([], (): TournamentMeta[] => {
	return [...allTournaments.values()]
		.map((t) => t.meta)
		.sort((a, b) => b.date.localeCompare(a.date));
});

/** The currently selected tournament data. */
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

/** Classification results for the current tournament. */
export const classificationResults = derived(
	currentTournament,
	($tournament): ClassificationResult[] => {
		if (!$tournament) return [];
		return classifyAll($tournament.decklists, archetypeDefs, { k: 5, minConfidence: 0.3 });
	},
);

/** Player ID → archetype mapping for the current tournament. */
export const playerArchetypes = derived(
	[currentTournament, classificationResults],
	([$tournament, $results]): Map<string, string> => {
		if (!$tournament) return new Map();
		return buildPlayerArchetypeMap($tournament, $results);
	},
);

/** Matchup matrix and archetype stats, reactive to settings changes. */
export const metagameData = derived(
	[currentTournament, playerArchetypes, settings],
	([$tournament, $playerArchetypes, $settings]) => {
		if (!$tournament || $playerArchetypes.size === 0) {
			return null;
		}

		const options: MatrixOptions = {
			excludeMirrors: $settings.excludeMirrors,
			topN: $settings.topN,
			excludePlayoffs: $settings.excludePlayoffs,
		};

		return buildMatchupMatrix([$tournament], $playerArchetypes, options);
	},
);

/** Just the archetype stats from the metagame data. */
export const archetypeStats = derived(
	metagameData,
	($data): ArchetypeStats[] => $data?.stats ?? [],
);
