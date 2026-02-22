import { describe, it, expect } from 'vitest';
import { assembleTournament } from '../../scripts/lib/assembler';
import type {
	MeleeStandingRow,
	MeleeMatchRow,
	MeleeDecklistDetails,
	ParsedTournamentPage,
	ParsedRound,
} from '../../scripts/lib/types';

function makeStanding(overrides: Partial<MeleeStandingRow> = {}): MeleeStandingRow {
	return {
		Rank: 1,
		Points: 9,
		MatchWins: 3,
		MatchLosses: 0,
		MatchDraws: 0,
		OpponentMatchWinPercentage: 0.5,
		TeamGameWinPercentage: 0.75,
		OpponentGameWinPercentage: 0.5,
		Team: {
			Players: [{ ID: 100, DisplayName: 'Alice', Username: 'alice123', TeamId: 1 }],
		},
		Decklists: [{ DecklistId: 'deck-aaa', PlayerId: 100, DecklistName: 'Mono Red', Format: 'Standard', FormatId: 'fmt-1' }],
		...overrides,
	};
}

function makeMatch(overrides: Partial<MeleeMatchRow> = {}): MeleeMatchRow {
	return {
		Guid: 'match-1',
		Competitors: [
			{
				ID: 1,
				CheckedIn: null,
				ResultConfirmed: null,
				SortOrder: 0,
				GameByes: 0,
				GameWins: 2,
				GameWinsAndGameByes: 2,
				TeamId: 1,
				Team: { ID: 1, Name: null, Players: [{ ID: 100, DisplayName: 'Alice', DisplayNameLastFirst: 'Alice', Username: 'alice123', TeamId: 1 }] },
				Decklists: [],
			},
			{
				ID: 2,
				CheckedIn: null,
				ResultConfirmed: null,
				SortOrder: 1,
				GameByes: 0,
				GameWins: 1,
				GameWinsAndGameByes: 1,
				TeamId: 2,
				Team: { ID: 2, Name: null, Players: [{ ID: 200, DisplayName: 'Bob', DisplayNameLastFirst: 'Bob', Username: 'bob456', TeamId: 2 }] },
				Decklists: [],
			},
		],
		RoundNumber: 1,
		RoundId: 5000,
		TournamentId: 999,
		Format: 'Standard',
		FormatDescription: 'Standard',
		ResultString: '2-1-0',
		HasResult: true,
		GameDraws: 0,
		TableNumber: 1,
		ByeReasonDescription: null,
		...overrides,
	};
}

function makeDecklistDetails(overrides: Partial<MeleeDecklistDetails> = {}): MeleeDecklistDetails {
	return {
		Guid: 'deck-aaa',
		DecklistName: 'Mono Red',
		FormatName: 'Standard',
		Game: 'MagicTheGathering',
		Records: [
			{ l: 'mountain', n: 'Mountain', s: null, q: 20, c: 0, t: 'Land' },
			{ l: 'lightningbolt', n: 'Lightning Bolt', s: null, q: 4, c: 0, t: 'Instant' },
			{ l: 'negate', n: 'Negate', s: null, q: 2, c: 99, t: 'Instant' },
		],
		LinkToCards: true,
		Components: [],
		...overrides,
	};
}

const baseParsed: ParsedTournamentPage = {
	name: 'Test Tournament',
	date: '2024-01-15',
	formats: ['Standard'],
	rounds: [
		{ id: 5000, name: 'Round 1', isCompleted: true, isStarted: false },
	],
};

describe('assembleTournament', () => {
	it('assembles a basic tournament with one player, one round, one match', () => {
		const standings = [
			makeStanding(),
			makeStanding({
				Rank: 2,
				Points: 6,
				MatchWins: 2,
				MatchLosses: 1,
				MatchDraws: 0,
				Team: { Players: [{ ID: 200, DisplayName: 'Bob', Username: 'bob456', TeamId: 2 }] },
				Decklists: [{ DecklistId: 'deck-bbb', PlayerId: 200, DecklistName: 'Control', Format: 'Standard', FormatId: 'fmt-1' }],
			}),
		];

		const decklists = new Map<string, { details: MeleeDecklistDetails; playerId: number }>();
		decklists.set('deck-aaa', { details: makeDecklistDetails(), playerId: 100 });
		decklists.set('deck-bbb', {
			details: makeDecklistDetails({ Guid: 'deck-bbb', DecklistName: 'Control', Records: [] }),
			playerId: 200,
		});

		const completedRounds: ParsedRound[] = [{ id: 5000, name: 'Round 1', isCompleted: true, isStarted: false }];
		const roundMatches = new Map<number, MeleeMatchRow[]>();
		roundMatches.set(5000, [makeMatch()]);

		const result = assembleTournament({
			tournamentId: 999,
			parsed: baseParsed,
			standings,
			decklists,
			completedRounds,
			roundMatches,
		});

		// Meta
		expect(result.meta.id).toBe(999);
		expect(result.meta.name).toBe('Test Tournament');
		expect(result.meta.date).toBe('2024-01-15');
		expect(result.meta.formats).toEqual(['Standard']);
		expect(result.meta.url).toBe('https://melee.gg/Tournament/View/999');
		expect(result.meta.playerCount).toBe(2);
		expect(result.meta.roundCount).toBe(1);

		// Players
		expect(result.players['100']).toBeDefined();
		expect(result.players['100'].name).toBe('Alice');
		expect(result.players['100'].username).toBe('alice123');
		expect(result.players['100'].rank).toBe(1);
		expect(result.players['100'].matchRecord).toBe('3-0-0');
		expect(result.players['100'].decklistIds).toEqual(['deck-aaa']);
		expect(result.players['100'].reportedArchetypes).toEqual(['Mono Red']);

		expect(result.players['200']).toBeDefined();
		expect(result.players['200'].name).toBe('Bob');
		expect(result.players['200'].matchRecord).toBe('2-1-0');

		// Decklists
		expect(result.decklists['deck-aaa']).toBeDefined();
		expect(result.decklists['deck-aaa'].playerId).toBe('100');
		expect(result.decklists['deck-aaa'].mainboard).toHaveLength(2);
		expect(result.decklists['deck-aaa'].sideboard).toHaveLength(1);
		expect(result.decklists['deck-aaa'].reportedArchetype).toBe('Mono Red');

		// Rounds
		expect(result.rounds['5000']).toBeDefined();
		expect(result.rounds['5000'].name).toBe('Round 1');
		expect(result.rounds['5000'].number).toBe(1);
		expect(result.rounds['5000'].isPlayoff).toBe(false);
		expect(result.rounds['5000'].matches).toHaveLength(1);

		// Match result
		const match = result.rounds['5000'].matches[0];
		expect(match.player1Id).toBe('100');
		expect(match.player2Id).toBe('200');
		expect(match.winnerId).toBe('100');
		expect(match.result).toBe('2-1-0');
	});

	it('handles bye matches', () => {
		const standings = [makeStanding()];
		const decklists = new Map<string, { details: MeleeDecklistDetails; playerId: number }>();
		const completedRounds: ParsedRound[] = [{ id: 5000, name: 'Round 1', isCompleted: true, isStarted: false }];

		const byeMatch = makeMatch({
			Competitors: [
				{
					ID: 1,
					CheckedIn: null,
					ResultConfirmed: null,
					SortOrder: 0,
					GameByes: 0,
					GameWins: null,
					GameWinsAndGameByes: 2,
					TeamId: 1,
					Team: { ID: 1, Name: null, Players: [{ ID: 100, DisplayName: 'Alice', DisplayNameLastFirst: 'Alice', Username: 'alice123', TeamId: 1 }] },
					Decklists: [],
				},
			],
			ByeReasonDescription: 'Bye',
		});

		const roundMatches = new Map<number, MeleeMatchRow[]>();
		roundMatches.set(5000, [byeMatch]);

		const result = assembleTournament({
			tournamentId: 999,
			parsed: baseParsed,
			standings,
			decklists,
			completedRounds,
			roundMatches,
		});

		const match = result.rounds['5000'].matches[0];
		expect(match.player1Id).toBe('100');
		expect(match.player2Id).toBeNull();
		expect(match.result).toBe('bye');
		expect(match.winnerId).toBe('100');
	});

	it('handles draw matches', () => {
		const standings = [makeStanding()];
		const decklists = new Map<string, { details: MeleeDecklistDetails; playerId: number }>();
		const completedRounds: ParsedRound[] = [{ id: 5000, name: 'Round 1', isCompleted: true, isStarted: false }];

		const drawMatch = makeMatch({
			Competitors: [
				{
					ID: 1, CheckedIn: null, ResultConfirmed: null, SortOrder: 0,
					GameByes: 0, GameWins: 1, GameWinsAndGameByes: 1, TeamId: 1,
					Team: { ID: 1, Name: null, Players: [{ ID: 100, DisplayName: 'Alice', DisplayNameLastFirst: 'Alice', Username: 'alice123', TeamId: 1 }] },
					Decklists: [],
				},
				{
					ID: 2, CheckedIn: null, ResultConfirmed: null, SortOrder: 1,
					GameByes: 0, GameWins: 1, GameWinsAndGameByes: 1, TeamId: 2,
					Team: { ID: 2, Name: null, Players: [{ ID: 200, DisplayName: 'Bob', DisplayNameLastFirst: 'Bob', Username: 'bob456', TeamId: 2 }] },
					Decklists: [],
				},
			],
			GameDraws: 1,
		});

		const roundMatches = new Map<number, MeleeMatchRow[]>();
		roundMatches.set(5000, [drawMatch]);

		const result = assembleTournament({
			tournamentId: 999,
			parsed: baseParsed,
			standings,
			decklists,
			completedRounds,
			roundMatches,
		});

		const match = result.rounds['5000'].matches[0];
		expect(match.winnerId).toBeNull();
		expect(match.result).toBe('1-1-1');
	});

	it('handles empty competitors array', () => {
		const standings = [makeStanding()];
		const decklists = new Map<string, { details: MeleeDecklistDetails; playerId: number }>();
		const completedRounds: ParsedRound[] = [{ id: 5000, name: 'Round 1', isCompleted: true, isStarted: false }];

		const emptyMatch = makeMatch({ Competitors: [] });
		const roundMatches = new Map<number, MeleeMatchRow[]>();
		roundMatches.set(5000, [emptyMatch]);

		const result = assembleTournament({
			tournamentId: 999,
			parsed: baseParsed,
			standings,
			decklists,
			completedRounds,
			roundMatches,
		});

		const match = result.rounds['5000'].matches[0];
		expect(match.player1Id).toBe('');
		expect(match.player2Id).toBeNull();
		expect(match.result).toBe('unknown');
	});

	it('correctly identifies playoff rounds', () => {
		const standings = [makeStanding()];
		const decklists = new Map<string, { details: MeleeDecklistDetails; playerId: number }>();

		const playoffRounds: ParsedRound[] = [
			{ id: 6000, name: 'Quarterfinals', isCompleted: true, isStarted: false },
			{ id: 6001, name: 'Semifinals', isCompleted: true, isStarted: false },
			{ id: 6002, name: 'Finals', isCompleted: true, isStarted: false },
		];

		const roundMatches = new Map<number, MeleeMatchRow[]>();
		roundMatches.set(6000, []);
		roundMatches.set(6001, []);
		roundMatches.set(6002, []);

		const result = assembleTournament({
			tournamentId: 999,
			parsed: { ...baseParsed, rounds: playoffRounds },
			standings,
			decklists,
			completedRounds: playoffRounds,
			roundMatches,
		});

		expect(result.rounds['6000'].isPlayoff).toBe(true);
		expect(result.rounds['6000'].number).toBe(900);
		expect(result.rounds['6001'].isPlayoff).toBe(true);
		expect(result.rounds['6001'].number).toBe(950);
		expect(result.rounds['6002'].isPlayoff).toBe(true);
		expect(result.rounds['6002'].number).toBe(999);
	});

	it('extracts round numbers from names like "Round 5"', () => {
		const standings = [makeStanding()];
		const decklists = new Map<string, { details: MeleeDecklistDetails; playerId: number }>();

		const rounds: ParsedRound[] = [
			{ id: 5005, name: 'Round 5', isCompleted: true, isStarted: false },
		];

		const roundMatches = new Map<number, MeleeMatchRow[]>();
		roundMatches.set(5005, []);

		const result = assembleTournament({
			tournamentId: 999,
			parsed: { ...baseParsed, rounds },
			standings,
			decklists,
			completedRounds: rounds,
			roundMatches,
		});

		expect(result.rounds['5005'].number).toBe(5);
		expect(result.rounds['5005'].isPlayoff).toBe(false);
	});

	it('handles players with no decklists', () => {
		const standings = [
			makeStanding({ Decklists: [] }),
		];
		const decklists = new Map<string, { details: MeleeDecklistDetails; playerId: number }>();
		const completedRounds: ParsedRound[] = [];
		const roundMatches = new Map<number, MeleeMatchRow[]>();

		const result = assembleTournament({
			tournamentId: 999,
			parsed: baseParsed,
			standings,
			decklists,
			completedRounds,
			roundMatches,
		});

		expect(result.players['100'].decklistIds).toEqual([]);
		expect(result.players['100'].reportedArchetypes).toEqual([]);
	});

	it('handles multi-format tournaments with multiple decklists per player', () => {
		const standings = [
			makeStanding({
				Decklists: [
					{ DecklistId: 'deck-draft', PlayerId: 100, DecklistName: '', Format: 'Draft', FormatId: 'fmt-d' },
					{ DecklistId: 'deck-std', PlayerId: 100, DecklistName: 'Mono Red', Format: 'Standard', FormatId: 'fmt-s' },
				],
			}),
		];

		const decklists = new Map<string, { details: MeleeDecklistDetails; playerId: number }>();
		decklists.set('deck-std', { details: makeDecklistDetails({ Guid: 'deck-std' }), playerId: 100 });

		const result = assembleTournament({
			tournamentId: 999,
			parsed: { ...baseParsed, formats: ['Draft', 'Standard'] },
			standings,
			decklists,
			completedRounds: [],
			roundMatches: new Map(),
		});

		expect(result.players['100'].decklistIds).toEqual(['deck-draft', 'deck-std']);
		expect(result.players['100'].reportedArchetypes).toEqual(['Unknown', 'Mono Red']);
		expect(result.meta.formats).toEqual(['Draft', 'Standard']);
	});
});
