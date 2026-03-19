/**
 * User preference store for metagame analysis settings.
 * Values persist in memory (reset on page reload).
 */
import { writable } from "svelte/store";
import type { TournamentImportance } from "../types/tournament";

export type OtherMode = "topN" | "minShare";

export interface MetaSettings {
	// Tournament filters
	format: string;
	dateFrom: string; // '' = no lower bound (ISO date string)
	dateTo: string; // '' = no upper bound (ISO date string)
	minTier: TournamentImportance; // minimum importance for auto-selection ("other" = no filter)
	paperOnly: boolean; // if true, only tabletop tournaments are auto-selected
	useStandings: boolean; // if true, supplement overall stats with standings W-L-D for incomplete tournaments
	selectedTournamentIds: string[]; // empty = all tournaments

	// Matrix options
	excludeMirrors: boolean;
	otherMode: OtherMode;
	topN: number; // 0 = show all (only used when otherMode = 'topN')
	minMetagameShare: number; // 0-100 as percentage (only used when otherMode = 'minShare')

	// Winners mode
	winnersMode: boolean;
	winnersCutoff: number; // 0.10–0.50
}

export function isoDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

export function makeDefaults(): MetaSettings {
	const today = new Date();
	const minus30 = new Date(today);
	minus30.setDate(today.getDate() - 30);
	return {
		format: "Standard",
		dateFrom: isoDate(minus30),
		dateTo: isoDate(today),
		minTier: "other",
		paperOnly: false,
		useStandings: false,
		selectedTournamentIds: [],
		excludeMirrors: true,
		otherMode: "minShare",
		topN: 0,
		minMetagameShare: 2,
		winnersMode: false,
		winnersCutoff: 0.25,
	};
}

export const settings = writable<MetaSettings>(makeDefaults());

export function resetSettings(): void {
	settings.set(makeDefaults());
}
