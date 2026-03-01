// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import WinrateSplitterPanel from '../../src/lib/components/WinrateSplitterPanel.svelte';

afterEach(() => cleanup());

const defaultProps = {
	archetypeName: 'Aggro',
	allCardNames: ['Lightning Bolt', 'Mountain', 'Shock', 'Goblin Guide'],
	tournaments: [],
	playerArchetypes: new Map<string, string>(),
};

describe('WinrateSplitterPanel', () => {
	it('renders card search input', () => {
		const { container } = render(WinrateSplitterPanel, { props: defaultProps });
		const input = container.querySelector('input[type="text"]');
		expect(input).toBeTruthy();
		expect(input?.getAttribute('placeholder')).toContain('Search card');
	});

	it('renders mode toggle buttons', () => {
		const { container } = render(WinrateSplitterPanel, { props: defaultProps });
		const buttons = container.querySelectorAll('.mode-btn');
		expect(buttons).toHaveLength(2);
		expect(buttons[0].textContent).toContain('Binary');
		expect(buttons[1].textContent).toContain('Per Copy');
	});

	it('renders split button', () => {
		const { container } = render(WinrateSplitterPanel, { props: defaultProps });
		const btn = container.querySelector('.split-btn');
		expect(btn).toBeTruthy();
		expect(btn?.textContent).toContain('Split');
	});

	it('split button is disabled when no card selected', () => {
		const { container } = render(WinrateSplitterPanel, { props: defaultProps });
		const btn = container.querySelector('.split-btn') as HTMLButtonElement;
		expect(btn.disabled).toBe(true);
	});

	it('renders threshold input in binary mode', () => {
		const { container } = render(WinrateSplitterPanel, { props: defaultProps });
		const numInput = container.querySelector('input[type="number"]');
		expect(numInput).toBeTruthy();
	});

	it('does not show results table initially', () => {
		const { container } = render(WinrateSplitterPanel, { props: defaultProps });
		const table = container.querySelector('table');
		expect(table).toBeNull();
	});
});
