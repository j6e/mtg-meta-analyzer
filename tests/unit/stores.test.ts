import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { writable, derived } from 'svelte/store';
import type { MetaSettings } from '../../src/lib/stores/settings';
import { settings, resetSettings } from '../../src/lib/stores/settings';

describe('settings store', () => {
	it('has correct defaults', () => {
		resetSettings();
		const s = get(settings);
		expect(s.excludeMirrors).toBe(true);
		expect(s.topN).toBe(0);
		expect(s.excludePlayoffs).toBe(true);
	});

	it('can update individual settings', () => {
		resetSettings();
		settings.update((s) => ({ ...s, excludeMirrors: false, topN: 5 }));
		const s = get(settings);
		expect(s.excludeMirrors).toBe(false);
		expect(s.topN).toBe(5);
	});

	it('resets to defaults', () => {
		settings.update((s) => ({ ...s, excludeMirrors: false, topN: 10, excludePlayoffs: false }));
		resetSettings();
		const s = get(settings);
		expect(s.excludeMirrors).toBe(true);
		expect(s.topN).toBe(0);
		expect(s.excludePlayoffs).toBe(true);
	});
});

describe('derived store reactivity', () => {
	it('derived stores update when source changes', () => {
		const source = writable(1);
		const doubled = derived(source, ($s) => $s * 2);

		expect(get(doubled)).toBe(2);
		source.set(5);
		expect(get(doubled)).toBe(10);
	});

	it('multi-source derived stores react to any input change', () => {
		const a = writable(2);
		const b = writable(3);
		const sum = derived([a, b], ([$a, $b]) => $a + $b);

		expect(get(sum)).toBe(5);
		a.set(10);
		expect(get(sum)).toBe(13);
		b.set(7);
		expect(get(sum)).toBe(17);
	});
});
