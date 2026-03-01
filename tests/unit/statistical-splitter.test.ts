import { describe, it, expect } from 'vitest';
import { computeStatistics, autoScanCards } from '../../src/lib/utils/statistical-splitter';
import { splitByCard } from '../../src/lib/utils/winrate-splitter';
import type { TournamentData, PlayerInfo, MatchResult } from '../../src/lib/types/tournament';
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

function makeDeckWithCards(playerId: string, mainboard: [string, number][]): DecklistInfo {
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

// Reuse the same fixture from winrate-splitter tests
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
		makeMatch('a1', 'c1', 'a1'),
		makeMatch('a2', 'c2', 'a2'),
		makeMatch('a3', 'c1', 'c1'),
		makeMatch('a4', 'c2', 'c2'),
	],
});

const archetypes = new Map([
	['a1', 'Aggro'], ['a2', 'Aggro'],
	['a3', 'Aggro'], ['a4', 'Aggro'],
	['c1', 'Control'], ['c2', 'Control'],
]);

describe('computeStatistics', () => {
	it('produces CIs for each group row', () => {
		const split = splitByCard([tournament], archetypes, 'Aggro', 'Lightning Bolt', 'binary', { threshold: 4 });
		const stats = computeStatistics(split);

		expect(stats.rows).toHaveLength(2);
		for (const row of stats.rows) {
			expect(row.overallCI.lower).toBeLessThan(row.overallCI.upper);
			expect(row.overallCI.mean).toBeGreaterThanOrEqual(0);
			expect(row.overallCI.mean).toBeLessThanOrEqual(1);
		}
	});

	it('produces per-cell CIs for opponents with data', () => {
		const split = splitByCard([tournament], archetypes, 'Aggro', 'Lightning Bolt', 'binary', { threshold: 4 });
		const stats = computeStatistics(split);

		const boltRow = stats.rows.find((r) => r.label.includes('4+'))!;
		expect(boltRow.cellCIs.has('Control')).toBe(true);
		const ci = boltRow.cellCIs.get('Control')!;
		// 2-0 record: mean should be high
		expect(ci.mean).toBeGreaterThan(0.5);
	});

	it('produces Fisher significance for each cell', () => {
		const split = splitByCard([tournament], archetypes, 'Aggro', 'Lightning Bolt', 'binary', { threshold: 4 });
		const stats = computeStatistics(split);

		for (const row of stats.rows) {
			for (const [, sig] of row.cellSignificance) {
				expect(sig.pValue).toBeGreaterThanOrEqual(0);
				expect(sig.pValue).toBeLessThanOrEqual(1);
				expect(sig.level).toBeGreaterThanOrEqual(0);
				expect(sig.level).toBeLessThanOrEqual(3);
			}
		}
	});

	it('produces pairwise comparisons', () => {
		const split = splitByCard([tournament], archetypes, 'Aggro', 'Lightning Bolt', 'binary', { threshold: 4 });
		const stats = computeStatistics(split);

		// 2 groups → 1 pairwise comparison
		expect(stats.pairwise).toHaveLength(1);
		const pair = stats.pairwise[0];
		expect(pair.probABetter).toBeGreaterThanOrEqual(0);
		expect(pair.probABetter).toBeLessThanOrEqual(1);
	});

	it('bolt group has higher P(A>B) than no-bolt group', () => {
		const split = splitByCard([tournament], archetypes, 'Aggro', 'Lightning Bolt', 'binary', { threshold: 4 });
		const stats = computeStatistics(split);

		const pair = stats.pairwise[0];
		// 4+ copies (all wins) should be better than <4 copies (all losses)
		if (pair.groupA.includes('4+')) {
			expect(pair.probABetter).toBeGreaterThan(0.5);
		} else {
			expect(pair.probABetter).toBeLessThan(0.5);
		}
	});
});

describe('autoScanCards', () => {
	it('returns results sorted by adjusted p-value', async () => {
		const results = await autoScanCards(
			[tournament], archetypes, 'Aggro',
			['Lightning Bolt', 'Shock', 'Mountain'],
			'binary',
			{ threshold: 4, minGroupSize: 1 },
		);

		// Should have at least one result
		expect(results.length).toBeGreaterThan(0);

		// Should be sorted by adjusted p-value
		for (let i = 1; i < results.length; i++) {
			expect(results[i].adjustedP).toBeGreaterThanOrEqual(results[i - 1].adjustedP);
		}
	});

	it('reports effect size as difference between best and worst group', async () => {
		const results = await autoScanCards(
			[tournament], archetypes, 'Aggro',
			['Lightning Bolt'],
			'binary',
			{ threshold: 4, minGroupSize: 1 },
		);

		expect(results).toHaveLength(1);
		// Bolt group: 100% WR, no-bolt: 0% WR → effect ≈ 1.0
		expect(results[0].effectSize).toBeGreaterThan(0.5);
	});

	it('skips cards with fewer groups than 2', async () => {
		const results = await autoScanCards(
			[tournament], archetypes, 'Aggro',
			['Nonexistent Card'],
			'binary',
			{ threshold: 1, minGroupSize: 1 },
		);

		// All players have 0 copies → only 1 group → skipped
		expect(results).toHaveLength(0);
	});

	it('calls onProgress callback', async () => {
		const progressCalls: [number, number][] = [];
		await autoScanCards(
			[tournament], archetypes, 'Aggro',
			['Lightning Bolt', 'Shock', 'Mountain', 'Island', 'Counterspell', 'Nonexistent'],
			'binary',
			{
				threshold: 4,
				minGroupSize: 1,
				onProgress: (done, total) => progressCalls.push([done, total]),
			},
		);

		expect(progressCalls.length).toBeGreaterThan(0);
		// Last call should report total
		const last = progressCalls[progressCalls.length - 1];
		expect(last[0]).toBe(last[1]);
	});
});
