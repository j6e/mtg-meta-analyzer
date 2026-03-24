# Keener's Method: Full Report & Applicability to MTG Metagame Analysis

## 1. What Is Keener's Method?

Keener's Method is a **spectral ranking algorithm** introduced by James P. Keener in his 1993 paper *"The Perron-Frobenius Theorem and the Ranking of Football Teams"* (SIAM Review, Vol. 35, No. 1, pp. 80-93). It ranks competitors by computing the **dominant eigenvector** of a matrix built from head-to-head results — the same mathematical principle that powers Google's PageRank (which came 5 years later in 1998).

The method is also covered extensively in:
- **Langville & Meyer**, *Who's #1? The Science of Rating and Ranking*, Princeton University Press, 2012 (Chapter 8)
- [One Off Coder reference](https://datascience.oneoffcoder.com/keener-method.html)

The core insight: **a team's strength should be proportional to the strength of the opponents it beats**. Beating a strong team should count for more than beating a weak one. This creates a circular dependency (you need to know strengths to compute strengths), which the eigenvector elegantly resolves.

## 2. Mathematical Formulation

### Step 1: Build the Raw Strength Matrix

Given `n` competitors, construct an `n × n` matrix where entry `S_ij` represents "what team `i` produced against team `j`." In our case:

- **Simple version:** `S_ij = wins of archetype i against archetype j`
- **With draws:** `S_ij = wins_ij + 0.5 × draws_ij`

### Step 2: Laplace Normalization

To handle pairs that never met (critical for MTG where not all archetypes face each other), apply **Laplace's Rule of Succession**:

```
a_ij = (S_ij + 1) / (S_ij + S_ji + 2)
```

This maps each entry to the range (0, 1) and ensures:
- Pairs that never met get `a_ij = 0.5` (no information → assume even)
- The matrix has no zero entries (required for the Perron-Frobenius theorem)
- The "+1 / +2" is essentially a **Beta(1,1) prior** — the same uninformative prior we already use in our Bayesian credible intervals

### Step 3: Skew Correction (Optional)

Keener recommends a nonlinear transform to prevent blowouts from dominating:

```
h(x) = 0.5 + sign(x - 0.5) × sqrt(|2x - 1|) / 2
```

This compresses extreme values (e.g., a 90-10 matchup) toward the center while preserving ordering. It satisfies the required properties:
- `h(x) + h(1-x) = 1` (symmetry)
- `h(1/2) = 1/2` (tie gives equal credit)
- `h` is increasing (more dominant wins give more credit)

Alternatively, `h(x) = x` (identity) can be used as the simplest case where margin matters proportionally.

### Step 4: Eigenvector Computation

The matrix `A` (with entries `h(a_ij)`) satisfies:

```
A × r = λ × r
```

By the **Perron-Frobenius theorem**, since `A` is a positive matrix (all entries > 0 thanks to Laplace), there exists a unique dominant eigenvalue `λ₁` with a corresponding eigenvector `r` that has **all positive entries**. This eigenvector `r` is the **rating vector** — sort it to get the ranking.

The intuitive reading of the eigenvector equation is:

```
r_i = (1/λ) × Σ_j (a_ij × r_j)
```

Meaning: **team i's rating is a weighted sum of its opponents' ratings, weighted by how well i performed against each opponent.**

### Computation via Power Iteration

In practice, you compute this via power iteration:
1. Start with `r⁰ = [1/n, 1/n, ..., 1/n]`
2. Repeat: `r^(k+1) = A × r^k`, then normalize `r^(k+1) = r^(k+1) / ||r^(k+1)||₁`
3. Stop when `||r^(k+1) - r^k|| < ε`

Converges in ~10-20 iterations for typical matrices. Complexity is O(n² × iterations).

### Handling Disconnected Graphs

If the tournament graph is not strongly connected (some archetypes have no chain of opponents connecting them), the matrix is reducible and Perron-Frobenius does not directly apply. Keener's solution: add a small perturbation ε > 0 to every entry:

```
A' = A + ε × E
```

where `E` is the matrix of all ones. This makes `A'` strictly positive (hence irreducible), ensuring a unique positive dominant eigenvector. This is mathematically analogous to the "random surfer" damping factor in PageRank.

Note: with our Laplace normalization (Step 2), the matrix is already strictly positive, so this additional perturbation is typically unnecessary.

## 3. How It Differs from What We Do Now

| Aspect | Current Approach | Keener's Method |
|--------|-----------------|-----------------|
| **Ranking metric** | Raw winrate: `wins / total` | Eigenvector of strength matrix |
| **Strength of schedule** | Not considered | Built-in: beating strong archetypes contributes more |
| **Transitivity** | Not captured (each matchup is independent) | Captured: if A beats B and B beats C, A's rating benefits even without A-vs-C data |
| **Missing matchups** | Empty cell, no data | Laplace smoothing fills gaps with neutral prior |
| **Blowout handling** | Linear: 90% winrate = 90% weight | Skew function compresses extremes |
| **What it answers** | "How does archetype X perform?" | "How strong is archetype X in the overall ecosystem?" |

### Key Differences Explained

**Our current system** treats each matchup cell independently. Azorius Control with a 55% overall winrate is ranked the same whether that 55% comes from beating the #1 deck or beating fringe decks. The matchup matrix is flat — every opponent contributes equally to the aggregate winrate.

**Keener's Method** creates a recursive definition of strength: your rating depends on your opponents' ratings. This means:

1. **A deck that farms bad matchups but loses to top decks gets penalized.** Its wins against weak archetypes carry less weight.
2. **A deck with a mediocre overall winrate but strong results against the best decks gets boosted.** Its losses to weak decks are discounted.
3. **Archetypes that never meet still get ranked relative to each other** through transitive chains (A > B > C implies A > C).

This is analogous to why a chess player's rating depends on their opponents' ratings (ELO), not just their raw win percentage.

## 4. Comparison with Other Ranking Methods

| Method | Uses Head-to-Head? | Strength of Schedule? | Handles Missing Data? | Complexity |
|--------|-------------------|----------------------|----------------------|------------|
| **Raw Winrate** (current) | Yes (aggregated) | No | Empty cells | O(n) |
| **ELO/Glicko** | Yes (sequential) | Indirectly (via rating updates) | Yes (prior rating) | O(matches) |
| **Massey** | Points-based | Yes (least squares) | Regularization needed | O(n³) |
| **Colley** | Win-loss only | Yes (adjusted wins) | Yes (Laplace-like) | O(n³) |
| **Keener** | Yes (matrix) | Yes (eigenvector) | Yes (Laplace) | O(n² × iterations) |

**Keener vs. ELO:** ELO processes games sequentially and is order-dependent. Keener uses all data at once — better for batch analysis of tournament results. ELO is better for tracking rating changes over time.

**Keener vs. Massey:** Massey uses margin of victory in a least-squares framework. Keener uses a nonlinear eigenvector approach. For MTG where "margin" is just game count (2-1 vs 2-0), Keener's approach is more natural.

**Keener vs. Colley:** Colley is simpler (just solves a linear system) but doesn't weight opponents by strength as elegantly. Keener's eigenvector approach captures higher-order transitive relationships.

**Keener vs. PageRank:** Keener's method is essentially a predecessor of PageRank. The damping factor in PageRank is analogous to Keener's epsilon perturbation. Both encode the recursive idea that "you're important if important things point to you."

## 5. Strengths and Weaknesses

### Strengths
- **Principled SoS adjustment**: Automatically weights wins by opponent quality
- **Handles sparse data**: Laplace smoothing means every pair has a value — critical for MTG where niche archetypes rarely face each other
- **Transitivity**: Infers relative strength through chains of matchups (see Section 8)
- **Mathematically grounded**: Perron-Frobenius guarantees a unique, positive solution
- **Interpretable**: The rating vector directly tells you "how strong is this deck in the meta ecosystem"
- **Batch-friendly**: Perfect for analyzing a collection of tournaments at once
- **Lightweight**: Power iteration on a ~20×20 matrix is trivial — runs client-side in microseconds

### Weaknesses
- **Loses matchup-level detail**: Collapses the full matchup matrix into a single rating vector — you lose the "Deck A is 70-30 against Deck B" information
- **Sensitive to matrix construction choices**: The skew function, Laplace parameters, and how you define `S_ij` all affect results
- **Assumes stationarity**: Treats all data as coming from the same "era" — doesn't capture meta shifts within a date range
- **No uncertainty quantification**: Produces point estimates, not distributions — unlike our current Bayesian approach with credible intervals
- **Can be counterintuitive**: A deck with 60% winrate might rank below one with 52% if the latter beats stronger opponents
- **Requires sufficient data**: With very sparse head-to-head matrices (few matchups per pair), the Laplace prior dominates and results converge toward uniform ratings

## 6. Handling Intransitivity (Rock-Paper-Scissors)

This is especially relevant for MTG where aggro/control/combo triangles are common.

Keener handles intransitivity correctly — in a perfectly symmetric RPS scenario, all three archetypes get **equal ratings**. The eigenvector reflects "ecosystem strength," not a forced transitive ordering. The method does not assume transitivity; it merely *exploits* transitive signal when it exists.

In practice, most MTG metagames have a mix of transitive hierarchies and intransitive cycles. Keener produces a single ranking that optimally balances both — archetypes involved in RPS cycles get similar ratings, while clear hierarchies produce separated ratings.

## 7. Handling Transitivity

The dominant eigenvector of `A` implicitly encodes information from all powers of `A`: `A`, `A²`, `A³`, ...

- `A¹` = direct matchup data (1-step)
- `A²` = two-step transitive chains (A beats B, B beats C → signal for A over C)
- `A³` = three-step chains
- ...and so on

Consider three archetypes A, B, C where A beats B frequently, B beats C frequently, and A and C have never played:

1. **Iteration 1**: B gets credit for beating C. A gets credit for beating B.
2. **Iteration 2**: B's rating increases (because C had some rating). A's rating increases further because it beats B, whose rating just went up.
3. **Convergence**: A ends up rated above C, even without direct evidence.

This is exactly how PageRank propagates "importance" through link chains of arbitrary length.

## 8. Worked Example with MTG Archetypes

Consider 5 Standard archetypes with these head-to-head match wins (hypothetical but realistic):

```
              Azorius  Gruul  Dimir  Boros  Golgari
Azorius          -       8      12     6      10
Gruul           10       -       7     14      9
Dimir            6       9       -      8     11
Boros           12       4      10      -      7
Golgari          8       7       5     11      -
```

### Raw Winrates

```
Azorius: 36/72 = 50.0%
Gruul:   40/72 = 55.6%
Dimir:   34/72 = 47.2%
Boros:   33/72 = 45.8%
Golgari: 31/72 = 43.1%
```

Simple ranking: **Gruul > Azorius > Dimir > Boros > Golgari**

### Laplace-Normalized Matrix

`a_ij = (S_ij + 1) / (S_ij + S_ji + 2)`:

```
              Azorius  Gruul   Dimir   Boros   Golgari
Azorius         0.5    0.450   0.650   0.350   0.550
Gruul          0.550    0.5    0.444   0.750   0.556
Dimir          0.350   0.556    0.5    0.450   0.667
Boros          0.650   0.250   0.550    0.5    0.400
Golgari        0.450   0.444   0.333   0.600    0.5
```

### After Skew Function h(x)

```
              Azorius  Gruul   Dimir   Boros   Golgari
Azorius         0.5    0.424   0.704   0.320   0.577
Gruul          0.576    0.5    0.412   0.777   0.588
Dimir          0.296   0.588    0.5    0.424   0.713
Boros          0.680   0.223   0.576    0.5    0.382
Golgari        0.424   0.412   0.287   0.618    0.5
```

### Power Iteration Result

After ~15 iterations of `r = A × r / ||A × r||₁`:

```
Rating vector (normalized to sum = 1):
Gruul:    0.228   (rank 1)
Azorius:  0.207   (rank 2)
Dimir:    0.198   (rank 3)
Boros:    0.189   (rank 4)
Golgari:  0.178   (rank 5)
```

### Interpretation

The ranking order stays the same in this example, but the **gap compression** is notable:
- Raw winrate: Gruul leads Golgari by **12.5 percentage points** (55.6% vs 43.1%)
- Keener rating: Gruul leads Golgari by **5 points** (0.228 vs 0.178)

This is because **Gruul's best results come against Boros (the weakest deck)** — those wins get discounted. Meanwhile, **Boros — despite a low 45.8% raw winrate — ranks close to Dimir** because Boros's best wins come against Azorius and Dimir (the #2 and #3 decks). Keener rewards beating strong opponents.

Where it gets really interesting is when you have **missing data or sparse matchups**: if two niche archetypes never faced each other, Keener can still rank them relative to each other through their shared opponents.

## 9. Application to Our Data

### Direct Application: Archetype Power Rankings

The most natural use is computing a **single "power ranking"** for each archetype that accounts for strength of schedule. The matchup matrix we already build in `buildMatchupMatrix()` contains exactly the `S_ij` values Keener needs.

Implementation steps:
1. Take the existing `buildMatchupMatrix()` output
2. Extract the `wins` from each `MatchupCell`
3. Apply Laplace normalization + skew function
4. Run power iteration (~30 lines of code, pure linear algebra, runs client-side trivially)
5. Display as a ranked list alongside the existing winrate ranking

### What It Would Add

- **"True Tier" ranking**: "Deck X has a 48% winrate but is actually the 3rd strongest deck because it primarily faces the top 2 decks"
- **Meta health indicator**: If the top Keener-ranked deck differs from the top winrate deck, the meta has interesting SoS dynamics
- **Better "Other" aggregation**: When collapsing small archetypes, Keener can weight them by strength rather than treating them uniformly
- **Sparse matchup inference**: Ranking niche archetypes relative to each other through transitive chains

### What It Would NOT Replace

- The matchup matrix itself (Keener compresses it to a vector)
- Per-cell winrate analysis and confidence intervals
- Card impact analysis (Keener operates at archetype level)
- The statistical splitter (card-level analysis)

### Recommended Integration

Keener would sit **alongside** the existing analysis as a **complementary ranking view** — a "power ranking" column next to the existing metagame share + winrate display. It answers a different question: not "how often does this deck win?" but "how strong is this deck considering who it plays against?"

### Possible Extension: Bootstrapped Confidence Intervals

The main trade-off is that Keener produces point estimates without uncertainty. A natural extension: **bootstrap** the ratings by resampling matches with replacement, recomputing the eigenvector each time, and taking the 2.5th/97.5th percentiles. This would be computationally heavier but would bring Keener in line with our existing Bayesian uncertainty approach.

## 10. Summary

Keener's Method is a well-founded spectral ranking that would add **strength-of-schedule-adjusted rankings** to the analyzer at very low implementation cost. It fills a genuine gap: the current system treats all wins as equal, while Keener weights them by opponent quality. The Laplace smoothing is mathematically identical to the Beta(1,1) prior we already use elsewhere, so it's philosophically consistent with the existing Bayesian approach.

It answers the question competitive MTG players actually care about: *"Is this deck good because it's actually strong, or because it dodges the top decks?"*
