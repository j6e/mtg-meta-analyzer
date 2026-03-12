/** Extract round number from round name string. */
export function extractRoundNumber(name: string): number {
	const match = name.match(/Round\s+(\d+)/i);
	if (match) return Number(match[1]);

	// Playoff rounds: assign high numbers
	const lower = name.toLowerCase();
	if (lower.includes("quarterfinal")) return 900;
	if (lower.includes("semifinal")) return 950;
	if (lower.includes("final") && !lower.includes("semi") && !lower.includes("quarter"))
		return 999;
	if (lower.includes("top 8")) return 900;
	if (lower.includes("top 4")) return 950;

	return 0;
}
