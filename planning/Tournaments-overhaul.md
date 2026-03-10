# Tournaments Overhaul

## Initial proposal

In the future (not now) we are going to add support for other data origins, not only melee.gg
- spicerack.gg: example https://www.spicerack.gg/events/2041196
- mtgo.com/decklist: example https://www.mtgo.com/decklist/standard-challenge-64-2026-03-0912834540

Before developing the individual parsers wee need to change the way we store the tournaments to support this.
We should create a folder per format, start only with: Standard, Modern, Pioneer, Legacy, Vintage, Pauper, Premodern and Duel Commander. Then in each format a folder for each year-month period. In each format/year-month/ there needs to be an index.json listing the events of that period and it's metadata, so the frontend can populate the tournament selector box without looking inside every single file, just format and folders based on year-month.

Also we need to add "source" to the meta part in the tournament: melee.gg, spicerack.gg or mtgo.com
We also need to add tournament importance as meta:
    - ***: Pro Tours, Arena Championships, World Championship
    - **: RC, Spotlight Series, MTGO Showcase, PTQ
    - *: Destination Qualifier, RCQ, ReCQ, MTGO Challenge, LCQ
    - blank: everything else
Another property is tabletop: yes/no
Another field should be clean name, it should start as the original name. I'll manually edit if necessary. UI should show clean name

This should affect the way the current tournament parser behaves

## Context

The project currently stores tournament data as flat JSON files in `data/tournaments/{meleeId}.json`, all from melee.gg. To prepare for multiple data sources (spicerack.gg, mtgo.com) and scale to hundreds/thousands of tournaments, we need to restructure storage, add metadata fields, and update the data pipeline.

**Not in scope**: Building spicerack/mtgo parsers, lazy loading, UI redesign. This is structural groundwork only.

## Decisions Made

- **Storage**: Per-format folders with year-month subfolders + per-format `index.json`
- **IDs**: String with source prefix (`"melee-339227"`) — change from `number` now
- **Multi-format**: For now, store in primary constructed format only (draft rounds discarded for Pro Tours)
- **Importance**: Auto-inferred from name via regex, manual override preserved in index
- **Tabletop**: Per-source default (melee→true, mtgo→false), override possible in index
- **cleanName/importance**: Live only in per-format `index.json`, NOT in TournamentMeta/tournament JSON (survives re-fetches, editable without touching tournament data)

## New Directory Structure

```
data/
  standard/
    index.json                          # TournamentIndexEntry[] for all Standard tournaments
    2026-03/
      melee-385576.json
      melee-339227.json
    2026-02/
      melee-408838.json
  modern/
    index.json
    2026-03/
      melee-392336.json
  pioneer/
    index.json
    ...
  legacy/
    index.json
  vintage/
    index.json
  pauper/
    index.json
  premodern/
    index.json
  duel-commander/
    index.json
```

Filenames: `{source}-{id}.json` (e.g., `melee-385576.json`)

## Type Changes

### Modified: [src/lib/types/tournament.ts](src/lib/types/tournament.ts)

```typescript
// New types
export type TournamentSource = "melee" | "spicerack" | "mtgo";
export type TournamentImportance = "professional" | "premier" | "competitive" | "other";
// professional (***) = Pro Tour, Worlds, Arena Championship
// premier (**)        = RC, Spotlight Series, MTGO Showcase, PTQ
// competitive (*)     = RCQ, ReCQ, Destination Qualifier, MTGO Challenge, LCQ
// other (blank)       = everything else

// Modified TournamentMeta
export interface TournamentMeta {
  id: string;                // CHANGED: "melee-339227" (was number)
  name: string;
  date: string;
  formats: string[];
  url: string;
  fetchedAt: string;
  playerCount: number;
  roundCount: number;
  source: TournamentSource;  // NEW
  tabletop: boolean;         // NEW
}

// New: per-format index entry
export interface TournamentIndexEntry {
  id: string;                         // "melee-339227"
  name: string;                       // raw name from source
  cleanName: string;                  // display name (defaults to name, manually editable)
  date: string;                       // ISO date
  formats: string[];
  source: TournamentSource;
  url: string;
  playerCount: number;
  roundCount: number;
  importance: TournamentImportance;
  tabletop: boolean;
  path: string;                       // relative path within format dir, e.g. "2026-03/melee-385576.json"
}
```

## Implementation Steps

### Step 1: Update type definitions
- **File**: [src/lib/types/tournament.ts](src/lib/types/tournament.ts)
- Add `TournamentSource`, `TournamentImportance`, `TournamentIndexEntry` types
- Change `TournamentMeta.id` from `number` to `string`
- Add `source: TournamentSource` and `tabletop: boolean` to `TournamentMeta`

### Step 2: Fix all TypeScript compilation errors from id: number → string
Mechanical find-and-replace across these files:
- [src/lib/stores/settings.ts](src/lib/stores/settings.ts) — `selectedTournamentIds: number[]` → `string[]`
- [src/lib/stores/tournaments.ts](src/lib/stores/tournaments.ts) — `Map<number, ...>` → `Map<string, ...>`, all id references
- [src/lib/components/FilterPanel.svelte](src/lib/components/FilterPanel.svelte) — `handleTournamentToggle(id: number, ...)` → `string`
- [src/lib/utils/decklist-collector.ts](src/lib/utils/decklist-collector.ts) — `tournamentId: number` → `string`
- [src/routes/tournaments/+page.svelte](src/routes/tournaments/+page.svelte) — any numeric id references
- Any other files the TypeScript compiler flags

### Step 3: Write migration script
- **New file**: `scripts/migrate-tournaments.ts`
- For each `data/tournaments/{number}.json`:
  1. Read the JSON
  2. Determine the primary format (first constructed format in `meta.formats`)
  3. Change `meta.id` from `339227` to `"melee-339227"`
  4. Add `meta.source: "melee"`, `meta.tabletop: true`
  5. Create target directory `data/{format}/{year-month}/`
  6. Write to `data/{format}/{year-month}/melee-{id}.json`
  7. Delete old file
- Generate per-format `index.json` files with auto-inferred importance and `cleanName = name`

### Step 4: Write importance inference utility
- **New file**: `scripts/lib/importance.ts`
- `inferImportance(name: string): TournamentImportance` using regex patterns
- Patterns: `/Pro Tour|World Championship|Arena Championship/i` → professional, `/Regional Championship|Spotlight|Showcase|PTQ/i` → premier, `/RCQ|ReCQ|Challenge|LCQ|Destination Qualifier/i` → competitive, default → other

### Step 5: Update loader.ts
- **File**: [src/lib/data/loader.ts](src/lib/data/loader.ts)
- Change glob: `"/data/tournaments/*.json"` → `"/data/*/**/*.json"` (matches `data/{format}/{year-month}/*.json`, excludes index.json files)
- Add second glob for index files: `"/data/*/index.json"`
- Parse string IDs from filenames
- Export `loadTournaments(): Map<string, TournamentData>` and `loadIndexes(): Map<string, TournamentIndexEntry[]>` (keyed by format slug)

### Step 6: Update tournament stores to use index data
- **File**: [src/lib/stores/tournaments.ts](src/lib/stores/tournaments.ts)
- Load indexes via `loadIndexes()`
- `tournamentList` derived store merges index data (cleanName, importance) with tournament meta
- Expose `availableFormats` from index keys (format folder names)
- `filteredTournaments` uses index for metadata, loads full data from the tournament map

### Step 7: Update assembler and fetch script
- **File**: [scripts/lib/assembler.ts](scripts/lib/assembler.ts)
  - Output `meta.id` as `"melee-{tournamentId}"` string
  - Add `meta.source: "melee"`, `meta.tabletop: true`
- **File**: [scripts/fetch-tournament.ts](scripts/fetch-tournament.ts)
  - Determine primary format from parsed tournament page
  - Compute year-month from tournament date
  - Output path: `data/{format}/{year-month}/melee-{id}.json`
  - After writing tournament file, update `data/{format}/index.json`:
    - Read existing index, preserve `cleanName`/`importance` overrides for this tournament ID
    - Upsert entry with fresh metadata + auto-inferred importance (if no override)
    - Write index back

### Step 8: Write rebuild-index script
- **New file**: `scripts/rebuild-index.ts`
- Scans all `data/{format}/{year-month}/*.json` files
- Rebuilds each format's `index.json` from scratch
- Preserves existing `cleanName`/`importance` overrides from current index
- Useful for one-off regeneration or after manual file moves

### Step 9: Update frontend components to show new fields
- **File**: [src/lib/components/FilterPanel.svelte](src/lib/components/FilterPanel.svelte)
  - Show `cleanName` instead of `name` in tournament checkboxes
- **File**: [src/routes/tournaments/+page.svelte](src/routes/tournaments/+page.svelte)
  - Show `cleanName` in table
  - Add importance indicator column (stars or similar)
  - Add source and tabletop columns

### Step 10: Update tests
- **Files**: [tests/integration/assembler.test.ts](tests/integration/assembler.test.ts), [tests/unit/](tests/unit/), [tests/component/](tests/component/)
- Update assembler tests for new meta fields (string id, source, tabletop)
- Update any test fixtures or mocks referencing numeric tournament IDs
- Add unit tests for `inferImportance()`
- Update component tests for FilterPanel and tournaments page

### Step 11: Update list-tournaments script
- **File**: [scripts/list-tournaments.ts](scripts/list-tournaments.ts)
- Add importance column to CSV output (auto-inferred from name)
- Add tabletop column

## Verification

1. `bun run build` — no TypeScript errors, site builds successfully
2. `bun vitest run` — all existing tests pass with updated fixtures
3. `bun vitest run tests/unit/importance.test.ts` — importance inference tests pass
4. Run migration script on current data, verify files moved correctly and indexes generated
5. Run `bun run dev`, confirm:
   - FilterPanel shows tournaments with clean names
   - Format filter works (now driven by folder-based formats)
   - Tournament selector checkboxes work with string IDs
   - Metagame page loads and displays data correctly
6. Run `bun run scripts/fetch-tournament.ts <id>` on a known tournament, verify it writes to correct path and updates index

## Critical files summary
- [src/lib/types/tournament.ts](src/lib/types/tournament.ts) — type definitions (core change)
- [src/lib/data/loader.ts](src/lib/data/loader.ts) — glob patterns and index loading
- [src/lib/stores/tournaments.ts](src/lib/stores/tournaments.ts) — store refactor (most complex)
- [src/lib/stores/settings.ts](src/lib/stores/settings.ts) — ID type change
- [scripts/lib/assembler.ts](scripts/lib/assembler.ts) — new meta fields in output
- [scripts/fetch-tournament.ts](scripts/fetch-tournament.ts) — new output paths + index management
- [src/lib/components/FilterPanel.svelte](src/lib/components/FilterPanel.svelte) — cleanName display
- [src/routes/tournaments/+page.svelte](src/routes/tournaments/+page.svelte) — new columns

---

## Appendix A: Index refinements

### Context

After the initial overhaul, two issues with `TournamentIndexEntry`:

1. **`formats: string[]` is redundant** — Each index is per-format (lives in `data/standard/index.json`), so the format is already implied by which index the entry belongs to. A single `format: string` field is clearer and avoids confusion about what the array means in a per-format context.

2. **Missing `pairings` flag** — MTGO tournaments don't provide match/round data, only decklists and standings. This matters for winrate and matchup matrix calculations. A `pairings: boolean` field lets the frontend/stores filter or flag tournaments that can't contribute to matchup analysis.

### Changes to `TournamentIndexEntry`

```typescript
export interface TournamentIndexEntry {
  // ...existing fields...
  format: string;     // CHANGED: was `formats: string[]` — single primary format
  pairings: boolean;  // NEW: whether match/round data is available
  // ...rest unchanged...
}
```

### Files to modify

1. **[src/lib/types/tournament.ts](src/lib/types/tournament.ts)** — Change `formats: string[]` → `format: string`, add `pairings: boolean`
2. **[data/standard/index.json](data/standard/index.json)** — Update existing entries: `"formats": ["Standard"]` → `"format": "Standard"`, add `"pairings": true`
3. **[scripts/fetch-tournament.ts](scripts/fetch-tournament.ts)** line 189 — Change `formats: tournament.meta.formats` → `format: primaryFormat`, add `pairings: true` (melee always has pairings)
4. **[scripts/rebuild-index.ts](scripts/rebuild-index.ts)** line 83 — Change `formats: data.meta.formats` → `format: data.meta.formats[0] ?? "Unknown"`, add `pairings: Object.keys(data.rounds).length > 0`
5. **[scripts/migrate-tournaments.ts](scripts/migrate-tournaments.ts)** line 83 — Same pattern as rebuild-index (migration already ran but keep script consistent)
6. **[src/routes/tournaments/+page.svelte](src/routes/tournaments/+page.svelte)** line 120 — Change `t.formats.join(', ')` → display comes from `TournamentMeta.formats` (unchanged), no impact on index display

**No changes needed** in the store layer — `tournamentList` spreads `TournamentMeta` (which keeps `formats: string[]`) and cherry-picks `cleanName`/`importance` from the index. The `format` field on `TournamentIndexEntry` is not currently used by any store-level filtering (filtering uses `TournamentMeta.formats`).

### Verification

1. `bun run svelte-check` — 0 errors
2. `bun vitest run` — all tests pass
3. Inspect `data/standard/index.json` — entries have `"format": "Standard"` and `"pairings": true`
4. Run `bun run scripts/rebuild-index.ts` — regenerates cleanly with new schema
