// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';

describe('component test smoke test', () => {
	it('should have access to jsdom environment', () => {
		expect(typeof document).toBe('object');
		expect(typeof window).toBe('object');
	});

	it('should be able to create DOM elements', () => {
		const div = document.createElement('div');
		div.textContent = 'Hello Svelte 5';
		document.body.appendChild(div);
		expect(document.body.textContent).toContain('Hello Svelte 5');
		document.body.removeChild(div);
	});
});
