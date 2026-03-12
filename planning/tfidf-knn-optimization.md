# TF-IDF & KNN Computational Optimization

## Investigation Summary

The TF-IDF and KNN implementations are **algorithmically correct** but have significant computational inefficiencies that compound in the hot path of the /archetypes page.

### Current Data Scale
- 133 tournament JSON files across 5 formats
- ~50-200 decklists per tournament
- Filtered view: 2,000-8,000 decklists
- KNN inner loop: ~500 unclassified × ~5,000 labeled = 2.5M similarity computations

## Issues & Improvements

### Issue 1: Full sort for top-k selection (HIGH)
- **Location**: `src/lib/algorithms/knn.ts:39`
- **Problem**: `similarities.sort()` is O(n log n) to find top-k neighbors
- **Fix**: Use a min-heap of size k or quickselect algorithm → O(n log k)
- With k=5 and n=5,000: sort does ~60k comparisons vs ~15k with a heap

### Issue 2: Map allocation per cosine similarity call (HIGH)
- **Location**: `src/lib/algorithms/cosine-similarity.ts:41`
- **Problem**: `cosineSimilaritySparse` creates a new `Map` on every call — this is the innermost function, called ~2.5M times
- **Fix**: Pre-normalize vectors to unit length at vectorization time. Cosine similarity then becomes a sparse dot product (no Map, no norm computation)

### Issue 3: Norm recomputation every call (HIGH)
- **Location**: `src/lib/algorithms/cosine-similarity.ts:42-58`
- **Problem**: Each labeled vector's norm is recomputed every time it's compared to a new target. A labeled vector compared against 500 unclassified vectors has its norm computed 500 times.
- **Fix**: Pre-compute norms once during vectorization, or pre-normalize to unit vectors (eliminates norms entirely)

### Issue 4: Object allocation in KNN loop (MEDIUM)
- **Location**: `src/lib/algorithms/knn.ts:33`
- **Problem**: `.map()` creates a new `{label, similarity}` object per labeled point per classification call — 2.5M short-lived objects cause GC pressure
- **Fix**: Reuse a pre-allocated buffer array, or inline the top-k selection to avoid materializing the full array

## Implementation Plan

### Step 1: Pre-normalize vectors + reuse target map (fixes Issues 2 & 3) ✅
- In `vectorize()` (`src/lib/algorithms/tfidf.ts`), normalize vectors to unit length
- In `knnClassify()` (`src/lib/algorithms/knn.ts`), build target Map once and reuse across all labeled point comparisons
- Replaced `cosineSimilaritySparse` with `dotWithMap` — no per-call Map allocation, no norm computation
- Added `dotSparse` to `cosine-similarity.ts` for general use

### Steps 2 & 3: Min-heap + single pass (fixes Issues 1 & 4) ✅
- Replaced `.map()` + `.sort()` + `.slice()` with a single-pass min-heap of size k
- Iterate labeled points once, computing dot product and maintaining only the k best
- O(n log k) instead of O(n log n), zero intermediate object allocations

## Benchmarks

Benchmark script: `scripts/bench-classifier.ts` (5 iterations per scenario)

Run after each optimization: `bun run scripts/bench-classifier.ts`

### Baseline (before any changes)

| Scenario | Tournaments | Decklists | Mean (ms) | Std Dev (ms) |
|---|---:|---:|---:|---:|
| Standard, Feb 09 → Mar 11, Premier | 8 | 3677 | 7107.8 | 126.5 |
| Standard, Feb 09 → Mar 11, All | 36 | 5705 | 17459.8 | 284.1 |
| Standard, Jan 01 → Mar 11, Premier | 14 | 6653 | 27642.8 | 294.8 |

### After Step 1: Pre-normalize + reuse target map (~2.7x speedup)

| Scenario | Tournaments | Decklists | Mean (ms) | Std Dev (ms) | Speedup |
|---|---:|---:|---:|---:|---:|
| Standard, Feb 09 → Mar 11, Premier | 8 | 3677 | 2664.0 | 49.5 | 2.67x |
| Standard, Feb 09 → Mar 11, All | 36 | 5705 | 6353.2 | 109.5 | 2.75x |
| Standard, Jan 01 → Mar 11, Premier | 14 | 6653 | 10243.0 | 326.0 | 2.70x |

### After Steps 2 & 3: Min-heap + single pass (~4.4x total speedup from baseline)

| Scenario | Tournaments | Decklists | Mean (ms) | Std Dev (ms) | vs Baseline | vs Step 1 |
|---|---:|---:|---:|---:|---:|---:|
| Standard, Feb 09 → Mar 11, Premier | 8 | 3677 | 1630.2 | 30.0 | 4.36x | 1.63x |
| Standard, Feb 09 → Mar 11, All | 36 | 5705 | 3941.0 | 36.6 | 4.43x | 1.61x |
| Standard, Jan 01 → Mar 11, Premier | 14 | 6653 | 6451.5 | 184.6 | 4.28x | 1.59x |

### Where time goes now (after Steps 1-3)

All 4 original algorithmic issues are resolved. Profiling the Premier scenario (3677 decklists, 1630ms):

- ~70% of decks classified by signature cards → ~2500 labeled, ~1100 unclassified
- KNN inner loop: 1100 unclassified × 2500 labeled = **2.75M dot product calls**
- Each `dotWithMap` call: iterate ~20 sparse entries with `Map.get()` hash lookups
- `buildCorpus` + `vectorize` together are ~5-10% of total time
- **The remaining bottleneck is the sheer number of comparisons in KNN**

## Further Optimization Proposals

### Proposal A: Centroid classification instead of KNN (~100x reduction in comparisons)

**Idea**: Instead of comparing each unclassified deck against every labeled deck, compute the **mean vector (centroid)** of each archetype from its labeled examples, then classify by nearest centroid.

**Why it works for MTG**: Archetype clusters are tight — decks in the same archetype share 50+ of their 60 cards. The centroid represents the "average list" very accurately. Within-archetype variation (e.g., 2 copies of a flex slot vs 3) is small relative to between-archetype differences.

**Complexity change**:
- Current KNN: 1100 unclassified × 2500 labeled = **2.75M** comparisons
- Centroid: 1100 unclassified × ~25 archetypes = **27,500** comparisons
- That's a **100x reduction** in the classification step

**Implementation**:
1. After vectorizing labeled decks, group vectors by archetype label
2. Compute centroid per archetype: element-wise mean of all vectors in the group
3. Normalize each centroid to unit length
4. For each unclassified deck, compute dot product against each centroid
5. Assign the archetype of the nearest centroid

**Confidence scoring**: Use the ratio of distance to nearest vs second-nearest centroid (or absolute similarity to nearest). This replaces the KNN "average similarity of winning label's neighbors" metric.

**Tradeoff**: Less nuanced for edge-case decks that sit between archetypes. KNN with k=5 can capture "3 neighbors say Aggro, 2 say Midrange" granularity. Centroid classification is a hard assignment to whichever centroid is closest. For MTG, this is usually fine — archetypes are well-separated clusters.

**Estimated impact**: ~100x on classification step → total pipeline could drop from ~1600ms to ~50-100ms for the Premier scenario.

### Proposal B: Dense Float64Array vectors instead of sparse tuples (~2-3x on dot product)

**Idea**: Replace `SparseVector = [number, number][]` (array of heap-allocated 2-element tuples) with dense `Float64Array` vectors.

**Why it helps**: The vocabulary is ~300-500 unique cards. A dense Float64Array of 500 floats is only 4KB — trivially small. The dot product becomes a tight numeric loop over contiguous memory with no Map lookups, no tuple destructuring, and no hash table overhead. V8's JIT can potentially auto-vectorize this with SIMD.

**Current sparse dot product** (per call):
```
for each of ~20 entries in labeled vector:
  → destructure [idx, val] tuple (heap object access)
  → targetMap.get(idx) (hash lookup ~50ns)
  → multiply + accumulate
```

**Dense dot product** (per call):
```
for i = 0 to vocabSize:
  → a[i] * b[i] (contiguous memory, no branching)
```

Even though dense does 500 multiply-adds vs 20 meaningful sparse ones, the 480 zero multiplications are essentially free (no branch, no memory lookup). The cache locality and JIT-friendliness more than compensate.

**Implementation**:
1. Change `vectorize()` to return `Float64Array` of size `corpus.vocabulary.size`
2. Update `knnClassify` to use simple loop: `for (let i = 0; i < len; i++) dot += a[i] * b[i]`
3. No targetMap needed — just array indexing
4. Pre-normalization still applies (divide by L2 norm in vectorize)

**Tradeoff**: More memory per vector (~4KB vs ~320 bytes for 20-entry sparse). With ~6000 vectors that's ~24MB vs ~2MB. Negligible for a desktop app.

**Estimated impact**: ~2-3x speedup on the dot product step. Applies regardless of whether KNN or centroid is used.

### Proposal C: Fuse vectorize into corpus build (~5% saving)

**Idea**: Currently `buildCorpus()` iterates all decklists to compute vocabulary and IDF, then `vectorize()` is called separately for each decklist. Since `buildCorpus` already visits every card in every decklist, the TF values could be accumulated during that same pass.

**Implementation**:
1. During `buildCorpus`, for each decklist, also compute the raw TF vector (card counts / total)
2. After IDF is computed, multiply each stored TF vector by IDF and normalize
3. Return the corpus + all pre-computed vectors in one pass

**Tradeoff**: Slightly more complex API — `buildCorpus` returns vectors alongside the corpus. Minor coupling increase.

**Estimated impact**: Small (~5%). Eliminates redundant iteration over decklists but the per-card work (Map lookup for vocabulary index) is already fast. Worth doing as cleanup but not a meaningful performance win on its own.

## Recommendation

**Proposal A (centroid) is the clear winner** for a step-change improvement. It reduces the core bottleneck by ~100x with minimal quality tradeoff for well-clustered MTG data. Proposal B (dense vectors) stacks on top for another 2-3x. Proposal C is minor cleanup.

Combined, Proposals A + B could bring the Premier scenario from ~1600ms to **~20-50ms** — fast enough to feel instant on every filter change.
