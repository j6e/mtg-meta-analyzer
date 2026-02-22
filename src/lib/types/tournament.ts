import type { DecklistInfo } from './decklist.ts';

export interface TournamentMeta {
	id: number;
	name: string;
	date: string; // ISO date
	format: string; // "Standard", "Modern", etc.
	url: string; // original melee.gg URL
	fetchedAt: string; // ISO timestamp
	playerCount: number;
	roundCount: number;
}

export interface PlayerInfo {
	name: string;
	rank: number;
	points: number;
	matchRecord: string; // "7-2-0"
	gameRecord: string; // "15-6-1"
	decklistId: number | null;
	reportedArchetype: string | null;
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
