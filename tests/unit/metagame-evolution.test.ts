import { describe, expect, it } from "vitest";
import type { TournamentData } from "../../src/lib/types/tournament";
import {
	computeMetagameEvolution,
	formatDateRange,
	generatePeriods,
	isoWeekMonday,
} from "../../src/lib/utils/metagame-evolution";

// --- Helpers ---

function makeT(
	date: string,
	players: Record<string, string>,
	opts?: { playerCount?: number; ranks?: Record<string, number> },
): TournamentData {
	const ids = Object.keys(players);
	return {
		meta: {
			id: `t-${date}`,
			name: date,
			date,
			formats: ["Standard"],
			url: "",
			fetchedAt: "",
			playerCount: opts?.playerCount ?? ids.length,
			roundCount: 1,
			source: "melee",
			tabletop: true,
		},
		players: Object.fromEntries(
			ids.map((id, i) => [
				id,
				{
					name: id,
					username: id,
					rank: opts?.ranks?.[id] ?? i + 1,
					points: 0,
					matchRecord: "0-0-0",
					decklistIds: [],
					reportedArchetypes: [],
				},
			]),
		),
		decklists: {},
		rounds: {},
	};
}

function makeMap(players: Record<string, string>): Map<string, string> {
	return new Map(Object.entries(players));
}

// --- Tests ---

describe("isoWeekMonday", () => {
	it("returns Monday for a Wednesday input", () => {
		// 2026-03-11 is a Wednesday; ISO week Monday should be 2026-03-09
		const d = new Date("2026-03-11T00:00:00Z");
		const mon = isoWeekMonday(d);
		expect(mon.toISOString().slice(0, 10)).toBe("2026-03-09");
	});

	it("returns the same date for a Monday input", () => {
		const d = new Date("2026-03-09T00:00:00Z");
		expect(isoWeekMonday(d).toISOString().slice(0, 10)).toBe("2026-03-09");
	});

	it("handles Sunday (maps to previous Monday)", () => {
		// 2026-03-15 is a Sunday → Monday should be 2026-03-09
		const d = new Date("2026-03-15T00:00:00Z");
		expect(isoWeekMonday(d).toISOString().slice(0, 10)).toBe("2026-03-09");
	});
});

describe("formatDateRange", () => {
	it("formats same-month range", () => {
		const start = new Date("2026-03-09T00:00:00Z");
		const end = new Date("2026-03-15T00:00:00Z");
		expect(formatDateRange(start, end)).toBe("Mar 9–15");
	});

	it("formats cross-month range", () => {
		const start = new Date("2026-01-26T00:00:00Z");
		const end = new Date("2026-02-01T00:00:00Z");
		expect(formatDateRange(start, end)).toBe("Jan 26–Feb 1");
	});

	it("formats cross-year range", () => {
		const start = new Date("2025-12-29T00:00:00Z");
		const end = new Date("2026-01-04T00:00:00Z");
		expect(formatDateRange(start, end)).toBe("Dec 29–Jan 4");
	});
});

describe("generatePeriods — 1w", () => {
	it("generates one week period for single-date range, clipped to earliest", () => {
		// 2026-03-11 (Wed) → ISO week Mon 2026-03-09 to Sun 2026-03-15, clipped start to Mar 11
		const periods = generatePeriods("2026-03-11", "2026-03-11", "1w");
		expect(periods).toHaveLength(1);
		expect(periods[0].startDate).toBe("2026-03-11");
		expect(periods[0].endDate).toBe("2026-03-15");
	});

	it("generates multiple weeks ordered oldest-to-newest", () => {
		// latest = 2026-03-11 (wk11 Mon 9–Sun 15), earliest = 2026-02-25 (wk9 Mon 23–Sun 1 Mar)
		const periods = generatePeriods("2026-03-11", "2026-02-25", "1w");
		// Should cover weeks: Feb 23–Mar 1, Mar 2–8, Mar 9–15
		expect(periods.length).toBeGreaterThanOrEqual(3);
		// First period should start before last
		expect(periods[0].startDate < periods[periods.length - 1].startDate).toBe(true);
		// Last period should contain the anchor date
		expect(periods[periods.length - 1].startDate <= "2026-03-11").toBe(true);
		expect(periods[periods.length - 1].endDate >= "2026-03-11").toBe(true);
	});

	it("does not generate periods before the earliest date", () => {
		const periods = generatePeriods("2026-03-11", "2026-03-10", "1w");
		// Both dates are in the same week → only 1 period
		expect(periods).toHaveLength(1);
	});
});

describe("generatePeriods — 2w", () => {
	it("anchor Wednesday in week 12: most recent = Mon wk11 – Sun wk12, clipped to earliest", () => {
		// 2026-03-18 is a Wednesday in ISO week 12 of 2026
		// isoWeekSunday(Mar 18) = Mar 22 (Sunday of wk12)
		// 14 days back → start = Mar 9, clipped to Mar 18 (earliestDate)
		const periods = generatePeriods("2026-03-18", "2026-03-18", "2w");
		expect(periods).toHaveLength(1);
		expect(periods[0].startDate).toBe("2026-03-18");
		expect(periods[0].endDate).toBe("2026-03-22");
	});

	it("generates consecutive 14-day chunks stepping backwards", () => {
		const periods = generatePeriods("2026-03-18", "2026-02-10", "2w");
		expect(periods.length).toBeGreaterThanOrEqual(3);
		// All periods except the first should be exactly 14 days (first may be clipped)
		for (const p of periods.slice(1)) {
			const start = new Date(`${p.startDate}T00:00:00Z`);
			const end = new Date(`${p.endDate}T00:00:00Z`);
			const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
			expect(diffDays).toBe(13); // inclusive: Sun - Mon = 13 days difference
		}
		// First period is clipped to earliestDate
		expect(periods[0].startDate).toBe("2026-02-10");
	});

	it("handles year boundary: anchor in first ISO week, clipped to earliest", () => {
		// 2026-01-05 is a Monday in ISO week 2 of 2026
		// isoWeekSunday = 2026-01-11; start = 2025-12-29, clipped to 2026-01-05
		const periods = generatePeriods("2026-01-05", "2026-01-05", "2w");
		expect(periods).toHaveLength(1);
		expect(periods[0].startDate).toBe("2026-01-05");
		expect(periods[0].endDate).toBe("2026-01-11");
	});
});

describe("generatePeriods — 1m", () => {
	it("anchor in March: most recent = full March, prior = February clipped to earliest", () => {
		const periods = generatePeriods("2026-03-15", "2026-02-10", "1m");
		expect(periods).toHaveLength(2);
		expect(periods[0].startDate).toBe("2026-02-10"); // clipped from Feb 1
		expect(periods[0].endDate).toBe("2026-02-28");
		expect(periods[1].startDate).toBe("2026-03-01");
		expect(periods[1].endDate).toBe("2026-03-31");
	});

	it("uses full calendar month, not anchor date, as end", () => {
		const periods = generatePeriods("2026-03-05", "2026-03-05", "1m");
		expect(periods).toHaveLength(1);
		expect(periods[0].endDate).toBe("2026-03-31"); // full month, not Mar 5
	});

	it("label uses month name when period is unclipped, date range when clipped", () => {
		// Unclipped: earliest is first of month
		const full = generatePeriods("2026-03-15", "2026-03-01", "1m");
		expect(full[0].label).toBe("March 2026");
		// Clipped: earliest mid-month → date range label
		const clipped = generatePeriods("2026-03-15", "2026-03-15", "1m");
		expect(clipped[0].label).toBe("Mar 15–31");
	});
});

describe("computeMetagameEvolution", () => {
	it("returns [] for empty tournaments", () => {
		const { series } = computeMetagameEvolution([], new Map(), "1w", {});
		expect(series).toEqual([]);
	});

	it("basic share computation: single period, two archetypes", () => {
		const t = makeT("2026-03-11", { p1: "A", p2: "A", p3: "B" });
		const archetypes = makeMap({ p1: "A", p2: "A", p3: "B" });
		const { series } = computeMetagameEvolution([t], archetypes, "1w", {});
		const a = series.find((s) => s.name === "A")!;
		const b = series.find((s) => s.name === "B")!;
		expect(a).toBeDefined();
		expect(b).toBeDefined();
		// A: 2/3, B: 1/3
		expect(a.points[a.points.length - 1].share).toBeCloseTo(2 / 3);
		expect(b.points[b.points.length - 1].share).toBeCloseTo(1 / 3);
	});

	it("empty period → share null for all series", () => {
		// Two tournaments a month apart; 1w periods will have many empty periods in between
		const t1 = makeT("2026-01-05", { p1: "A" });
		const t2 = makeT("2026-03-11", { p2: "A" });
		const archetypes = makeMap({ p1: "A", p2: "A" });
		const { series } = computeMetagameEvolution([t1, t2], archetypes, "1w", {});
		// Periods with no tournaments should have null share (skipped in charts)
		const emptyPeriods = series[0].points.filter((p) => p.share === null);
		expect(emptyPeriods.length).toBeGreaterThan(0);
	});

	it("output ordered oldest-to-newest", () => {
		const t1 = makeT("2026-01-05", { p1: "A" });
		const t2 = makeT("2026-02-11", { p2: "B" });
		const archetypes = makeMap({ p1: "A", p2: "B" });
		const { series } = computeMetagameEvolution([t1, t2], archetypes, "1m", {});
		// First period clipped to Jan 5 (earliest tournament), last is full February
		expect(series[0].points[0].label).toBe("Jan 5–31");
		expect(series[0].points[series[0].points.length - 1].label).toBe("February 2026");
	});

	it("topN collapsing: top 1 of 2 archetypes → Other appears", () => {
		const t = makeT("2026-03-11", { p1: "A", p2: "A", p3: "B" });
		const archetypes = makeMap({ p1: "A", p2: "A", p3: "B" });
		const { series } = computeMetagameEvolution([t], archetypes, "1w", { topN: 1 });
		const names = series.map((s) => s.name);
		expect(names).toContain("A");
		expect(names).toContain("Other");
		expect(names).not.toContain("B");
	});

	it("minMetagameShare collapsing: archetype below threshold → Other", () => {
		// A: 9/10, B: 1/10 = 0.1. threshold 0.15 → B collapses
		const players: Record<string, string> = {};
		for (let i = 0; i < 9; i++) players[`a${i}`] = "A";
		players.b0 = "B";
		const t = makeT("2026-03-11", players);
		const archetypes = makeMap(players);
		const { series } = computeMetagameEvolution([t], archetypes, "1w", {
			minMetagameShare: 0.15,
		});
		const names = series.map((s) => s.name);
		expect(names).toContain("A");
		expect(names).toContain("Other");
		expect(names).not.toContain("B");
	});

	it("global archetype set: archetype in one period appears in all periods with 0% elsewhere", () => {
		const t1 = makeT("2026-01-05", { p1: "A" });
		const t2 = makeT("2026-02-05", { p2: "B" });
		const archetypes = makeMap({ p1: "A", p2: "B" });
		const { series } = computeMetagameEvolution([t1, t2], archetypes, "1m", {});
		const aSeries = series.find((s) => s.name === "A")!;
		const bSeries = series.find((s) => s.name === "B")!;
		expect(aSeries).toBeDefined();
		expect(bSeries).toBeDefined();
		// A is 0 in the February period; B is 0 in the January period
		expect(aSeries.points.length).toBe(bSeries.points.length);
		// First period clipped to Jan 5 (earliest), February is full month
		const janA = aSeries.points.find((p) => p.label === "Jan 5–31")!;
		const febA = aSeries.points.find((p) => p.label === "February 2026")!;
		expect(janA.share).toBeCloseTo(1);
		expect(febA.share).toBe(0);
	});

	it("excludes Unknown players from share computation", () => {
		const t = makeT("2026-03-11", { p1: "A", p2: "U" });
		// p2 maps to Unknown in the archetype map
		const archetypes = new Map([
			["p1", "A"],
			["p2", "Unknown"],
		]);
		const { series } = computeMetagameEvolution([t], archetypes, "1w", {});
		const a = series.find((s) => s.name === "A")!;
		expect(a.points[0].share).toBeCloseTo(1); // only A counts
		expect(series.find((s) => s.name === "Unknown")).toBeUndefined();
	});

	it("date range bounds: no periods outside earliest–latest", () => {
		const t1 = makeT("2026-03-09", { p1: "A" }); // Monday of some week
		const t2 = makeT("2026-03-15", { p2: "B" }); // Sunday of same week
		const archetypes = makeMap({ p1: "A", p2: "B" });
		const { series } = computeMetagameEvolution([t1, t2], archetypes, "1w", {});
		// Both dates are in same ISO week → should be exactly 1 period
		expect(series[0].points).toHaveLength(1);
	});
});
