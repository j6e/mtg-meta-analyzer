# Win Rate Correction for Top-32 Standings Data

## The Problem

MTGO publishes only **top-32 standings** (W-L-D records without pairings) and
**top-8 playoff brackets** (with full match results). This creates a
survivorship bias: top-32 players won matches against opponents who didn't make
the cut, inflating every archetype's observed win rate above 50%.

### Data structure per tournament

| Data source | What we see | Typical volume |
|---|---|---|
| Playoff brackets (top 8) | Full pairings: who played whom, match result | 7 matches |
| Swiss standings (top 32) | Per-player W-L-D record, no pairings | 32 players × ~6 swiss rounds |

### Where the bias comes from

In a closed system (all players visible), total wins = total losses. But we only
see the top 32. Their "extra" wins came from beating non-top-32 opponents:

```
surplus = Σ wins_i − Σ losses_i    (across all top-32 archetypes)
```

For Pioneer March 2026: `surplus = 3380 − 2596 = 784`. These 784 wins have no
corresponding losses in our dataset, inflating the observed average win rate from
50% to ~56.5%.

## The Correction

A three-step process that (1) removes the systemic bias, (2) anchors each
archetype on its unbiased round-data performance, and (3) accounts for sample
size via confidence shrinkage.

### Step 1 — Remove systemic bias (match-count-weighted)

Compute the global average win rate using match-count weighting:

```
            Σ wins_i
raw_avg = ───────────
            Σ total_i
```

This equals exactly 50% for closed-system data (paper tournaments with full
rounds), so only the standings-contributed surplus registers as bias.

The uniform bias is the gap between this average and 50%:

```
bias = raw_avg − 0.5
```

### Step 2 — Per-archetype prior from round data

When both paper (round-level) and standings data are available, the round data
provides an unbiased baseline for each archetype. We use it as a per-archetype
prior, shrunk toward 50% based on the round-data sample size.

The shrinkage function uses a squared form for aggressive suppression of
small samples:

```
              N_round²
f(N_round) = ────────────────
              N_round² + K_p²
```

where `K_p = 167` (calibrated so f(500) ≈ 0.9).

The per-archetype prior is:

```
prior_i = 0.5 × (1 − f(N_round_i)) + round_wr_i × f(N_round_i)
```

| Round N | f(N)  | Effect |
|---------|-------|--------|
| 20      | 0.01  | Prior ≈ 50% (too few matches to trust) |
| 50      | 0.08  | Prior ≈ 50% + 8% of paper signal |
| 100     | 0.26  | Modest paper influence |
| 200     | 0.59  | Paper dominates |
| 500     | 0.90  | Prior ≈ paper winrate |
| 800     | 0.96  | Prior ≈ paper winrate |

If no round data exists for an archetype (or round N = 0), the prior
defaults to 50%.

### Step 3 — Confidence shrinkage

Shrink each archetype's de-biased deviation from its prior proportionally to
our confidence in the combined sample:

```
                                                N_i
adjusted_i = prior_i + (raw_wr_i − raw_avg) × ─────────
                                                N_i + K
```

where:
- `N_i` = total matches for archetype i (round + standings combined)
- `K` = **median N** across all archetypes with data

The factor `N_i / (N_i + K)` is the **confidence weight**:

| N_i vs K | Confidence | Effect |
|---|---|---|
| N_i >> K | → 1.0 | Keep full deviation from prior (strong signal) |
| N_i = K  | = 0.5 | Keep half the deviation |
| N_i << K | → 0.0 | Regress almost entirely to prior (weak signal) |

### Why K = median N

The median is the "typical" archetype's sample size in the dataset. This means:
- An archetype with typical representation keeps ~50% of its signal
- Larger archetypes (top of the meta) keep proportionally more
- Fringe archetypes with handful of matches are appropriately skepticized

The median derives from the data itself — no manual tuning required.

### Properties

1. **De-biasing uses match-count weighting** — only the actual standings surplus
   counts as bias; no phantom bias from share-vs-count discrepancies
2. **Per-archetype priors** — archetypes with strong paper data anchor on their
   paper performance; archetypes with little paper data default to 50%
3. **Aggressive small-sample suppression** — the N² form ensures noisy paper
   estimates (N < 50) barely influence the prior
4. **Relative ordering preserved** — if deck A had higher raw WR than deck B
   (and both have sufficient data), A will still be higher after adjustment
5. **Large samples barely change** — high-N archetypes keep their signal
6. **Two parameters** — K (median, data-derived) and K_p = 167 (calibrated)

## Pseudocode

```
function correct_winrates(archetypes, round_archetypes=None):
    K_PRIOR = 167

    # Step 1: compute bias (match-count-weighted)
    raw_avg = sum(a.wins for a in archetypes) / sum(a.total for a in archetypes)

    # Step 2: choose K for confidence shrinkage
    K = median([a.total for a in archetypes if a.total > 0])

    # Step 3: adjust each archetype
    for a in archetypes:
        # Per-archetype prior from round data
        prior = 0.5
        if round_archetypes and a.name in round_archetypes:
            r = round_archetypes[a.name]
            if r.total > 0:
                f = r.total**2 / (r.total**2 + K_PRIOR**2)
                prior = 0.5 * (1 - f) + (r.wins / r.total) * f

        # De-bias + shrinkage
        confidence = a.total / (a.total + K)
        a.adjusted_wr = prior + (a.wins / a.total - raw_avg) * confidence

    return archetypes
```

## Worked Example (Modern, April 2026)

Input: paper + MTGO tournaments, Boros Energy has 17.9% metagame share.

```
raw_avg   = 51.5%   (match-count-weighted, combined data)
bias      = 1.5pp   (standings surplus)
K         = 900     (median matches per archetype)
K_PRIOR   = 167
```

| Archetype | Paper WR | Paper N | f(N) | Prior | Combined WR | Combined N | Conf | Adjusted |
|---|---|---|---|---|---|---|---|---|
| Boros Energy | 54.3% | 795 | 0.96 | 54.1% | 52.5% | 5192 | 0.85 | 54.9% |
| Jeskai Blink | 49.3% | 363 | 0.83 | 49.4% | 51.0% | 2419 | 0.73 | 49.0% |
| Fringe Deck | 60.0% | 20 | 0.01 | 50.1% | 55.0% | 80 | 0.08 | 50.4% |

- **Boros Energy** (paper N=795, f=0.96): prior ≈ 54.1% (anchored on paper).
  Combined data shows it slightly above average → adjusted stays near paper level.
- **Jeskai Blink** (paper N=363, f=0.83): prior ≈ 49.4%. Combined data
  confirms it's near-average.
- **Fringe Deck** (paper N=20, f=0.01): prior ≈ 50%. Despite a flashy 60%
  paper rate, too few matches to trust → regresses to 50%.

## Evolution from v1

The original method (v1) used a fixed 50% prior for all archetypes and
metagame-share-weighted averaging for bias computation. This worked well for
pure standings analysis but had two issues with mixed paper + standings data:

1. **Share-weighted bias** could differ from the true match-count-weighted
   bias, creating phantom corrections in paper data (where the true average
   is 50% by construction).
2. **Fixed 50% prior** ignored strong paper signals — an archetype at 54%
   across 800 paper matches would get pulled toward 50% when standings data
   was added, even though the paper estimate was trustworthy.

The current method (v2) addresses both by using match-count-weighted averaging
and per-archetype priors derived from round data with N²-form shrinkage.
