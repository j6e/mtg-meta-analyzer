import type { CardEntry, DecklistInfo } from "../../src/lib/types/decklist";
import type {
	MatchResult,
	PlayerInfo,
	RoundInfo,
	TournamentData,
} from "../../src/lib/types/tournament";
import { getFrontFace } from "../../src/lib/utils/card-normalizer";
import { PLAYOFF_ROUNDS } from "./round-utils";
import type { VidereRawCard, VidereRawEvent, VidereRawMatch } from "./videre-client";

// ---------------------------------------------------------------------------
// Assembler
// ---------------------------------------------------------------------------

export function assembleVidereTournament(raw: VidereRawEvent): TournamentData {
	const { event } = raw;

	// events.rounds counts Swiss only; playoff rounds appear as higher numbers
	const maxRound = raw.matches.reduce((max, m) => Math.max(max, m.round), 0);
	const roundCount = Math.max(event.rounds, maxRound);

	const decksByPlayer = new Map<string, number>();
	for (const deck of raw.decks) {
		decksByPlayer.set(deck.player, deck.id);
	}

	// Players from standings, keyed by player name (videre has no numeric ids)
	const players: Record<string, PlayerInfo> = {};
	for (const standing of raw.standings) {
		const deckId = decksByPlayer.get(standing.player);
		players[standing.player] = {
			name: standing.player,
			username: standing.player,
			rank: standing.rank,
			points: standing.points,
			matchRecord: standing.record,
			decklistIds: deckId !== undefined ? [`videre-deck-${deckId}`] : [],
			reportedArchetypes: [],
		};
	}

	const decklists: Record<string, DecklistInfo> = {};
	for (const deck of raw.decks) {
		decklists[`videre-deck-${deck.id}`] = {
			playerId: deck.player,
			mainboard: parseCards(deck.mainboard),
			sideboard: parseCards(deck.sideboard),
			commanders: null,
			companion: null,
			reportedArchetype: null,
		};
	}

	return {
		meta: {
			id: `videre-${event.id}`,
			name: event.name,
			date: event.date,
			formats: [event.format],
			url: `https://api.videreproject.com/events?event_id=${event.id}`,
			fetchedAt: new Date().toISOString(),
			playerCount: event.players,
			roundCount,
			source: "videre",
			tabletop: false,
		},
		players,
		decklists,
		rounds: buildRounds(raw.matches, event.rounds),
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseCards(cards: VidereRawCard[]): CardEntry[] {
	return cards.map((c) => ({
		cardName: getFrontFace(c.name),
		quantity: c.quantity,
	}));
}

/**
 * Collapse mirrored match rows (one row per player per round) into one
 * MatchResult per pairing: keep the winner's row (its game-level record is the
 * result string), for draws keep the row where player < opponent, and turn
 * bye rows (recorded as wins with null opponent) into explicit byes.
 */
function collapseRound(rows: VidereRawMatch[]): MatchResult[] {
	const matches: MatchResult[] = [];
	for (const m of rows) {
		if (m.isbye || m.opponent === null) {
			matches.push({
				player1Id: m.player,
				player2Id: null,
				result: "bye",
				winnerId: m.player,
			});
		} else if (m.result === "win") {
			matches.push({
				player1Id: m.player,
				player2Id: m.opponent,
				result: m.record,
				winnerId: m.player,
			});
		} else if (m.result === "draw" && m.player < m.opponent) {
			matches.push({
				player1Id: m.player,
				player2Id: m.opponent,
				result: m.record,
				winnerId: null,
			});
		}
		// 'loss' rows and the mirrored half of draws are the same pairing
		// seen from the other side — skipped.
	}
	return matches;
}

function buildRounds(
	allMatches: VidereRawMatch[],
	swissRounds: number,
): Record<string, RoundInfo> {
	const byRound = new Map<number, VidereRawMatch[]>();
	for (const m of allMatches) {
		const list = byRound.get(m.round);
		if (list) list.push(m);
		else byRound.set(m.round, [m]);
	}

	const roundNumbers = [...byRound.keys()].sort((a, b) => a - b);
	const playoffRounds = roundNumbers.filter((n) => n > swissRounds);
	const lastRound = playoffRounds[playoffRounds.length - 1];

	const rounds: Record<string, RoundInfo> = {};
	for (const n of roundNumbers) {
		const matches = collapseRound(byRound.get(n)!);

		if (n <= swissRounds) {
			rounds[String(n)] = {
				name: `Round ${n}`,
				number: n,
				isPlayoff: false,
				matches,
			};
		} else {
			// Map playoff rounds from the last round backwards (position-from-end,
			// not player-count, so Top-4 events map to sf/f correctly)
			const info = PLAYOFF_ROUNDS[lastRound - n];
			if (!info) continue;
			rounds[info.key] = {
				name: info.name,
				number: info.number,
				isPlayoff: true,
				matches,
			};
		}
	}

	return rounds;
}
