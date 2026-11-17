import type { DecklistInfo } from "../types/decklist";
import type { TournamentData } from "../types/tournament";

export interface EnrichedDecklist {
	decklist: DecklistInfo;
	decklistId: string;
	playerName: string;
	playerId: string;
	playerRank: number;
	matchRecord: string;
	tournamentName: string;
	tournamentDate: string;
	tournamentUrl: string;
	tournamentPlayerCount: number;
	tournamentId: string;
}

/**
 * Collect all decklists for a given archetype across tournaments,
 * enriched with player and tournament metadata.
 *
 * `tournamentNames` maps tournament id → cleaned display name (as shown on the
 * Tournaments page); tournaments missing from it keep their raw name.
 */
export function collectArchetypeDecklists(
	tournaments: TournamentData[],
	playerArchetypes: Map<string, string>,
	archetypeName: string,
	tournamentNames: Map<string, string> = new Map(),
): EnrichedDecklist[] {
	const result: EnrichedDecklist[] = [];

	for (const t of tournaments) {
		for (const [playerId, player] of Object.entries(t.players)) {
			if (playerArchetypes.get(`${t.meta.id}:${playerId}`) !== archetypeName) continue;
			for (const deckId of player.decklistIds) {
				const deck = t.decklists[deckId];
				if (deck) {
					result.push({
						decklist: deck,
						decklistId: deckId,
						playerName: player.name,
						playerId,
						playerRank: player.rank,
						matchRecord: player.matchRecord,
						tournamentName: tournamentNames.get(t.meta.id) ?? t.meta.name,
						tournamentDate: t.meta.date,
						tournamentUrl: t.meta.url,
						tournamentPlayerCount: t.meta.playerCount,
						tournamentId: t.meta.id,
					});
				}
			}
		}
	}

	return result;
}

/**
 * Collect raw DecklistInfo[] for an archetype (no metadata).
 */
export function collectRawDecklists(
	tournaments: TournamentData[],
	playerArchetypes: Map<string, string>,
	archetypeName: string,
): DecklistInfo[] {
	return collectArchetypeDecklists(tournaments, playerArchetypes, archetypeName).map(
		(e) => e.decklist,
	);
}

/**
 * Find the decklist with the best standing (lowest rank) across all tournaments.
 * Ties broken by tournament name (alphabetical), then player name.
 */
export function findBestDecklist(
	enriched: EnrichedDecklist[],
): EnrichedDecklist | null {
	if (enriched.length === 0) return null;

	return enriched.reduce((best, curr) => {
		if (curr.playerRank < best.playerRank) return curr;
		if (curr.playerRank > best.playerRank) return best;
		// Same rank — tiebreak by tournament name, then player name
		const tCmp = curr.tournamentName.localeCompare(best.tournamentName);
		if (tCmp !== 0) return tCmp < 0 ? curr : best;
		return curr.playerName.localeCompare(best.playerName) < 0 ? curr : best;
	});
}
