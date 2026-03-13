import type { CardEntry, DecklistInfo } from "../../src/lib/types/decklist";
import type {
	MatchResult,
	PlayerInfo,
	RoundInfo,
	TournamentData,
} from "../../src/lib/types/tournament";
import type {
	MtgoRawBracketRound,
	MtgoRawDeck,
	MtgoRawFinalRank,
	MtgoRawTournament,
	MtgoRawWinLoss,
} from "./mtgo-client";

// ---------------------------------------------------------------------------
// Format code mapping
// ---------------------------------------------------------------------------

const FORMAT_CODE_MAP: Record<string, string> = {
	CSTANDARD: "Standard",
	CMODERN: "Modern",
	CPIONEER: "Pioneer",
	CLEGACY: "Legacy",
	CPAUPER: "Pauper",
	CVINTAGE: "Vintage",
	CPREMODERN: "Premodern",
	CHULAHOOP: "Premodern", // pre-March 2026 combined event
};

export function formatCodeToName(code: string): string {
	return FORMAT_CODE_MAP[code] ?? "Unknown";
}

// ---------------------------------------------------------------------------
// Assembler
// ---------------------------------------------------------------------------

export function assembleMtgoTournament(
	raw: MtgoRawTournament,
	href: string,
): TournamentData {
	const totalRounds =
		raw.final_rank.length > 0 ? Number(raw.final_rank[0].roundnumber) : 0;

	// Build lookup maps
	const winlossMap = new Map<string, MtgoRawWinLoss>();
	for (const wl of raw.winloss) {
		winlossMap.set(wl.loginid, wl);
	}

	const finalRankMap = new Map<string, MtgoRawFinalRank>();
	for (const fr of raw.final_rank) {
		finalRankMap.set(fr.loginid, fr);
	}

	const decksByPlayer = new Map<string, MtgoRawDeck>();
	for (const deck of raw.decklists) {
		decksByPlayer.set(deck.loginid, deck);
	}

	// Build players from standings
	const players: Record<string, PlayerInfo> = {};
	for (const standing of raw.standings) {
		const loginid = standing.loginid;
		const wl = winlossMap.get(loginid);
		const fr = finalRankMap.get(loginid);
		const deck = decksByPlayer.get(loginid);

		const wins = wl ? Number(wl.wins) : 0;
		const losses = wl ? Number(wl.losses) : 0;

		const decklistId = deck ? `mtgo-deck-${deck.decktournamentid}` : null;

		players[loginid] = {
			name: standing.login_name,
			username: standing.login_name,
			rank: fr ? Number(fr.rank) : Number(standing.rank),
			points: Number(standing.score),
			matchRecord: `${wins}-${losses}-0`,
			decklistIds: decklistId ? [decklistId] : [],
			reportedArchetypes: [],
		};
	}

	// Build decklists
	const decklists: Record<string, DecklistInfo> = {};
	for (const deck of raw.decklists) {
		const decklistId = `mtgo-deck-${deck.decktournamentid}`;
		decklists[decklistId] = {
			playerId: deck.loginid,
			mainboard: parseCards(deck.main_deck),
			sideboard: parseCards(deck.sideboard_deck),
			commanders: null,
			companion: null,
			reportedArchetype: null,
		};
	}

	// Build playoff rounds from brackets
	const rounds: Record<string, RoundInfo> = {};
	if (raw.brackets.length > 0) {
		const bracketRounds = buildPlayoffRounds(raw.brackets);
		for (const [key, round] of Object.entries(bracketRounds)) {
			rounds[key] = round;
		}
	}

	return {
		meta: {
			id: `mtgo-${raw.event_id}`,
			name: raw.description,
			date: raw.starttime.slice(0, 10),
			formats: [formatCodeToName(raw.format)],
			url: `https://www.mtgo.com${href}`,
			fetchedAt: new Date().toISOString(),
			playerCount: Number(raw.player_count.players),
			roundCount: totalRounds,
			source: "mtgo",
			tabletop: false,
		},
		players,
		decklists,
		rounds,
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseCards(cards: MtgoRawDeck["main_deck"]): CardEntry[] {
	return cards.map((c) => ({
		cardName: c.card_attributes.card_name,
		quantity: Number(c.qty),
	}));
}

const BRACKET_ROUND_NAMES: Record<
	number,
	{ key: string; name: string; number: number }
> = {
	0: { key: "playoffs-f", name: "Finals", number: 999 },
	1: { key: "playoffs-sf", name: "Semifinals", number: 950 },
	2: { key: "playoffs-qf", name: "Quarterfinals", number: 900 },
};

function buildPlayoffRounds(
	brackets: MtgoRawBracketRound[],
): Record<string, RoundInfo> {
	const rounds: Record<string, RoundInfo> = {};

	for (const bracket of brackets) {
		const info = BRACKET_ROUND_NAMES[bracket.index];
		if (!info) continue;

		const matches: MatchResult[] = bracket.matches.map((m) => {
			const winner = m.players.find((p) => p.winner);
			const loser = m.players.find((p) => !p.winner);

			return {
				player1Id: winner ? String(winner.loginid) : "",
				player2Id: loser ? String(loser.loginid) : null,
				result: winner && loser ? `${winner.wins}-${loser.wins}-0` : "unknown",
				winnerId: winner ? String(winner.loginid) : null,
			};
		});

		rounds[info.key] = {
			name: info.name,
			number: info.number,
			isPlayoff: true,
			matches,
		};
	}

	return rounds;
}
