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

## The Correction: Linear De-bias with Confidence Shrinkage

A two-step process that (1) removes the systemic bias and (2) accounts for
sample size.

### Step 1 — Remove systemic bias

Compute the metagame-share-weighted average win rate across all archetypes:

```
            Σ (share_i × raw_wr_i)
raw_avg = ─────────────────────────
               Σ share_i
```

where `share_i = player_count_i / total_players` and
`raw_wr_i = wins_i / (wins_i + losses_i + draws_i)`.

The uniform bias is the gap between this average and the expected 50%:

```
bias = raw_avg − 0.5
```

De-bias each archetype by subtracting the bias:

```
debiased_i = raw_wr_i − bias
```

After this step, the weighted average of `debiased_i` is exactly 50%.
All relative differences between archetypes are preserved — we've only
shifted the entire distribution down.

### Step 2 — Confidence shrinkage toward 50%

The de-biased win rate still has noise, especially for low-sample archetypes.
An archetype with 18 matches could easily show 44% or 60% by chance alone.

We shrink each archetype's deviation from 50% proportionally to our confidence
in its sample:

```
                                         N_i
adjusted_i = 0.5 + (debiased_i − 0.5) × ─────────
                                         N_i + K
```

where:
- `N_i` = total matches for archetype i
- `K` = **median N** across all archetypes with data

The factor `N_i / (N_i + K)` is the **confidence weight**:

| N_i vs K | Confidence | Effect |
|---|---|---|
| N_i >> K | → 1.0 | Keep full deviation from 50% (strong signal) |
| N_i = K  | = 0.5 | Keep half the deviation |
| N_i << K | → 0.0 | Regress almost entirely to 50% (weak signal) |

### Why K = median N

The median is the "typical" archetype's sample size in the dataset. This means:
- An archetype with typical representation keeps ~50% of its signal
- Larger archetypes (top of the meta) keep proportionally more
- Fringe archetypes with handful of matches are appropriately skepticized

The median derives from the data itself — no manual tuning required.

### Combined formula

Putting both steps together:

```
                                                        N_i
adjusted_i = 0.5 + (raw_wr_i − raw_avg) × ─────────
                                           N_i + K
```

Note that `raw_wr_i − raw_avg = raw_wr_i − (0.5 + bias) = debiased_i − 0.5`,
so the two steps collapse into a single expression.

### Properties

1. **Weighted average = 50%** — the systemic top-32 inflation is fully removed
2. **Relative ordering preserved** — if deck A had higher raw WR than deck B
   (and both have sufficient data), A will still be higher after adjustment
3. **Small samples regress to 50%** — we don't make strong claims about
   archetypes with few matches
4. **Large samples barely change** — high-N archetypes keep their signal
5. **Single parameter (K)** — derived from data, not manually tuned

## Pseudocode

```
function correct_winrates(archetypes):
    # Step 1: compute bias
    raw_avg = weighted_average(
        values = [a.wins / a.total for a in archetypes],
        weights = [a.metagame_share for a in archetypes]
    )
    bias = raw_avg - 0.5

    # Step 2: choose K
    K = median([a.total for a in archetypes if a.total > 0])

    # Step 3: adjust each archetype
    for a in archetypes:
        debiased = a.wins / a.total - bias
        confidence = a.total / (a.total + K)
        a.adjusted_wr = 0.5 + (debiased - 0.5) * confidence

    return archetypes
```

## Worked Example (Pioneer, March 2026)

Input: 30 tournaments, 245 top-32 players, standings W-L-D = 3380-2596-0.

```
raw_avg = 56.4%
bias    = 56.4% − 50.0% = 6.4pp
K       = 289  (median matches per archetype)
```

| Archetype | Share | Raw WR | Debiased | Conf | Adjusted |
|---|---|---|---|---|---|
| Izzet Prowess | 21.6% | 56.2% | 49.8% | 83% | 49.8% |
| Azorius Control | 6.9% | 61.7% | 55.4% | 60% | 53.2% |
| Dimir Self-Bounce | 1.6% | 49.4% | 43.0% | 35% | 47.6% |
| Mono-Green Devotion | 1.2% | 44.4% | 38.1% | 6% | 49.3% |

- **Izzet Prowess** (N=1462, conf=83%): barely changes — strong signal says
  it's a ~50% deck after de-biasing.
- **Azorius Control** (N=431, conf=60%): raw 61.7% is the highest, adjusted
  53.2% still shows it's the best-performing deck, but tempered.
- **Dimir Self-Bounce** (N=154, conf=35%): flat de-bias gives 43.0% which
  seems too harsh; confidence shrinkage pulls it back toward 50% → 47.6%.
- **Mono-Green Devotion** (N=18, conf=6%): almost fully regressed to 50% —
  we simply don't have enough data to say anything about this deck.
