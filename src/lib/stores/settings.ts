/**
 * User preference store for metagame analysis settings.
 * Values persist in memory (reset on page reload).
 */
import { writable } from 'svelte/store';

export type OtherMode = 'topN' | 'minShare';

export interface MetaSettings {
	// Tournament filters
	format: string; // '' = all formats
	dateFrom: string; // '' = no lower bound (ISO date string)
	dateTo: string; // '' = no upper bound (ISO date string)
	selectedTournamentIds: number[]; // empty = all tournaments

	// Matrix options
	excludeMirrors: boolean;
	otherMode: OtherMode;
	topN: number; // 0 = show all (only used when otherMode = 'topN')
	minMetagameShare: number; // 0-100 as percentage (only used when otherMode = 'minShare')
}

const defaults: MetaSettings = {
	format: '',
	dateFrom: '',
	dateTo: '',
	selectedTournamentIds: [],
	excludeMirrors: true,
	otherMode: 'minShare',
	topN: 0,
	minMetagameShare: 2,
};

export const settings = writable<MetaSettings>({ ...defaults });

export function resetSettings(): void {
	settings.set({ ...defaults });
}
