export interface MatchupCell {
	wins: number;
	losses: number;
	draws: number;
	intentionalDraws: number; // IDs (0-0-3), excluded from total/winrate
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
	wins: number;
	losses: number;
	draws: number;
	totalMatches: number;
	playerCount: number;
	byes: number; // excluded from totalMatches/winrate
	intentionalDraws: number; // IDs (0-0-3), excluded from totalMatches/winrate
}

export interface MetagameReport {
	matrix: MatchupMatrix;
	archetypes: ArchetypeStats[];
	tournamentIds: number[];
	format: string;
}

export interface AttributionMatrix {
	classifiedArchetypes: string[]; // row labels, sorted by count desc
	reportedArchetypes: string[]; // column labels, sorted by count desc
	cells: number[][]; // cells[row][col] = decklist count
	rowTotals: number[];
	colTotals: number[];
	grandTotal: number;
	maxCount: number; // for color scaling
}
