export interface MatchupCell {
	wins: number;
	losses: number;
	draws: number;
	total: number;
	winrate: number | null; // null if no matches
}

export interface MatchupMatrix {
	archetypes: string[]; // ordered by metagame share
	cells: MatchupCell[][]; // [row][col], row = archetype playing, col = opponent
}

export interface ArchetypeStats {
	name: string;
	metagameShare: number; // 0-1
	overallWinrate: number; // 0-1
	totalMatches: number;
	playerCount: number;
}

export interface MetagameReport {
	matrix: MatchupMatrix;
	archetypes: ArchetypeStats[];
	tournamentIds: number[];
	format: string;
}
