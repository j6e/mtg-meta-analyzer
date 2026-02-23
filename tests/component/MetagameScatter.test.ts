// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import MetagameScatter from '../../src/lib/components/MetagameScatter.svelte';
import type { ArchetypeStats } from '../../src/lib/types/metagame';

// Chart.js needs a canvas context — jsdom provides a stub but Chart.js
// may fail to fully render. We test that the component mounts and the
// canvas element is present.

// Mock canvas getContext for Chart.js in jsdom
beforeEach(() => {
	HTMLCanvasElement.prototype.getContext = (() => {
		return {
			canvas: { width: 400, height: 300 },
			clearRect: () => {},
			beginPath: () => {},
			moveTo: () => {},
			lineTo: () => {},
			stroke: () => {},
			fill: () => {},
			arc: () => {},
			save: () => {},
			restore: () => {},
			setLineDash: () => {},
			measureText: () => ({ width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 }),
			fillText: () => {},
			strokeText: () => {},
			createLinearGradient: () => ({ addColorStop: () => {} }),
			createRadialGradient: () => ({ addColorStop: () => {} }),
			fillRect: () => {},
			strokeRect: () => {},
			scale: () => {},
			translate: () => {},
			rotate: () => {},
			setTransform: () => {},
			resetTransform: () => {},
			drawImage: () => {},
			clip: () => {},
			isPointInPath: () => false,
			getImageData: () => ({ data: new Uint8ClampedArray(4) }),
			putImageData: () => {},
		};
	}) as any;
});

const sampleStats: ArchetypeStats[] = [
	{ name: 'Aggro', metagameShare: 0.35, overallWinrate: 0.55, totalMatches: 100, playerCount: 14 },
	{ name: 'Control', metagameShare: 0.25, overallWinrate: 0.48, totalMatches: 80, playerCount: 10 },
	{ name: 'Midrange', metagameShare: 0.2, overallWinrate: 0.52, totalMatches: 60, playerCount: 8 },
	{ name: 'Unknown', metagameShare: 0.2, overallWinrate: 0.45, totalMatches: 40, playerCount: 8 },
];

describe('MetagameScatter component', () => {
	it('mounts a canvas element', () => {
		const { container } = render(MetagameScatter, { props: { stats: sampleStats } });
		const canvas = container.querySelector('canvas[data-testid="scatter-canvas"]');
		expect(canvas).toBeTruthy();
	});

	it('renders legend items for non-Unknown archetypes', () => {
		const { container } = render(MetagameScatter, { props: { stats: sampleStats } });
		const legendItems = container.querySelectorAll('.legend-item');
		// 3 non-Unknown archetypes
		expect(legendItems.length).toBe(3);
		const names = [...legendItems].map((el) => el.textContent?.trim());
		expect(names).toContain('Aggro');
		expect(names).toContain('Control');
		expect(names).toContain('Midrange');
		expect(names).not.toContain('Unknown');
	});

	it('handles empty stats', () => {
		const { container } = render(MetagameScatter, { props: { stats: [] } });
		const canvas = container.querySelector('canvas');
		expect(canvas).toBeTruthy();
		const legendItems = container.querySelectorAll('.legend-item');
		expect(legendItems.length).toBe(0);
	});
});
