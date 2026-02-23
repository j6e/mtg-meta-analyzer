import { describe, it, expect } from 'vitest';
import {
	buildPlayerArchetypeMap,
	buildMatchupMatrix,
	computeMetagameStats,
} from '../../src/lib/utils/winrate-calculator';
import type { TournamentData, MatchResult, RoundInfo, PlayerInfo } from '../../src/lib/types/tournament';
import type { ClassificationResult } from '../../src/lib/algorithms/archetype-classifier';
import type { DecklistInfo } from '../../src/lib/types/decklist';

// --- Helpers ---

function makeTournament(overrides: {
	players?: Record<string, PlayerInfo>;
	decklists?: Record<string, DecklistInfo>;
	rounds?: Record<string, RoundInfo>;
}): TournamentData {
	return {
		meta: {
			id: 1,
			name: 'Test Tournament',
			date: '2026-01-01',
			formats: ['Standard'],
			url: 'https://melee.gg/Tournament/View/1',
			fetchedAt: '2026-01-01T00:00:00Z',
			playerCount: Object.keys(overrides.players ?? {}).length,
			roundCount: Object.keys(overrides.rounds ?? {}).length,
		},
		players: overrides.players ?? {},
		decklists: overrides.decklists ?? {},
		rounds: overrides.rounds ?? {},
	};
}

function makePlayer(name: string, decklistIds: string[] = []): PlayerInfo {
	return {
		name,
		username: name.toLowerCase(),
		rank: 1,
		points: 0,
		matchRecord: '0-0-0',
		decklistIds,
		reportedArchetypes: [],
	};
}

function makeDecklist(playerId: string): DecklistInfo {
	return {
		playerId,
		mainboard: [{ cardName: 'Mountain', quantity: 20 }],
		sideboard: [],
		companion: null,
		reportedArchetype: null,
	};
}

function makeMatch(p1: string, p2: string | null, winnerId: string | null): MatchResult {
	return {
		player1Id: p1,
		player2Id: p2,
		result: winnerId ? '2-0-0' : p2 ? 'draw' : 'bye',
		winnerId,
	};
}

function makeRound(name: string, num: number, matches: MatchResult[], isPlayoff = false): RoundInfo {
	return { name, number: num, isPlayoff, matches };
}

// --- Tests ---

describe('buildPlayerArchetypeMap', () => {
	it('maps players to archetypes via their decklists', () => {
		const tournament = makeTournament({
			players: {
				p1: makePlayer('Alice', ['d1']),
				p2: makePlayer('Bob', ['d2']),
			},
			decklists: {
				d1: makeDecklist('p1'),
				d2: makeDecklist('p2'),
			},
		});

		const results: ClassificationResult[] = [
			{ decklistId: 'd1', archetype: 'Aggro', method: 'signature', confidence: 1.0 },
			{ decklistId: 'd2', archetype: 'Control', method: 'knn', confidence: 0.8 },
		];

		const map = buildPlayerArchetypeMap(tournament, results);
		expect(map.get('p1')).toBe('Aggro');
		expect(map.get('p2')).toBe('Control');
	});

	it('assigns Unknown to players without classified decklists', () => {
		const tournament = makeTournament({
			players: {
				p1: makePlayer('Alice', ['d1']),
				p2: makePlayer('Bob', []), // no decklist
			},
			decklists: { d1: makeDecklist('p1') },
		});

		const results: ClassificationResult[] = [
			{ decklistId: 'd1', archetype: 'Aggro', method: 'signature', confidence: 1.0 },
		];

		const map = buildPlayerArchetypeMap(tournament, results);
		expect(map.get('p1')).toBe('Aggro');
		expect(map.get('p2')).toBe('Unknown');
	});

	it('skips Unknown decklists and uses next classified one', () => {
		const tournament = makeTournament({
			players: {
				p1: makePlayer('Alice', ['d1', 'd2']),
			},
			decklists: {
				d1: makeDecklist('p1'),
				d2: makeDecklist('p1'),
			},
		});

		const results: ClassificationResult[] = [
			{ decklistId: 'd1', archetype: 'Unknown', method: 'unknown', confidence: 0 },
			{ decklistId: 'd2', archetype: 'Midrange', method: 'knn', confidence: 0.7 },
		];

		const map = buildPlayerArchetypeMap(tournament, results);
		expect(map.get('p1')).toBe('Midrange');
	});
});

describe('buildMatchupMatrix', () => {
	it('builds a 2-archetype matrix with symmetric winrates', () => {
		const tournament = makeTournament({
			players: {
				p1: makePlayer('Alice'), p2: makePlayer('Bob'),
				p3: makePlayer('Carol'), p4: makePlayer('Dave'),
			},
			rounds: {
				r1: makeRound('Round 1', 1, [
					makeMatch('p1', 'p2', 'p1'), // Aggro beats Control
					makeMatch('p3', 'p4', 'p3'), // Aggro beats Control
				]),
				r2: makeRound('Round 2', 2, [
					makeMatch('p1', 'p3', 'p1'), // Aggro mirror (excluded by default)
					makeMatch('p2', 'p4', 'p4'), // Control beats Control (mirror, excluded)
				]),
			},
		});

		const playerArchetypes = new Map([
			['p1', 'Aggro'], ['p2', 'Control'],
			['p3', 'Aggro'], ['p4', 'Control'],
		]);

		const { matrix, stats } = buildMatchupMatrix([tournament], playerArchetypes);

		expect(matrix.archetypes).toEqual(['Aggro', 'Control']);

		// Aggro vs Control: 2 wins, 0 losses
		const aggIdx = matrix.archetypes.indexOf('Aggro');
		const ctrlIdx = matrix.archetypes.indexOf('Control');
		expect(matrix.cells[aggIdx][ctrlIdx].wins).toBe(2);
		expect(matrix.cells[aggIdx][ctrlIdx].losses).toBe(0);
		expect(matrix.cells[aggIdx][ctrlIdx].winrate).toBe(1.0);

		// Control vs Aggro: 0 wins, 2 losses (symmetric)
		expect(matrix.cells[ctrlIdx][aggIdx].wins).toBe(0);
		expect(matrix.cells[ctrlIdx][aggIdx].losses).toBe(2);
		expect(matrix.cells[ctrlIdx][aggIdx].winrate).toBe(0.0);

		// Symmetry: A vs B winrate = 1 - B vs A winrate
		expect(matrix.cells[aggIdx][ctrlIdx].winrate! + matrix.cells[ctrlIdx][aggIdx].winrate!).toBe(1.0);
	});

	it('excludes mirror matches by default', () => {
		const tournament = makeTournament({
			players: { p1: makePlayer('Alice'), p2: makePlayer('Bob') },
			rounds: {
				r1: makeRound('Round 1', 1, [
					makeMatch('p1', 'p2', 'p1'), // Aggro mirror
				]),
			},
		});

		const playerArchetypes = new Map([['p1', 'Aggro'], ['p2', 'Aggro']]);
		const { matrix } = buildMatchupMatrix([tournament], playerArchetypes);

		const idx = matrix.archetypes.indexOf('Aggro');
		expect(matrix.cells[idx][idx].total).toBe(0);
		expect(matrix.cells[idx][idx].winrate).toBeNull();
	});

	it('includes mirror matches when excludeMirrors is false', () => {
		const tournament = makeTournament({
			players: { p1: makePlayer('Alice'), p2: makePlayer('Bob') },
			rounds: {
				r1: makeRound('Round 1', 1, [
					makeMatch('p1', 'p2', 'p1'), // Aggro mirror
				]),
			},
		});

		const playerArchetypes = new Map([['p1', 'Aggro'], ['p2', 'Aggro']]);
		const { matrix } = buildMatchupMatrix([tournament], playerArchetypes, { excludeMirrors: false });

		const idx = matrix.archetypes.indexOf('Aggro');
		// Mirror: 1 win + 1 loss from the same match
		expect(matrix.cells[idx][idx].wins).toBe(1);
		expect(matrix.cells[idx][idx].losses).toBe(1);
		expect(matrix.cells[idx][idx].total).toBe(2);
		expect(matrix.cells[idx][idx].winrate).toBeCloseTo(0.5);
	});

	it('skips byes', () => {
		const tournament = makeTournament({
			players: { p1: makePlayer('Alice'), p2: makePlayer('Bob') },
			rounds: {
				r1: makeRound('Round 1', 1, [
					makeMatch('p1', null, 'p1'), // bye
					makeMatch('p2', 'p1', 'p2'), // real match
				]),
			},
		});

		const playerArchetypes = new Map([['p1', 'Aggro'], ['p2', 'Control']]);
		const { matrix } = buildMatchupMatrix([tournament], playerArchetypes);

		// Only the real match should count
		const aggIdx = matrix.archetypes.indexOf('Aggro');
		const ctrlIdx = matrix.archetypes.indexOf('Control');
		expect(matrix.cells[ctrlIdx][aggIdx].wins).toBe(1);
		expect(matrix.cells[aggIdx][ctrlIdx].losses).toBe(1);
	});

	it('handles draws', () => {
		const tournament = makeTournament({
			players: { p1: makePlayer('Alice'), p2: makePlayer('Bob') },
			rounds: {
				r1: makeRound('Round 1', 1, [
					makeMatch('p1', 'p2', null), // draw
				]),
			},
		});

		const playerArchetypes = new Map([['p1', 'Aggro'], ['p2', 'Control']]);
		const { matrix } = buildMatchupMatrix([tournament], playerArchetypes);

		const aggIdx = matrix.archetypes.indexOf('Aggro');
		const ctrlIdx = matrix.archetypes.indexOf('Control');
		expect(matrix.cells[aggIdx][ctrlIdx].draws).toBe(1);
		expect(matrix.cells[ctrlIdx][aggIdx].draws).toBe(1);
		expect(matrix.cells[aggIdx][ctrlIdx].winrate).toBe(0); // 0 wins / 1 total
	});

	it('aggregates small archetypes into Other with topN', () => {
		const tournament = makeTournament({
			players: {
				p1: makePlayer('Alice'), p2: makePlayer('Bob'),
				p3: makePlayer('Carol'), p4: makePlayer('Dave'),
				p5: makePlayer('Eve'),
			},
			rounds: {
				r1: makeRound('Round 1', 1, [
					makeMatch('p1', 'p3', 'p1'),
					makeMatch('p2', 'p4', 'p2'),
				]),
			},
		});

		const playerArchetypes = new Map([
			['p1', 'Aggro'], ['p2', 'Aggro'],
			['p3', 'Control'],
			['p4', 'Midrange'],
			['p5', 'Combo'],
		]);

		const { matrix, stats } = buildMatchupMatrix([tournament], playerArchetypes, { topN: 2 });

		// Aggro (2 players) and Control (1 player) are top 2 by count
		// Midrange and Combo get merged into Other
		expect(matrix.archetypes).toContain('Aggro');
		expect(matrix.archetypes).toContain('Control');
		expect(matrix.archetypes).toContain('Other');
		expect(matrix.archetypes).not.toContain('Midrange');
		expect(matrix.archetypes).not.toContain('Combo');

		const otherStats = stats.find((s) => s.name === 'Other');
		expect(otherStats!.playerCount).toBe(2); // Midrange + Combo
	});

	it('aggregates small archetypes into Other with minMetagameShare', () => {
		const tournament = makeTournament({
			players: {
				p1: makePlayer('1'), p2: makePlayer('2'),
				p3: makePlayer('3'), p4: makePlayer('4'),
				p5: makePlayer('5'), p6: makePlayer('6'),
				p7: makePlayer('7'), p8: makePlayer('8'),
				p9: makePlayer('9'), p10: makePlayer('10'),
			},
			rounds: {
				r1: makeRound('Round 1', 1, [
					makeMatch('p1', 'p10', 'p1'),
				]),
			},
		});

		const playerArchetypes = new Map([
			['p1', 'Aggro'], ['p2', 'Aggro'], ['p3', 'Aggro'], ['p4', 'Aggro'], // 40%
			['p5', 'Control'], ['p6', 'Control'], ['p7', 'Control'], // 30%
			['p8', 'Midrange'], ['p9', 'Midrange'], // 20%
			['p10', 'Combo'], // 10%
		]);

		// Threshold 15%: Combo (10%) gets merged into Other
		const { matrix } = buildMatchupMatrix([tournament], playerArchetypes, { minMetagameShare: 0.15 });

		expect(matrix.archetypes).toContain('Aggro');
		expect(matrix.archetypes).toContain('Control');
		expect(matrix.archetypes).toContain('Midrange');
		expect(matrix.archetypes).toContain('Other');
		expect(matrix.archetypes).not.toContain('Combo');
	});

	it('returns empty matrix for empty tournament', () => {
		const tournament = makeTournament({});
		const playerArchetypes = new Map<string, string>();

		const { matrix, stats } = buildMatchupMatrix([tournament], playerArchetypes);
		expect(matrix.archetypes).toEqual([]);
		expect(matrix.cells).toEqual([]);
		expect(stats).toEqual([]);
	});

	it('handles a single match correctly', () => {
		const tournament = makeTournament({
			players: { p1: makePlayer('Alice'), p2: makePlayer('Bob') },
			rounds: {
				r1: makeRound('Round 1', 1, [makeMatch('p1', 'p2', 'p1')]),
			},
		});

		const playerArchetypes = new Map([['p1', 'Aggro'], ['p2', 'Control']]);
		const { matrix, stats } = buildMatchupMatrix([tournament], playerArchetypes);

		expect(matrix.archetypes).toHaveLength(2);
		const aggIdx = matrix.archetypes.indexOf('Aggro');
		const ctrlIdx = matrix.archetypes.indexOf('Control');
		expect(matrix.cells[aggIdx][ctrlIdx].wins).toBe(1);
		expect(matrix.cells[aggIdx][ctrlIdx].total).toBe(1);
		expect(matrix.cells[aggIdx][ctrlIdx].winrate).toBe(1.0);

		// Stats
		const aggStats = stats.find((s) => s.name === 'Aggro')!;
		expect(aggStats.overallWinrate).toBe(1.0);
		expect(aggStats.totalMatches).toBe(1);
	});

	it('orders archetypes by metagame share descending', () => {
		const tournament = makeTournament({
			players: {
				p1: makePlayer('1'), p2: makePlayer('2'), p3: makePlayer('3'),
				p4: makePlayer('4'), p5: makePlayer('5'),
			},
			rounds: {
				r1: makeRound('Round 1', 1, [makeMatch('p1', 'p4', 'p1')]),
			},
		});

		const playerArchetypes = new Map([
			['p1', 'Control'], ['p2', 'Control'], ['p3', 'Control'], // 3 players
			['p4', 'Aggro'], ['p5', 'Aggro'], // 2 players
		]);

		const { matrix } = buildMatchupMatrix([tournament], playerArchetypes);
		expect(matrix.archetypes[0]).toBe('Control');
		expect(matrix.archetypes[1]).toBe('Aggro');
	});

	it('includes Unknown players in matrix', () => {
		const tournament = makeTournament({
			players: { p1: makePlayer('Alice'), p2: makePlayer('Bob') },
			rounds: {
				r1: makeRound('Round 1', 1, [makeMatch('p1', 'p2', 'p1')]),
			},
		});

		const playerArchetypes = new Map([['p1', 'Aggro'], ['p2', 'Unknown']]);
		const { matrix } = buildMatchupMatrix([tournament], playerArchetypes);

		expect(matrix.archetypes).toContain('Unknown');
		const aggIdx = matrix.archetypes.indexOf('Aggro');
		const unkIdx = matrix.archetypes.indexOf('Unknown');
		expect(matrix.cells[aggIdx][unkIdx].wins).toBe(1);
	});

	it('aggregates multiple tournaments', () => {
		const t1 = makeTournament({
			players: { p1: makePlayer('Alice'), p2: makePlayer('Bob') },
			rounds: { r1: makeRound('Round 1', 1, [makeMatch('p1', 'p2', 'p1')]) },
		});

		const t2 = makeTournament({
			players: { p3: makePlayer('Carol'), p4: makePlayer('Dave') },
			rounds: { r1: makeRound('Round 1', 1, [makeMatch('p3', 'p4', 'p4')]) },
		});

		const playerArchetypes = new Map([
			['p1', 'Aggro'], ['p2', 'Control'],
			['p3', 'Aggro'], ['p4', 'Control'],
		]);

		const { matrix } = buildMatchupMatrix([t1, t2], playerArchetypes);
		const aggIdx = matrix.archetypes.indexOf('Aggro');
		const ctrlIdx = matrix.archetypes.indexOf('Control');

		// 1 win from t1, 1 loss from t2
		expect(matrix.cells[aggIdx][ctrlIdx].wins).toBe(1);
		expect(matrix.cells[aggIdx][ctrlIdx].losses).toBe(1);
		expect(matrix.cells[aggIdx][ctrlIdx].winrate).toBeCloseTo(0.5);
	});
});

describe('computeMetagameStats', () => {
	it('computes metagame share and winrate', () => {
		const tournament = makeTournament({
			players: {
				p1: makePlayer('Alice'), p2: makePlayer('Bob'),
				p3: makePlayer('Carol'), p4: makePlayer('Dave'),
			},
			rounds: {
				r1: makeRound('Round 1', 1, [
					makeMatch('p1', 'p3', 'p1'), // Aggro beats Control
					makeMatch('p2', 'p4', 'p4'), // Aggro loses to Control
				]),
			},
		});

		const playerArchetypes = new Map([
			['p1', 'Aggro'], ['p2', 'Aggro'],
			['p3', 'Control'], ['p4', 'Control'],
		]);

		const stats = computeMetagameStats([tournament], playerArchetypes);
		expect(stats).toHaveLength(2);

		const aggro = stats.find((s) => s.name === 'Aggro')!;
		const control = stats.find((s) => s.name === 'Control')!;

		expect(aggro.metagameShare).toBeCloseTo(0.5);
		expect(control.metagameShare).toBeCloseTo(0.5);
		expect(aggro.overallWinrate).toBeCloseTo(0.5);
		expect(control.overallWinrate).toBeCloseTo(0.5);
		expect(aggro.playerCount).toBe(2);
		expect(aggro.totalMatches).toBe(2);
	});

	it('metagame shares sum to 1.0', () => {
		const tournament = makeTournament({
			players: {
				p1: makePlayer('1'), p2: makePlayer('2'),
				p3: makePlayer('3'), p4: makePlayer('4'),
				p5: makePlayer('5'),
			},
			rounds: {},
		});

		const playerArchetypes = new Map([
			['p1', 'Aggro'], ['p2', 'Aggro'],
			['p3', 'Control'],
			['p4', 'Midrange'],
			['p5', 'Combo'],
		]);

		const stats = computeMetagameStats([tournament], playerArchetypes);
		const totalShare = stats.reduce((sum, s) => sum + s.metagameShare, 0);
		expect(totalShare).toBeCloseTo(1.0);
	});

	it('includes mirror matches in overall winrate', () => {
		const tournament = makeTournament({
			players: { p1: makePlayer('Alice'), p2: makePlayer('Bob') },
			rounds: {
				r1: makeRound('Round 1', 1, [makeMatch('p1', 'p2', 'p1')]),
			},
		});

		const playerArchetypes = new Map([['p1', 'Aggro'], ['p2', 'Aggro']]);
		const stats = computeMetagameStats([tournament], playerArchetypes);

		const aggro = stats.find((s) => s.name === 'Aggro')!;
		// 1 win + 1 loss = 50% winrate (mirror)
		expect(aggro.overallWinrate).toBeCloseTo(0.5);
		expect(aggro.totalMatches).toBe(2); // counted from both sides
	});

	it('returns sorted by player count descending', () => {
		const tournament = makeTournament({
			players: {
				p1: makePlayer('1'), p2: makePlayer('2'), p3: makePlayer('3'),
				p4: makePlayer('4'), p5: makePlayer('5'),
			},
			rounds: {},
		});

		const playerArchetypes = new Map([
			['p1', 'Control'], ['p2', 'Control'], ['p3', 'Control'],
			['p4', 'Aggro'], ['p5', 'Aggro'],
		]);

		const stats = computeMetagameStats([tournament], playerArchetypes);
		expect(stats[0].name).toBe('Control');
		expect(stats[1].name).toBe('Aggro');
	});
});
