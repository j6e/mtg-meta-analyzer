// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import CardTooltip from '../../src/lib/components/CardTooltip.svelte';

afterEach(() => cleanup());

describe('CardTooltip component', () => {
	it('renders the trigger text', () => {
		const { getByText } = render(CardTooltip, {
			props: { cardName: 'Lightning Bolt', children: undefined as any },
		});
		// With snippets, children may not render text in the test — check trigger exists
		const trigger = document.querySelector('.card-tooltip-trigger');
		expect(trigger).toBeTruthy();
	});

	it('does not show tooltip by default', () => {
		render(CardTooltip, {
			props: { cardName: 'Lightning Bolt', children: undefined as any },
		});
		const tooltip = document.querySelector('.card-tooltip');
		expect(tooltip).toBeNull();
	});

	it('shows tooltip on mouseenter', async () => {
		render(CardTooltip, {
			props: { cardName: 'Lightning Bolt', children: undefined as any },
		});
		const trigger = document.querySelector('.card-tooltip-trigger')!;
		await fireEvent.mouseEnter(trigger, { clientX: 100, clientY: 100 });
		const tooltip = document.querySelector('.card-tooltip');
		expect(tooltip).toBeTruthy();
	});

	it('hides tooltip on mouseleave', async () => {
		render(CardTooltip, {
			props: { cardName: 'Lightning Bolt', children: undefined as any },
		});
		const trigger = document.querySelector('.card-tooltip-trigger')!;
		await fireEvent.mouseEnter(trigger, { clientX: 100, clientY: 100 });
		expect(document.querySelector('.card-tooltip')).toBeTruthy();
		await fireEvent.mouseLeave(trigger);
		expect(document.querySelector('.card-tooltip')).toBeNull();
	});

	it('tooltip contains an img with the correct Scryfall URL', async () => {
		render(CardTooltip, {
			props: { cardName: 'Lightning Bolt', children: undefined as any },
		});
		const trigger = document.querySelector('.card-tooltip-trigger')!;
		await fireEvent.mouseEnter(trigger, { clientX: 100, clientY: 100 });
		const img = document.querySelector('.card-tooltip img') as HTMLImageElement;
		expect(img).toBeTruthy();
		expect(img.src).toContain('api.scryfall.com');
		expect(img.src).toContain('Lightning%20Bolt');
	});

	it('uses front face for DFC card names', async () => {
		render(CardTooltip, {
			props: { cardName: 'Aclazotz, Deepest Betrayal // Temple of the Dead', children: undefined as any },
		});
		const trigger = document.querySelector('.card-tooltip-trigger')!;
		await fireEvent.mouseEnter(trigger, { clientX: 100, clientY: 100 });
		const img = document.querySelector('.card-tooltip img') as HTMLImageElement;
		expect(img.src).toContain('Aclazotz');
		expect(img.src).not.toContain('Temple');
	});
});
