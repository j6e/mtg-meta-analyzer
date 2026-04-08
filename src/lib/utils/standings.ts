/**
 * Standings remainder computation — extracts unrecorded wins/losses/draws
 * from player match records for tournaments with incomplete round data.
 */

import type { TournamentData } from "../types/tournament";

export interface StandingsRemainder {
	/** archetype → extra wins not counted in recorded rounds */
	extraWins: Map<string, number>;
	/** archetype → extra losses */
	extraLosses: Map<string, number>;
	/** archetype → extra draws */
	extraDraws: Map<string, number>;
	/** total extra records added (for UI display) */
	totalExtraRecords: number;
}

/** Parse a "W-L-D" match record string into numeric components. */
export function parseMatchRecord(record: string): {
	w: number;
	l: number;
	d: number;
} {
	const parts = record.split("-");
	return {
		w: Number(parts[0]) || 0,
		l: Number(parts[1]) || 0,
		d: Number(parts[2]) || 0,
	};
}

/**
 * Count a player's wins, losses, and draws from the recorded rounds
 * of a tournament. Byes count as wins (consistent with how standings
 * records count them). Intentional draws (0-0-3) count as draws.
 */
export function countPlayerRoundResults(
	tournament: TournamentData,
	playerId: string,
): { w: number; l: number; d: number } {
	let w = 0;
	let l = 0;
	let d = 0;

	for (const round of Object.values(tournament.rounds)) {
		for (const match of round.matches) {
			if (match.player1Id === playerId) {
				if (!match.player2Id) {
					// Bye — counted as a win in standings
					w++;
				} else if (match.result === "0-0-3") {
					// Intentional draw
					d++;
				} else if (match.winnerId === playerId) {
					w++;
				} else if (match.winnerId === null) {
					d++;
				} else {
					l++;
				}
			} else if (match.player2Id === playerId) {
				if (match.result === "0-0-3") {
					d++;
				} else if (match.winnerId === playerId) {
					w++;
				} else if (match.winnerId === null) {
					d++;
				} else {
					l++;
				}
			}
		}
	}

	return { w, l, d };
}

/** Returns true if a tournament has incomplete round data. */
export function hasIncompleteRounds(tournament: TournamentData): boolean {
	return Object.keys(tournament.rounds).length < tournament.meta.roundCount;
}

/**
 * Compute the standings remainder: for each player in tournaments with
 * incomplete round data, subtract their recorded round results from their
 * total match record. The remainder represents real matches we know the
 * outcome of but don't have round-level detail for.
 *
 * Results are accumulated per archetype using the provided playerArchetypes map.
 */
export function computeStandingsRemainder(
	tournaments: TournamentData[],
	playerArchetypes: Map<string, string>,
): StandingsRemainder {
	const extraWins = new Map<string, number>();
	const extraLosses = new Map<string, number>();
	const extraDraws = new Map<string, number>();
	let totalExtraRecords = 0;

	for (const t of tournaments) {
		if (!hasIncompleteRounds(t)) continue;

		for (const [playerId, player] of Object.entries(t.players)) {
			const archetype = playerArchetypes.get(`${t.meta.id}:${playerId}`);
			if (!archetype) continue;

			const total = parseMatchRecord(player.matchRecord);
			const recorded = countPlayerRoundResults(t, playerId);

			const ew = Math.max(0, total.w - recorded.w);
			const el = Math.max(0, total.l - recorded.l);
			const ed = Math.max(0, total.d - recorded.d);

			if (ew + el + ed === 0) continue;

			extraWins.set(archetype, (extraWins.get(archetype) ?? 0) + ew);
			extraLosses.set(archetype, (extraLosses.get(archetype) ?? 0) + el);
			extraDraws.set(archetype, (extraDraws.get(archetype) ?? 0) + ed);
			totalExtraRecords += ew + el + ed;
		}
	}

	return { extraWins, extraLosses, extraDraws, totalExtraRecords };
}
