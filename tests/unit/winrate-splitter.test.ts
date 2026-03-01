import { describe, it, expect } from 'vitest';
import { splitByCard } from '../../src/lib/utils/winrate-splitter';
import type { TournamentData, PlayerInfo, RoundInfo, MatchResult } from '../../src/lib/types/tournament';
import type { DecklistInfo } from '../../src/lib/types/decklist';

function makePlayer(name: string, decklistIds: string[], rank = 1): PlayerInfo {
	return {
		name,
		username: name.toLowerCase(),
		rank,
		points: 0,
		matchRecord: '0-0-0',
		decklistIds,
		reportedArchetypes: [],
	};
}

function makeDeckWithCards(
	playerId: string,
	mainboard: [string, number][],
): DecklistInfo {
	return {
		playerId,
		mainboard: mainboard.map(([cardName, quantity]) => ({ cardName, quantity })),
		sideboard: [],
		companion: null,
		reportedArchetype: null,
	};
}

function makeMatch(p1: string, p2: string, winnerId: string | null): MatchResult {
	return {
		player1Id: p1,
		player2Id: p2,
		result: winnerId ? '2-1-0' : '1-1-0',
		winnerId,
	};
}

function makeTournament(overrides: {
	players: Record<string, PlayerInfo>;
	decklists: Record<string, DecklistInfo>;
	matches: MatchResult[];
}): TournamentData {
	return {
		meta: {
			id: 1,
			name: 'Test',
			date: '2026-01-01',
			formats: ['Standard'],
			url: 'https://melee.gg/Tournament/View/1',
			fetchedAt: '2026-01-01T00:00:00Z',
			playerCount: Object.keys(overrides.players).length,
			roundCount: 1,
		},
		players: overrides.players,
		decklists: overrides.decklists,
		rounds: {
			r1: {
				name: 'Round 1',
				number: 1,
				isPlayoff: false,
				matches: overrides.matches,
			},
		},
	};
}

describe('splitByCard', () => {
	// Setup: 4 Aggro players (2 with 4x Bolt, 2 with 0x Bolt), 2 Control players
	const tournament = makeTournament({
		players: {
			a1: makePlayer('AggroWithBolt1', ['da1']),
			a2: makePlayer('AggroWithBolt2', ['da2']),
			a3: makePlayer('AggroNoBolt1', ['da3']),
			a4: makePlayer('AggroNoBolt2', ['da4']),
			c1: makePlayer('ControlPlayer1', ['dc1']),
			c2: makePlayer('ControlPlayer2', ['dc2']),
		},
		decklists: {
			da1: makeDeckWithCards('a1', [['Lightning Bolt', 4], ['Mountain', 20]]),
			da2: makeDeckWithCards('a2', [['Lightning Bolt', 4], ['Mountain', 20]]),
			da3: makeDeckWithCards('a3', [['Shock', 4], ['Mountain', 20]]),
			da4: makeDeckWithCards('a4', [['Shock', 4], ['Mountain', 20]]),
			dc1: makeDeckWithCards('c1', [['Island', 20], ['Counterspell', 4]]),
			dc2: makeDeckWithCards('c2', [['Island', 20], ['Counterspell', 4]]),
		},
		matches: [
			// Bolt aggro beats control
			makeMatch('a1', 'c1', 'a1'),
			makeMatch('a2', 'c2', 'a2'),
			// Non-bolt aggro loses to control
			makeMatch('a3', 'c1', 'c1'),
			makeMatch('a4', 'c2', 'c2'),
		],
	});

	const archetypes = new Map([
		['a1', 'Aggro'],
		['a2', 'Aggro'],
		['a3', 'Aggro'],
		['a4', 'Aggro'],
		['c1', 'Control'],
		['c2', 'Control'],
	]);

	it('binary split partitions players correctly', () => {
		const result = splitByCard(
			[tournament],
			archetypes,
			'Aggro',
			'Lightning Bolt',
			'binary',
			{ threshold: 4 },
		);

		expect(result.cardName).toBe('Lightning Bolt');
		expect(result.groupRows).toHaveLength(2);

		const withBolt = result.groupRows.find((r) => r.label.includes('4+'))!;
		const withoutBolt = result.groupRows.find((r) => r.label.includes('<'))!;

		expect(withBolt.playerCount).toBe(2);
		expect(withoutBolt.playerCount).toBe(2);
	});

	it('baseline row covers all players', () => {
		const result = splitByCard(
			[tournament],
			archetypes,
			'Aggro',
			'Lightning Bolt',
			'binary',
			{ threshold: 4 },
		);

		expect(result.baselineRow.label).toBe('All');
		expect(result.baselineRow.playerCount).toBe(4);
		// 2 wins + 2 losses = 50% overall against Control
		expect(result.baselineRow.overallWinrate).toBeCloseTo(0.5);
	});

	it('group rows reflect filtered matchup data', () => {
		const result = splitByCard(
			[tournament],
			archetypes,
			'Aggro',
			'Lightning Bolt',
			'binary',
			{ threshold: 4 },
		);

		const withBolt = result.groupRows.find((r) => r.label.includes('4+'))!;
		const withoutBolt = result.groupRows.find((r) => r.label.includes('<'))!;

		// With Bolt: 2 wins, 0 losses vs Control → 100%
		const boltVsControl = withBolt.cells.get('Control');
		expect(boltVsControl).toBeDefined();
		expect(boltVsControl!.winrate).toBeCloseTo(1.0);

		// Without Bolt: 0 wins, 2 losses vs Control → 0%
		const noBoltVsControl = withoutBolt.cells.get('Control');
		expect(noBoltVsControl).toBeDefined();
		expect(noBoltVsControl!.winrate).toBeCloseTo(0.0);
	});

	it('per-copy mode creates groups for each distinct copy count', () => {
		const result = splitByCard(
			[tournament],
			archetypes,
			'Aggro',
			'Lightning Bolt',
			'per-copy',
		);

		// 2 players with 4 copies, 2 with 0 copies → groups for 0 and 4
		expect(result.groupRows).toHaveLength(2);
		const labels = result.groupRows.map((r) => r.label);
		expect(labels).toContain('0 copies');
		expect(labels).toContain('4 copies');
	});

	it('card not in any decklist puts all players in 0 copies', () => {
		const result = splitByCard(
			[tournament],
			archetypes,
			'Aggro',
			'Nonexistent Card',
			'binary',
			{ threshold: 1 },
		);

		// All players have 0 copies, so only the "< 1" group exists
		expect(result.groupRows).toHaveLength(1);
		expect(result.groupRows[0].playerCount).toBe(4);
	});

	it('opponents list excludes the inspected archetype', () => {
		const result = splitByCard(
			[tournament],
			archetypes,
			'Aggro',
			'Lightning Bolt',
			'binary',
		);

		expect(result.opponents).not.toContain('Aggro');
		expect(result.opponents).toContain('Control');
	});
});
