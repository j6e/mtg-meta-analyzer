// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import AttributionMatrix from '../../src/lib/components/AttributionMatrix.svelte';
import type { AttributionMatrix as MatrixType } from '../../src/lib/types/metagame';

const sampleMatrix: MatrixType = {
	classifiedArchetypes: ['Aggro', 'Control', 'Midrange'],
	reportedArchetypes: ['Aggro', 'Control', 'Combo'],
	cells: [
		// Aggro classified vs [Aggro reported, Control reported, Combo reported]
		[10, 2, 0],
		// Control classified vs [Aggro reported, Control reported, Combo reported]
		[1, 8, 1],
		// Midrange classified vs [Aggro reported, Control reported, Combo reported]
		[0, 3, 5],
	],
	rowTotals: [12, 10, 8],
	colTotals: [11, 13, 6],
	grandTotal: 30,
	maxCount: 10,
};

describe('AttributionMatrix component', () => {
	it('renders correct number of rows and columns', () => {
		const { container } = render(AttributionMatrix, {
			props: { matrix: sampleMatrix },
		});

		const headerCells = container.querySelectorAll('thead th');
		// 3 reported archetype columns + 1 total column + 1 corner cell = 5
		expect(headerCells.length).toBe(5);

		const bodyRows = container.querySelectorAll('tbody tr');
		// 3 classified archetype rows + 1 totals row = 4
		expect(bodyRows.length).toBe(4);
	});

	it('displays classified archetype names in row headers', () => {
		const { container } = render(AttributionMatrix, {
			props: { matrix: sampleMatrix },
		});

		const rowHeaders = container.querySelectorAll('tbody th.row-header');
		const rowNames = [...rowHeaders].map((th) => th.textContent?.trim());
		expect(rowNames).toEqual(['Aggro', 'Control', 'Midrange', 'Total']);
	});

	it('displays reported archetype names in column headers', () => {
		const { container } = render(AttributionMatrix, {
			props: { matrix: sampleMatrix },
		});

		const colHeaders = container.querySelectorAll('thead th.col-header');
		const colNames = [...colHeaders].map((th) => th.textContent?.trim());
		expect(colNames).toEqual(['Aggro', 'Control', 'Combo', 'Total']);
	});

	it('shows correct counts in data cells', () => {
		const { container } = render(AttributionMatrix, {
			props: { matrix: sampleMatrix },
		});

		// Aggro classified vs Control reported: 2
		const cell01 = container.querySelector('[data-testid="attr-cell-0-1"]');
		expect(cell01?.textContent?.trim()).toBe('2');

		// Control classified vs Control reported: 8
		const cell11 = container.querySelector('[data-testid="attr-cell-1-1"]');
		expect(cell11?.textContent?.trim()).toBe('8');

		// Midrange classified vs Combo reported: 5
		const cell22 = container.querySelector('[data-testid="attr-cell-2-2"]');
		expect(cell22?.textContent?.trim()).toBe('5');
	});

	it('shows dash for zero cells', () => {
		const { container } = render(AttributionMatrix, {
			props: { matrix: sampleMatrix },
		});

		// Aggro classified vs Combo reported: 0
		const cell02 = container.querySelector('[data-testid="attr-cell-0-2"]');
		expect(cell02?.textContent?.trim()).toBe('—');

		// Midrange classified vs Aggro reported: 0
		const cell20 = container.querySelector('[data-testid="attr-cell-2-0"]');
		expect(cell20?.textContent?.trim()).toBe('—');
	});

	it('marks agreement cells with the agreement CSS class', () => {
		const { container } = render(AttributionMatrix, {
			props: { matrix: sampleMatrix },
		});

		// Aggro classified vs Aggro reported: agreement (count=10 > 0)
		const cell00 = container.querySelector('[data-testid="attr-cell-0-0"]');
		expect(cell00?.classList.contains('agreement')).toBe(true);

		// Control classified vs Control reported: agreement (count=8 > 0)
		const cell11 = container.querySelector('[data-testid="attr-cell-1-1"]');
		expect(cell11?.classList.contains('agreement')).toBe(true);

		// Midrange classified vs Combo reported: NOT agreement (names differ)
		const cell22 = container.querySelector('[data-testid="attr-cell-2-2"]');
		expect(cell22?.classList.contains('agreement')).toBe(false);

		// Zero agreement cell should NOT have agreement class
		// Aggro classified vs Combo reported: count=0
		const cell02 = container.querySelector('[data-testid="attr-cell-0-2"]');
		expect(cell02?.classList.contains('agreement')).toBe(false);
	});

	it('renders total row and column with correct values', () => {
		const { container } = render(AttributionMatrix, {
			props: { matrix: sampleMatrix },
		});

		const bodyRows = container.querySelectorAll('tbody tr');

		// Last row is totals
		const totalsRow = bodyRows[bodyRows.length - 1];
		const totalCells = totalsRow.querySelectorAll('td');
		const totalValues = [...totalCells].map((td) => td.textContent?.trim());
		// col totals: 11, 13, 6, then grand total: 30
		expect(totalValues).toEqual(['11', '13', '6', '30']);

		// Row totals (last td in each data row)
		const dataRows = [...bodyRows].slice(0, 3);
		const rowTotalValues = dataRows.map((row) => {
			const cells = row.querySelectorAll('td');
			return cells[cells.length - 1].textContent?.trim();
		});
		expect(rowTotalValues).toEqual(['12', '10', '8']);
	});

	it('handles empty matrix', () => {
		const emptyMatrix: MatrixType = {
			classifiedArchetypes: [],
			reportedArchetypes: [],
			cells: [],
			rowTotals: [],
			colTotals: [],
			grandTotal: 0,
			maxCount: 0,
		};

		const { container } = render(AttributionMatrix, {
			props: { matrix: emptyMatrix },
		});

		// Only the totals row in tbody (with empty totals)
		const bodyRows = container.querySelectorAll('tbody tr');
		expect(bodyRows.length).toBe(1); // just the totals row
	});

	it('applies background color to cells with counts', () => {
		const { container } = render(AttributionMatrix, {
			props: { matrix: sampleMatrix },
		});

		// Cell with count 10 (max) should have background
		const cell00 = container.querySelector('[data-testid="attr-cell-0-0"]') as HTMLElement;
		expect(cell00?.style.backgroundColor).toBeTruthy();

		// Cell with count 0 should NOT have background
		const cell02 = container.querySelector('[data-testid="attr-cell-0-2"]') as HTMLElement;
		expect(cell02?.style.backgroundColor).toBe('');
	});
});
