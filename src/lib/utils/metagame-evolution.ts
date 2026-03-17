import type { TournamentData } from "../types/tournament";
import type { MatrixOptions } from "./winrate-calculator";

export type PeriodSize = "1w" | "2w" | "1m";

export interface EvolutionPoint {
	label: string; // X-axis period label
	share: number | null; // 0–1, null when period has no tournaments
}

export interface EvolutionSeries {
	name: string;
	points: EvolutionPoint[]; // ordered oldest-to-newest
}

// --- Internal helpers ---

/** Parse an ISO date string (YYYY-MM-DD) as UTC midnight. */
function parseDate(iso: string): Date {
	return new Date(`${iso}T00:00:00Z`);
}

/** Format a Date as YYYY-MM-DD (UTC). */
function toISODate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

/** Add N days to a Date (returns new Date, UTC). */
function addDays(date: Date, n: number): Date {
	const d = new Date(date);
	d.setUTCDate(d.getUTCDate() + n);
	return d;
}

/**
 * Return the Monday of the ISO 8601 week containing `date` (UTC).
 * ISO weeks start on Monday (day 1). Sunday is day 0 → maps to 6 days back.
 */
export function isoWeekMonday(date: Date): Date {
	const day = date.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
	const daysToMonday = day === 0 ? 6 : day - 1;
	return addDays(date, -daysToMonday);
}

/** Return the Sunday of the ISO 8601 week containing `date` (UTC). */
export function isoWeekSunday(date: Date): Date {
	return addDays(isoWeekMonday(date), 6);
}

/**
 * Format a date range as a human-readable label.
 * Same month:     "Mar 10–16"
 * Cross-month:    "Jan 28–Feb 3"
 * Cross-year:     "Dec 29–Jan 4"
 */
export function formatDateRange(start: Date, end: Date): string {
	const fmt = (d: Date, opts: Intl.DateTimeFormatOptions): string =>
		new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" }).format(d);
	const startMon = fmt(start, { month: "short" });
	const endMon = fmt(end, { month: "short" });
	const startDay = start.getUTCDate();
	const endDay = end.getUTCDate();
	const startYear = start.getUTCFullYear();
	const endYear = end.getUTCFullYear();
	if (startYear !== endYear) return `${startMon} ${startDay}–${endMon} ${endDay}`;
	if (startMon === endMon) return `${startMon} ${startDay}–${endDay}`;
	return `${startMon} ${startDay}–${endMon} ${endDay}`;
}

interface Period {
	label: string;
	startDate: string; // YYYY-MM-DD
	endDate: string; // YYYY-MM-DD
}

/**
 * Generate non-overlapping calendar periods, anchored to `latestDate` and
 * counting backwards until the period containing `earliestDate` is included.
 * Returns periods ordered oldest-to-newest.
 */
export function generatePeriods(
	latestDate: string,
	earliestDate: string,
	periodSize: PeriodSize,
): Period[] {
	const periods: Period[] = [];
	const anchor = parseDate(latestDate);

	if (periodSize === "1w") {
		let end = isoWeekSunday(anchor);
		let start = addDays(end, -6);
		while (toISODate(end) >= earliestDate) {
			periods.push({
				label: formatDateRange(start, end),
				startDate: toISODate(start),
				endDate: toISODate(end),
			});
			end = addDays(start, -1);
			start = addDays(end, -6);
		}
	} else if (periodSize === "2w") {
		// Most recent period: Sunday of anchor's week (end), 13 days before (start)
		let end = isoWeekSunday(anchor);
		let start = addDays(end, -13);
		while (toISODate(end) >= earliestDate) {
			periods.push({
				label: formatDateRange(start, end),
				startDate: toISODate(start),
				endDate: toISODate(end),
			});
			end = addDays(start, -1);
			start = addDays(end, -13);
		}
	} else {
		// "1m": full calendar months
		let year = anchor.getUTCFullYear();
		let month = anchor.getUTCMonth(); // 0-indexed
		while (true) {
			const start = new Date(Date.UTC(year, month, 1));
			const end = new Date(Date.UTC(year, month + 1, 0)); // day 0 of next month = last day of this month
			if (toISODate(end) < earliestDate) break;
			const label = new Intl.DateTimeFormat("en-US", {
				month: "long",
				year: "numeric",
				timeZone: "UTC",
			}).format(start);
			periods.push({ label, startDate: toISODate(start), endDate: toISODate(end) });
			month--;
			if (month < 0) {
				month = 11;
				year--;
			}
		}
	}

	periods.reverse(); // oldest first

	// Clip the first period's start to the actual earliest date
	if (periods.length > 0 && periods[0].startDate < earliestDate) {
		const clippedStart = parseDate(earliestDate);
		const end = parseDate(periods[0].endDate);
		periods[0] = {
			label: formatDateRange(clippedStart, end),
			startDate: earliestDate,
			endDate: periods[0].endDate,
		};
	}

	return periods;
}

/**
 * Compute per-archetype metagame share evolution across calendar periods.
 *
 * - Returns [] if tournaments is empty.
 * - topN > 0 keeps the top-N archetypes by total global player-entry count.
 * - minMetagameShare > 0 keeps archetypes with global share >= threshold.
 * - Caller should zero out whichever collapsing mode is inactive.
 * - "Unknown" is always excluded. "Other" appears only if archetypes are collapsed.
 * - Each EvolutionSeries has one point per period, ordered oldest-to-newest.
 *   Periods with no tournaments produce share: 0 for all series.
 */
export function computeMetagameEvolution(
	tournaments: TournamentData[],
	playerArchetypes: Map<string, string>,
	periodSize: PeriodSize,
	options: Pick<MatrixOptions, "topN" | "minMetagameShare">,
): EvolutionSeries[] {
	if (tournaments.length === 0) return [];
	const { topN = 0, minMetagameShare = 0 } = options;

	// Date range
	const dates = tournaments.map((t) => t.meta.date).sort();
	const earliest = dates[0];
	const latest = dates[dates.length - 1];

	// Global archetype counts across ALL tournaments
	const globalCounts = new Map<string, number>();
	let globalTotal = 0;
	for (const t of tournaments) {
		for (const playerId of Object.keys(t.players)) {
			const arch = playerArchetypes.get(playerId);
			if (!arch || arch === "Unknown") continue;
			globalCounts.set(arch, (globalCounts.get(arch) ?? 0) + 1);
			globalTotal++;
		}
	}

	// Determine qualifying archetype set
	const sortedByCount = [...globalCounts.entries()].sort((a, b) => b[1] - a[1]);
	const otherSet = new Set<string>();
	let qualifyingNames: string[];

	if (topN > 0 && sortedByCount.length > topN) {
		qualifyingNames = sortedByCount.slice(0, topN).map(([name]) => name);
		for (const [name] of sortedByCount.slice(topN)) otherSet.add(name);
	} else if (minMetagameShare > 0 && globalTotal > 0) {
		qualifyingNames = sortedByCount
			.filter(([name, count]) => {
				const share = count / globalTotal;
				if (share < minMetagameShare) {
					otherSet.add(name);
					return false;
				}
				return true;
			})
			.map(([name]) => name);
	} else {
		qualifyingNames = sortedByCount.map(([name]) => name);
	}

	const hasOther = otherSet.size > 0;
	const seriesNames = [...qualifyingNames, ...(hasOther ? ["Other"] : [])];

	// Generate calendar periods
	const periods = generatePeriods(latest, earliest, periodSize);

	// Per-period share maps
	const periodShares: Map<string, number>[] = periods.map((period) => {
		const counts = new Map<string, number>();
		let total = 0;
		const periodTournaments = tournaments.filter(
			(t) => t.meta.date >= period.startDate && t.meta.date <= period.endDate,
		);
		for (const t of periodTournaments) {
			for (const playerId of Object.keys(t.players)) {
				const rawArch = playerArchetypes.get(playerId);
				if (!rawArch || rawArch === "Unknown") continue;
				const displayArch = otherSet.has(rawArch) ? "Other" : rawArch;
				counts.set(displayArch, (counts.get(displayArch) ?? 0) + 1);
				total++;
			}
		}
		if (total === 0) return new Map<string, number>();
		const shares = new Map<string, number>();
		for (const [name, count] of counts) shares.set(name, count / total);
		return shares;
	});

	// Track which periods have no tournaments at all
	const emptyPeriods = new Set(
		periods.map((_, i) => i).filter((i) => periodShares[i].size === 0),
	);

	return seriesNames.map((name) => ({
		name,
		points: periods.map((period, i) => ({
			label: period.label,
			share: emptyPeriods.has(i) ? null : (periodShares[i].get(name) ?? 0),
		})),
	}));
}
