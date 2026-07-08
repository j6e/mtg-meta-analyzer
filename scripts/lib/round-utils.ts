/**
 * Canonical playoff round keys/names/sort-numbers, keyed by position from
 * the last round: 0 = Finals. Shared by the mtgo and videre assemblers and
 * the melee round-name parser so all sources emit identical round shapes.
 */
export const PLAYOFF_ROUNDS: Record<
	number,
	{ key: string; name: string; number: number }
> = {
	0: { key: "playoffs-f", name: "Finals", number: 999 },
	1: { key: "playoffs-sf", name: "Semifinals", number: 950 },
	2: { key: "playoffs-qf", name: "Quarterfinals", number: 900 },
};

/** Extract round number from round name string. */
export function extractRoundNumber(name: string): number {
	const match = name.match(/Round\s+(\d+)/i);
	if (match) return Number(match[1]);

	// Playoff rounds: assign the canonical high numbers
	const lower = name.toLowerCase();
	if (lower.includes("quarterfinal")) return PLAYOFF_ROUNDS[2].number;
	if (lower.includes("semifinal")) return PLAYOFF_ROUNDS[1].number;
	if (lower.includes("final") && !lower.includes("semi") && !lower.includes("quarter"))
		return PLAYOFF_ROUNDS[0].number;
	if (lower.includes("top 8")) return PLAYOFF_ROUNDS[2].number;
	if (lower.includes("top 4")) return PLAYOFF_ROUNDS[1].number;

	return 0;
}
