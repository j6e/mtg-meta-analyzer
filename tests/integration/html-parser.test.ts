import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseTournamentPage, parseDecklistString, parseDecklistRecords } from '../../scripts/lib/html-parser';
import type { MeleeDecklistDetails } from '../../scripts/lib/types';

function readFixture(name: string): string {
	return readFileSync(resolve(__dirname, '../fixtures', name), 'utf-8');
}

describe('parseTournamentPage', () => {
	it('extracts name from minimal fixture', () => {
		const html = readFixture('tournament-minimal.html');
		const result = parseTournamentPage(html);
		expect(result.name).toBe('Pro Tour Thunder Junction');
	});

	it('extracts date in ISO format', () => {
		const html = readFixture('tournament-minimal.html');
		const result = parseTournamentPage(html);
		expect(result.date).toBe('2024-04-26');
	});

	it('extracts formats from registration line', () => {
		const html = readFixture('tournament-minimal.html');
		const result = parseTournamentPage(html);
		expect(result.formats).toEqual(['Draft', 'Standard', 'Draft2']);
	});

	it('extracts round IDs from standings container', () => {
		const html = readFixture('tournament-minimal.html');
		const result = parseTournamentPage(html);
		expect(result.rounds).toHaveLength(6);
		expect(result.rounds[0]).toEqual({
			id: 242279,
			name: 'Round 1',
			isCompleted: true,
			isStarted: false,
		});
		expect(result.rounds[5]).toEqual({
			id: 242297,
			name: 'Finals',
			isCompleted: true,
			isStarted: false,
		});
	});

	it('parses real tournament HTML fixture', () => {
		const html = readFixture('tournament-72980.html');
		const result = parseTournamentPage(html);
		expect(result.name).toBe('Pro Tour Thunder Junction');
		expect(result.date).toBe('2024-04-26');
		expect(result.formats).toContain('Standard');
		expect(result.formats).toContain('Draft');
		expect(result.rounds.length).toBeGreaterThan(10);

		// All rounds should be completed for an ended tournament
		const completedRounds = result.rounds.filter(r => r.isCompleted);
		expect(completedRounds.length).toBeGreaterThan(0);
	});

	it('handles tournament with incomplete rounds', () => {
		const html = readFixture('tournament-no-decklists.html');
		const result = parseTournamentPage(html);
		expect(result.name).toBe('FNM Weekly Standard');
		expect(result.date).toBe('2026-02-15');
		expect(result.formats).toEqual(['Standard']);
		expect(result.rounds).toHaveLength(3);

		const completed = result.rounds.filter(r => r.isCompleted);
		expect(completed).toHaveLength(2);

		const incomplete = result.rounds.filter(r => !r.isCompleted);
		expect(incomplete).toHaveLength(1);
		expect(incomplete[0].name).toBe('Round 3');
	});

	it('handles single format tournament', () => {
		const html = readFixture('tournament-no-decklists.html');
		const result = parseTournamentPage(html);
		expect(result.formats).toEqual(['Standard']);
	});

	it('returns empty data for empty HTML', () => {
		const result = parseTournamentPage('<html><body></body></html>');
		expect(result.name).toBe('');
		expect(result.date).toBe('');
		expect(result.formats).toEqual([]);
		expect(result.rounds).toEqual([]);
	});
});

describe('parseDecklistString', () => {
	it('parses a standard decklist with mainboard and sideboard', () => {
		const input = `Deck
4 Lightning Bolt
3 Counterspell
2 Island
Sideboard
2 Negate
1 Mystical Dispute`;

		const result = parseDecklistString(input);
		expect(result.mainboard).toEqual([
			{ cardName: 'Lightning Bolt', quantity: 4 },
			{ cardName: 'Counterspell', quantity: 3 },
			{ cardName: 'Island', quantity: 2 },
		]);
		expect(result.sideboard).toEqual([
			{ cardName: 'Negate', quantity: 2 },
			{ cardName: 'Mystical Dispute', quantity: 1 },
		]);
		expect(result.companion).toBeNull();
	});

	it('parses a decklist with companion section', () => {
		const input = `Deck
4 Leyline Binding
Companion
1 Yorion, Sky Nomad
Sideboard
1 Yorion, Sky Nomad
2 Negate`;

		const result = parseDecklistString(input);
		expect(result.mainboard).toEqual([{ cardName: 'Leyline Binding', quantity: 4 }]);
		expect(result.companion).toEqual([{ cardName: 'Yorion, Sky Nomad', quantity: 1 }]);
		expect(result.sideboard).toEqual([
			{ cardName: 'Yorion, Sky Nomad', quantity: 1 },
			{ cardName: 'Negate', quantity: 2 },
		]);
	});

	it('handles split card names with //', () => {
		const input = `Deck
1 Fire // Ice
3 Imodane's Recruiter // Train Troops`;

		const result = parseDecklistString(input);
		expect(result.mainboard).toEqual([
			{ cardName: 'Fire // Ice', quantity: 1 },
			{ cardName: "Imodane's Recruiter // Train Troops", quantity: 3 },
		]);
	});

	it('handles Windows-style line endings', () => {
		const input = "Deck\r\n4 Island\r\nSideboard\r\n2 Negate";
		const result = parseDecklistString(input);
		expect(result.mainboard).toHaveLength(1);
		expect(result.sideboard).toHaveLength(1);
	});

	it('handles empty decklist', () => {
		const result = parseDecklistString('');
		expect(result.mainboard).toEqual([]);
		expect(result.sideboard).toEqual([]);
		expect(result.companion).toBeNull();
	});
});

describe('parseDecklistRecords', () => {
	it('separates mainboard (c=0) and sideboard (c=99)', () => {
		const details: MeleeDecklistDetails = {
			Guid: 'test-guid',
			DecklistName: 'Domain Ramp',
			FormatName: 'Standard',
			Game: 'MagicTheGathering',
			Records: [
				{ l: 'island', n: 'Island', s: null, q: 4, c: 0, t: 'Land' },
				{ l: 'forest', n: 'Forest', s: null, q: 3, c: 0, t: 'Land' },
				{ l: 'negate', n: 'Negate', s: null, q: 2, c: 99, t: 'Instant' },
			],
			LinkToCards: true,
			Components: [],
		};

		const result = parseDecklistRecords(details);
		expect(result.mainboard).toEqual([
			{ cardName: 'Island', quantity: 4 },
			{ cardName: 'Forest', quantity: 3 },
		]);
		expect(result.sideboard).toEqual([
			{ cardName: 'Negate', quantity: 2 },
		]);
		expect(result.reportedArchetype).toBe('Domain Ramp');
	});

	it('handles empty records', () => {
		const details: MeleeDecklistDetails = {
			Guid: 'test-guid',
			DecklistName: '',
			FormatName: 'Standard',
			Game: 'MagicTheGathering',
			Records: [],
			LinkToCards: true,
			Components: [],
		};

		const result = parseDecklistRecords(details);
		expect(result.mainboard).toEqual([]);
		expect(result.sideboard).toEqual([]);
		expect(result.reportedArchetype).toBeNull();
	});

	it('handles split card names from API', () => {
		const details: MeleeDecklistDetails = {
			Guid: 'test-guid',
			DecklistName: 'Test Deck',
			FormatName: 'Standard',
			Game: 'MagicTheGathering',
			Records: [
				{ l: 'imodanesrecruiter', n: "Imodane's Recruiter // Train Troops", s: null, q: 1, c: 0, t: 'Sorcery' },
			],
			LinkToCards: true,
			Components: [],
		};

		const result = parseDecklistRecords(details);
		expect(result.mainboard[0].cardName).toBe("Imodane's Recruiter // Train Troops");
	});
});
