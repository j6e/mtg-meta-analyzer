# Design: Metagame Share Evolution

**Date:** 2026-03-15
**Branch:** feat/metagame-evolution
**Status:** Approved

## Summary

Add a "Metagame Share Evolution" chart to the bottom of the Metagame page. The chart shows how each archetype's metagame share changes over time, using non-overlapping calendar-aligned windows of 1 week, 2 weeks, or 1 month. Each archetype is a line with card-art dots connected across periods.

## Requirements

- Uses the same filtered tournament selection as the rest of the Metagame page
- Respects the same archetype filtering settings (topN / minMetagameShare / Other collapsing)
- Period sizes: 1 week, 2 weeks, 1 month — selectable via toggle buttons
- Periods are non-overlapping and whole (calendar-aligned)
- If no tournaments fall in a period, all archetype shares are 0% for that period
- Dots use circular card-art images (same as existing MetagameScatter)
- Lines connect all periods including 0% ones (no gaps)

## Approach

Approach B: pure utility function + Svelte component consuming existing stores via `$derived()`. No new store added.

## Files

| File | Change |
|------|--------|
| `src/lib/utils/metagame-evolution.ts` | **new** — pure bucketing + share-computation utility |
| `src/lib/components/MetagameEvolution.svelte` | **new** — Chart.js line chart, period toggle, card-art dots, legend |
| `src/routes/metagame/+page.svelte` | **modified** — add new section at bottom inside `{#if $metagameData}` |
| `src/lib/utils/metagame-evolution.test.ts` | **new** — unit tests for utility |

## Utility: `metagame-evolution.ts`

### Period bucketing

Given the date range of the filtered tournaments, generates all non-overlapping whole calendar periods covering that range.

**1 week (`'1w'`)**: ISO weeks, Monday–Sunday.
- Period label format: `Mar 10–16`
- Alignment: ISO week standard (Monday = week start)

**2 weeks (`'2w'`)**: Pairs of consecutive ISO weeks. ISO week numbers are paired as (1+2), (3+4), (5+6), etc. — so week 1 of the year always starts a pair.
- Period label format: `Mar 3–16`

**1 month (`'1m'`)**: Calendar months (Jan 1–31, Feb 1–28, etc.).
- Period label format: `March 2026`

Only periods whose range intersects the earliest–latest tournament dates are generated (no unbounded generation).

### Share computation

For each period:
1. Collect all filtered tournaments whose `meta.date` falls within `[startDate, endDate]`
2. Aggregate player counts per archetype across those tournaments using the `playerArchetypes` map
3. Apply the same topN / minMetagameShare collapsing as `buildMatchupMatrix` — archetypes that don't qualify become "Other"
4. Compute share = `playerCount / totalPlayers`
5. If zero tournaments in the period → all shares are 0

### Public API

```ts
export type PeriodSize = '1w' | '2w' | '1m';

export interface EvolutionPoint {
  label: string;   // period label for X axis
  share: number;   // 0–1
}

export interface EvolutionSeries {
  name: string;
  points: EvolutionPoint[];
}

export function computeMetagameEvolution(
  tournaments: TournamentData[],
  playerArchetypes: Map<string, string>,
  periodSize: PeriodSize,
  options: Pick<MatrixOptions, 'topN' | 'minMetagameShare'>,
): EvolutionSeries[]
```

## Component: `MetagameEvolution.svelte`

### Props

```ts
{
  tournaments: TournamentData[];
  playerArchetypes: Map<string, string>;
  matrixOptions: MatrixOptions;
  archetypeCardMap: Map<string, string>;
}
```

### State

- `periodSize: PeriodSize = '2w'` (local, not persisted to URL)
- `series: EvolutionSeries[]` — computed via `$derived()` from props + periodSize

### Chart

- Chart.js `line` type
- One dataset per archetype
- X axis: category scale, labels = period label strings
- Y axis: 0–100%, ticks formatted as `%`
- Point radius: 10px (fixed, large enough for card art)
- Card-art plugin: same circular-crop approach as `MetagameScatter` — draws art_crop image over each point, with a dominant-color border ring
- Lines connect all points including 0% values (no gaps)
- `interaction: { mode: 'index', intersect: false }` for multi-archetype tooltips

### Controls

Three pill-style toggle buttons above the chart: `1 week` / `2 weeks` / `1 month`. Matches the existing button style in the app. Switching period re-derives the series and rebuilds the chart.

### Legend

Same style as `MetagameScatter` — circular card-art thumbnail + archetype name, wrapping flex row below the chart.

## Page Integration (`metagame/+page.svelte`)

Add a third `<section>` inside the `{#if $metagameData}` block, after the Matchup Matrix:

```svelte
<section>
  <h2>Metagame Share Evolution</h2>
  <MetagameEvolution
    tournaments={$filteredTournaments}
    playerArchetypes={$playerArchetypes}
    matrixOptions={...}
    archetypeCardMap={$archetypeCardMap}
  />
</section>
```

Matrix options are derived from `$settings` (same `topN`, `minMetagameShare`, `otherMode` fields used by the scatter).

## Testing

Unit tests in `metagame-evolution.test.ts`:

1. ISO week boundary — a mid-week date maps to the correct Monday start
2. Two-week pairing — ISO weeks 1+2 pair, 3+4 pair, etc.
3. Calendar month bucketing — dates map to the correct month period
4. Empty period → 0% share for all archetypes
5. topN collapsing — archetypes beyond the cutoff merge into "Other"
6. Date range — only periods intersecting the data range are generated
