import type { DecklistInfo } from "../../src/lib/types/decklist";
import type {
	MatchResult,
	PlayerInfo,
	RoundInfo,
	TournamentData,
} from "../../src/lib/types/tournament";
import { parseDecklistRecords } from "./html-parser";
import type {
	MeleeDecklistDetails,
	MeleeMatchRow,
	MeleeStandingRow,
	ParsedRound,
	ParsedTournamentPage,
} from "./types";

export interface AssembleInput {
	tournamentId: number;
	parsed: ParsedTournamentPage;
	standings: MeleeStandingRow[];
	decklists: Map<string, { details: MeleeDecklistDetails; playerId: number }>;
	completedRounds: ParsedRound[];
	roundMatches: Map<number, MeleeMatchRow[]>;
}

export function assembleTournament(input: AssembleInput): TournamentData {
	const { tournamentId, parsed, standings, decklists, completedRounds, roundMatches } =
		input;

	// Build players from standings
	const players: Record<string, PlayerInfo> = {};
	for (const s of standings) {
		const player = s.Team.Players[0];
		if (!player) continue;
		const playerId = String(player.ID);

		players[playerId] = {
			name: player.DisplayName,
			username: player.Username,
			rank: s.Rank,
			points: s.Points,
			matchRecord: `${s.MatchWins}-${s.MatchLosses}-${s.MatchDraws}`,
			decklistIds: s.Decklists.map((d) => d.DecklistId),
			reportedArchetypes: s.Decklists.map((d) => d.DecklistName || "Unknown"),
		};
	}

	// Build decklists
	const decklistsOut: Record<string, DecklistInfo> = {};
	for (const [deckId, { details, playerId }] of decklists) {
		const parsed = parseDecklistRecords(details);
		decklistsOut[deckId] = {
			playerId: String(playerId),
			mainboard: parsed.mainboard,
			sideboard: parsed.sideboard,
			companion: parsed.companion,
			reportedArchetype: parsed.reportedArchetype,
		};
	}

	// Build rounds from matches
	const rounds: Record<string, RoundInfo> = {};
	for (const round of completedRounds) {
		const rawMatches = roundMatches.get(round.id) ?? [];

		const matches: MatchResult[] = rawMatches.map((m) => parseMatchResult(m));

		const roundNumber = extractRoundNumber(round.name);
		const isPlayoff = isPlayoffRound(round.name);

		rounds[String(round.id)] = {
			name: round.name,
			number: roundNumber,
			isPlayoff,
			matches,
		};
	}

	const {
		players: cleanedPlayers,
		rounds: cleanedRounds,
		removedCount,
	} = removeNoShows(players, rounds);
	if (removedCount > 0) {
		console.log(
			`  Removed ${removedCount} no-show player(s) and converted their R1 matches to byes.`,
		);
	}

	return {
		meta: {
			id: `melee-${tournamentId}`,
			name: parsed.name,
			date: parsed.date,
			formats: parsed.formats,
			url: `https://melee.gg/Tournament/View/${tournamentId}`,
			fetchedAt: new Date().toISOString(),
			playerCount: Object.keys(cleanedPlayers).length,
			roundCount: completedRounds.length,
			source: "melee",
			tabletop: true,
		},
		players: cleanedPlayers,
		decklists: decklistsOut,
		rounds: cleanedRounds,
	};
}

/**
 * Parse a MeleeMatchRow into our MatchResult format.
 */
function parseMatchResult(m: MeleeMatchRow): MatchResult {
	const competitors = m.Competitors;

	if (competitors.length === 0) {
		return {
			player1Id: "",
			player2Id: null,
			result: "unknown",
			winnerId: null,
		};
	}

	const p1 = competitors[0];
	const p2 = competitors.length > 1 ? competitors[1] : null;

	const player1Id = String(p1.Team.Players[0]?.ID ?? p1.TeamId);
	const player2Id = p2 ? String(p2.Team.Players[0]?.ID ?? p2.TeamId) : null;

	// Determine winner from GameWins/GameByes
	let winnerId: string | null = null;
	let result = m.ResultString;

	if (m.ByeReasonDescription) {
		// Bye
		result = "bye";
		winnerId = player1Id;
	} else if (p1 && p2) {
		const p1Wins = p1.GameWinsAndGameByes ?? 0;
		const p2Wins = p2.GameWinsAndGameByes ?? 0;

		if (p1Wins > p2Wins) {
			winnerId = player1Id;
			result = `${p1Wins}-${p2Wins}-${m.GameDraws}`;
		} else if (p2Wins > p1Wins) {
			winnerId = player2Id;
			result = `${p2Wins}-${p1Wins}-${m.GameDraws}`;
		} else {
			winnerId = null;
			result = `${p1Wins}-${p2Wins}-${m.GameDraws}` || "draw";
		}
	}

	return { player1Id, player2Id, result, winnerId };
}

function extractRoundNumber(name: string): number {
	const match = name.match(/Round\s+(\d+)/i);
	if (match) return Number(match[1]);

	// Playoff rounds: assign high numbers
	const lower = name.toLowerCase();
	if (lower.includes("quarterfinal")) return 900;
	if (lower.includes("semifinal")) return 950;
	if (lower.includes("final") && !lower.includes("semi") && !lower.includes("quarter"))
		return 999;
	if (lower.includes("top 8")) return 900;
	if (lower.includes("top 4")) return 950;

	return 0;
}

function isPlayoffRound(name: string): boolean {
	const lower = name.toLowerCase();
	return (
		lower.includes("quarterfinal") ||
		lower.includes("semifinal") ||
		lower.includes("final") ||
		lower.includes("top 8") ||
		lower.includes("top 4") ||
		lower.includes("playoff")
	);
}

/**
 * Detect and remove no-show players from assembled tournament data.
 *
 * A player is considered a no-show if ALL of the following hold:
 *   1. They have no decklists (decklistIds is empty)
 *   2. They lost their round 1 match (winnerId !== their id)
 *   3. They do not appear in any round 2 match
 *
 * No-show players are removed from `players` and their R1 matches are
 * converted to proper byes for the opponent.
 */
function removeNoShows(
	players: Record<string, PlayerInfo>,
	rounds: Record<string, RoundInfo>,
): {
	players: Record<string, PlayerInfo>;
	rounds: Record<string, RoundInfo>;
	removedCount: number;
} {
	const sortedRoundKeys = Object.keys(rounds).sort(
		(a, b) => rounds[a].number - rounds[b].number,
	);
	if (sortedRoundKeys.length < 2) return { players, rounds, removedCount: 0 };

	const r1Key = sortedRoundKeys[0];
	const r2Key = sortedRoundKeys[1];
	const r1Matches = rounds[r1Key].matches;
	const r2Matches = rounds[r2Key].matches;

	// Players present in R2
	const inR2 = new Set<string>();
	for (const m of r2Matches) {
		if (m.player1Id) inR2.add(m.player1Id);
		if (m.player2Id) inR2.add(m.player2Id);
	}

	// Identify no-shows
	const noShows = new Set<string>();
	for (const m of r1Matches) {
		for (const pid of [m.player1Id, m.player2Id]) {
			if (!pid) continue;
			if (
				pid in players &&
				players[pid].decklistIds.length === 0 &&
				m.winnerId !== pid &&
				!inR2.has(pid)
			) {
				noShows.add(pid);
			}
		}
	}

	if (noShows.size === 0) return { players, rounds, removedCount: 0 };

	// Remove from players
	const cleanedPlayers = { ...players };
	for (const pid of noShows) delete cleanedPlayers[pid];

	// Convert R1 matches to byes
	const cleanedR1Matches = r1Matches.map((m): MatchResult => {
		const p1IsNoShow = m.player1Id !== null && noShows.has(m.player1Id);
		const p2IsNoShow = m.player2Id !== null && noShows.has(m.player2Id);
		if (!p1IsNoShow && !p2IsNoShow) return m;

		const opponentId = p1IsNoShow ? m.player2Id : m.player1Id;
		return {
			player1Id: opponentId ?? "",
			player2Id: null,
			result: "bye",
			winnerId: opponentId,
		};
	});

	const cleanedRounds = {
		...rounds,
		[r1Key]: { ...rounds[r1Key], matches: cleanedR1Matches },
	};

	return { players: cleanedPlayers, rounds: cleanedRounds, removedCount: noShows.size };
}
