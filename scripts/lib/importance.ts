import type { TournamentImportance } from "../../src/lib/types/tournament";

/** Extract primary constructed format (skip Draft/Sealed/Limited). */
export function getPrimaryFormat(formats: string[]): string {
	const constructed = formats.filter((f) => !/\b(draft|sealed|limited)\b/i.test(f));
	return constructed[0] ?? formats[0] ?? "unknown";
}

/** Convert a format name to a URL/directory slug. */
export function toFormatSlug(format: string): string {
	return format.toLowerCase().replace(/\s+/g, "-");
}

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

// Format names to strip from tournament names (case-insensitive)
const FORMAT_NAMES =
	/\b(?:Standard|Modern|Pioneer|Legacy|Vintage|Pauper|Limited|Draft|Sealed|Historic|Alchemy|Timeless|Explorer|Commander|EDH|Brawl|Oathbreaker|Centurion|Duel\s*Commander|Canadian\s*Highlander|Old\s*School|Premodern|Penny\s*Dreadful)\b/gi;

/**
 * Generate a clean display name from a raw tournament name by stripping:
 * - Bracketed time/day prefixes like `[Lyon Sun 09:30]` (keeps location)
 * - Format names (Modern, Standard, etc.)
 * - Day-of-week segments (Monday, Tuesday, etc.)
 * - Time segments (9:00 am, 12:00 pm, etc.)
 * - Dangling separators and whitespace
 */
export function cleanTournamentName(name: string): string {
	let result = name;

	// Extract location from bracketed prefixes: [Lyon Sun 09:30] → Lyon
	result = result.replace(/\[([^\]]*)\]/g, (_, content: string) => {
		// Strip day names and times from bracket content
		const cleaned = content
			.replace(/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/gi, "")
			.replace(/\d{1,2}:\d{2}/g, "")
			.trim();
		return cleaned || "";
	});

	// Strip format names
	result = result.replace(FORMAT_NAMES, "");

	// Strip day-of-week words
	result = result.replace(
		/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi,
		"",
	);

	// Strip time patterns (e.g. "9:00 am", "12:00 pm", "10:00 AM")
	result = result.replace(/\d{1,2}:\d{2}\s*(?:am|pm)/gi, "");

	// Strip Season/Round qualifiers like "Season 4 - Round 2"
	result = result.replace(/\bSeason\s+\d+\s*-\s*Round\s+\d+\b/gi, "");

	// Clean up separators: collapse " - - " or " -  - " into " - ", remove leading/trailing separators
	result = result.replace(/(?:\s*-\s*){2,}/g, " - ");
	result = result.replace(/(?:\s*:\s*)+$/g, "");
	result = result.replace(/^\s*-\s*/, "");
	result = result.replace(/\s*-\s*$/, "");

	// Collapse whitespace
	result = result.replace(/\s+/g, " ").trim();

	return result;
}
