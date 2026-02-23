// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import DecklistView from '../../src/lib/components/DecklistView.svelte';
import type { DecklistInfo } from '../../src/lib/types/decklist';

afterEach(() => cleanup());

const sampleDecklist: DecklistInfo = {
	playerId: 'p1',
	mainboard: [
		{ cardName: 'Lightning Bolt', quantity: 4 },
		{ cardName: 'Mountain', quantity: 20 },
		{ cardName: 'Goblin Guide', quantity: 4 },
	],
	sideboard: [
		{ cardName: 'Searing Blood', quantity: 3 },
		{ cardName: 'Roiling Vortex', quantity: 2 },
	],
	companion: null,
	reportedArchetype: 'Mono-Red Aggro',
};

describe('DecklistView component', () => {
	it('renders mainboard cards with quantities', () => {
		const { container } = render(DecklistView, {
			props: { decklist: sampleDecklist },
		});
		const items = container.querySelectorAll('li');
		// 3 mainboard + 2 sideboard = 5
		expect(items.length).toBe(5);
		expect(container.textContent).toContain('4x');
		expect(container.textContent).toContain('Lightning Bolt');
		expect(container.textContent).toContain('Mountain');
	});

	it('shows mainboard and sideboard counts', () => {
		const { container } = render(DecklistView, {
			props: { decklist: sampleDecklist },
		});
		// Mainboard: 4+20+4 = 28
		expect(container.textContent).toContain('(28)');
		// Sideboard: 3+2 = 5
		expect(container.textContent).toContain('(5)');
	});

	it('shows player name and archetype when provided', () => {
		const { container } = render(DecklistView, {
			props: {
				decklist: sampleDecklist,
				playerName: 'Alice',
				archetype: 'Mono-Red Aggro',
			},
		});
		expect(container.textContent).toContain('Alice');
		expect(container.textContent).toContain('Mono-Red Aggro');
	});

	it('hides metadata section when no player/archetype', () => {
		const { container } = render(DecklistView, {
			props: { decklist: sampleDecklist },
		});
		expect(container.querySelector('.meta')).toBeNull();
	});

	it('hides sideboard section when empty', () => {
		const noSideboard: DecklistInfo = {
			...sampleDecklist,
			sideboard: [],
		};
		const { container } = render(DecklistView, {
			props: { decklist: noSideboard },
		});
		const headings = container.querySelectorAll('h3');
		const headingTexts = [...headings].map((h) => h.textContent);
		expect(headingTexts.some((t) => t?.includes('Sideboard'))).toBe(false);
	});

	it('shows companion section when present', () => {
		const withCompanion: DecklistInfo = {
			...sampleDecklist,
			companion: [{ cardName: 'Lurrus of the Dream-Den', quantity: 1 }],
		};
		const { container } = render(DecklistView, {
			props: { decklist: withCompanion },
		});
		expect(container.textContent).toContain('Companion');
		expect(container.textContent).toContain('Lurrus of the Dream-Den');
	});

	it('renders card names inside CardTooltip triggers', () => {
		const { container } = render(DecklistView, {
			props: { decklist: sampleDecklist },
		});
		const triggers = container.querySelectorAll('.card-tooltip-trigger');
		expect(triggers.length).toBe(5); // 3 mainboard + 2 sideboard
	});
});
