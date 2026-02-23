/**
 * User preference store for metagame analysis settings.
 * Values persist in memory (reset on page reload).
 */
import { writable } from 'svelte/store';

export interface MetaSettings {
	excludeMirrors: boolean;
	topN: number; // 0 = show all archetypes
	excludePlayoffs: boolean;
}

const defaults: MetaSettings = {
	excludeMirrors: true,
	topN: 0,
	excludePlayoffs: true,
};

export const settings = writable<MetaSettings>({ ...defaults });

export function resetSettings(): void {
	settings.set({ ...defaults });
}
