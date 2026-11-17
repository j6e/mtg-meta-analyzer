import type {
	DecklistInfo,
	DecklistPlayer,
	DecklistTournament,
} from "../types/decklist";
import type { TournamentData } from "../types/tournament";

export interface EnrichedDecklist {
	decklist: DecklistInfo;
	decklistId: string;
	player: DecklistPlayer;
	tournament: DecklistTournament;
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
		const tournament: DecklistTournament = {
			id: t.meta.id,
			name: tournamentNames.get(t.meta.id) ?? t.meta.name,
			date: t.meta.date,
			url: t.meta.url,
			playerCount: t.meta.playerCount,
		};
		for (const [playerId, player] of Object.entries(t.players)) {
			if (playerArchetypes.get(`${t.meta.id}:${playerId}`) !== archetypeName) continue;
			for (const deckId of player.decklistIds) {
				const deck = t.decklists[deckId];
				if (deck) {
					result.push({
						decklist: deck,
						decklistId: deckId,
						player: {
							id: playerId,
							name: player.name,
							rank: player.rank,
							record: player.matchRecord,
						},
						tournament,
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
		if (curr.player.rank < best.player.rank) return curr;
		if (curr.player.rank > best.player.rank) return best;
		// Same rank — tiebreak by tournament name, then player name
		const tCmp = curr.tournament.name.localeCompare(best.tournament.name);
		if (tCmp !== 0) return tCmp < 0 ? curr : best;
		return curr.player.name.localeCompare(best.player.name) < 0 ? curr : best;
	});
}
