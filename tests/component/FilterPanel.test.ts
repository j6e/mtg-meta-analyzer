// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import { get } from 'svelte/store';
import FilterPanel from '../../src/lib/components/FilterPanel.svelte';
import { settings, resetSettings } from '../../src/lib/stores/settings';
import type { TournamentMeta } from '../../src/lib/types/tournament';

afterEach(() => cleanup());
beforeEach(() => resetSettings());

const sampleTournaments: TournamentMeta[] = [
	{
		id: 1,
		name: 'Tournament A',
		date: '2025-06-01',
		formats: ['Standard'],
		url: '',
		fetchedAt: '',
		playerCount: 100,
		roundCount: 8,
	},
	{
		id: 2,
		name: 'Tournament B',
		date: '2025-07-15',
		formats: ['Standard', 'Draft'],
		url: '',
		fetchedAt: '',
		playerCount: 200,
		roundCount: 12,
	},
];

const sampleFormats = ['Draft', 'Standard'];

describe('FilterPanel component', () => {
	it('renders the filter panel', () => {
		const { container } = render(FilterPanel, {
			props: { tournaments: sampleTournaments, formats: sampleFormats },
		});
		expect(container.querySelector('[data-testid="filter-panel"]')).toBeTruthy();
	});

	it('shows format options including "All formats"', () => {
		const { container } = render(FilterPanel, {
			props: { tournaments: sampleTournaments, formats: sampleFormats },
		});
		const options = container.querySelectorAll('select option');
		const labels = [...options].map((o) => o.textContent);
		expect(labels).toContain('All formats');
		expect(labels).toContain('Standard');
		expect(labels).toContain('Draft');
	});

	it('shows date range inputs', () => {
		const { container } = render(FilterPanel, {
			props: { tournaments: sampleTournaments, formats: sampleFormats },
		});
		const dateInputs = container.querySelectorAll('input[type="date"]');
		expect(dateInputs.length).toBe(2);
	});

	it('lists all tournaments with checkboxes', () => {
		const { container } = render(FilterPanel, {
			props: { tournaments: sampleTournaments, formats: sampleFormats },
		});
		const checks = container.querySelectorAll('.tournament-check');
		expect(checks.length).toBe(2);
		expect(checks[0].textContent).toContain('Tournament A');
		expect(checks[1].textContent).toContain('Tournament B');
	});

	it('shows mirror match toggle', () => {
		const { container } = render(FilterPanel, {
			props: { tournaments: sampleTournaments, formats: sampleFormats },
		});
		const checkboxes = container.querySelectorAll('.toggle input[type="checkbox"]');
		expect(checkboxes.length).toBe(1);
	});

	it('shows "Other" threshold radio buttons', () => {
		const { container } = render(FilterPanel, {
			props: { tournaments: sampleTournaments, formats: sampleFormats },
		});
		const radios = container.querySelectorAll('input[type="radio"]');
		expect(radios.length).toBe(2);
	});

	it('updates settings store when format changes', async () => {
		const { container } = render(FilterPanel, {
			props: { tournaments: sampleTournaments, formats: sampleFormats },
		});
		const select = container.querySelector('select')!;
		await fireEvent.change(select, { target: { value: 'Standard' } });
		expect(get(settings).format).toBe('Standard');
	});

	it('updates settings store when mirror toggle changes', async () => {
		const { container } = render(FilterPanel, {
			props: { tournaments: sampleTournaments, formats: sampleFormats },
		});
		const toggles = container.querySelectorAll('.toggle input[type="checkbox"]');
		const mirrorToggle = toggles[0] as HTMLInputElement;
		// Default is checked (excludeMirrors: true)
		expect(mirrorToggle.checked).toBe(true);
		await fireEvent.click(mirrorToggle);
		expect(get(settings).excludeMirrors).toBe(false);
	});

	it('shows Top N input when topN mode selected', () => {
		const { container } = render(FilterPanel, {
			props: { tournaments: sampleTournaments, formats: sampleFormats },
		});
		const numberInput = container.querySelector('.threshold-input input[type="number"]');
		expect(numberInput).toBeTruthy();
		// Default mode is topN, so should show "archetypes" label
		expect(container.textContent).toContain('archetypes');
	});
});
