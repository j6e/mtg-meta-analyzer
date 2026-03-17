# Winners Metagame — Design Spec

## Problem

The metagame evolution chart currently treats every tournament entrant equally. In larger tournaments, the top tables have a meaningfully different archetype distribution than the field. Users want to see "what's winning" vs "what's being played."

## Decision

Add a **Field / Winners toggle** to the existing metagame evolution chart. When "Winners" is selected, only players in the **top X%** of each tournament's final standings contribute to the metagame share calculation. The cutoff percentage is configurable from 10% to 50% in 5% increments, defaulting to 25%.

### Why cutoff over continuous weighting

We evaluated 9 weighting approaches on 30 Standard tournaments (3,500+ players). Findings:

- **Cutoff methods produced the strongest signal** — up to +2.5pp swings vs baseline, compared to ~1.0–1.7pp for continuous methods (inverse rank, win rate, exponential decay).
- **Cutoff is the most intuitive** — "what are the top 25% playing?" is a natural question for MTG players.
- **Normalization is inherent** — rank 8/32 in a Challenge and rank 246/984 in an RC are both top 25%.
- **Avoids edge cases** like early-drop players with misleading 100% win rates.

### Why not continuous weighting

- Weaker signal in the data.
- Harder to explain to users ("what does the percentage mean when weighted?").
- The weighting function shape (linear, quadratic, exponential) is an arbitrary choice that doesn't meaningfully change results — most continuous methods converge to similar outputs.

## Data Model

### New type: `EvolutionOptions`

Replaces the current `Pick<MatrixOptions, "topN" | "minMetagameShare">` parameter in `computeMetagameEvolution()`.

```ts
interface EvolutionOptions {
  topN?: number;              // existing — keep top N archetypes
  minMetagameShare?: number;  // existing — minimum share threshold
  winnersMode?: boolean;      // new — false = field (default), true = winners
  winnersCutoff?: number;     // new — 0.10–0.50, step 0.05, default 0.25
}
```

`MatrixOptions` is NOT modified. The matchup matrix and winrate calculator are unaffected.

### Filtering logic

Inside `computeMetagameEvolution()`, when `winnersMode` is `true`:

```
For each tournament t in period:
  cutoffRank = ceil(t.meta.playerCount * winnersCutoff)
  For each [playerId, player] in Object.entries(t.players):
    if player.rank <= cutoffRank:
      count toward archetype shares
    else:
      skip
```

When `winnersMode` is `false` (default), all players count — identical to current behavior.

The cutoff uses `t.meta.playerCount` (the full tournament field size). For MTGO tournaments that only publish top-32 decklists, the cutoff rank may exceed the available data — see "Incomplete data warning" below.

Note: both the global archetype count loop and the per-period loop currently iterate with `Object.keys(t.players)`. The per-period loop must be changed to `Object.entries(t.players)` to access `player.rank` for filtering. The global archetype count loop is NOT filtered — see below.

### Global archetype ranking is NOT filtered

The global archetype counts (used for `topN` / `minMetagameShare` collapsing into "Other") always use the full field, regardless of `winnersMode`. The archetype set is determined first from all players, then the winners cutoff filters which players contribute to per-period shares within that fixed set.

### Incomplete data warning

MTGO tournaments typically only include top-32 decklists even when `playerCount` is 60–90+. When `winnersMode` is `true` and `ceil(playerCount * winnersCutoff)` exceeds the number of available players in `t.players` for any tournament in the current view, `computeMetagameEvolution()` returns a flag indicating incomplete data. The chart legend displays a warning, e.g. "Some tournaments have incomplete data for this cutoff." In this scenario all available players from those tournaments are included (the cutoff has no filtering effect for that tournament).

## UI

### Controls

Added to the existing metagame evolution chart control bar in `MetagameEvolution.svelte`:

1. **Toggle button pair**: "Field" / "Winners" — styled consistently with the existing period selector buttons.
2. **Cutoff dropdown**: Only visible when "Winners" is selected. Options: 10%, 15%, 20%, 25%, 30%, 35%, 40%, 45%, 50%. Default: 25%.

Layout: toggle and dropdown appear inline next to the existing period selector.

### Chart indicator

When in Winners mode, the chart subtitle indicates the active filter, e.g. "Top 25%". If the incomplete-data flag is set, a warning appears in the legend: "Some tournaments have incomplete data for this cutoff."

### Settings persistence

Two new fields in the settings store (`src/lib/stores/settings.ts`):

- `winnersMode: boolean` — default `false`
- `winnersCutoff: number` — default `0.25`

These persist across SPA page navigation (same as existing settings; not persisted across page reloads).

Default values must be added to `makeDefaults()` in `settings.ts`: `winnersMode: false`, `winnersCutoff: 0.25`.

## Files Modified

| File | Change |
|------|--------|
| `src/lib/utils/metagame-evolution.ts` | New `EvolutionOptions` type; add rank-based filtering to `computeMetagameEvolution()`; return incomplete-data flag |
| `src/lib/stores/settings.ts` | Add `winnersMode` and `winnersCutoff` fields |
| `src/lib/components/MetagameEvolution.svelte` | Add Field/Winners toggle, cutoff dropdown, subtitle indicator. Read `winnersMode`/`winnersCutoff` from settings store and pass into `computeMetagameEvolution()` (same pattern as existing `topN`/`minMetagameShare`). |
| `tests/unit/metagame-evolution.test.ts` | Test cases for winners mode |

## Files NOT Modified

- `src/lib/utils/winrate-calculator.ts` — `MatrixOptions` untouched
- Tournament loading, classification, archetype stores — untouched

## Testing

Unit tests with synthetic tournament data:

1. **Basic filtering**: With `winnersMode: true, winnersCutoff: 0.25` and a 20-player tournament, only the top 5 players contribute to shares.
2. **Cross-tournament normalization**: A period with a 32-player and 200-player tournament — each contributes its own top X% independently.
3. **Rounding**: Tournament with 7 players at 25% cutoff → `ceil(7 * 0.25) = 2` players qualify.
4. **Default behavior**: With `winnersMode: false`, output is identical to current implementation.
5. **Homogeneous field**: All players play the same archetype → 100% share in both modes.
6. **Partial data (MTGO)**: Tournament with `playerCount: 78` but only 32 players in data (all ranked 1–32). Cutoff at 25% → `ceil(78 * 0.25) = 20`. Since all 32 available players have rank <= 20… no, rank 21–32 are excluded. Only 20 of 32 available players qualify. The incomplete-data flag is NOT set because cutoffRank (20) <= max available rank (32).
7. **Partial data — cutoff exceeds data**: Tournament with `playerCount: 78`, 32 players in data (ranked 1–32), cutoff at 50% → `ceil(78 * 0.50) = 39`. Since max rank in data is 32, all 32 players qualify and the incomplete-data flag is set.
8. **Tied ranks at boundary**: Two players share the cutoff rank — both are included (rank <= cutoffRank).
