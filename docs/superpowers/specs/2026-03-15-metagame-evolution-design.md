# Design: Metagame Share Evolution

**Date:** 2026-03-15
**Branch:** feat/metagame-evolution
**Status:** Approved

## Summary

Add a "Metagame Share Evolution" chart to the bottom of the Metagame page. The chart shows how each archetype's metagame share changes over time, using non-overlapping calendar-aligned windows of 1 week, 2 weeks, or 1 month. Each archetype is a line with card-art dots connected across periods.

## Requirements

- Uses the same filtered tournament selection as the rest of the Metagame page
- Respects the same archetype filtering settings (topN / minMetagameShare collapsing)
- Period sizes: 1 week, 2 weeks, 1 month — selectable via toggle buttons
- Periods are non-overlapping and whole (calendar-aligned), anchored to the latest tournament date and counting backwards
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

### Period generation

Periods are anchored to the **latest tournament date** in the filtered set and counted **backwards**. The anchor's period is the most recent; prior periods step back one unit at a time.

All periods from the anchor back to (and including) the period containing the earliest tournament date are generated. Periods that fall entirely before the earliest tournament date are not generated. Periods that fall entirely after the latest tournament date are not generated. The returned `points` array is ordered **oldest-to-newest** (index 0 = earliest period).

**1 week (`'1w'`)**: ISO 8601 weeks, Monday–Sunday. The anchor's ISO week is the most recent period.
- Label (same month): `Mar 10–16`
- Label (cross-month): `Jan 28–Feb 3`
- Label (cross-year): `Dec 29–Jan 4`

**2 weeks (`'2w'`)**: 14-day chunks using pure date arithmetic. The most recent period ends on the **Sunday of the anchor's ISO week** (always the full-week boundary — even if the anchor date falls mid-week) and starts 13 days before that (Monday of the preceding ISO week). Each prior period's end date = previous period's start date − 1 day; start date = end date − 13 days. No ISO week numbering involved — pure 14-day subtraction from the anchor's week boundary. This means year boundaries are handled naturally with no special cases.
- Label format follows the same cross-month/cross-year rules as `'1w'`.

**1 month (`'1m'`)**: Full calendar months (always Jan 1–31, Feb 1–28, etc.). The anchor's calendar month is the most recent period — its end date is always the last day of that month, not the anchor date itself.
- Label: `March 2026` (en-US locale via `Intl.DateTimeFormat`)

### Player-count aggregation

For each period, iterate over `TournamentData[]` entries whose `meta.date` falls within `[startDate, endDate]` **inclusive** — i.e. `meta.date >= startDate && meta.date <= endDate` (ISO string comparison). For each tournament, iterate over `Object.keys(tournament.players)` to get player IDs, and look each up in `playerArchetypes` to get their archetype. Players absent from `playerArchetypes` (i.e., `undefined` lookup result) are treated as `"Unknown"` and excluded from share counts — matching `buildMatchupMatrix` behavior.

A player who appears in two tournaments within the same period is counted **twice** (once per tournament entry). This is intentional and consistent with how `buildMatchupMatrix` counts players — the unit is tournament entries, not unique individuals.

### Archetype set (global, not per-period)

The qualifying archetype set is determined once from the **aggregate across all periods combined**. This uses the same logic as `buildMatchupMatrix`:
- If `topN > 0`: keep the top N archetypes ranked by their total player-entry count summed across all periods; collapse the rest into `"Other"`
- If `minMetagameShare > 0`: keep archetypes whose global share ≥ threshold; collapse the rest into `"Other"`
- `"Unknown"` is always excluded (never appears as a series)
- `"Other"` is emitted as a named series only if at least one archetype is collapsed into it

The global archetype set is fixed for all periods. An archetype absent from a given period still appears in that period's `EvolutionPoint` with `share: 0`.

### Share computation per period

For each period:
1. Collect tournaments whose `meta.date` falls within `[startDate, endDate]`
2. Sum player entries per archetype (Unknown excluded)
3. `totalPlayers` = sum of all non-Unknown player entries across all tournaments in the period (duplicates counted if same player appears in multiple tournaments in the same period)
4. Map each archetype to its display name (qualifying → itself; collapsing → `"Other"`)
5. `share = playerCount / totalPlayers` (0–1)
6. If zero tournaments in the period → all series get `share: 0`

### Public API

```ts
export type PeriodSize = '1w' | '2w' | '1m';

export interface EvolutionPoint {
  label: string;   // period label for X axis
  share: number;   // 0–1
}

export interface EvolutionSeries {
  name: string;
  points: EvolutionPoint[];  // ordered oldest-to-newest
}

/**
 * Compute per-archetype metagame share evolution across calendar periods.
 * Returns [] if tournaments is empty.
 * topN and minMetagameShare follow the same semantics as MatrixOptions:
 *   topN > 0 collapses archetypes beyond rank N; minMetagameShare > 0 collapses
 *   archetypes below the threshold. Caller should zero out whichever is inactive.
 */
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
  archetypeCardMap: Map<string, string>;  // archetype name → card name (for Scryfall lookup)
}
```

`archetypeCardMap` is the existing `$archetypeCardMap` store from `src/lib/stores/tournaments.ts`, which maps archetype name to the name of its first signature card. Only `topN` and `minMetagameShare` from `matrixOptions` are forwarded to the utility. `excludeMirrors` and `useStandings` are intentionally ignored — evolution share computation is based purely on player entry counts, not match results or standings.

### State

- `periodSize: PeriodSize = '2w'` (local, not persisted to URL)
- `series: EvolutionSeries[]` — computed via `$derived()` from props + periodSize

### Chart lifecycle

The Chart.js instance is **destroyed and recreated** whenever series data changes (period toggle or prop change). This follows the same `buildChart()` / `$effect()` pattern as `MetagameScatter`. No in-place `chart.update()`.

### Chart configuration

- Chart.js `line` type
- One dataset per archetype series; `dataset.label` = archetype name; `dataset.archetypeName` = archetype name (metadata for the card-art plugin)
- X axis: category scale, labels = `series[0].points.map(p => p.label)` (oldest left, newest right)
- Y axis: 0–100%. `share` (0–1) is **multiplied by 100** before passing to Chart.js. Ticks formatted as `v + '%'`.
- **Point radius: 10px** for share > 0 (large enough for card art); **0px** for share = 0 (no dot)
- Lines connect all periods including 0% (no gaps)
- `interaction: { mode: 'index', intersect: false }` for multi-archetype tooltips
- Tooltip label format: `${datasetLabel}: ${value.toFixed(1)}%`

### Card-art plugin

Same pattern as `MetagameScatter.cardArtPlugin`. At draw time, reads `dataset.archetypeName`, looks up the card name in `archetypeCardMap`, and draws a circular-cropped `art_crop` image over each point where share > 0. Points at 0% are skipped. If `archetypeName` is absent from `archetypeCardMap` (e.g., `"Other"`), the plugin skips that dataset silently — the point renders as a plain colored dot.

### Controls

Three pill-style buttons above the chart: `1 week` / `2 weeks` / `1 month`. Default: `2 weeks`. Switching re-derives `series` and rebuilds the chart.

### Legend

Same style as `MetagameScatter` — circular card-art thumbnail + archetype name, wrapping flex row below the chart. `"Other"` uses a plain colored dot (no card art), consistent with how `MetagameScatter` handles archetypes without a signature card.

## Page Integration (`metagame/+page.svelte`)

Add a third `<section>` after the Matchup Matrix, inside the `{#if $metagameData}` block:

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

`matrixOpts` is a new `$derived` local variable constructed from `$settings`. All five fields accessed (`excludeMirrors`, `otherMode`, `topN`, `minMetagameShare`, `useStandings`) are confirmed fields on the existing `MetaSettings` store in `src/lib/stores/settings.ts`. `otherMode: 'topN' | 'minShare'` controls which collapsing mode is active by zeroing out the other. This matches the pattern already used to build options for `buildMatchupMatrix` in the `metagameData` store. `useStandings` is included in `matrixOpts` for type completeness but is **not forwarded to the utility** — evolution share computation is always entry-count based, not standings-based.

```ts
const matrixOpts = $derived<MatrixOptions>({
  excludeMirrors: $settings.excludeMirrors,
  topN: $settings.otherMode === 'topN' ? $settings.topN : 0,
  minMetagameShare: $settings.otherMode === 'minShare' ? $settings.minMetagameShare / 100 : 0,
  useStandings: $settings.useStandings,
});
```

## Testing

Unit tests in `metagame-evolution.test.ts`:

1. **ISO week boundary**: a Wednesday date returns the Monday of that ISO week as `startDate`
2. **2w anchor**: anchor date is Wednesday of ISO week 12 → most recent period = Monday of week 11 through Sunday of week 12 (full 14-day window, end = Sunday of anchor's week); prior period = Monday of week 9 through Sunday of week 10
3. **2w year boundary**: anchor in ISO week 1 of a year → most recent period = last week of previous year through Sunday of week 1
4. **Calendar month**: anchor in March 2026 → most recent period = Mar 1–31; prior = Feb 1–28
5. **Cross-month label**: ISO week spanning Jan 28–Feb 3 → label `Jan 28–Feb 3`
6. **Output order**: returned `points` array is ordered oldest-to-newest
7. **Empty period → 0%**: period with no tournaments → all series have `share: 0`
8. **Empty input → `[]`**: `computeMetagameEvolution([], ...)` returns `[]`
9. **topN collapsing**: archetypes beyond cutoff merged into `"Other"` series
10. **minMetagameShare collapsing**: archetypes below threshold merged into `"Other"` series
11. **Global archetype set**: archetype present in only one period still appears in all periods (`share: 0` elsewhere)
12. **Date range bounds**: no periods generated before the earliest tournament date or after the latest
