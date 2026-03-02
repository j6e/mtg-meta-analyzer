# Statistical Audit Log

Last audited: 2026-03-02

## High Severity

### H1. Draws create inconsistency between CIs and displayed winrate

**File:** `src/lib/utils/statistical-splitter.ts:42`

`credibleInterval(row.totalWins, row.totalLosses)` drops draws from the Beta posterior, but the displayed `overallWinrate` includes draws in the denominator (`wins / (wins+losses+draws)`). The CI mean can differ from the point estimate.

**Fix options:** (a) Model draws as half-wins: `Beta(1 + wins + 0.5*draws, 1 + losses + 0.5*draws)`, or (b) make the displayed winrate conditional on decisive outcomes only.

### H2. Cumulative mode pairwise comparisons use overlapping groups

**File:** `src/lib/utils/statistical-splitter.ts:94-106`

In cumulative split mode (">=1", ">=2", ">=3"...), each group is a superset of the next. P(A>B) pairwise comparisons between adjacent groups share most of their data, making the comparison statistically invalid.

**Fix:** Skip pairwise comparisons in cumulative mode, or compare each ">=N" group against its complement "<N".

### H3. Pairwise Fisher's tests in auto-scan lose power vs. omnibus test

**File:** `src/lib/utils/statistical-splitter.ts:189-214`

With k groups per card generating C(k,2) pairs across hundreds of cards, BH correction carries a heavy burden (potentially 1000+ tests). A single omnibus test (chi-squared / Kruskal-Wallis) per card followed by post-hoc pairwise tests would be more powerful. Current approach is valid but conservative.

## Medium Severity

### M1. Population variance instead of sample variance

**File:** `src/lib/utils/card-impact.ts:166`

Divides by `n` instead of `n-1`. With the enforced minimum of 30 observations the distortion is <1.7%, but technically incorrect.

### M2. Comment says "Jeffreys-like" but prior is Uniform

**File:** `src/lib/algorithms/statistics.ts:155`

Uses Beta(1,1) = Uniform prior, not Jeffreys Beta(0.5, 0.5). The documentation is misleading.

### M3. Normal CI (z=1.96) may under-cover for small samples

**File:** `src/lib/algorithms/logistic-regression.ts:188`

Laplace (normal) approximation for credible intervals. For 30-200 observations with up to 12 features, intervals may be narrower than they should be.

### M4. Impact score on standardized coefficients obscures per-copy meaning

**File:** `src/lib/algorithms/logistic-regression.ts:190`

Two cards with the same standardized coefficient but different variance (e.g., 0-vs-4 copies vs 3-vs-4 copies) get the same impact score despite very different practical implications. Consider also reporting the unstandardized coefficient or impact per copy.

### M5. Max-copies across tournaments in splitter

**File:** `src/lib/utils/winrate-splitter.ts:44`

`countCardCopies` takes `Math.max` across tournaments for a player. If a player changed decks between events, their match results get misclassified.

### M6. BH correction scope differs between manual view and auto-scan

**File:** `src/lib/utils/statistical-splitter.ts`

Manual card-by-card exploration in `computeStatistics` applies BH only within that card's cells, while auto-scan applies BH globally. Users inspecting many cards manually may find false positives.

## Low Severity

### L1. Bisection for betaQuantile instead of Newton

**File:** `src/lib/algorithms/statistics.ts:125`

Negligible performance impact for current use cases.

### L2. choleskyInverse recomputes Cholesky per column

**File:** `src/lib/algorithms/linalg.ts:213`

Fine for p <= 16.

### L3. Pseudo-R² can go negative

**File:** `src/lib/algorithms/logistic-regression.ts:175`

Correct but potentially confusing to display.
