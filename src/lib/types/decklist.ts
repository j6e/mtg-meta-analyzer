export interface CardEntry {
	cardName: string;
	quantity: number;
}

export interface DecklistInfo {
	playerId: string;
	mainboard: CardEntry[];
	sideboard: CardEntry[];
	commanders: CardEntry[] | null;
	companion: CardEntry[] | null;
	reportedArchetype: string | null;
}

/** Who played a decklist and how they finished. */
export interface DecklistPlayer {
	id: string;
	name: string;
	rank: number;
	/** Match record "W-L-D", e.g. "7-2-0". */
	record: string;
}

/** The tournament a decklist comes from; `name` is the cleaned display name. */
export interface DecklistTournament {
	id: string;
	name: string;
	date: string;
	url: string;
	playerCount: number;
}
