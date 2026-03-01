// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import DecklistComparison from '../../src/lib/components/DecklistComparison.svelte';
import type { DecklistInfo } from '../../src/lib/types/decklist';

afterEach(() => cleanup());

const aggregate: DecklistInfo = {
	playerId: '',
	mainboard: [
		{ cardName: 'Lightning Bolt', quantity: 4 },
		{ cardName: 'Mountain', quantity: 20 },
		{ cardName: 'Shock', quantity: 2 },
	],
	sideboard: [
		{ cardName: 'Negate', quantity: 3 },
	],
	companion: null,
	reportedArchetype: null,
};

const selected: DecklistInfo = {
	playerId: 'p1',
	mainboard: [
		{ cardName: 'Lightning Bolt', quantity: 4 },
		{ cardName: 'Mountain', quantity: 18 },
		{ cardName: 'Goblin Guide', quantity: 4 },
	],
	sideboard: [
		{ cardName: 'Negate', quantity: 2 },
		{ cardName: 'Searing Blood', quantity: 2 },
	],
	companion: null,
	reportedArchetype: null,
};

describe('DecklistComparison', () => {
	it('shows aggregate-only table when no selected decklist', () => {
		const { container } = render(DecklistComparison, {
			props: { aggregateDecklist: aggregate },
		});
		// Should show aggregate cards in a table
		expect(container.textContent).toContain('Lightning Bolt');
		expect(container.textContent).toContain('Mainboard');
		// Should not show the selected column header
		expect(container.textContent).not.toContain('Selected');
	});

	it('renders both column headers when selected decklist provided', () => {
		const { container } = render(DecklistComparison, {
			props: {
				aggregateDecklist: aggregate,
				selectedDecklist: selected,
				aggregateLabel: 'Aggregate (O2)',
				selectedLabel: 'Pro Tour - Alice',
			},
		});
		expect(container.textContent).toContain('Aggregate (O2)');
		expect(container.textContent).toContain('Pro Tour - Alice');
	});

	it('shows all unique card names from both lists', () => {
		const { container } = render(DecklistComparison, {
			props: {
				aggregateDecklist: aggregate,
				selectedDecklist: selected,
			},
		});
		// Cards from both lists should appear
		expect(container.textContent).toContain('Lightning Bolt');
		expect(container.textContent).toContain('Mountain');
		expect(container.textContent).toContain('Shock'); // only in aggregate
		expect(container.textContent).toContain('Goblin Guide'); // only in selected
	});

	it('highlights cards unique to aggregate', () => {
		const { container } = render(DecklistComparison, {
			props: {
				aggregateDecklist: aggregate,
				selectedDecklist: selected,
			},
		});
		// Shock is only in aggregate, should have only-agg class on the tr
		const rows = container.querySelectorAll('tbody tr');
		const shockRow = [...rows].find((r) => r.textContent?.includes('Shock'));
		expect(shockRow?.classList.contains('only-agg')).toBe(true);
	});

	it('highlights cards unique to selected', () => {
		const { container } = render(DecklistComparison, {
			props: {
				aggregateDecklist: aggregate,
				selectedDecklist: selected,
			},
		});
		const rows = container.querySelectorAll('tbody tr');
		const guideRow = [...rows].find((r) => r.textContent?.includes('Goblin Guide'));
		expect(guideRow?.classList.contains('only-sel')).toBe(true);
	});

	it('shows quantity differences with delta badges', () => {
		const { container } = render(DecklistComparison, {
			props: {
				aggregateDecklist: aggregate,
				selectedDecklist: selected,
			},
		});
		// Mountain: 20 in agg, 18 in sel → delta -2
		const deltas = container.querySelectorAll('.delta');
		const deltaTexts = [...deltas].map((d) => d.textContent);
		expect(deltaTexts).toContain('-2');
	});

	it('shows sideboard differences', () => {
		const { container } = render(DecklistComparison, {
			props: {
				aggregateDecklist: aggregate,
				selectedDecklist: selected,
			},
		});
		expect(container.textContent).toContain('Sideboard');
		expect(container.textContent).toContain('Searing Blood');
	});
});
