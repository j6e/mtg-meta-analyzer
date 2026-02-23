// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import MatchupMatrix from '../../src/lib/components/MatchupMatrix.svelte';
import type { MatchupMatrix as MatrixType, ArchetypeStats } from '../../src/lib/types/metagame';

function makeCell(wins: number, losses: number, draws = 0, intentionalDraws = 0) {
	const total = wins + losses + draws;
	return {
		wins,
		losses,
		draws,
		intentionalDraws,
		total,
		winrate: total > 0 ? wins / total : null,
	};
}

const sampleMatrix: MatrixType = {
	archetypes: ['Aggro', 'Control', 'Midrange'],
	cells: [
		// Aggro vs [Aggro, Control, Midrange]
		[makeCell(0, 0), makeCell(7, 3), makeCell(4, 6)],
		// Control vs [Aggro, Control, Midrange]
		[makeCell(3, 7), makeCell(0, 0), makeCell(6, 4)],
		// Midrange vs [Aggro, Control, Midrange]
		[makeCell(6, 4), makeCell(4, 6), makeCell(0, 0)],
	],
};

const sampleStats: ArchetypeStats[] = [
	{ name: 'Aggro', metagameShare: 0.4, overallWinrate: 0.55, wins: 11, losses: 9, draws: 0, totalMatches: 20, playerCount: 8, byes: 0, intentionalDraws: 0 },
	{ name: 'Control', metagameShare: 0.35, overallWinrate: 0.45, wins: 9, losses: 11, draws: 0, totalMatches: 20, playerCount: 7, byes: 0, intentionalDraws: 0 },
	{ name: 'Midrange', metagameShare: 0.25, overallWinrate: 0.5, wins: 10, losses: 10, draws: 0, totalMatches: 20, playerCount: 5, byes: 0, intentionalDraws: 0 },
];

describe('MatchupMatrix component', () => {
	it('renders correct number of rows and columns', () => {
		const { container } = render(MatchupMatrix, {
			props: { matrix: sampleMatrix, stats: sampleStats },
		});

		const headerCells = container.querySelectorAll('thead th');
		// 3 archetype columns + 1 overall column + 1 corner cell = 5
		expect(headerCells.length).toBe(5);

		const bodyRows = container.querySelectorAll('tbody tr');
		expect(bodyRows.length).toBe(3);

		// Each row has 1 row-header + 1 overall cell + 3 data cells = 4 td
		const firstRowCells = bodyRows[0].querySelectorAll('td');
		expect(firstRowCells.length).toBe(4);
	});

	it('displays archetype names in headers', () => {
		const { container } = render(MatchupMatrix, {
			props: { matrix: sampleMatrix, stats: sampleStats },
		});

		const colHeaders = container.querySelectorAll('thead th.col-header');
		const colNames = [...colHeaders].map((th) => th.textContent?.trim());
		expect(colNames).toEqual(['Overall', 'Aggro', 'Control', 'Midrange']);

		const rowHeaders = container.querySelectorAll('tbody th.row-header');
		const rowNames = [...rowHeaders].map((th) => th.querySelector('.archetype-link')?.textContent?.trim());
		expect(rowNames).toEqual(['Aggro', 'Control', 'Midrange']);
	});

	it('shows winrate percentages in data cells', () => {
		const { container } = render(MatchupMatrix, {
			props: { matrix: sampleMatrix, stats: sampleStats },
		});

		// Aggro vs Control: 7-3 = 70.0%
		const cell01 = container.querySelector('[data-testid="cell-0-1"]');
		expect(cell01?.textContent).toContain('70.0%');
		expect(cell01?.textContent).toContain('(10)');
	});

	it('marks diagonal cells as mirror matches', () => {
		const { container } = render(MatchupMatrix, {
			props: { matrix: sampleMatrix, stats: sampleStats },
		});

		const cell00 = container.querySelector('[data-testid="cell-0-0"]');
		expect(cell00?.classList.contains('mirror')).toBe(true);
		expect(cell00?.textContent).toContain('Mirror');

		const cell11 = container.querySelector('[data-testid="cell-1-1"]');
		expect(cell11?.classList.contains('mirror')).toBe(true);
	});

	it('applies background color to non-mirror cells with data', () => {
		const { container } = render(MatchupMatrix, {
			props: { matrix: sampleMatrix, stats: sampleStats },
		});

		// Aggro vs Control: 70% winrate → should have greenish bg
		const cell01 = container.querySelector('[data-testid="cell-0-1"]') as HTMLElement;
		expect(cell01?.style.backgroundColor).toBeTruthy();

		// Mirror cell should NOT have inline bg
		const cell00 = container.querySelector('[data-testid="cell-0-0"]') as HTMLElement;
		expect(cell00?.style.backgroundColor).toBe('');
	});

	it('shows metagame share in row headers when stats provided', () => {
		const { container } = render(MatchupMatrix, {
			props: { matrix: sampleMatrix, stats: sampleStats },
		});

		const rowHeaders = container.querySelectorAll('tbody th.row-header');
		const aggro = rowHeaders[0];
		expect(aggro.textContent).toContain('40.0%');
	});

	it('handles empty matrix', () => {
		const emptyMatrix: MatrixType = { archetypes: [], cells: [] };
		const { container } = render(MatchupMatrix, {
			props: { matrix: emptyMatrix },
		});

		const bodyRows = container.querySelectorAll('tbody tr');
		expect(bodyRows.length).toBe(0);
	});

	it('links archetype names to detail pages', () => {
		const { container } = render(MatchupMatrix, {
			props: { matrix: sampleMatrix, stats: sampleStats },
		});

		const rowHeaders = container.querySelectorAll('tbody th.row-header');
		const links = [...rowHeaders].map((th) => th.querySelector('a')?.getAttribute('href'));
		expect(links).toEqual([
			'/archetypes/Aggro',
			'/archetypes/Control',
			'/archetypes/Midrange',
		]);
	});

	it('handles cells with no matches', () => {
		const sparseMatrix: MatrixType = {
			archetypes: ['A', 'B'],
			cells: [
				[makeCell(0, 0), makeCell(0, 0, 0)],
				[makeCell(0, 0, 0), makeCell(0, 0)],
			],
		};
		const { container } = render(MatchupMatrix, {
			props: { matrix: sparseMatrix },
		});

		const cell01 = container.querySelector('[data-testid="cell-0-1"]');
		expect(cell01?.textContent).toContain('—');
	});
});
