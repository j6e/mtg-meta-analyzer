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

		expect(s.format).toBe('');
		expect(s.dateFrom).toBe('');
		expect(s.dateTo).toBe('');
		expect(s.selectedTournamentIds).toEqual([]);
		expect(s.otherMode).toBe('topN');
		expect(s.minMetagameShare).toBe(0);
	});

	it('can update individual settings', () => {
		resetSettings();
		settings.update((s) => ({ ...s, excludeMirrors: false, topN: 5, format: 'Standard' }));
		const s = get(settings);
		expect(s.excludeMirrors).toBe(false);
		expect(s.topN).toBe(5);
		expect(s.format).toBe('Standard');
	});

	it('can update tournament filters', () => {
		resetSettings();
		settings.update((s) => ({
			...s,
			dateFrom: '2025-01-01',
			dateTo: '2025-12-31',
			selectedTournamentIds: [123, 456],
		}));
		const s = get(settings);
		expect(s.dateFrom).toBe('2025-01-01');
		expect(s.dateTo).toBe('2025-12-31');
		expect(s.selectedTournamentIds).toEqual([123, 456]);
	});

	it('can switch other mode', () => {
		resetSettings();
		settings.update((s) => ({ ...s, otherMode: 'minShare', minMetagameShare: 5 }));
		const s = get(settings);
		expect(s.otherMode).toBe('minShare');
		expect(s.minMetagameShare).toBe(5);
	});

	it('resets to defaults', () => {
		settings.update((s) => ({
			...s,
			excludeMirrors: false,
			topN: 10,

			format: 'Standard',
			dateFrom: '2025-01-01',
			selectedTournamentIds: [123],
			otherMode: 'minShare' as const,
			minMetagameShare: 5,
		}));
		resetSettings();
		const s = get(settings);
		expect(s.excludeMirrors).toBe(true);
		expect(s.topN).toBe(0);

		expect(s.format).toBe('');
		expect(s.selectedTournamentIds).toEqual([]);
		expect(s.otherMode).toBe('topN');
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
