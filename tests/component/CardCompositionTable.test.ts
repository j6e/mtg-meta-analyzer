// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import CardCompositionTable from '../../src/lib/components/CardCompositionTable.svelte';
import type { CardCompositionRow } from '../../src/lib/utils/card-composition';

afterEach(() => cleanup());

const sampleRows: CardCompositionRow[] = [
	{
		cardName: 'Lightning Bolt',
		thresholds: [1.0, 0.95, 0.8, 0.6],
		averageQuantity: 3.5,
		count: 20,
	},
	{
		cardName: 'Mountain',
		thresholds: [1.0, 1.0, 1.0, 1.0],
		averageQuantity: 20.0,
		count: 20,
	},
	{
		cardName: 'Shock',
		thresholds: [0.5, 0.3, 0.1, 0.0],
		averageQuantity: 1.8,
		count: 10,
	},
];

describe('CardCompositionTable', () => {
	it('renders correct number of rows', () => {
		const { container } = render(CardCompositionTable, {
			props: { rows: sampleRows, title: 'Mainboard', deckCount: 20 },
		});
		const bodyRows = container.querySelectorAll('tbody tr');
		expect(bodyRows).toHaveLength(3);
	});

	it('displays title and deck count', () => {
		const { container } = render(CardCompositionTable, {
			props: { rows: sampleRows, title: 'Mainboard', deckCount: 20 },
		});
		expect(container.textContent).toContain('Mainboard');
		expect(container.textContent).toContain('20 decks');
	});

	it('displays formatted percentages', () => {
		const { container } = render(CardCompositionTable, {
			props: { rows: sampleRows, title: 'Mainboard', deckCount: 20 },
		});
		expect(container.textContent).toContain('100%');
		expect(container.textContent).toContain('95%');
		expect(container.textContent).toContain('80%');
		expect(container.textContent).toContain('60%');
	});

	it('displays average quantity', () => {
		const { container } = render(CardCompositionTable, {
			props: { rows: sampleRows, title: 'Mainboard', deckCount: 20 },
		});
		expect(container.textContent).toContain('3.5');
		expect(container.textContent).toContain('20.0');
	});

	it('shows card names', () => {
		const { container } = render(CardCompositionTable, {
			props: { rows: sampleRows, title: 'Mainboard', deckCount: 20 },
		});
		expect(container.textContent).toContain('Lightning Bolt');
		expect(container.textContent).toContain('Mountain');
		expect(container.textContent).toContain('Shock');
	});

	it('shows empty message when no rows', () => {
		const { container } = render(CardCompositionTable, {
			props: { rows: [], title: 'Sideboard', deckCount: 0 },
		});
		expect(container.textContent).toContain('No cards found');
	});

	it('renders column headers', () => {
		const { container } = render(CardCompositionTable, {
			props: { rows: sampleRows, title: 'Mainboard', deckCount: 20 },
		});
		const headers = container.querySelectorAll('th');
		const headerTexts = [...headers].map((h) => h.textContent?.trim());
		// Headers may include sort indicators (▲/▼), so use partial matching
		expect(headerTexts.some((t) => t?.startsWith('Card'))).toBe(true);
		expect(headerTexts.some((t) => t?.startsWith('1+'))).toBe(true);
		expect(headerTexts.some((t) => t?.startsWith('2+'))).toBe(true);
		expect(headerTexts.some((t) => t?.startsWith('3+'))).toBe(true);
		expect(headerTexts.some((t) => t?.startsWith('4+'))).toBe(true);
		expect(headerTexts.some((t) => t?.startsWith('Avg'))).toBe(true);
	});
});
