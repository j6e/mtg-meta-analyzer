import { describe, it, expect } from 'vitest';

describe('unit test smoke test', () => {
	it('should pass a basic assertion', () => {
		expect(1 + 1).toBe(2);
	});

	it('should run in node environment', () => {
		expect(typeof globalThis).toBe('object');
	});
});
