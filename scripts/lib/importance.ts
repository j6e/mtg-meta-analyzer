import type { TournamentImportance } from "../../src/lib/types/tournament";

const IMPORTANCE_PATTERNS: { importance: TournamentImportance; pattern: RegExp }[] = [
	{
		importance: "professional",
		pattern: /\bPro Tour\b|\bWorld Championship\b|\bArena Championship\b/i,
	},
	{
		importance: "premier",
		pattern:
			/\bRegional Championship\b|\bSpotlight\b|\bMTGO Showcase\b|\bShowcase Challenge\b|\bPTQ\b/i,
	},
	{
		importance: "competitive",
		pattern:
			/\bRCQ\b|\bReCQ\b|\bDestination Qualifier\b|\bChallenge\b|\bLCQ\b|\bLast Chance\b/i,
	},
];

/** Infer tournament importance tier from its name using regex patterns. */
export function inferImportance(name: string): TournamentImportance {
	for (const { importance, pattern } of IMPORTANCE_PATTERNS) {
		if (pattern.test(name)) return importance;
	}
	return "other";
}
