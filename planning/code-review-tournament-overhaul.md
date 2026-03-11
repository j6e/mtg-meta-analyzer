# Code Review: `feature/tournament-overhaul` PR

**Date:** 2026-03-11
**Branch:** `feature/tournament-overhaul` → `master`
**Scope:** ~4,200 lines of TS/Svelte code changes (excluding data JSON files)

---

## Summary

Three parallel review agents analyzed the PR for code reuse, code quality/defects, and efficiency. The review found **1 bug**, **4 duplication issues**, **3 efficiency concerns**, and **1 dead-code issue**. Findings are ordered by severity.

---

## Bug

### 1. `eligibleIds` ignores `minTier`, causing stale URL excludes when tier changes

**File:** `src/lib/stores/url-settings.ts` — `eligibleIds()` (lines 31–45) and `settingsToSearchParams()` (line 73)
**Severity:** Bug — data correctness
**Confidence:** 90%

#### What's wrong

`settingsToSearchParams` computes which tournaments are "excluded" by diffing the eligible set against the selected set, then writes the result to the `?exclude=` URL param. However, `eligibleIds()` only filters by format, dateFrom, and dateTo — it does **not** filter by `minTier`.

#### Scenario

1. User sets `minTier = "competitive"`. Date range contains 5 tournaments: 3 competitive (`c1, c2, c3`) and 2 "other" (`o1, o2`).
2. `selectedTournamentIds = [c1, c2, c3]` (FilterPanel correctly excludes "other" tier).
3. `eligibleIds` returns `[c1, c2, c3, o1, o2]` (no tier filtering).
4. `excluded = eligible - selected = [o1, o2]`. URL becomes `?exclude=o1,o2&tier=competitive`.
5. On page reload, the URL is parsed correctly (both exclude and tier are applied — no visible bug yet).
6. **The bug:** User now lowers tier to "other" (no tier filter). The `exclude=o1,o2` param is still in the URL. `o1` and `o2` remain excluded even though the tier filter no longer removes them. The stale excludes were generated from tier logic, not manual user deselection, so they should have been cleared.

#### Impact

Tournaments that were implicitly excluded by tier filtering become permanently excluded in the URL, surviving across tier changes and page reloads. Users would need to manually re-select them.

#### Fix

Add `minTier` parameter to `eligibleIds` so that tier-excluded tournaments are handled entirely by the `tier=` URL param and never leak into `exclude=`:

```typescript
// url-settings.ts

function eligibleIds(
    tournaments: TournamentListEntry[],
    format: string,
    dateFrom: string,
    dateTo: string,
    minTier: TournamentImportance,  // add parameter
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
```

Update the call site in `settingsToSearchParams` (line 73):

```typescript
const eligible = eligibleIds(tournaments, s.format, s.dateFrom, s.dateTo, s.minTier);
```

This requires importing `importanceRank` from `$lib/types/tournament` in `url-settings.ts`.

---

## Duplication

### 2. `importanceStars` and `importanceOrder` in `tournaments/+page.svelte` duplicate existing utilities

**File:** `src/routes/tournaments/+page.svelte` — lines 15, 30–37
**Severity:** Duplication + inconsistency
**Confidence:** 95%

#### What's wrong

The tournaments page defines two local constructs that duplicate exports from `src/lib/types/tournament.ts`:

| Local construct | Existing utility | Difference |
|---|---|---|
| `importanceStars()` function (lines 30–37) — returns ASCII `*`, `**`, `***` | `IMPORTANCE_STARS` constant (tournament.ts:63–68) — returns Unicode `★`, `★★`, `★★★` | Different characters — visual inconsistency |
| `importanceOrder` constant (line 15) — `{ professional: 0, premier: 1, competitive: 2, other: 3 }` | `importanceRank()` function (tournament.ts:52–61) — returns `{ other: 0, competitive: 1, premier: 2, professional: 3 }` | **Inverted ranking** — importanceOrder sorts professional first (0), importanceRank sorts other first (0). Both happen to work because the sort direction compensates, but the semantics diverge. |

`FilterPanel.svelte` already imports and uses both `IMPORTANCE_STARS` and `importanceRank` correctly.

#### Impact

- Visual inconsistency: ASCII `*` on the tournaments page vs Unicode `★` everywhere else.
- Maintenance risk: two parallel ranking systems that happen to produce the same sort order by accident (inverted values + inverted comparison).

#### Fix

```svelte
<!-- src/routes/tournaments/+page.svelte -->
<script lang="ts">
import { importanceRank, IMPORTANCE_STARS } from '$lib/types/tournament';
// ... other imports ...

// DELETE: const importanceOrder = { ... };
// DELETE: function importanceStars(...) { ... }
</script>
```

In the sort comparator (line 57), replace:
```typescript
// Before:
return dir * (importanceOrder[a.importance] - importanceOrder[b.importance]);
// After:
return dir * (importanceRank(a.importance) - importanceRank(b.importance));
```

Note: `importanceRank` has the opposite polarity (professional=3, other=0) vs `importanceOrder` (professional=0, other=3). The default `sortDir` for importance is `"desc"`, so:
- Old: `desc` → `dir = -1` → `-1 * (0 - 3) = 3` → professional sorts first. Correct.
- New: `desc` → `dir = -1` → `-1 * (3 - 0) = -3` → professional sorts first. Correct.

Both produce the same result. If you want the default click to show professional first, you may want to flip the default `sortDir` for importance to `"asc"` — but verify this matches the current UX.

In the template (line 148), replace:
```svelte
<!-- Before: -->
<td class="importance" title={t.importance}>{importanceStars(t.importance)}</td>
<!-- After: -->
<td class="importance" title={t.importance}>{IMPORTANCE_STARS[t.importance]}</td>
```

---

### 3. `extractRoundNumber` duplicated between `fetch-tournament.ts` and `assembler.ts`

**Files:**
- `scripts/fetch-tournament.ts` — lines 465–478
- `scripts/lib/assembler.ts` — lines 181–195
**Severity:** Duplication
**Confidence:** 90%

#### What's wrong

Both files contain near-identical `extractRoundNumber` functions with the same regex (`/Round\s+(\d+)/i`), the same playoff sentinel values (quarterfinal→900, semifinal→950, final→999), and the same `top 8`/`top 4` aliases. They are functionally identical.

#### Impact

If playoff round numbering logic needs to change (e.g., adding "top 16" → 800), it must be updated in two places. Easy to miss one.

#### Fix

Extract to a shared module. `scripts/lib/assembler.ts` already contains `isPlayoffRound` (line 197), so a natural home is a new `scripts/lib/round-utils.ts` or just export from `assembler.ts`:

```typescript
// scripts/lib/round-utils.ts (new file)

/** Extract round number from round name string. */
export function extractRoundNumber(name: string): number {
    const match = name.match(/Round\s+(\d+)/i);
    if (match) return Number(match[1]);

    const lower = name.toLowerCase();
    if (lower.includes("quarterfinal")) return 900;
    if (lower.includes("semifinal")) return 950;
    if (lower.includes("final") && !lower.includes("semi") && !lower.includes("quarter"))
        return 999;
    if (lower.includes("top 8")) return 900;
    if (lower.includes("top 4")) return 950;

    return 0;
}
```

Import in both `fetch-tournament.ts` and `assembler.ts`.

---

### 4. `getPrimaryFormat` / `primaryFormat` duplicated between `fetch-tournament.ts` and `migrate-tournaments.ts`

**Files:**
- `scripts/fetch-tournament.ts` — line 481: `function getPrimaryFormat`
- `scripts/migrate-tournaments.ts` — line 24: `function primaryFormat`
**Severity:** Duplication
**Confidence:** 90%

#### What's wrong

Both functions have identical logic:
1. Filter out `draft|sealed|limited` formats using the same regex.
2. Return the first constructed format, or the first format, or `"unknown"`.

They differ only in name. Additionally, both scripts have an inline `formatSlug` helper (`.toLowerCase().replace(/\s+/g, "-")`) that does the same thing.

#### Impact

Same maintenance risk as finding #3 — two copies of format-detection logic.

#### Fix

Extract both into the shared `scripts/lib/` directory. `scripts/lib/importance.ts` (introduced in this PR) is a reasonable home since it already deals with tournament metadata:

```typescript
// scripts/lib/importance.ts (or a new scripts/lib/format-utils.ts)

/** Extract primary constructed format (skip Draft/Sealed/Limited). */
export function getPrimaryFormat(formats: string[]): string {
    const constructed = formats.filter((f) => !/\b(draft|sealed|limited)\b/i.test(f));
    return constructed[0] ?? formats[0] ?? "unknown";
}

/** Convert a format name to a URL/directory slug. */
export function toFormatSlug(format: string): string {
    return format.toLowerCase().replace(/\s+/g, "-");
}
```

---

### 5. Builtin config ID slug pattern repeated 3+ times in `FilterPanel.svelte`

**File:** `src/lib/components/FilterPanel.svelte` — lines 21, 65, 101
**Severity:** Stringly-typed duplication
**Confidence:** 82%

#### What's wrong

The pattern `` `builtin:${format.toLowerCase().replace(/\s+/g, '-')}` `` appears in three places in FilterPanel:
1. `matchingBuiltinConfigs` derived (line 21)
2. `onMount` archetype config sync (line 65)
3. `handleFormatChange` archetype config sync (line 101)

The same slug logic also exists in `src/lib/stores/archetype-configs.ts` when building `BUILTIN_CONFIGS`.

#### Impact

If the slug format ever changes, four locations must be updated. The repeated string construction is also error-prone (e.g., someone might forget the `builtin:` prefix or use a different separator).

#### Fix

Export a helper from `archetype-configs.ts`:

```typescript
// src/lib/stores/archetype-configs.ts
export function builtinConfigId(format: string): string {
    return `builtin:${format.toLowerCase().replace(/\s+/g, '-')}`;
}
```

Replace all three occurrences in FilterPanel with `builtinConfigId(format)`.

---

## Efficiency

### 6. `currentTournamentArchetypes` re-runs `classifyAll`, duplicating work from `classificationResults`

**File:** `src/lib/stores/tournaments.ts` — lines 223–234
**Severity:** Performance — wasted computation
**Confidence:** 88%

#### What's wrong

`classificationResults` (line 142) already runs `classifyAll` for every filtered tournament. `currentTournamentArchetypes` (line 223) independently calls `classifyAll` again for the currently selected tournament. When the selected tournament is in the filtered set (which it almost always is), the classification runs twice.

`classifyAll` is expensive — it builds a TF-IDF corpus and runs KNN for every decklist. For a tournament with 300+ decklists, this is significant.

#### Impact

Every time the user selects a different tournament (or the archetype config changes), `classifyAll` runs twice for that tournament.

#### Fix

Derive `currentTournamentArchetypes` from the pre-computed `classificationResults`:

```typescript
export const currentTournamentArchetypes = derived(
    [currentTournament, classificationResults, activeArchetypeConfig],
    ([$tournament, $resultsMap, $config]): Map<string, string> => {
        if (!$tournament) return new Map();
        // Reuse pre-computed results if available
        const cached = $resultsMap.get($tournament.meta.id);
        if (cached) {
            return buildPlayerArchetypeMap($tournament, cached);
        }
        // Fallback: tournament not in filtered set (rare)
        const results = classifyAll($tournament.decklists, $config.archetypes, {
            k: 5,
            minConfidence: 0.3,
            nameEqualsCommander: $config.nameEqualsCommander,
        });
        return buildPlayerArchetypeMap($tournament, results);
    },
);
```

This keeps the fallback for the edge case where the selected tournament isn't in the filtered set, but avoids double classification in the common case.

---

### 7. `settingsToSearchParams` calls `makeDefaults()` on every reactive update

**File:** `src/lib/stores/url-settings.ts` — line 52 (inside `settingsToSearchParams`) and line 97 (inside `searchParamsToSettings`)
**Severity:** Minor performance
**Confidence:** 85%

#### What's wrong

`settingsQueryString` is a derived store that fires every time `settings` or `tournamentList` changes. Each invocation calls `settingsToSearchParams`, which calls `makeDefaults()`. `makeDefaults()` allocates a new object, calls `new Date()`, and does date arithmetic. Additionally, `eligibleIds()` filters and maps the entire tournament list on every invocation.

This fires on every individual tournament checkbox toggle, every date change, etc.

#### Impact

Low — `makeDefaults()` is cheap and `eligibleIds` is a simple array filter. But it's unnecessary repeated work that's easy to fix.

#### Fix

Hoist the defaults to a module-level constant:

```typescript
// url-settings.ts
const SETTINGS_DEFAULTS = makeDefaults();
```

Use `SETTINGS_DEFAULTS` inside both `settingsToSearchParams` and `searchParamsToSettings` instead of calling `makeDefaults()` each time. This is safe because the defaults (date range based on "today") are fixed for the lifetime of the page.

---

### 8. `archetypeCardMap` re-scans all classification results on every filter change

**File:** `src/lib/stores/tournaments.ts` — lines 161–179
**Severity:** Minor performance
**Confidence:** 82%

#### What's wrong

`archetypeCardMap` depends on `classificationResults`, which changes whenever the tournament filter changes (date range, tournament selection, etc.). The loop that scans for `representativeCard` values iterates over every classification result across all filtered tournaments, even though the representative card for a given archetype is stable once the config is fixed.

#### Impact

Low-to-moderate. The loop body is cheap (just map lookups), but it runs over potentially thousands of results on every filter toggle. The real cost is that it triggers downstream re-renders of components that use `archetypeCardMap` even when the map hasn't actually changed.

#### Fix

For the commander card scan, derive from `globalClassificationResults` instead (which only changes when the archetype config changes, not on filter changes):

```typescript
export const archetypeCardMap = derived(
    [activeArchetypeDefs, globalClassificationResults],
    ([$defs, $resultsMap]): Map<string, string> => {
        const map = new Map<string, string>(
            $defs
                .filter((d) => d.signatureCards.length > 0)
                .map((d) => [d.name, d.signatureCards[0].name]),
        );
        for (const results of $resultsMap.values()) {
            for (const r of results) {
                if (r.representativeCard && !map.has(r.archetype)) {
                    map.set(r.archetype, r.representativeCard);
                }
            }
        }
        return map;
    },
);
```

This way the card map only recomputes when the archetype config changes, not on every filter toggle.

---

## Dead Code

### 9. `FilterPanel.svelte` `onMount` has redundant date-range filters

**File:** `src/lib/components/FilterPanel.svelte` — `onMount` block, lines 43–59
**Severity:** Dead code / confusion
**Confidence:** 85%

#### What's wrong

The `tournaments` derived (lines 34–41) already filters by `$settings.format`, `$settings.dateFrom`, and `$settings.dateTo`. Inside `onMount`, the `settings.update` callback re-applies date filters:

```typescript
.filter(
    (t) =>
        (!s.dateFrom || t.date >= s.dateFrom) &&
        (!s.dateTo || t.date <= s.dateTo) &&
        !excludeIds.has(t.id) &&
        (minRank === 0 || importanceRank(t.importance) >= minRank),
)
```

The date conditions are always true for every element in `tournaments` — they can never filter anything out because `tournaments` already excludes items outside the date range. Only the `excludeIds` and `minRank` conditions do useful work.

#### Impact

No functional impact. But the redundant guards add confusion about intent and could mask a future bug if `tournaments` were later changed to not pre-filter by date.

#### Fix

Remove the redundant date guards:

```typescript
onMount(() => {
    const excludeIds = getInitialExcludeIds();
    settings.update((s) => {
        const minRank = importanceRank(s.minTier);
        return {
            ...s,
            selectedTournamentIds: tournaments
                .filter(
                    (t) =>
                        !excludeIds.has(t.id) &&
                        (minRank === 0 || importanceRank(t.importance) >= minRank),
                )
                .map((t) => t.id),
        };
    });
    // ... rest of onMount
});
```

---

## Not flagged (reviewed and found correct)

- Commander classification logic (`usedAsCommander`, `nameEqualsCommander`, DFC normalization via `getFrontFace`)
- `computeMatchRecords` in `fetch-tournament.ts` — bye handling and win/loss logic
- `updateFormatIndex` manual-override preservation logic
- `migrate-tournaments.ts` re-run safety (`^\d+\.json$` filter)
- `settingsQueryString` guard preventing premature URL serialization
- `searchParamsToSettings` deserialization logic
