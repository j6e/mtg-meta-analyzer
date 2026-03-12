# /archetypes Page Performance — Investigation & Fixes

## Investigation Summary

The /archetypes route is slow due to a reactive dependency chain with no memoization in `src/lib/stores/tournaments.ts`:

```
settings change → filteredTournaments → classificationResults → playerArchetypes → metagameData
```

Any filter change (format, date, tier, etc.) triggers the entire chain to recompute.

### Bottleneck 1: KNN Classification (`classifyAllPooled`)
- **Location**: `src/lib/stores/tournaments.ts` ~lines 142-154
- Re-runs on every `filteredTournaments` or `activeArchetypeConfig` change
- Rebuilds TF-IDF corpus from scratch each time (all decklists → vocabulary → IDF)
- Vectorizes every unclassified deck against the full corpus
- Computes cosine similarity against ALL labeled training points
- With 2,000-8,000 filtered decklists, this is very expensive

### Bottleneck 2: Matchup Matrix (`buildMatchupMatrix`)
- **Location**: `src/lib/utils/winrate-calculator.ts`
- Iterates all tournaments/rounds/matches multiple times
- O(n²) archetype matrix construction
- Rebuilt on every settings change

### Bottleneck 3: No Caching
- TF-IDF corpus and KNN results are rebuilt every time
- Same decklists get re-classified even when nothing about them changed

## Recommended Fixes (priority order)

### Fix 1: Cache classification results per decklist
- Hash decklist contents and cache the archetype label
- KNN doesn't need to re-run for already-classified decks
- **Impact**: Eliminates redundant classification on filter changes

### Fix 2: Decouple display settings from classification
- Changes to `topN`, `minMetagameShare`, `excludeMirrors` should NOT re-trigger classification
- Only filter/format/date changes should trigger reclassification
- Matrix filtering can happen downstream without full recompute
- **Impact**: Most user interactions become instant

### Fix 3: Memoize TF-IDF corpus
- Only rebuild corpus when the actual training set changes
- Cache corpus keyed by the set of decklists used to build it
- **Impact**: Saves the most expensive single computation

### Fix 4: Debounce filter changes
- Avoid rapid recomputation when users adjust multiple filters in sequence
- **Impact**: Prevents cascading recomputes during interaction
