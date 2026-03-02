import { describe, it, expect } from 'vitest';
import {
	collectArchetypeDecklists,
	collectRawDecklists,
	findBestDecklist,
} from '../../src/lib/utils/decklist-collector';
import type { TournamentData, PlayerInfo } from '../../src/lib/types/tournament';
import type { DecklistInfo } from '../../src/lib/types/decklist';

function makePlayer(
	name: string,
	decklistIds: string[],
	rank = 1,
): PlayerInfo {
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

function makeDecklist(playerId: string): DecklistInfo {
	return {
		playerId,
		mainboard: [{ cardName: 'Mountain', quantity: 20 }],
		sideboard: [],
		companion: null,
		reportedArchetype: null,
	};
}

function makeTournament(overrides: {
	id?: number;
	name?: string;
	players?: Record<string, PlayerInfo>;
	decklists?: Record<string, DecklistInfo>;
}): TournamentData {
	const id = overrides.id ?? 1;
	return {
		meta: {
			id,
			name: overrides.name ?? 'Test Tournament',
			date: '2026-01-01',
			formats: ['Standard'],
			url: `https://melee.gg/Tournament/View/${id}`,
			fetchedAt: '2026-01-01T00:00:00Z',
			playerCount: Object.keys(overrides.players ?? {}).length,
			roundCount: 0,
		},
		players: overrides.players ?? {},
		decklists: overrides.decklists ?? {},
		rounds: {},
	};
}

describe('collectArchetypeDecklists', () => {
	it('collects decklists matching the archetype', () => {
		const t = makeTournament({
			players: {
				p1: makePlayer('Alice', ['d1']),
				p2: makePlayer('Bob', ['d2']),
			},
			decklists: {
				d1: makeDecklist('p1'),
				d2: makeDecklist('p2'),
			},
		});
		const archetypes = new Map([
			['p1', 'Aggro'],
			['p2', 'Control'],
		]);

		const result = collectArchetypeDecklists([t], archetypes, 'Aggro');
		expect(result).toHaveLength(1);
		expect(result[0].playerName).toBe('Alice');
		expect(result[0].playerId).toBe('p1');
		expect(result[0].decklistId).toBe('d1');
	});

	it('returns enriched metadata', () => {
		const t = makeTournament({
			id: 42,
			name: 'Pro Tour',
			players: { p1: makePlayer('Alice', ['d1'], 5) },
			decklists: { d1: makeDecklist('p1') },
		});
		const archetypes = new Map([['p1', 'Aggro']]);

		const result = collectArchetypeDecklists([t], archetypes, 'Aggro');
		expect(result[0]).toMatchObject({
			playerRank: 5,
			tournamentName: 'Pro Tour',
			tournamentId: 42,
		});
	});

	it('collects across multiple tournaments', () => {
		const t1 = makeTournament({
			id: 1,
			name: 'T1',
			players: { p1: makePlayer('Alice', ['d1']) },
			decklists: { d1: makeDecklist('p1') },
		});
		const t2 = makeTournament({
			id: 2,
			name: 'T2',
			players: { p2: makePlayer('Bob', ['d2']) },
			decklists: { d2: makeDecklist('p2') },
		});
		const archetypes = new Map([
			['p1', 'Aggro'],
			['p2', 'Aggro'],
		]);

		const result = collectArchetypeDecklists([t1, t2], archetypes, 'Aggro');
		expect(result).toHaveLength(2);
		expect(result.map((r) => r.playerName)).toEqual(['Alice', 'Bob']);
	});

	it('handles players with multiple decklists', () => {
		const t = makeTournament({
			players: { p1: makePlayer('Alice', ['d1', 'd2']) },
			decklists: {
				d1: makeDecklist('p1'),
				d2: makeDecklist('p1'),
			},
		});
		const archetypes = new Map([['p1', 'Aggro']]);

		const result = collectArchetypeDecklists([t], archetypes, 'Aggro');
		expect(result).toHaveLength(2);
		expect(result.map((r) => r.decklistId)).toEqual(['d1', 'd2']);
	});

	it('returns empty array when no matches', () => {
		const t = makeTournament({
			players: { p1: makePlayer('Alice', ['d1']) },
			decklists: { d1: makeDecklist('p1') },
		});
		const archetypes = new Map([['p1', 'Control']]);

		expect(collectArchetypeDecklists([t], archetypes, 'Aggro')).toEqual([]);
	});

	it('returns empty array for empty input', () => {
		expect(collectArchetypeDecklists([], new Map(), 'Aggro')).toEqual([]);
	});

	it('skips missing decklists gracefully', () => {
		const t = makeTournament({
			players: { p1: makePlayer('Alice', ['d1', 'missing']) },
			decklists: { d1: makeDecklist('p1') },
		});
		const archetypes = new Map([['p1', 'Aggro']]);

		const result = collectArchetypeDecklists([t], archetypes, 'Aggro');
		expect(result).toHaveLength(1);
		expect(result[0].decklistId).toBe('d1');
	});
});

describe('collectRawDecklists', () => {
	it('returns plain DecklistInfo array', () => {
		const t = makeTournament({
			players: {
				p1: makePlayer('Alice', ['d1']),
				p2: makePlayer('Bob', ['d2']),
			},
			decklists: {
				d1: makeDecklist('p1'),
				d2: makeDecklist('p2'),
			},
		});
		const archetypes = new Map([
			['p1', 'Aggro'],
			['p2', 'Aggro'],
		]);

		const result = collectRawDecklists([t], archetypes, 'Aggro');
		expect(result).toHaveLength(2);
		expect(result[0]).toHaveProperty('mainboard');
		expect(result[0]).not.toHaveProperty('playerName');
	});
});

describe('findBestDecklist', () => {
	it('returns the decklist with the lowest rank', () => {
		const t = makeTournament({
			players: {
				p1: makePlayer('Alice', ['d1'], 10),
				p2: makePlayer('Bob', ['d2'], 3),
				p3: makePlayer('Charlie', ['d3'], 7),
			},
			decklists: {
				d1: makeDecklist('p1'),
				d2: makeDecklist('p2'),
				d3: makeDecklist('p3'),
			},
		});
		const archetypes = new Map([
			['p1', 'Aggro'],
			['p2', 'Aggro'],
			['p3', 'Aggro'],
		]);

		const enriched = collectArchetypeDecklists([t], archetypes, 'Aggro');
		const best = findBestDecklist(enriched);
		expect(best?.playerName).toBe('Bob');
		expect(best?.playerRank).toBe(3);
	});

	it('breaks ties by tournament name', () => {
		const t1 = makeTournament({
			id: 1,
			name: 'Beta Tour',
			players: { p1: makePlayer('Alice', ['d1'], 1) },
			decklists: { d1: makeDecklist('p1') },
		});
		const t2 = makeTournament({
			id: 2,
			name: 'Alpha Tour',
			players: { p2: makePlayer('Bob', ['d2'], 1) },
			decklists: { d2: makeDecklist('p2') },
		});
		const archetypes = new Map([
			['p1', 'Aggro'],
			['p2', 'Aggro'],
		]);

		const enriched = collectArchetypeDecklists([t1, t2], archetypes, 'Aggro');
		const best = findBestDecklist(enriched);
		expect(best?.tournamentName).toBe('Alpha Tour');
	});

	it('returns null for empty input', () => {
		expect(findBestDecklist([])).toBeNull();
	});
});
