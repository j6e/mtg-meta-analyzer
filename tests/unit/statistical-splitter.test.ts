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

		const boltRow = stats.rows.find((r) => r.label.includes('4 copies'))!;
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
		// 4 copies (all wins) should be better than 0 copies (all losses)
		if (pair.groupA.includes('4 copies')) {
			expect(pair.probABetter).toBeGreaterThan(0.5);
		} else {
			expect(pair.probABetter).toBeLessThan(0.5);
		}
	});
});

describe('computeStatistics cumulative mode', () => {
	// Build a tournament with 3 distinct copy counts for "Flex Card": 0, 2, 4
	const cumPlayers: Record<string, PlayerInfo> = {};
	const cumDecklists: Record<string, DecklistInfo> = {};
	const cumMatches: MatchResult[] = [];

	for (let g = 0; g < 3; g++) {
		const copies = g * 2; // 0, 2, 4
		for (let j = 0; j < 4; j++) {
			const idx = g * 4 + j;
			const pid = `p${idx}`;
			const did = `dl${idx}`;
			cumPlayers[pid] = makePlayer(`P${idx}`, [did]);
			cumDecklists[did] = makeDeckWithCards(pid, [['Flex Card', copies], ['Filler', 4 - copies]]);
		}
	}
	cumPlayers['opp'] = makePlayer('Opp', ['dlopp']);
	cumDecklists['dlopp'] = makeDeckWithCards('opp', [['Island', 20]]);

	// Group 0 (0 copies): all lose; Group 1 (2 copies): mixed; Group 2 (4 copies): all win
	for (let i = 0; i < 12; i++) {
		const pid = `p${i}`;
		const group = Math.floor(i / 4);
		const wins = group === 2 ? true : group === 1 ? i % 2 === 0 : false;
		cumMatches.push(makeMatch(pid, 'opp', wins ? pid : 'opp'));
	}

	const cumTournament = makeTournament({ players: cumPlayers, decklists: cumDecklists, matches: cumMatches });
	const cumArchetypes = new Map<string, string>();
	for (let i = 0; i < 12; i++) cumArchetypes.set(`p${i}`, 'Aggro');
	cumArchetypes.set('opp', 'Control');

	it('cumulative mode produces one comparison per group (group vs complement)', () => {
		const split = splitByCard([cumTournament], cumArchetypes, 'Aggro', 'Flex Card', 'cumulative');
		const stats = computeStatistics(split, { mode: 'cumulative' });

		// Each group should be compared against its complement, not adjacent groups
		expect(stats.pairwise.length).toBe(split.groupRows.length);
		for (const pair of stats.pairwise) {
			expect(pair.groupB).toMatch(/^not /);
			expect(pair.probABetter).toBeGreaterThanOrEqual(0);
			expect(pair.probABetter).toBeLessThanOrEqual(1);
		}
	});

	it('without cumulative mode, produces adjacent pairwise comparisons', () => {
		const split = splitByCard([cumTournament], cumArchetypes, 'Aggro', 'Flex Card', 'per-copy');
		const stats = computeStatistics(split);

		// Adjacent comparisons: n-1 pairs for n groups
		expect(stats.pairwise.length).toBe(split.groupRows.length - 1);
		for (const pair of stats.pairwise) {
			expect(pair.groupB).not.toMatch(/^not /);
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

	it('binary split has no extraPairs (only 2 groups)', async () => {
		const results = await autoScanCards(
			[tournament], archetypes, 'Aggro',
			['Lightning Bolt'],
			'binary',
			{ threshold: 4, minGroupSize: 1 },
		);

		expect(results).toHaveLength(1);
		expect(results[0].extraPairs).toHaveLength(0);
	});

	it('per-copy split produces extraPairs when 3+ groups exist', async () => {
		// Build a tournament with 3 distinct copy-count groups for "Flex Card":
		// 0 copies (lose), 2 copies (mixed), 4 copies (win)
		const players: Record<string, PlayerInfo> = {};
		const decklists: Record<string, DecklistInfo> = {};
		const matches: MatchResult[] = [];

		// 6 players per group = 18 aggro players
		for (let g = 0; g < 3; g++) {
			const copies = g * 2; // 0, 2, 4
			for (let j = 0; j < 6; j++) {
				const idx = g * 6 + j;
				const pid = `a${idx}`;
				const did = `d${idx}`;
				players[pid] = makePlayer(`A${idx}`, [did]);
				decklists[did] = makeDeckWithCards(pid, [['Flex Card', copies], ['Filler', 4 - copies]]);
			}
		}

		// 1 control opponent
		players['c1'] = makePlayer('C1', ['dc1']);
		decklists['dc1'] = makeDeckWithCards('c1', [['Island', 20]]);

		// Group 0 (0 copies): all lose; Group 1 (2 copies): mixed; Group 2 (4 copies): all win
		for (let i = 0; i < 18; i++) {
			const pid = `a${i}`;
			const group = Math.floor(i / 6);
			let wins: boolean;
			if (group === 0) wins = false;
			else if (group === 2) wins = true;
			else wins = i % 2 === 0; // 50% for group 1
			matches.push(makeMatch(pid, 'c1', wins ? pid : 'c1'));
		}

		const t = makeTournament({ players, decklists, matches });
		const arch = new Map<string, string>();
		for (let i = 0; i < 18; i++) arch.set(`a${i}`, 'Aggro');
		arch.set('c1', 'Control');

		const results = await autoScanCards(
			[t], arch, 'Aggro',
			['Flex Card'],
			'per-copy',
			{ minGroupSize: 1, minEffectSize: 0.01 },
		);

		expect(results).toHaveLength(1);
		const r = results[0];

		// Primary row should be best (4 copies) vs worst (0 copies)
		expect(r.bestGroup).toContain('4');
		expect(r.worstGroup).toContain('0');

		// Should have extra pairs (e.g., 4 vs 2, 2 vs 0)
		expect(r.extraPairs.length).toBeGreaterThan(0);

		// All extra pairs should have valid BH-adjusted p-values
		for (const pair of r.extraPairs) {
			expect(pair.adjustedP).toBeGreaterThanOrEqual(0);
			expect(pair.adjustedP).toBeLessThanOrEqual(1);
			expect(pair.effectSize).toBeGreaterThan(0);
		}
	});

	it('BH correction is applied across all pairs from all cards', async () => {
		// With multiple cards producing multiple pairs, adjustedP should differ from rawP
		const players: Record<string, PlayerInfo> = {};
		const decklists: Record<string, DecklistInfo> = {};
		const matches: MatchResult[] = [];

		for (let g = 0; g < 3; g++) {
			const copies = g * 2;
			for (let j = 0; j < 6; j++) {
				const idx = g * 6 + j;
				const pid = `a${idx}`;
				const did = `d${idx}`;
				players[pid] = makePlayer(`A${idx}`, [did]);
				decklists[did] = makeDeckWithCards(pid, [
					['CardA', copies],
					['CardB', 4 - copies],
					['Filler', 4],
				]);
			}
		}
		players['c1'] = makePlayer('C1', ['dc1']);
		decklists['dc1'] = makeDeckWithCards('c1', [['Island', 20]]);

		for (let i = 0; i < 18; i++) {
			const pid = `a${i}`;
			const group = Math.floor(i / 6);
			const wins = group === 2;
			matches.push(makeMatch(pid, 'c1', wins ? pid : 'c1'));
		}

		const t = makeTournament({ players, decklists, matches });
		const arch = new Map<string, string>();
		for (let i = 0; i < 18; i++) arch.set(`a${i}`, 'Aggro');
		arch.set('c1', 'Control');

		const results = await autoScanCards(
			[t], arch, 'Aggro',
			['CardA', 'CardB'],
			'per-copy',
			{ minGroupSize: 1, minEffectSize: 0.01 },
		);

		// Both cards should produce results with pairwise tests
		expect(results.length).toBeGreaterThan(0);

		// Collect all adjusted p-values (primary + extras)
		const allAdjusted: number[] = [];
		for (const r of results) {
			allAdjusted.push(r.adjustedP);
			for (const p of r.extraPairs) allAdjusted.push(p.adjustedP);
		}

		// With multiple tests, at least some adjustedP should be >= rawP
		const allRaw: number[] = [];
		for (const r of results) {
			allRaw.push(r.rawP);
			for (const p of r.extraPairs) allRaw.push(p.rawP);
		}

		// BH can only increase p-values (or keep them equal)
		for (let i = 0; i < allAdjusted.length; i++) {
			expect(allAdjusted[i]).toBeGreaterThanOrEqual(allRaw[i] - 1e-10);
		}
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
