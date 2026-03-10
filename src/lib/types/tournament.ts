import type { DecklistInfo } from "./decklist.ts";

export type TournamentSource = "melee" | "spicerack" | "mtgo";

/** professional (***), premier (**), competitive (*), other (blank) */
export type TournamentImportance = "professional" | "premier" | "competitive" | "other";

export interface TournamentMeta {
	id: string; // "{source}-{numericId}", e.g. "melee-339227"
	name: string;
	date: string; // ISO date
	formats: string[]; // ["Standard"], ["Draft", "Standard", "Draft2"]
	url: string; // original source URL
	fetchedAt: string; // ISO timestamp
	playerCount: number;
	roundCount: number;
	source: TournamentSource;
	tabletop: boolean;
}

export interface PlayerInfo {
	name: string;
	username: string;
	rank: number;
	points: number;
	matchRecord: string; // "7-2-0"
	decklistIds: string[]; // GUIDs — may have multiple for multi-format tournaments
	reportedArchetypes: string[]; // archetype per decklist
}

export interface MatchResult {
	player1Id: string;
	player2Id: string | null; // null = bye
	result: string; // "2-1-0", "bye", "draw"
	winnerId: string | null;
}

export interface RoundInfo {
	name: string;
	number: number;
	isPlayoff: boolean;
	matches: MatchResult[];
}

export interface TournamentData {
	meta: TournamentMeta;
	players: Record<string, PlayerInfo>;
	decklists: Record<string, DecklistInfo>;
	rounds: Record<string, RoundInfo>;
}

/** Entry in a per-format index.json — lightweight metadata for the filter panel */
export interface TournamentIndexEntry {
	id: string; // "melee-339227"
	name: string; // raw name from source
	cleanName: string; // display name (defaults to name, manually editable)
	date: string; // ISO date
	format: string; // primary format (implied by which index file this lives in)
	source: TournamentSource;
	url: string;
	playerCount: number;
	roundCount: number;
	importance: TournamentImportance;
	tabletop: boolean;
	pairings: boolean; // whether match/round data is available (MTGO doesn't have this)
	path: string; // relative path within format dir, e.g. "2026-03/melee-385576.json"
}
