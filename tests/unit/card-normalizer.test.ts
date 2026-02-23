import { describe, it, expect } from 'vitest';
import {
	normalizeCardName,
	getFrontFace,
	getScryfallImageUrl,
} from '../../src/lib/utils/card-normalizer';

describe('normalizeCardName', () => {
	it('passes through a standard card name unchanged', () => {
		expect(normalizeCardName('Lightning Bolt')).toBe('Lightning Bolt');
	});

	it('trims leading and trailing whitespace', () => {
		expect(normalizeCardName('  Lightning Bolt  ')).toBe('Lightning Bolt');
	});

	it('normalizes // separator spacing', () => {
		expect(normalizeCardName('Fire//Ice')).toBe('Fire // Ice');
		expect(normalizeCardName('Fire  //  Ice')).toBe('Fire // Ice');
		expect(normalizeCardName('Fire //Ice')).toBe('Fire // Ice');
	});

	it('normalizes curly single quotes to straight quotes', () => {
		expect(normalizeCardName('Nature\u2019s Rhythm')).toBe("Nature's Rhythm");
		expect(normalizeCardName('\u2018quoted\u2019')).toBe("'quoted'");
	});

	it('normalizes curly double quotes to straight quotes', () => {
		expect(normalizeCardName('\u201CHello\u201D')).toBe('"Hello"');
	});

	it('handles accented characters (preserves them)', () => {
		expect(normalizeCardName('Bartolom\u00E9 del Presidio')).toBe('Bartolom\u00E9 del Presidio');
	});

	it('handles card names with apostrophes', () => {
		expect(normalizeCardName("Agatha's Soul Cauldron")).toBe("Agatha's Soul Cauldron");
	});

	it('handles card names with hyphens', () => {
		expect(normalizeCardName('Callous Sell-Sword // Burn Together')).toBe(
			'Callous Sell-Sword // Burn Together',
		);
	});
});

describe('getFrontFace', () => {
	it('extracts front face from a DFC name', () => {
		expect(getFrontFace('Aclazotz, Deepest Betrayal // Temple of the Dead')).toBe(
			'Aclazotz, Deepest Betrayal',
		);
	});

	it('returns the full name for a regular card', () => {
		expect(getFrontFace('Lightning Bolt')).toBe('Lightning Bolt');
	});

	it('handles split cards', () => {
		expect(getFrontFace('Fire // Ice')).toBe('Fire');
	});

	it('handles adventure cards', () => {
		expect(getFrontFace('Bonecrusher Giant // Stomp')).toBe('Bonecrusher Giant');
	});

	it('normalizes before splitting', () => {
		expect(getFrontFace('  Fire//Ice  ')).toBe('Fire');
	});
});

describe('getScryfallImageUrl', () => {
	it('builds a Scryfall image URL for a regular card', () => {
		const url = getScryfallImageUrl('Lightning Bolt');
		expect(url).toBe(
			'https://api.scryfall.com/cards/named?format=image&version=normal&exact=Lightning%20Bolt',
		);
	});

	it('uses the front face for DFCs', () => {
		const url = getScryfallImageUrl('Aclazotz, Deepest Betrayal // Temple of the Dead');
		expect(url).toContain('exact=Aclazotz%2C%20Deepest%20Betrayal');
		expect(url).not.toContain('Temple');
	});

	it('supports different image versions', () => {
		const url = getScryfallImageUrl('Lightning Bolt', 'small');
		expect(url).toContain('version=small');
	});

	it('encodes special characters in the URL', () => {
		const url = getScryfallImageUrl("Agatha's Soul Cauldron");
		expect(url).toContain("Agatha's%20Soul%20Cauldron");
	});
});
