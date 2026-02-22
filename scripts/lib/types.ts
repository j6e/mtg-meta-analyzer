// DataTables protocol types

export interface DataTablesColumn {
	data: string;
	name: string;
	searchable: boolean;
	orderable: boolean;
	search: { value: string; regex: boolean };
}

export interface DataTablesResponse<T = unknown> {
	draw: number;
	recordsTotal: number;
	recordsFiltered: number;
	data: T[];
}

// Melee.gg API response types (actual shape from server, Feb 2026)

export interface MeleeStandingRow {
	Rank: number;
	Points: number;
	MatchWins: number;
	MatchLosses: number;
	MatchDraws: number;
	OpponentMatchWinPercentage: number;
	TeamGameWinPercentage: number;
	OpponentGameWinPercentage: number;
	Team: {
		Players: {
			ID: number;
			DisplayName: string;
			Username: string;
			TeamId: number;
		}[];
	};
	Decklists: {
		DecklistId: string; // GUID
		PlayerId: number;
		DecklistName: string;
		Format: string;
		FormatId: string;
	}[];
}

export interface MeleeMatchCompetitor {
	ID: number;
	CheckedIn: string | null;
	ResultConfirmed: string | null;
	SortOrder: number;
	GameByes: number;
	GameWins: number | null;
	GameWinsAndGameByes: number;
	TeamId: number;
	Team: {
		ID: number;
		Name: string | null;
		Players: {
			ID: number;
			DisplayName: string;
			DisplayNameLastFirst: string;
			Username: string;
			TeamId: number;
		}[];
	};
	Decklists: {
		DecklistId: string;
		DecklistName: string;
	}[];
}

export interface MeleeMatchRow {
	Guid: string;
	Competitors: MeleeMatchCompetitor[];
	RoundNumber: number;
	RoundId: number;
	TournamentId: number;
	Format: string;
	FormatDescription: string;
	ResultString: string;
	HasResult: boolean;
	GameDraws: number;
	TableNumber: number | null;
	ByeReasonDescription: string | null;
}

export interface MeleeTournamentSearchRow {
	ID: number;
	Name: string;
	StartDate: string;
	OrganizationName: string;
	FormatDescription: string;
	StatusDescription: string;
	Decklists: number;
}

// Decklist JSON endpoint types

export interface MeleeDecklistRecord {
	l: string;  // lowercase card name (slug)
	n: string;  // display card name
	s: string | null;  // set code (nullable)
	q: number;  // quantity
	c: number;  // category: 0 = mainboard, 99 = sideboard
	t: string;  // card type (Creature, Instant, Land, etc.)
}

export interface MeleeDecklistDetails {
	Guid: string;
	DecklistName: string;
	FormatName: string;
	Game: string;
	Records: MeleeDecklistRecord[];
	LinkToCards: boolean;
	Components: {
		ComponentDescription: string;
		CardQuantity: number;
		CardRecords: MeleeDecklistRecord[];
	}[];
}

// Parsed types (after HTML/response processing)

export interface ParsedTournamentPage {
	name: string;
	date: string;
	formats: string[];
	rounds: ParsedRound[];
}

export interface ParsedRound {
	id: number;
	name: string;
	isCompleted: boolean;
	isStarted: boolean;
}

export interface ParsedDecklist {
	mainboard: { cardName: string; quantity: number }[];
	sideboard: { cardName: string; quantity: number }[];
	companion: { cardName: string; quantity: number }[] | null;
	reportedArchetype: string | null;
}
