import type { ArchetypeStats, MatchupCell, MatchupMatrix } from "../types/metagame";
import type { TournamentData } from "../types/tournament";
import { buildMatchupMatrix } from "./winrate-calculator";

export type SplitMode = "binary" | "per-copy" | "cumulative";

export interface SplitRow {
	label: string;
	cells: Map<string, MatchupCell>;
	overallWinrate: number | null;
	totalMatches: number;
	totalWins: number;
	totalLosses: number;
	playerCount: number;
}

export interface SplitResult {
	cardName: string;
	mode: SplitMode;
	opponents: string[];
	baselineRow: SplitRow;
	groupRows: SplitRow[];
}

export function countCardCopies(
	tournaments: TournamentData[],
	playerArchetypes: Map<string, string>,
	archetypeName: string,
	cardName: string,
): Map<string, number> {
	const playerCopies = new Map<string, number>();

	for (const t of tournaments) {
		for (const [playerId, player] of Object.entries(t.players)) {
			if (playerArchetypes.get(`${t.meta.id}:${playerId}`) !== archetypeName) continue;
			const dlId = player.decklistIds[0];
			const dl = dlId ? t.decklists[dlId] : undefined;
			if (!dl) continue;

			let copies = 0;
			for (const entry of dl.mainboard) {
				if (entry.cardName === cardName) copies += entry.quantity;
			}
			for (const entry of dl.sideboard) {
				if (entry.cardName === cardName) copies += entry.quantity;
			}
			playerCopies.set(`${t.meta.id}:${playerId}`, copies);
		}
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
	prebuilt?: { matrix: MatchupMatrix; stats: ArchetypeStats[] },
	useStandings?: boolean,
): SplitRow {
	// Always build an un-collapsed matrix so every archetype is individually
	// visible. The "Other" cell is aggregated manually from the same set of
	// archetypes the caller determined via the baseline threshold.
	const { matrix, stats } =
		prebuilt ??
		buildMatchupMatrix(tournaments, playerArchetypes, {
			excludeMirrors: true,
			useStandings,
		});

	const idx = matrix.archetypes.indexOf(archetypeName);
	const cells = new Map<string, MatchupCell>();
	let totalWins = 0;
	let totalLosses = 0;
	let totalDraws = 0;

	if (idx !== -1) {
		// Named opponents that are NOT "Other" — used to determine which
		// individual archetypes should be summed into the "Other" bucket.
		const namedOpponents = new Set(opponents.filter((o) => o !== "Other"));

		for (const opponent of opponents) {
			if (opponent === "Other") {
				// Sum all archetypes not explicitly named as opponents
				let w = 0,
					l = 0,
					d = 0,
					id = 0,
					t = 0;
				for (let j = 0; j < matrix.archetypes.length; j++) {
					const name = matrix.archetypes[j];
					if (j === idx || namedOpponents.has(name)) continue;
					const c = matrix.cells[idx][j];
					w += c.wins;
					l += c.losses;
					d += c.draws;
					id += c.intentionalDraws;
					t += c.total;
				}
				if (t > 0) {
					cells.set("Other", {
						wins: w,
						losses: l,
						draws: d,
						intentionalDraws: id,
						total: t,
						winrate: w / t,
					});
				}
			} else {
				const oIdx = matrix.archetypes.indexOf(opponent);
				if (oIdx !== -1 && oIdx !== idx) {
					cells.set(opponent, matrix.cells[idx][oIdx]);
				}
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
		label: "",
		cells,
		overallWinrate: totalMatches > 0 ? totalWins / totalMatches : null,
		totalMatches,
		totalWins,
		totalLosses,
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
	options?: {
		threshold?: number;
		topN?: number;
		minMetagameShare?: number;
		useStandings?: boolean;
	},
): SplitResult {
	const playerCopies = countCardCopies(
		tournaments,
		playerArchetypes,
		archetypeName,
		cardName,
	);

	const matrixOpts = {
		excludeMirrors: true,
		topN: options?.topN,
		minMetagameShare: options?.minMetagameShare,
		useStandings: options?.useStandings,
	};

	// Build the un-collapsed baseline matrix once (reused for opponent determination + baseline row)
	const baselineResult = buildMatchupMatrix(tournaments, playerArchetypes, {
		excludeMirrors: true,
		useStandings: options?.useStandings,
	});

	// Determine opponents from a possibly collapsed matrix (topN/minMetagameShare)
	const hasCollapsing = matrixOpts.topN || matrixOpts.minMetagameShare;
	const opponents = hasCollapsing
		? buildMatchupMatrix(
				tournaments,
				playerArchetypes,
				matrixOpts,
			).matrix.archetypes.filter((a) => a !== archetypeName)
		: baselineResult.matrix.archetypes.filter((a) => a !== archetypeName);

	// Build baseline row (all players), reusing the already-built matrix
	const allPlayerIds = new Set(playerCopies.keys());
	const baselineRow = extractRow(
		tournaments,
		playerArchetypes,
		archetypeName,
		opponents,
		allPlayerIds.size,
		baselineResult,
		options?.useStandings,
	);
	baselineRow.label = "All";

	// Partition players into groups
	const groups: { label: string; playerIds: Set<string> }[] = [];

	if (mode === "binary") {
		const threshold = options?.threshold ?? 4;
		const above = new Set<string>();
		const below = new Set<string>();
		for (const [pid, copies] of playerCopies) {
			if (copies >= threshold) above.add(pid);
			else below.add(pid);
		}
		const maxCopies = Math.max(...playerCopies.values());
		const aboveLabel =
			maxCopies > threshold ? `${threshold}+ copies` : `${threshold} copies`;
		if (above.size > 0) groups.push({ label: aboveLabel, playerIds: above });
		if (below.size > 0)
			groups.push({
				label: threshold === 1 ? "0 copies" : `< ${threshold} copies`,
				playerIds: below,
			});
	} else if (mode === "cumulative") {
		// cumulative mode: each row is "≥ N copies" (overlapping groups)
		// Fisher's test compares each group against its complement (< N)
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
		// First group: "= 0 copies" (players with none of the card)
		if (byCount.has(0) && byCount.get(0)!.size > 0) {
			groups.push({ label: "0 copies", playerIds: byCount.get(0)! });
		}
		// Remaining groups: "≥ N copies" (skip the lowest — "≥ min" would be everyone)
		for (let i = 1; i < sortedCounts.length; i++) {
			const threshold = sortedCounts[i];
			const atOrAbove = new Set<string>();
			for (const [pid, copies] of playerCopies) {
				if (copies >= threshold) atOrAbove.add(pid);
			}
			if (atOrAbove.size > 0) {
				groups.push({
					label: `≥ ${threshold} ${threshold === 1 ? "copy" : "copies"}`,
					playerIds: atOrAbove,
				});
			}
		}
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
				label: count === 1 ? "1 copy" : `${count} copies`,
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
			undefined,
			options?.useStandings,
		);
		row.label = group.label;
		return row;
	});

	return { cardName, mode, opponents, baselineRow, groupRows };
}
