import type {
	MeleeStandingRow,
	MeleeMatchRow,
	MeleeDecklistDetails,
	ParsedTournamentPage,
	ParsedRound,
} from './types';
import type {
	TournamentData,
	PlayerInfo,
	MatchResult,
	RoundInfo,
} from '../../src/lib/types/tournament';
import type { DecklistInfo } from '../../src/lib/types/decklist';
import { parseDecklistRecords } from './html-parser';

export interface AssembleInput {
	tournamentId: number;
	parsed: ParsedTournamentPage;
	standings: MeleeStandingRow[];
	decklists: Map<string, { details: MeleeDecklistDetails; playerId: number }>;
	completedRounds: ParsedRound[];
	roundMatches: Map<number, MeleeMatchRow[]>;
}

export function assembleTournament(input: AssembleInput): TournamentData {
	const { tournamentId, parsed, standings, decklists, completedRounds, roundMatches } = input;

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
			reportedArchetypes: s.Decklists.map((d) => d.DecklistName || 'Unknown'),
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

	return {
		meta: {
			id: tournamentId,
			name: parsed.name,
			date: parsed.date,
			formats: parsed.formats,
			url: `https://melee.gg/Tournament/View/${tournamentId}`,
			fetchedAt: new Date().toISOString(),
			playerCount: Object.keys(players).length,
			roundCount: completedRounds.length,
		},
		players,
		decklists: decklistsOut,
		rounds,
	};
}

/**
 * Parse a MeleeMatchRow into our MatchResult format.
 */
function parseMatchResult(m: MeleeMatchRow): MatchResult {
	const competitors = m.Competitors;

	if (competitors.length === 0) {
		return { player1Id: '', player2Id: null, result: 'unknown', winnerId: null };
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
		result = 'bye';
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
			result = `${p1Wins}-${p2Wins}-${m.GameDraws}` || 'draw';
		}
	}

	return { player1Id, player2Id, result, winnerId };
}

function extractRoundNumber(name: string): number {
	const match = name.match(/Round\s+(\d+)/i);
	if (match) return Number(match[1]);

	// Playoff rounds: assign high numbers
	const lower = name.toLowerCase();
	if (lower.includes('quarterfinal')) return 900;
	if (lower.includes('semifinal')) return 950;
	if (lower.includes('final') && !lower.includes('semi') && !lower.includes('quarter')) return 999;
	if (lower.includes('top 8')) return 900;
	if (lower.includes('top 4')) return 950;

	return 0;
}

function isPlayoffRound(name: string): boolean {
	const lower = name.toLowerCase();
	return (
		lower.includes('quarterfinal') ||
		lower.includes('semifinal') ||
		lower.includes('final') ||
		lower.includes('top 8') ||
		lower.includes('top 4') ||
		lower.includes('playoff')
	);
}
