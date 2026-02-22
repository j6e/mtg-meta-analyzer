import { parse } from 'node-html-parser';
import type { ParsedTournamentPage, ParsedRound, ParsedDecklist, MeleeDecklistDetails } from './types';

/**
 * Parse a melee.gg tournament page HTML to extract metadata and round IDs.
 */
export function parseTournamentPage(html: string): ParsedTournamentPage {
	const root = parse(html);

	// Tournament name: <title>Name | Melee</title> or from <h3> in headline
	const title = root.querySelector('title')?.text ?? '';
	const name = title.replace(/\s*\|\s*Melee\s*$/, '').trim();

	// Date: <span data-toggle="datetime" data-value="4/26/2024 4:00:00 PM">
	const dateSpan = root.querySelector('#tournament-headline-start-date-field span[data-toggle="datetime"]');
	const rawDate = dateSpan?.getAttribute('data-value') ?? '';
	const date = parseDate(rawDate);

	// Formats: from #tournament-headline-registration, after "Format: "
	const registration = root.querySelector('#tournament-headline-registration')?.text ?? '';
	const formats = parseFormats(registration);

	// Rounds: from #standings-round-selector-container (has data-is-completed)
	const standingsContainer = root.querySelector('#standings-round-selector-container');
	const roundButtons = standingsContainer?.querySelectorAll('button.round-selector') ?? [];

	const rounds: ParsedRound[] = roundButtons.map((btn) => ({
		id: Number(btn.getAttribute('data-id')),
		name: btn.getAttribute('data-name') ?? btn.text.trim(),
		isCompleted: btn.getAttribute('data-is-completed') === 'True',
		isStarted: btn.getAttribute('data-is-started') === 'True',
	}));

	return { name, date, formats, rounds };
}

/**
 * Parse a melee.gg decklist from the JSON endpoint's ArenaDecklistString.
 * Format: "Deck\n4 CardName\n...\nSideboard\n2 CardName\n..."
 */
export function parseDecklistString(decklistString: string): ParsedDecklist {
	const lines = decklistString.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
	const mainboard: { cardName: string; quantity: number }[] = [];
	const sideboard: { cardName: string; quantity: number }[] = [];
	const companion: { cardName: string; quantity: number }[] = [];

	let section: 'deck' | 'sideboard' | 'companion' = 'deck';

	for (const line of lines) {
		const lower = line.toLowerCase();
		if (lower === 'deck') { section = 'deck'; continue; }
		if (lower === 'sideboard') { section = 'sideboard'; continue; }
		if (lower === 'companion') { section = 'companion'; continue; }

		const match = line.match(/^(\d+)\s+(.+)$/);
		if (!match) continue;

		const entry = { quantity: Number(match[1]), cardName: match[2].trim() };

		switch (section) {
			case 'deck': mainboard.push(entry); break;
			case 'sideboard': sideboard.push(entry); break;
			case 'companion': companion.push(entry); break;
		}
	}

	return {
		mainboard,
		sideboard,
		companion: companion.length > 0 ? companion : null,
		reportedArchetype: null,
	};
}

/**
 * Convert melee.gg decklist JSON Records to a ParsedDecklist.
 * Records use c=0 for mainboard and c=99 for sideboard.
 */
export function parseDecklistRecords(details: MeleeDecklistDetails): ParsedDecklist {
	const mainboard: { cardName: string; quantity: number }[] = [];
	const sideboard: { cardName: string; quantity: number }[] = [];

	for (const record of details.Records) {
		const entry = { cardName: record.n, quantity: record.q };
		if (record.c === 0) {
			mainboard.push(entry);
		} else if (record.c === 99) {
			sideboard.push(entry);
		}
	}

	return {
		mainboard,
		sideboard,
		companion: null, // companion cards appear in sideboard in the Records format
		reportedArchetype: details.DecklistName || null,
	};
}

// --- Helpers ---

function parseDate(raw: string): string {
	if (!raw) return '';
	// Input format: "4/26/2024 4:00:00 PM" (US format)
	const d = new Date(raw);
	if (isNaN(d.getTime())) return raw;
	return d.toISOString().split('T')[0]; // "2024-04-26"
}

function parseFormats(registration: string): string[] {
	// "Free to Play | Invite Only | Format: Draft, Standard, Draft2 | Ended | ..."
	const formatMatch = registration.match(/Format:\s*([^|]+)/i);
	if (!formatMatch) return [];
	return formatMatch[1].split(',').map((f) => f.trim()).filter(Boolean);
}
