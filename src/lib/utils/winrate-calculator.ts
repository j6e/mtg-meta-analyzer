import type { TournamentData, MatchResult } from '../types/tournament';
import type { MatchupCell, MatchupMatrix, ArchetypeStats, AttributionMatrix } from '../types/metagame';
import type { ClassificationResult } from '../algorithms/archetype-classifier';

/** Intentional draws are recorded as 0-0-3 — no games played, just drawn rounds. */
function isIntentionalDraw(match: MatchResult): boolean {
	return match.result === '0-0-3';
}

export interface MatrixOptions {
	excludeMirrors?: boolean; // default true — mirror matches excluded from matrix
	minMetagameShare?: number; // 0-1, archetypes below this threshold → "Other"
	topN?: number; // 0 = no limit, otherwise keep only top N archetypes
}

/**
 * Build a playerId → archetype mapping from classifier results and tournament data.
 * For players with multiple decklists (multi-format), uses the first classified decklist.
 */
export function buildPlayerArchetypeMap(
	tournament: TournamentData,
	results: ClassificationResult[],
): Map<string, string> {
	const deckArchetype = new Map<string, string>();
	for (const r of results) {
		deckArchetype.set(r.decklistId, r.archetype);
	}

	const playerArchetype = new Map<string, string>();
	for (const [playerId, player] of Object.entries(tournament.players)) {
		let archetype = 'Unknown';
		for (const deckId of player.decklistIds) {
			const a = deckArchetype.get(deckId);
			if (a && a !== 'Unknown') {
				archetype = a;
				break;
			}
		}
		playerArchetype.set(playerId, archetype);
	}

	return playerArchetype;
}

/**
 * Build a matchup matrix and per-archetype stats from tournament data.
 *
 * @param tournaments - Tournament data with rounds and matches
 * @param playerArchetypes - Map of playerId → archetype name
 * @param options - Matrix options (mirror exclusion, "Other" aggregation, etc.)
 */
export function buildMatchupMatrix(
	tournaments: TournamentData[],
	playerArchetypes: Map<string, string>,
	options: MatrixOptions = {},
): { matrix: MatchupMatrix; stats: ArchetypeStats[] } {
	const {
		excludeMirrors = true,
		minMetagameShare = 0,
		topN = 0,
	} = options;

	// Step 1: Count players per raw archetype
	const rawPlayerSets = new Map<string, Set<string>>();
	for (const [playerId, archetype] of playerArchetypes) {
		if (!rawPlayerSets.has(archetype)) rawPlayerSets.set(archetype, new Set());
		rawPlayerSets.get(archetype)!.add(playerId);
	}
	const totalPlayers = playerArchetypes.size;

	// Step 2: Determine which archetypes get collapsed to "Other"
	const otherSet = new Set<string>();
	let sortedNames = [...rawPlayerSets.entries()]
		.filter(([name]) => name !== 'Unknown')
		.sort((a, b) => b[1].size - a[1].size)
		.map(([name]) => name);

	if (topN > 0 && sortedNames.length > topN) {
		for (const name of sortedNames.slice(topN)) {
			otherSet.add(name);
		}
		sortedNames = sortedNames.slice(0, topN);
	}

	if (minMetagameShare > 0) {
		sortedNames = sortedNames.filter((name) => {
			const share = (rawPlayerSets.get(name)?.size ?? 0) / totalPlayers;
			if (share < minMetagameShare) {
				otherSet.add(name);
				return false;
			}
			return true;
		});
	}

	// Build display archetype list (sorted by player count, Other/Unknown last)
	const displayArchetypes = [...sortedNames];
	const hasOther = otherSet.size > 0;
	if (hasOther) displayArchetypes.push('Other');
	const hasUnknown = (rawPlayerSets.get('Unknown')?.size ?? 0) > 0;
	// Merge Unknown into Other when Other exists; only show standalone Unknown if no Other bucket
	if (hasUnknown && !hasOther) displayArchetypes.push('Unknown');

	// Resolve raw archetype to display archetype
	function resolve(raw: string): string {
		if (otherSet.has(raw)) return 'Other';
		if (raw === 'Unknown' && hasOther) return 'Other';
		return raw;
	}

	// Step 3: Build archetype index and initialize cells
	const archIndex = new Map<string, number>();
	for (let i = 0; i < displayArchetypes.length; i++) {
		archIndex.set(displayArchetypes[i], i);
	}
	const n = displayArchetypes.length;
	const cells: MatchupCell[][] = Array.from({ length: n }, () =>
		Array.from({ length: n }, () => ({ wins: 0, losses: 0, draws: 0, intentionalDraws: 0, total: 0, winrate: null })),
	);

	// Step 4: Count players per display archetype
	const displayPlayerSets = new Map<string, Set<string>>();
	for (const name of displayArchetypes) {
		displayPlayerSets.set(name, new Set());
	}
	for (const [playerId, raw] of playerArchetypes) {
		const display = resolve(raw);
		displayPlayerSets.get(display)?.add(playerId);
	}

	// Step 5: Accumulate match results
	const overallWins = new Map<string, number>();
	const overallLosses = new Map<string, number>();
	const overallDraws = new Map<string, number>();
	const overallByes = new Map<string, number>();
	const overallIDs = new Map<string, number>();

	for (const tournament of tournaments) {
		for (const round of Object.values(tournament.rounds)) {
			for (const match of round.matches) {
				// Count byes per archetype (no opponent)
				if (!match.player2Id) {
					const raw = playerArchetypes.get(match.player1Id);
					if (raw) {
						const arch = resolve(raw);
						overallByes.set(arch, (overallByes.get(arch) ?? 0) + 1);
					}
					continue;
				}

				const raw1 = playerArchetypes.get(match.player1Id);
				const raw2 = playerArchetypes.get(match.player2Id);
				if (!raw1 || !raw2) continue;

				const arch1 = resolve(raw1);
				const arch2 = resolve(raw2);

				// Count IDs per cell and per archetype, but exclude from W/L/D
				if (isIntentionalDraw(match)) {
					overallIDs.set(arch1, (overallIDs.get(arch1) ?? 0) + 1);
					overallIDs.set(arch2, (overallIDs.get(arch2) ?? 0) + 1);
					if (!(excludeMirrors && arch1 === arch2)) {
						const i = archIndex.get(arch1);
						const j = archIndex.get(arch2);
						if (i !== undefined && j !== undefined) {
							cells[i][j].intentionalDraws++;
							cells[j][i].intentionalDraws++;
						}
					}
					continue;
				}

				if (excludeMirrors && arch1 === arch2) continue;

				const i = archIndex.get(arch1);
				const j = archIndex.get(arch2);
				if (i === undefined || j === undefined) continue;

				if (match.winnerId === match.player1Id) {
					cells[i][j].wins++;
					cells[j][i].losses++;
					overallWins.set(arch1, (overallWins.get(arch1) ?? 0) + 1);
					overallLosses.set(arch2, (overallLosses.get(arch2) ?? 0) + 1);
				} else if (match.winnerId === match.player2Id) {
					cells[i][j].losses++;
					cells[j][i].wins++;
					overallWins.set(arch2, (overallWins.get(arch2) ?? 0) + 1);
					overallLosses.set(arch1, (overallLosses.get(arch1) ?? 0) + 1);
				} else {
					// Draw (winnerId is null)
					cells[i][j].draws++;
					cells[j][i].draws++;
					overallDraws.set(arch1, (overallDraws.get(arch1) ?? 0) + 1);
					overallDraws.set(arch2, (overallDraws.get(arch2) ?? 0) + 1);
				}
			}
		}
	}

	// Step 6: Compute totals and winrates
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			const cell = cells[i][j];
			cell.total = cell.wins + cell.losses + cell.draws;
			cell.winrate = cell.total > 0 ? cell.wins / cell.total : null;
		}
	}

	// Step 7: Build stats
	const stats: ArchetypeStats[] = displayArchetypes.map((name) => {
		const playerCount = displayPlayerSets.get(name)?.size ?? 0;
		const w = overallWins.get(name) ?? 0;
		const l = overallLosses.get(name) ?? 0;
		const d = overallDraws.get(name) ?? 0;
		const totalMatches = w + l + d;
		return {
			name,
			metagameShare: totalPlayers > 0 ? playerCount / totalPlayers : 0,
			overallWinrate: totalMatches > 0 ? w / totalMatches : 0,
			wins: w,
			losses: l,
			draws: d,
			totalMatches,
			playerCount,
			byes: overallByes.get(name) ?? 0,
			intentionalDraws: overallIDs.get(name) ?? 0,
		};
	});

	return {
		matrix: { archetypes: displayArchetypes, cells },
		stats,
	};
}

/**
 * Compute metagame stats from tournament data (standalone, includes all matches).
 */
export function computeMetagameStats(
	tournaments: TournamentData[],
	playerArchetypes: Map<string, string>,
): ArchetypeStats[] {
	const playerSets = new Map<string, Set<string>>();
	for (const [playerId, archetype] of playerArchetypes) {
		if (!playerSets.has(archetype)) playerSets.set(archetype, new Set());
		playerSets.get(archetype)!.add(playerId);
	}
	const totalPlayers = playerArchetypes.size;

	const wins = new Map<string, number>();
	const losses = new Map<string, number>();
	const draws = new Map<string, number>();
	const byes = new Map<string, number>();
	const ids = new Map<string, number>();

	for (const tournament of tournaments) {
		for (const round of Object.values(tournament.rounds)) {
			for (const match of round.matches) {
				if (!match.player2Id) {
					const arch = playerArchetypes.get(match.player1Id);
					if (arch) byes.set(arch, (byes.get(arch) ?? 0) + 1);
					continue;
				}

				const arch1 = playerArchetypes.get(match.player1Id);
				const arch2 = playerArchetypes.get(match.player2Id);
				if (!arch1 || !arch2) continue;

				if (isIntentionalDraw(match)) {
					ids.set(arch1, (ids.get(arch1) ?? 0) + 1);
					ids.set(arch2, (ids.get(arch2) ?? 0) + 1);
					continue;
				}

				if (match.winnerId === match.player1Id) {
					wins.set(arch1, (wins.get(arch1) ?? 0) + 1);
					losses.set(arch2, (losses.get(arch2) ?? 0) + 1);
				} else if (match.winnerId === match.player2Id) {
					wins.set(arch2, (wins.get(arch2) ?? 0) + 1);
					losses.set(arch1, (losses.get(arch1) ?? 0) + 1);
				} else {
					draws.set(arch1, (draws.get(arch1) ?? 0) + 1);
					draws.set(arch2, (draws.get(arch2) ?? 0) + 1);
				}
			}
		}
	}

	// Sort by player count descending
	const archetypeNames = [...playerSets.entries()]
		.sort((a, b) => b[1].size - a[1].size)
		.map(([name]) => name);

	return archetypeNames.map((name) => {
		const playerCount = playerSets.get(name)?.size ?? 0;
		const w = wins.get(name) ?? 0;
		const l = losses.get(name) ?? 0;
		const d = draws.get(name) ?? 0;
		const totalMatches = w + l + d;
		return {
			name,
			metagameShare: totalPlayers > 0 ? playerCount / totalPlayers : 0,
			overallWinrate: totalMatches > 0 ? w / totalMatches : 0,
			wins: w,
			losses: l,
			draws: d,
			totalMatches,
			playerCount,
			byes: byes.get(name) ?? 0,
			intentionalDraws: ids.get(name) ?? 0,
		};
	});
}

/**
 * Build an attribution (confusion) matrix comparing classifier-assigned archetypes
 * against player self-reported archetypes. Each cell counts decklists.
 */
export function buildAttributionMatrix(
	tournaments: TournamentData[],
	classificationResultsMap: Map<number, ClassificationResult[]>,
): AttributionMatrix | null {
	// Count: classified → reported → count
	const counts = new Map<string, Map<string, number>>();

	for (const t of tournaments) {
		const results = classificationResultsMap.get(t.meta.id) ?? [];
		for (const r of results) {
			const decklist = t.decklists[r.decklistId];
			if (!decklist) continue;

			const classified = r.archetype;
			const raw = decklist.reportedArchetype?.trim();
			const reported = raw ? raw : 'No Report';

			if (!counts.has(classified)) counts.set(classified, new Map());
			const inner = counts.get(classified)!;
			inner.set(reported, (inner.get(reported) ?? 0) + 1);
		}
	}

	if (counts.size === 0) return null;

	// Collect totals per classified archetype
	const classifiedTotals = new Map<string, number>();
	for (const [classified, inner] of counts) {
		let total = 0;
		for (const count of inner.values()) total += count;
		classifiedTotals.set(classified, total);
	}

	// Collect totals per reported archetype
	const reportedTotals = new Map<string, number>();
	for (const inner of counts.values()) {
		for (const [reported, count] of inner) {
			reportedTotals.set(reported, (reportedTotals.get(reported) ?? 0) + count);
		}
	}

	// Sort both axes by total count descending
	const classifiedArchetypes = [...classifiedTotals.entries()]
		.sort((a, b) => b[1] - a[1])
		.map(([name]) => name);
	const reportedArchetypes = [...reportedTotals.entries()]
		.sort((a, b) => b[1] - a[1])
		.map(([name]) => name);

	// Build cells, totals, maxCount
	const rowTotals: number[] = [];
	const colTotals: number[] = new Array(reportedArchetypes.length).fill(0);
	let grandTotal = 0;
	let maxCount = 0;

	const cells: number[][] = classifiedArchetypes.map((classified) => {
		const inner = counts.get(classified) ?? new Map<string, number>();
		let rowTotal = 0;
		const row = reportedArchetypes.map((reported, j) => {
			const count = inner.get(reported) ?? 0;
			rowTotal += count;
			colTotals[j] += count;
			if (count > maxCount) maxCount = count;
			return count;
		});
		rowTotals.push(rowTotal);
		grandTotal += rowTotal;
		return row;
	});

	return {
		classifiedArchetypes,
		reportedArchetypes,
		cells,
		rowTotals,
		colTotals,
		grandTotal,
		maxCount,
	};
}
