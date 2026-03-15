/**
 * Bridge between MetaSettings and URL search params.
 * The URL is the source of truth — every filter change updates the URL,
 * and on page load the URL initializes the settings store.
 */
import { derived } from "svelte/store";
import { importanceRank, type TournamentImportance } from "../types/tournament";
import { type MetaSettings, makeDefaults, settings } from "./settings";
import { type TournamentListEntry, tournamentList } from "./tournaments";

const VALID_TIERS = new Set<TournamentImportance>([
	"other",
	"competitive",
	"premier",
	"professional",
]);

// --- Initial exclude set (populated once from URL, consumed once by FilterPanel) ---

let initialExcludeIds: Set<string> = new Set();

/** Returns (and clears) the exclude IDs parsed from the initial URL. */
export function getInitialExcludeIds(): Set<string> {
	const ids = initialExcludeIds;
	initialExcludeIds = new Set();
	return ids;
}

// --- Serialization: settings → URL search params ---

function eligibleIds(
	tournaments: TournamentListEntry[],
	format: string,
	dateFrom: string,
	dateTo: string,
	minTier: TournamentImportance,
): string[] {
	const minRank = importanceRank(minTier);
	return tournaments
		.filter((t) => {
			if (format && !t.formats.includes(format)) return false;
			if (dateFrom && t.date < dateFrom) return false;
			if (dateTo && t.date > dateTo) return false;
			if (minRank > 0 && importanceRank(t.importance) < minRank) return false;
			return true;
		})
		.map((t) => t.id);
}

export function settingsToSearchParams(
	s: MetaSettings,
	tournaments: TournamentListEntry[],
): URLSearchParams {
	const params = new URLSearchParams();
	const defaults = makeDefaults();

	// Format — omit when matching default
	if (s.format !== defaults.format) {
		if (s.format) {
			params.set("format", s.format);
		} else {
			params.set("format", "");
		}
	}

	// Date range — always include (they're relative to "today" so we must be explicit)
	params.set("from", s.dateFrom);
	params.set("to", s.dateTo);

	// Minimum tier — omit when default
	if (s.minTier !== "other") {
		params.set("tier", s.minTier);
	}

	// Exclude — compute deselected tournaments
	const eligible = eligibleIds(tournaments, s.format, s.dateFrom, s.dateTo, s.minTier);
	const selectedSet = new Set(s.selectedTournamentIds);
	const excluded = eligible.filter((id) => !selectedSet.has(id));
	if (excluded.length > 0) {
		params.set("exclude", excluded.join(","));
	}

	// Display options — only include non-defaults
	if (!s.excludeMirrors) {
		params.set("mirrors", "0");
	}
	if (s.otherMode === "topN") {
		params.set("other", "topN");
		params.set("top", String(s.topN));
	} else if (s.minMetagameShare !== defaults.minMetagameShare) {
		params.set("minShare", String(s.minMetagameShare));
	}

	return params;
}

// --- Deserialization: URL search params → settings ---

export function searchParamsToSettings(params: URLSearchParams): MetaSettings {
	const defaults = makeDefaults();

	const format = params.has("format") ? (params.get("format") ?? "") : defaults.format;
	const dateFrom = params.get("from") ?? defaults.dateFrom;
	const dateTo = params.get("to") ?? defaults.dateTo;
	const tierRaw = params.get("tier") as TournamentImportance | null;
	const minTier: TournamentImportance =
		tierRaw && VALID_TIERS.has(tierRaw) ? tierRaw : "other";

	// Store exclude IDs for FilterPanel to consume on mount
	const excludeRaw = params.get("exclude");
	if (excludeRaw) {
		initialExcludeIds = new Set(excludeRaw.split(",").filter(Boolean));
	} else {
		initialExcludeIds = new Set();
	}

	const excludeMirrors = params.get("mirrors") !== "0";

	let otherMode = defaults.otherMode;
	let topN = defaults.topN;
	let minMetagameShare = defaults.minMetagameShare;

	if (params.get("other") === "topN") {
		otherMode = "topN";
		const topVal = Number.parseInt(params.get("top") ?? "", 10);
		topN = Number.isFinite(topVal) ? topVal : defaults.topN;
	} else {
		const msVal = Number.parseFloat(params.get("minShare") ?? "");
		if (Number.isFinite(msVal)) {
			minMetagameShare = msVal;
		}
	}

	return {
		format,
		dateFrom,
		dateTo,
		minTier,
		selectedTournamentIds: [], // filled by FilterPanel onMount
		excludeMirrors,
		otherMode,
		topN,
		minMetagameShare,
		paperOnly: defaults.paperOnly,
		useStandings: defaults.useStandings,
	};
}

// --- Derived query string store (for internal links) ---

export const settingsQueryString = derived(
	[settings, tournamentList],
	([$settings, $tournaments]): string => {
		// Don't serialize until tournaments are populated
		if ($settings.selectedTournamentIds.length === 0 && $tournaments.length > 0) {
			return "";
		}
		const params = settingsToSearchParams($settings, $tournaments);
		const str = params.toString();
		return str ? `?${str}` : "";
	},
);
