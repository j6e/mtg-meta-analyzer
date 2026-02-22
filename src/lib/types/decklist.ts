export interface CardEntry {
	cardName: string;
	quantity: number;
}

export interface DecklistInfo {
	playerId: string;
	mainboard: CardEntry[];
	sideboard: CardEntry[];
	companion: CardEntry[] | null;
	reportedArchetype: string | null;
}
