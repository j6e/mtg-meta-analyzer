import type { TournamentData } from '../types/tournament';
import type { MatchupCell } from '../types/metagame';
import { collectArchetypeDecklists } from './decklist-collector';
import { buildMatchupMatrix } from './winrate-calculator';

export type SplitMode = 'binary' | 'per-copy';

export interface SplitRow {
	label: string;
	cells: Map<string, MatchupCell>;
	overallWinrate: number | null;
	totalMatches: number;
	playerCount: number;
}

export interface SplitResult {
	cardName: string;
	opponents: string[];
	baselineRow: SplitRow;
	groupRows: SplitRow[];
}

function countCardCopies(
	tournaments: TournamentData[],
	playerArchetypes: Map<string, string>,
	archetypeName: string,
	cardName: string,
): Map<string, number> {
	const enriched = collectArchetypeDecklists(tournaments, playerArchetypes, archetypeName);
	const playerCopies = new Map<string, number>();

	for (const e of enriched) {
		// Take max copies across all decklists for the same player
		const existing = playerCopies.get(e.playerId) ?? 0;
		let copies = 0;
		for (const entry of e.decklist.mainboard) {
			if (entry.cardName === cardName) copies += entry.quantity;
		}
		for (const entry of e.decklist.sideboard) {
			if (entry.cardName === cardName) copies += entry.quantity;
		}
		playerCopies.set(e.playerId, Math.max(existing, copies));
	}

	return playerCopies;
}

function buildFilteredArchetypeMap(
	fullMap: Map<string, string>,
	archetypeName: string,
	includedPlayerIds: Set<string>,
): Map<string, string> {
	const filtered = new Map<string, string>();
	for (const [playerId, archetype] of fullMap) {
		if (archetype === archetypeName) {
			if (includedPlayerIds.has(playerId)) {
				filtered.set(playerId, archetype);
			}
		} else {
			filtered.set(playerId, archetype);
		}
	}
	return filtered;
}

function extractRow(
	tournaments: TournamentData[],
	playerArchetypes: Map<string, string>,
	archetypeName: string,
	opponents: string[],
	playerCount: number,
): SplitRow {
	const { matrix, stats } = buildMatchupMatrix(tournaments, playerArchetypes, {
		excludeMirrors: true,
	});

	const idx = matrix.archetypes.indexOf(archetypeName);
	const cells = new Map<string, MatchupCell>();
	let totalWins = 0;
	let totalLosses = 0;
	let totalDraws = 0;

	if (idx !== -1) {
		for (const opponent of opponents) {
			const oIdx = matrix.archetypes.indexOf(opponent);
			if (oIdx !== -1 && oIdx !== idx) {
				cells.set(opponent, matrix.cells[idx][oIdx]);
			}
		}
		const archetypeStats = stats.find((s) => s.name === archetypeName);
		if (archetypeStats) {
			totalWins = archetypeStats.wins;
			totalLosses = archetypeStats.losses;
			totalDraws = archetypeStats.draws;
		}
	}

	const totalMatches = totalWins + totalLosses + totalDraws;
	return {
		label: '',
		cells,
		overallWinrate: totalMatches > 0 ? totalWins / totalMatches : null,
		totalMatches,
		playerCount,
	};
}

/**
 * Split an archetype's players into groups based on copies of a card,
 * then compute per-group matchup rows against the rest of the meta.
 */
export function splitByCard(
	tournaments: TournamentData[],
	playerArchetypes: Map<string, string>,
	archetypeName: string,
	cardName: string,
	mode: SplitMode,
	options?: { threshold?: number },
): SplitResult {
	const playerCopies = countCardCopies(tournaments, playerArchetypes, archetypeName, cardName);

	// Determine opponents from the baseline matrix
	const { matrix: baseMatrix } = buildMatchupMatrix(tournaments, playerArchetypes, {
		excludeMirrors: true,
	});
	const opponents = baseMatrix.archetypes.filter((a) => a !== archetypeName);

	// Build baseline row (all players)
	const allPlayerIds = new Set(playerCopies.keys());
	const baselineRow = extractRow(
		tournaments,
		playerArchetypes,
		archetypeName,
		opponents,
		allPlayerIds.size,
	);
	baselineRow.label = 'All';

	// Partition players into groups
	const groups: { label: string; playerIds: Set<string> }[] = [];

	if (mode === 'binary') {
		const threshold = options?.threshold ?? 4;
		const above = new Set<string>();
		const below = new Set<string>();
		for (const [pid, copies] of playerCopies) {
			if (copies >= threshold) above.add(pid);
			else below.add(pid);
		}
		if (above.size > 0) groups.push({ label: `${threshold}+ copies`, playerIds: above });
		if (below.size > 0)
			groups.push({ label: `< ${threshold} copies`, playerIds: below });
	} else {
		// per-copy mode: group by exact copy count
		const byCount = new Map<number, Set<string>>();
		for (const [pid, copies] of playerCopies) {
			let set = byCount.get(copies);
			if (!set) {
				set = new Set();
				byCount.set(copies, set);
			}
			set.add(pid);
		}
		const sortedCounts = [...byCount.keys()].sort((a, b) => a - b);
		for (const count of sortedCounts) {
			const set = byCount.get(count)!;
			groups.push({
				label: count === 1 ? '1 copy' : `${count} copies`,
				playerIds: set,
			});
		}
	}

	// Build a row for each group
	const groupRows: SplitRow[] = groups.map((group) => {
		const filteredMap = buildFilteredArchetypeMap(
			playerArchetypes,
			archetypeName,
			group.playerIds,
		);
		const row = extractRow(
			tournaments,
			filteredMap,
			archetypeName,
			opponents,
			group.playerIds.size,
		);
		row.label = group.label;
		return row;
	});

	return { cardName, opponents, baselineRow, groupRows };
}
