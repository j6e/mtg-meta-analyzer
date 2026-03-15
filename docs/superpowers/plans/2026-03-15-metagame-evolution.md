# Metagame Share Evolution Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Metagame Share Evolution" line chart to the bottom of the Metagame page, showing each archetype's metagame share across non-overlapping 1-week, 2-week, or 1-month calendar periods.

**Architecture:** A pure utility function `computeMetagameEvolution` buckets the filtered tournaments into calendar periods and computes per-archetype share for each period. A new Svelte component `MetagameEvolution` renders a Chart.js line chart with card-art dots and a period toggle. The metagame page wires it up using existing stores.

**Tech Stack:** SvelteKit 5 (Svelte 5 runes), Chart.js 4, Vitest 4 (run with `bun run test`), Bun

---

## Chunk 1: Utility function and tests

### Task 1: Create the utility file with types and helpers

**Files:**
- Create: `src/lib/utils/metagame-evolution.ts`

- [ ] **Step 1.1: Create the file with types, helpers, and a stub for the main export**

  Create `src/lib/utils/metagame-evolution.ts`:

  ```ts
  import type { MatrixOptions } from "./winrate-calculator";
  import type { TournamentData } from "../types/tournament";

  export type PeriodSize = "1w" | "2w" | "1m";

  export interface EvolutionPoint {
  	label: string; // X-axis period label
  	share: number; // 0–1
  }

  export interface EvolutionSeries {
  	name: string;
  	points: EvolutionPoint[]; // ordered oldest-to-newest
  }

  // --- Internal helpers ---

  /** Parse an ISO date string (YYYY-MM-DD) as UTC midnight. */
  function parseDate(iso: string): Date {
  	return new Date(iso + "T00:00:00Z");
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
  			periods.push({ label: formatDateRange(start, end), startDate: toISODate(start), endDate: toISODate(end) });
  			end = addDays(start, -1);
  			start = addDays(end, -6);
  		}
  	} else if (periodSize === "2w") {
  		// Most recent period: Sunday of anchor's week (end), 13 days before (start)
  		let end = isoWeekSunday(anchor);
  		let start = addDays(end, -13);
  		while (toISODate(end) >= earliestDate) {
  			periods.push({ label: formatDateRange(start, end), startDate: toISODate(start), endDate: toISODate(end) });
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
  			const label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(start);
  			periods.push({ label, startDate: toISODate(start), endDate: toISODate(end) });
  			month--;
  			if (month < 0) { month = 11; year--; }
  		}
  	}

  	periods.reverse(); // oldest first
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
  		qualifyingNames = sortedByCount.filter(([name, count]) => {
  			const share = count / globalTotal;
  			if (share < minMetagameShare) { otherSet.add(name); return false; }
  			return true;
  		}).map(([name]) => name);
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

  	return seriesNames.map((name) => ({
  		name,
  		points: periods.map((period, i) => ({
  			label: period.label,
  			share: periodShares[i].get(name) ?? 0,
  		})),
  	}));
  }
  ```

- [ ] **Step 1.2: Verify it type-checks**

  ```bash
  bun run check
  ```
  Expected: no type errors in `metagame-evolution.ts`

---

### Task 2: Write and run tests

**Files:**
- Create: `src/lib/utils/metagame-evolution.test.ts`

- [ ] **Step 2.1: Create the test file**

  Create `src/lib/utils/metagame-evolution.test.ts`:

  ```ts
  import { describe, expect, it } from "vitest";
  import {
  	computeMetagameEvolution,
  	formatDateRange,
  	generatePeriods,
  	isoWeekMonday,
  	isoWeekSunday,
  } from "./metagame-evolution";
  import type { TournamentData } from "../types/tournament";

  // --- Helpers ---

  function makeT(date: string, players: Record<string, string>): TournamentData {
  	return {
  		meta: {
  			id: `t-${date}`, name: date, date,
  			formats: ["Standard"], url: "", fetchedAt: "",
  			playerCount: Object.keys(players).length,
  			roundCount: 1, source: "melee", tabletop: true,
  		},
  		players: Object.fromEntries(
  			Object.keys(players).map((id) => [
  				id,
  				{ name: id, username: id, rank: 1, points: 0, matchRecord: "0-0-0", decklistIds: [], reportedArchetypes: [] },
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
  	it("generates one week period for single-date range", () => {
  		// 2026-03-11 (Wed) → ISO week Mon 2026-03-09 to Sun 2026-03-15
  		const periods = generatePeriods("2026-03-11", "2026-03-11", "1w");
  		expect(periods).toHaveLength(1);
  		expect(periods[0].startDate).toBe("2026-03-09");
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
  	it("anchor Wednesday in week 12: most recent = Mon wk11 – Sun wk12", () => {
  		// 2026-03-18 is a Wednesday in ISO week 12 of 2026
  		// isoWeekSunday(Mar 18) = Mar 22 (Sunday of wk12)
  		// 14 days back → start = Mar 9 (Mon of wk11)
  		const periods = generatePeriods("2026-03-18", "2026-03-18", "2w");
  		expect(periods).toHaveLength(1);
  		expect(periods[0].startDate).toBe("2026-03-09");
  		expect(periods[0].endDate).toBe("2026-03-22");
  	});

  	it("generates consecutive 14-day chunks stepping backwards", () => {
  		const periods = generatePeriods("2026-03-18", "2026-02-10", "2w");
  		expect(periods.length).toBeGreaterThanOrEqual(3);
  		// Each period should be exactly 14 days
  		for (const p of periods) {
  			const start = new Date(p.startDate + "T00:00:00Z");
  			const end = new Date(p.endDate + "T00:00:00Z");
  			const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  			expect(diffDays).toBe(13); // inclusive: Sun - Mon = 13 days difference
  		}
  	});

  	it("handles year boundary: anchor in first ISO week", () => {
  		// 2026-01-05 is a Monday in ISO week 2 of 2026
  		// isoWeekSunday = 2026-01-11; start = 2025-12-29
  		const periods = generatePeriods("2026-01-05", "2026-01-05", "2w");
  		expect(periods).toHaveLength(1);
  		expect(periods[0].startDate).toBe("2025-12-29");
  		expect(periods[0].endDate).toBe("2026-01-11");
  	});
  });

  describe("generatePeriods — 1m", () => {
  	it("anchor in March: most recent = full March, prior = full February", () => {
  		const periods = generatePeriods("2026-03-15", "2026-02-10", "1m");
  		expect(periods).toHaveLength(2);
  		expect(periods[0].startDate).toBe("2026-02-01");
  		expect(periods[0].endDate).toBe("2026-02-28");
  		expect(periods[1].startDate).toBe("2026-03-01");
  		expect(periods[1].endDate).toBe("2026-03-31");
  	});

  	it("uses full calendar month, not anchor date, as end", () => {
  		const periods = generatePeriods("2026-03-05", "2026-03-05", "1m");
  		expect(periods).toHaveLength(1);
  		expect(periods[0].endDate).toBe("2026-03-31"); // full month, not Mar 5
  	});

  	it("label is 'March 2026'", () => {
  		const periods = generatePeriods("2026-03-15", "2026-03-15", "1m");
  		expect(periods[0].label).toBe("March 2026");
  	});
  });

  describe("computeMetagameEvolution", () => {
  	it("returns [] for empty tournaments", () => {
  		expect(computeMetagameEvolution([], new Map(), "1w", {})).toEqual([]);
  	});

  	it("basic share computation: single period, two archetypes", () => {
  		const t = makeT("2026-03-11", { p1: "A", p2: "A", p3: "B" });
  		const archetypes = makeMap({ p1: "A", p2: "A", p3: "B" });
  		const result = computeMetagameEvolution([t], archetypes, "1w", {});
  		const a = result.find((s) => s.name === "A")!;
  		const b = result.find((s) => s.name === "B")!;
  		expect(a).toBeDefined();
  		expect(b).toBeDefined();
  		// A: 2/3, B: 1/3
  		expect(a.points[a.points.length - 1].share).toBeCloseTo(2 / 3);
  		expect(b.points[b.points.length - 1].share).toBeCloseTo(1 / 3);
  	});

  	it("empty period → share 0 for all series", () => {
  		// Two tournaments a month apart; 1w periods will have many empty periods in between
  		const t1 = makeT("2026-01-05", { p1: "A" });
  		const t2 = makeT("2026-03-11", { p2: "A" });
  		const archetypes = makeMap({ p1: "A", p2: "A" });
  		const result = computeMetagameEvolution([t1, t2], archetypes, "1w", {});
  		// There should be at least one period with no tournaments
  		const emptyPeriods = result[0].points.filter((p) => p.share === 0);
  		expect(emptyPeriods.length).toBeGreaterThan(0);
  	});

  	it("output ordered oldest-to-newest", () => {
  		const t1 = makeT("2026-01-05", { p1: "A" });
  		const t2 = makeT("2026-02-11", { p2: "B" });
  		const archetypes = makeMap({ p1: "A", p2: "B" });
  		const result = computeMetagameEvolution([t1, t2], archetypes, "1m", {});
  		expect(result[0].points[0].label).toBe("January 2026");
  		expect(result[0].points[result[0].points.length - 1].label).toBe("February 2026");
  	});

  	it("topN collapsing: top 1 of 2 archetypes → Other appears", () => {
  		const t = makeT("2026-03-11", { p1: "A", p2: "A", p3: "B" });
  		const archetypes = makeMap({ p1: "A", p2: "A", p3: "B" });
  		const result = computeMetagameEvolution([t], archetypes, "1w", { topN: 1 });
  		const names = result.map((s) => s.name);
  		expect(names).toContain("A");
  		expect(names).toContain("Other");
  		expect(names).not.toContain("B");
  	});

  	it("minMetagameShare collapsing: archetype below threshold → Other", () => {
  		// A: 9/10, B: 1/10 = 0.1. threshold 0.15 → B collapses
  		const players: Record<string, string> = {};
  		for (let i = 0; i < 9; i++) players[`a${i}`] = "A";
  		players["b0"] = "B";
  		const t = makeT("2026-03-11", players);
  		const archetypes = makeMap(players);
  		const result = computeMetagameEvolution([t], archetypes, "1w", { minMetagameShare: 0.15 });
  		const names = result.map((s) => s.name);
  		expect(names).toContain("A");
  		expect(names).toContain("Other");
  		expect(names).not.toContain("B");
  	});

  	it("global archetype set: archetype in one period appears in all periods with 0% elsewhere", () => {
  		const t1 = makeT("2026-01-05", { p1: "A" });
  		const t2 = makeT("2026-02-05", { p2: "B" });
  		const archetypes = makeMap({ p1: "A", p2: "B" });
  		const result = computeMetagameEvolution([t1, t2], archetypes, "1m", {});
  		const aSeries = result.find((s) => s.name === "A")!;
  		const bSeries = result.find((s) => s.name === "B")!;
  		expect(aSeries).toBeDefined();
  		expect(bSeries).toBeDefined();
  		// A is 0 in the February period; B is 0 in the January period
  		expect(aSeries.points.length).toBe(bSeries.points.length);
  		const janA = aSeries.points.find((p) => p.label === "January 2026")!;
  		const febA = aSeries.points.find((p) => p.label === "February 2026")!;
  		expect(janA.share).toBeCloseTo(1);
  		expect(febA.share).toBe(0);
  	});

  	it("excludes Unknown players from share computation", () => {
  		const t = makeT("2026-03-11", { p1: "A", p2: "U" });
  		// p2 maps to Unknown in the archetype map
  		const archetypes = new Map([["p1", "A"], ["p2", "Unknown"]]);
  		const result = computeMetagameEvolution([t], archetypes, "1w", {});
  		const a = result.find((s) => s.name === "A")!;
  		expect(a.points[0].share).toBeCloseTo(1); // only A counts
  		expect(result.find((s) => s.name === "Unknown")).toBeUndefined();
  	});

  	it("date range bounds: no periods outside earliest–latest", () => {
  		const t1 = makeT("2026-03-09", { p1: "A" }); // Monday of some week
  		const t2 = makeT("2026-03-15", { p2: "B" }); // Sunday of same week
  		const archetypes = makeMap({ p1: "A", p2: "B" });
  		const result = computeMetagameEvolution([t1, t2], archetypes, "1w", {});
  		// Both dates are in same ISO week → should be exactly 1 period
  		expect(result[0].points).toHaveLength(1);
  	});
  });
  ```

- [ ] **Step 2.2: Run tests**

  ```bash
  bun run test src/lib/utils/metagame-evolution.test.ts
  ```
  Expected: all tests pass. If any fail, debug the logic in `metagame-evolution.ts` before continuing.

- [ ] **Step 2.3: Fix any issues until tests pass**

  ```bash
  bun run test src/lib/utils/metagame-evolution.test.ts
  ```
  Expected: all tests pass (green)

- [ ] **Step 2.4: Commit**

  ```bash
  git add src/lib/utils/metagame-evolution.ts src/lib/utils/metagame-evolution.test.ts
  git commit -m "feat: add metagame evolution utility with period bucketing and share computation"
  ```

---

## Chunk 2: Svelte component and page integration

### Task 3: Create the MetagameEvolution component

**Files:**
- Create: `src/lib/components/MetagameEvolution.svelte`

The component mirrors `MetagameScatter.svelte` in structure — a `<canvas>` for Chart.js with a custom card-art plugin. Study `src/lib/components/MetagameScatter.svelte` before implementing.

- [ ] **Step 3.1: Create the component**

  Create `src/lib/components/MetagameEvolution.svelte`:

  ```svelte
  <script lang="ts">
  	import { onDestroy, onMount } from 'svelte';
  	import {
  		Chart,
  		CategoryScale,
  		Legend,
  		LineController,
  		LineElement,
  		LinearScale,
  		PointElement,
  		Tooltip,
  	} from 'chart.js';
  	import type { MatrixOptions } from '../utils/winrate-calculator';
  	import type { TournamentData } from '../types/tournament';
  	import {
  		computeMetagameEvolution,
  		type EvolutionSeries,
  		type PeriodSize,
  	} from '../utils/metagame-evolution';
  	import { getScryfallImageUrl } from '../utils/card-normalizer';

  	Chart.register(CategoryScale, Legend, LineController, LineElement, LinearScale, PointElement, Tooltip);

  	let {
  		tournaments,
  		playerArchetypes,
  		matrixOptions,
  		archetypeCardMap,
  	}: {
  		tournaments: TournamentData[];
  		playerArchetypes: Map<string, string>;
  		matrixOptions: MatrixOptions;
  		archetypeCardMap: Map<string, string>;
  	} = $props();

  	let periodSize = $state<PeriodSize>('2w');

  	const series = $derived(
  		computeMetagameEvolution(tournaments, playerArchetypes, periodSize, {
  			topN: matrixOptions.topN,
  			minMetagameShare: matrixOptions.minMetagameShare,
  		}),
  	);

  	let canvas: HTMLCanvasElement;
  	let chart: Chart | null = null;

  	/** Loaded card art images keyed by archetype name. */
  	const loadedImages = new Map<string, HTMLImageElement>();
  	/** Dominant color extracted from each archetype's card art. */
  	const dominantColors = new Map<string, string>();

  	const COLORS = [
  		'#2563eb', '#e11d48', '#16a34a', '#ea580c', '#7c3aed',
  		'#0891b2', '#ca8a04', '#be185d', '#059669', '#d97706',
  		'#6366f1', '#dc2626', '#65a30d', '#0d9488', '#a855f7',
  	];
  	const OTHER_COLOR = '#555555';

  	/** Extract dominant color from image center (reused from MetagameScatter). */
  	function extractDominantColor(img: HTMLImageElement): string {
  		const size = 32;
  		const offscreen = document.createElement('canvas');
  		offscreen.width = size;
  		offscreen.height = size;
  		const ctx = offscreen.getContext('2d');
  		if (!ctx) return '#888888';
  		const imgW = img.naturalWidth;
  		const imgH = img.naturalHeight;
  		const cropSize = Math.min(imgW, imgH);
  		const sx = (imgW - cropSize) / 2;
  		const sy = (imgH - cropSize) / 2;
  		ctx.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, size, size);
  		const data = ctx.getImageData(0, 0, size, size).data;
  		let rSum = 0, gSum = 0, bSum = 0, count = 0;
  		for (let i = 0; i < data.length; i += 4) { rSum += data[i]; gSum += data[i + 1]; bSum += data[i + 2]; count++; }
  		return `rgb(${Math.round(rSum / count)}, ${Math.round(gSum / count)}, ${Math.round(bSum / count)})`;
  	}

  	function loadArchetypeImages(names: string[]) {
  		for (const name of names) {
  			if (loadedImages.has(name)) continue;
  			const cardName = archetypeCardMap.get(name);
  			if (!cardName) continue;
  			const url = getScryfallImageUrl(cardName, 'art_crop');
  			const img = new Image();
  			img.crossOrigin = 'anonymous';
  			img.onload = () => {
  				loadedImages.set(name, img);
  				dominantColors.set(name, extractDominantColor(img));
  				if (chart) chart.update('none');
  			};
  			img.onerror = () => {
  				const fallback = new Image();
  				fallback.onload = () => { loadedImages.set(name, fallback); if (chart) chart.update('none'); };
  				fallback.src = url;
  			};
  			img.src = url;
  		}
  	}

  	/** Card-art plugin: draws circular card art over points where share > 0. */
  	const cardArtPlugin = {
  		id: 'evolutionCardArt',
  		afterDatasetsDraw(chartInstance: Chart) {
  			const ctx = chartInstance.ctx;
  			for (let dsIndex = 0; dsIndex < chartInstance.data.datasets.length; dsIndex++) {
  				const ds = chartInstance.data.datasets[dsIndex] as any;
  				const archName = ds.archetypeName as string;
  				const img = loadedImages.get(archName);
  				if (!img) continue;
  				const meta = chartInstance.getDatasetMeta(dsIndex);
  				for (let ptIndex = 0; ptIndex < meta.data.length; ptIndex++) {
  					const element = meta.data[ptIndex] as any;
  					const r = element.options?.pointRadius ?? element.options?.radius ?? 0;
  					if (r === 0) continue; // skip 0% points
  					const { x, y } = element;
  					ctx.save();
  					ctx.beginPath();
  					ctx.arc(x, y, r, 0, Math.PI * 2);
  					ctx.closePath();
  					ctx.clip();
  					const imgW = img.naturalWidth;
  					const imgH = img.naturalHeight;
  					const cropSize = Math.min(imgW, imgH);
  					ctx.drawImage(img, (imgW - cropSize) / 2, (imgH - cropSize) / 2, cropSize, cropSize, x - r, y - r, r * 2, r * 2);
  					ctx.restore();
  					ctx.save();
  					ctx.beginPath();
  					ctx.arc(x, y, r, 0, Math.PI * 2);
  					ctx.strokeStyle = dominantColors.get(archName) ?? 'rgba(255,255,255,0.6)';
  					ctx.lineWidth = 2;
  					ctx.stroke();
  					ctx.restore();
  				}
  			}
  		},
  	};

  	function buildChart(currentSeries: EvolutionSeries[]) {
  		if (chart) { chart.destroy(); chart = null; }
  		if (currentSeries.length === 0 || currentSeries[0].points.length === 0) return;

  		loadArchetypeImages(currentSeries.map((s) => s.name));

  		const labels = currentSeries[0].points.map((p) => p.label);

  		chart = new Chart(canvas, {
  			type: 'line',
  			data: {
  				labels,
  				datasets: currentSeries.map((s, i) => {
  					const isOther = s.name === 'Other';
  					const color = isOther ? OTHER_COLOR : COLORS[i % COLORS.length];
  					return {
  						label: s.name,
  						archetypeName: s.name,
  						data: s.points.map((p) => p.share * 100),
  						pointRadius: s.points.map((p) => (p.share > 0 ? 10 : 0)),
  						pointHoverRadius: s.points.map((p) => (p.share > 0 ? 12 : 0)),
  						pointBackgroundColor: color + 'bb',
  						pointBorderColor: color,
  						pointBorderWidth: 2,
  						borderColor: color,
  						borderWidth: 2,
  						backgroundColor: 'transparent',
  						tension: 0.3,
  					};
  				}),
  			},
  			options: {
  				responsive: true,
  				maintainAspectRatio: false,
  				interaction: { mode: 'index', intersect: false },
  				scales: {
  					x: {
  						grid: { color: '#f0f0f0' },
  						ticks: { font: { size: 11 } },
  					},
  					y: {
  						min: 0,
  						max: 100,
  						title: { display: true, text: 'Metagame Share (%)', font: { size: 13 } },
  						ticks: { callback: (v) => `${v}%`, stepSize: 10 },
  						grid: { color: '#f0f0f0' },
  					},
  				},
  				plugins: {
  					legend: { display: false },
  					tooltip: {
  						callbacks: {
  							label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%`,
  						},
  					},
  				},
  			},
  			plugins: [cardArtPlugin],
  		});
  	}

  	onMount(() => buildChart(series));
  	onDestroy(() => chart?.destroy());

  	$effect(() => {
  		void series.length; // track dependency
  		if (canvas) buildChart(series);
  	});
  </script>

  <div class="controls">
  	<span class="label">Period:</span>
  	{#each [['1w', '1 week'], ['2w', '2 weeks'], ['1m', '1 month']] as [value, label] (value)}
  		<button
  			type="button"
  			class="period-btn"
  			class:active={periodSize === value}
  			onclick={() => (periodSize = value as PeriodSize)}
  		>{label}</button>
  	{/each}
  </div>

  <div class="chart-container">
  	<canvas bind:this={canvas} data-testid="evolution-canvas"></canvas>
  </div>

  <div class="legend">
  	{#each series as s, i}
  		<span class="legend-item">
  			{#if archetypeCardMap.has(s.name)}
  				<img
  					class="legend-art"
  					src={getScryfallImageUrl(archetypeCardMap.get(s.name)!, 'art_crop')}
  					alt={s.name}
  				/>
  			{:else}
  				<span
  					class="dot"
  					style="background: {s.name === 'Other' ? OTHER_COLOR : COLORS[i % COLORS.length]}"
  				></span>
  			{/if}
  			{s.name}
  		</span>
  	{/each}
  </div>

  <style>
  	.controls {
  		display: flex;
  		align-items: center;
  		gap: 0.4rem;
  		margin-bottom: 0.75rem;
  	}

  	.label {
  		font-size: 0.85rem;
  		color: var(--color-text-muted);
  		margin-right: 0.2rem;
  	}

  	.period-btn {
  		padding: 0.2rem 0.7rem;
  		border-radius: 9999px;
  		border: 1px solid var(--color-border);
  		background: var(--color-surface);
  		font-size: 0.8rem;
  		cursor: pointer;
  		color: var(--color-text-muted);
  		transition: all 0.15s;
  	}

  	.period-btn.active {
  		background: var(--color-text);
  		color: var(--color-bg);
  		border-color: var(--color-text);
  	}

  	.period-btn:hover:not(.active) {
  		background: var(--color-hover);
  	}

  	.chart-container {
  		position: relative;
  		height: 380px;
  		background: var(--color-surface);
  		border: 1px solid var(--color-border);
  		border-radius: var(--radius);
  		padding: 1rem;
  	}

  	.legend {
  		display: flex;
  		flex-wrap: wrap;
  		gap: 0.75rem;
  		margin-top: 0.75rem;
  		font-size: 0.8rem;
  	}

  	.legend-item {
  		display: flex;
  		align-items: center;
  		gap: 0.3rem;
  	}

  	.dot {
  		width: 10px;
  		height: 10px;
  		border-radius: 50%;
  		display: inline-block;
  	}

  	.legend-art {
  		width: 18px;
  		height: 18px;
  		border-radius: 50%;
  		object-fit: cover;
  		border: 1px solid var(--color-border);
  	}
  </style>
  ```

- [ ] **Step 3.2: Verify the component type-checks**

  ```bash
  bun run check
  ```
  Expected: no type errors in `MetagameEvolution.svelte`

---

### Task 4: Wire up the metagame page

**Files:**
- Modify: `src/routes/metagame/+page.svelte`

- [ ] **Step 4.1: Add the import and matrixOpts derived, then add the new section**

  Open `src/routes/metagame/+page.svelte`. Make the following changes:

  **Add import** at the top of the `<script>` block (after the existing imports):
  ```ts
  import MetagameEvolution from '$lib/components/MetagameEvolution.svelte';
  import { playerArchetypes, archetypeCardMap } from '$lib/stores/tournaments';
  import type { MatrixOptions } from '$lib/utils/winrate-calculator';
  ```

  **Add derived variable** in the `<script>` block (after the existing `$derived` declarations):
  ```ts
  const matrixOpts = $derived<MatrixOptions>({
  	excludeMirrors: $settings.excludeMirrors,
  	topN: $settings.otherMode === 'topN' ? $settings.topN : 0,
  	minMetagameShare: $settings.otherMode === 'minShare' ? $settings.minMetagameShare / 100 : 0,
  	useStandings: $settings.useStandings,
  });
  ```

  **Add section** inside the `{#if $metagameData}` block, after the Matchup Matrix section:
  ```svelte
  <section>
  	<h2>Metagame Share Evolution</h2>
  	<MetagameEvolution
  		tournaments={$filteredTournaments}
  		playerArchetypes={$playerArchetypes}
  		matrixOptions={matrixOpts}
  		archetypeCardMap={$archetypeCardMap}
  	/>
  </section>
  ```

- [ ] **Step 4.2: Type-check and lint**

  ```bash
  bun run check
  ```
  Expected: no type errors

- [ ] **Step 4.3: Run the full test suite**

  ```bash
  bun run test
  ```
  Expected: all tests pass (green)

- [ ] **Step 4.4: Start dev server and manually verify**

  ```bash
  bun run dev
  ```

  Open the Metagame page and verify:
  - "Metagame Share Evolution" section appears at the bottom
  - Period toggle buttons work (1 week / 2 weeks / 1 month)
  - Chart renders lines with card-art dots
  - Tooltips show archetype name + percentage
  - Legend shows card art thumbnails (or colored dot for "Other")
  - Switching periods rebuilds the chart correctly

- [ ] **Step 4.5: Commit**

  ```bash
  git add src/lib/components/MetagameEvolution.svelte src/routes/metagame/+page.svelte
  git commit -m "feat: add Metagame Share Evolution chart to metagame page"
  ```
