# Ranking Algorithms for Competitive Games: A Survey for MTG Metagame Analysis

A comprehensive survey of ranking algorithms used in sports, their mathematical foundations, and how they apply to ranking MTG archetypes from head-to-head matchup data.

## Table of Contents

1. [Overview & Taxonomy](#1-overview--taxonomy)
2. [PageRank / Markov Random Walk](#2-pagerank--markov-random-walk)
3. [Massey's Method](#3-masseys-method)
4. [Colley's Method](#4-colleys-method)
5. [Bradley-Terry Model](#5-bradley-terry-model)
6. [ELO Rating System](#6-elo-rating-system)
7. [TrueSkill](#7-trueskill)
8. [Offense-Defense (OD) Rating](#8-offense-defense-od-rating)
9. [HITS Algorithm](#9-hits-algorithm-hubs-and-authorities)
10. [Copeland Method & Weighted Majority](#10-copeland-method--weighted-majority)
11. [Rank Aggregation](#11-rank-aggregation)
12. [Generative vs. Descriptive Models](#12-generative-vs-descriptive-models)
13. [Comparison Matrix](#13-comparison-matrix)
14. [Application to MTG Archetype Ranking](#14-application-to-mtg-archetype-ranking)
15. [Recommendations](#15-recommendations)
16. [References](#16-references)

---

## 1. Overview & Taxonomy

Ranking algorithms for pairwise competition data fall into two broad families:

**Descriptive (algorithmic) methods** — summarize observed results into a ranking vector:
- PageRank / Markov random walk
- Keener's method (see `keeners-method.md`)
- Massey's method
- Colley's method
- Copeland / weighted majority
- HITS
- Offense-Defense rating

**Generative (probabilistic) methods** — posit a model for how outcomes are generated, then estimate parameters:
- Bradley-Terry model
- ELO / Glicko / Glicko-2
- TrueSkill

This distinction matters: generative models can make predictions with uncertainty estimates, while descriptive models produce rankings without a probabilistic interpretation (see [Section 12](#12-generative-vs-descriptive-models)).

---

## 2. PageRank / Markov Random Walk

### Origin

Brin & Page, *"The Anatomy of a Large-Scale Hypertextual Web Search Engine"* (1998). Adapted to sports by Govan & Meyer (2006, NC State), Callaghan, Porter & Mucha (2007), Park & Newman (2005).

Also covered in: Langville & Meyer, *Who's #1? The Science of Rating and Ranking* (Princeton University Press, 2012).

### Core Idea

Imagine a "random voter" walking through archetypes. At each step, the voter is at archetype *i* and moves to archetype *j* with probability proportional to how convincingly *j* beat *i*. The long-run fraction of time spent at each archetype is its ranking score.

### Mathematical Formulation

Given *n* archetypes with matchup data, construct a directed graph where losses create edges (loser "endorses" winner).

**Adjacency matrix**: `A_ij = number of times archetype i lost to archetype j`

**Row-stochastic transition matrix**:
```
H_ij = A_ij / Σ_k A_ik
```

If archetype *i* has never lost (undefeated), replace the zero row with `1/n` for all entries (dangling node fix).

**Google matrix** (with damping factor *d*, typically 0.85):
```
G = d × S + (1 - d) × (1/n) × E
```

where `S` is `H` with dangling rows fixed, and `E` is the all-ones matrix.

The **PageRank vector** `π` is the stationary distribution:
```
π^T × G = π^T,   Σ_i π_i = 1
```

### The Damping Factor

The damping factor *d* has a specific interpretation:
- **d = 1**: Pure transitive ranking from game graph only. Can be unstable with sparse data.
- **d = 0**: All teams equal (uniform distribution).
- **d = 0.85** (web default): Heavy weight on transitive evidence, light uniform prior.
- **d = 0.50–0.60**: Found by Govan & Meyer to give better predictive accuracy for NFL. Lower damping = more regularization = better for sparse graphs.

**Rule of thumb**: Dense schedules (round-robin) → d = 0.80–0.90. Sparse schedules (Swiss, NFL) → d = 0.50–0.70.

### Incorporating Margin of Victory

The basic binary model treats all wins equally. Weighted variants:

**Score-based fractional edges** (Callaghan et al.):
```
For a match where j beats i with scores s_j, s_i:
  A_ij += s_j / (s_i + s_j)    [credit from loser to winner]
  A_ji += s_i / (s_i + s_j)    [partial credit for close loss]
```

**Margin-weighted** (for MTG best-of-3):
```
A_ij += f(games_won_by_j - games_won_by_i)
```
where `f` could be linear, `log(1+x)`, or `sqrt(x)` to compress blowouts.

**Sigmoid scaling**:
```
A_ij = 1 / (1 + exp(-k × (s_j - s_i)))
```

### Handling Draws

```
For a draw between i and j:
  A_ij += 0.5
  A_ji += 0.5
```

### Computation

Power iteration: `π^(k+1) = π^(k) × G`, starting from uniform. Converges in ~30 iterations for sports-sized problems. For a 20×20 archetype matrix, this is microseconds.

### Relation to Keener's Method

PageRank is essentially Keener's method (1993) with an explicit damping/teleportation mechanism. Both compute the dominant eigenvector of a matrix derived from game results. Key differences:

| Aspect | PageRank | Keener |
|--------|----------|--------|
| Matrix type | Row-stochastic (Markov chain) | Nonnegative (Perron-Frobenius) |
| Regularization | Explicit damping factor (1-d) | Implicit via Laplace smoothing |
| Information flow | One-directional (loser → winner) | Bidirectional (both get nonzero entries) |
| MOV handling | Must be added via edge weighting | Built into comparison function h(x) |
| Interpretation | Probability (stationary distribution) | Ordinal (relative magnitude) |

### Sports Applications

- Govan & Meyer (2006): Ranking NFL teams
- Callaghan et al. (2007): NCAA Division I-A football
- Park & Newman (2005): US college football network analysis
- Radicchi et al. (2011): Professional tennis player ranking (PLoS ONE)
- Lazova & Basnarkov (2015): FIFA national team ranking
- Xia et al. (2014): BCS ranking comparison

---

## 3. Massey's Method

### Origin

Kenneth Massey, *"Statistical Models Applied to the Rating of Sports Teams"* (1997 undergraduate honors thesis, Bluefield College). One of the BCS computer polls (1999–2013). Formalized in Langville & Meyer (2012).

### Core Idea

A **least-squares** approach. The fundamental assumption: for any match between archetype *i* and archetype *j*, the point differential should be approximated by the difference in their ratings:

```
r_i - r_j ≈ y_k   (observed point differential in match k)
```

Find the ratings that best explain all observed differentials simultaneously.

### Mathematical Formulation

Given *n* archetypes and *m* matches:

- **X**: an `m × n` design matrix. For match *k* between *i* and *j*: `X_ki = +1`, `X_kj = -1`, all others 0.
- **y**: `m × 1` vector of point differentials.
- **r**: `n × 1` unknown rating vector.

The overdetermined system `Xr = y` is solved via least squares. The **normal equations**:

```
M × r = p

where:
  M = X^T × X   (the Massey matrix)
  p = X^T × y   (right-hand side vector)
```

### Structure of the Massey Matrix

`M` is a **graph Laplacian** of the game graph:
- `M_ii = t_i` (total matches played by archetype *i*)
- `M_ij = -n_ij` (negative of matches between *i* and *j*)

The vector `p`:
- `p_i` = cumulative point differential for archetype *i* across all matches

### The Singularity Problem

`M` is always **singular** (graph Laplacians have eigenvalue 0 with eigenvector `1`). Ratings are defined only up to a constant shift.

**Fix**: Replace the last row of `M` with all ones, and the last entry of `p` with zero. This imposes `Σ r_i = 0` (ratings centered at zero). The modified system has a unique solution if the game graph is connected.

### Offense-Defense Decomposition

Each archetype gets two ratings:
- `o_i`: offensive rating (ability to win games)
- `d_i`: defensive rating (ability to not lose)
- Overall: `r_i = o_i - d_i`

The model:
```
points scored by i against j ≈ o_i + d_j
points scored by j against i ≈ o_j + d_i
```

Solved iteratively via coupled equations. For MTG, this maps to "proactive power" (ability to execute a game plan) vs. "resilience" (ability to not lose to opponents' game plans).

### Strengths & Weaknesses

**Strengths:**
- Clear statistical foundation (OLS / maximum likelihood under Gaussian errors)
- Uses margin of victory — a 2-0 match counts differently than 2-1
- Offense-defense decomposition gives richer insight than a single number
- Rating difference = predicted point differential (interpretable)
- Residual analysis identifies "surprising" matchups where the 1D model breaks down

**Weaknesses:**
- Sensitive to outliers (single blowout distorts ratings)
- Requires singularity fix
- Assumes linear relationship between strength and point differential
- Single scalar per archetype — cannot capture intransitive (RPS) dynamics

---

## 4. Colley's Method

### Origin

Wesley Colley, *"Colley's Bias Free College Football Ranking Method"* (2002). BCS computer poll. Designed to be bias-free (no preseason assumptions) and to ignore margin of victory.

### Core Idea

Start from **Laplace's Rule of Succession**: if an archetype has played `t` matches and won `w`, the Bayesian estimate with uniform prior is:

```
r_i = (1 + w_i) / (2 + t_i)
```

Then adjust wins/losses for **strength of schedule**: a win against a strong opponent counts more, a loss against a strong opponent costs less.

### The Colley Matrix Equation

```
C × r = b

where:
  C_ii = 2 + t_i          (diagonal: 2 + matches played)
  C_ij = -n_ij             (off-diagonal: negative of matches between i and j)
  b_i  = 1 + (w_i - l_i)/2 (bias vector: 1 + half the win-loss differential)
```

Equivalently: `C = 2I + M` where `M` is the Massey matrix (graph Laplacian).

### Why It's Always Non-Singular

The Massey matrix `M` is positive semidefinite with smallest eigenvalue 0. Adding `2I` shifts all eigenvalues up by 2, making `C` strictly positive definite. No singularity fix needed.

### Properties

- Before any games: `r_i = 0.5` for all archetypes (bias-free)
- Ratings are bounded in [0, 1] with mean exactly 0.5
- Only uses wins and losses — deliberately ignores margin of victory
- SoS adjustment is implicit through the matrix coupling

### Strengths & Weaknesses

**Strengths:**
- Always non-singular, no fix needed
- Ratings in [0, 1] centered at 0.5 — easy to interpret as "adjusted win probability"
- No parameters to tune
- Bayesian foundation (Laplace's rule)
- Simple, elegant

**Weaknesses:**
- Ignores margin of victory (2-0 and 2-1 are treated identically)
- Still produces a single scalar — cannot capture RPS dynamics
- The Bayesian motivation is somewhat loose (matches are not i.i.d. coin flips)

### Relationship to Massey

The Colley matrix is `C = 2I + M` — literally the Massey matrix with Bayesian regularization. Colley is a regularized, win-loss-only version of Massey.

---

## 5. Bradley-Terry Model

### Origin

Bradley & Terry, *"Rank Analysis of Incomplete Block Designs"* (1952). Modern reference: Hunter, *"MM algorithms for generalized Bradley-Terry models"* (Annals of Statistics, 2004).

### Core Idea

Each archetype has a positive strength parameter `p_i`. The probability that *i* beats *j* is:

```
P(i beats j) = p_i / (p_i + p_j)
```

This is a **generative model** — it specifies how match outcomes are produced.

### Connection to Logistic Regression

Define `λ_i = log(p_i)`. Then:

```
P(i beats j) = 1 / (1 + exp(-(λ_i - λ_j)))
```

This is exactly a **logistic regression** where the predictor is the difference in log-strengths. You can fit Bradley-Terry with any logistic regression solver by constructing a design matrix where each match produces a row with `+1` in column *i*, `-1` in column *j*.

**This equivalence is extremely important** because it means:
- Standard errors come for free (Fisher information matrix)
- Covariates can be added: play/draw advantage, specific cards, etc.
- Regularization (Ridge/Lasso) prevents overfitting with sparse data
- All standard GLM diagnostics (deviance, AIC, residuals) apply

### Maximum Likelihood Estimation

Given `w_ij` wins for *i* against *j*, the log-likelihood is:

```
ℓ(p) = Σ_{i<j} [ w_ij × log(p_i) + w_ji × log(p_j) - (w_ij + w_ji) × log(p_i + p_j) ]
```

The MLE exists and is unique (up to scaling) if and only if the comparison graph is **strongly connected**.

### The MM Algorithm (Hunter, 2004)

Define:
- `W_i = Σ_j w_ij` (total wins for archetype *i*)
- `n_ij = w_ij + w_ji` (total matches between *i* and *j*)

Iterative update:
```
p_i^(new) = W_i / Σ_{j≠i} [ n_ij / (p_i^(old) + p_j^(old)) ]
```

Then renormalize so `Σ p_i = 1`.

**Properties:**
- Each step is guaranteed to increase the log-likelihood
- Converges to the global MLE
- No step-size tuning needed
- Each iteration is O(m) where m = number of nonzero matchup pairs
- Intuition: strength = total wins / (sum of "expected difficulty" per opponent)

### Extension: Ties (Davidson, 1970)

Introduces a tie parameter `θ > 0`:
```
P(i beats j) = p_i / (p_i + θ√(p_i × p_j) + p_j)
P(tie)       = θ√(p_i × p_j) / (p_i + θ√(p_i × p_j) + p_j)
```

### Extension: Home/Play-Draw Advantage

Add a parameter `δ > 0`:
```
P(i beats j | i goes first) = δ × p_i / (δ × p_i + p_j)
```

In log-form: `logit(P) = (λ_i - λ_j) + log(δ)`. The `log(δ)` is an intercept in the logistic regression. Directly relevant for MTG play/draw advantage.

### Strengths & Weaknesses

**Strengths:**
- Principled probabilistic model with well-understood statistical properties
- MLE is consistent and asymptotically efficient
- Confidence intervals and hypothesis tests available
- Extensible: ties, covariates, home advantage, random effects
- Equivalent to logistic regression — enormous software ecosystem
- MM algorithm is simple, stable, guaranteed to converge
- Handles unbalanced schedules naturally through the likelihood
- Can predict unobserved matchups: `P(i beats j) = logistic(λ_i - λ_j)`

**Weaknesses:**
- **Assumes transitivity**: if A > B and B > C, the model forces A > C. Cannot capture RPS dynamics. The model will fit, but parameters will be a compromise.
- Requires a connected comparison graph
- Does not model temporal drift (though time-varying parameters can be added)
- Does not model variance in performance (a consistent deck and a volatile one with the same mean get the same rating)

---

## 6. ELO Rating System

### Origin

Arpad Elo, adopted by FIDE for chess in 1970.

### Formulation

**Expected score** given ratings `R_i` and `R_j`:
```
E_i = 1 / (1 + 10^((R_j - R_i) / 400))
```

This is a logistic function with base 10 and scale 400. A 400-point difference = 10:1 expected win ratio.

**Update after a match** (actual score `S_i` ∈ {0, 0.5, 1}):
```
R_i^(new) = R_i^(old) + K × (S_i - E_i)
```

### ELO is Approximate Bradley-Terry

The connection is direct:
- Both use the logistic model for win probabilities
- Bradley-Terry fits all strengths simultaneously (batch MLE)
- ELO updates one at a time after each game (online stochastic gradient descent)
- ELO with K-factor = SGD with learning rate `K / (400 × ln 10)`
- Batch ELO iterated to convergence = Bradley-Terry MLE

### The K-Factor

Controls responsiveness:
- Large K (32–40): volatile, adapts quickly (new/developing players)
- Small K (10–16): stable (established players)
- FIDE: K=40 (new), K=20 (under 2400), K=10 (over 2400)

The K-factor is ELO's main weakness — it's a fixed hyperparameter that doesn't adapt to actual uncertainty.

### Batch vs. Online

**Online ELO**: Order of games matters (recency bias). Good for tracking drift over time. Computationally trivial.

**Batch ELO** (iterated to convergence): Equivalent to Bradley-Terry MLE. No order dependence. Loses temporal tracking.

**For MTG archetype analysis on a fixed tournament dataset, batch Bradley-Terry MLE is strictly preferable.** ELO's online nature adds noise without benefit.

### Glicko & Glicko-2 (Glickman, 1999/2001)

Addresses ELO's main weakness by adding **rating deviation** (RD) — uncertainty measure.

Each player/archetype has:
- `R` — rating (like ELO)
- `RD` — standard deviation of the rating estimate

Key ideas:
- New/inactive archetypes have high RD (uncertain rating)
- Many matches → low RD (well-determined)
- Wins against uncertain opponents change your rating less
- Expected score uses modified logistic:

```
E_i = 1 / (1 + 10^(-g(RD_j) × (R_i - R_j) / 400))

where g(RD) = 1 / sqrt(1 + 3q²RD² / π²),  q = ln(10)/400
```

Glicko is essentially a Bayesian approach: rating = posterior mean, RD = posterior standard deviation.

### Strengths & Weaknesses

**Strengths:**
- Extremely simple (ELO), universally recognized
- Online mode naturally tracks temporal drift
- Glicko adds principled uncertainty quantification

**Weaknesses:**
- K-factor is an arbitrary hyperparameter (ELO)
- Online mode is path-dependent
- For batch archetype analysis, it's just a worse version of Bradley-Terry
- No natural way to incorporate covariates

---

## 7. TrueSkill

### Origin

Herbrich, Minka & Graepel (Microsoft Research, 2006). Developed for Xbox Live matchmaking.

### Model

Each archetype has skill `s_i ~ N(μ_i, σ_i²)`. In a match, performance is:
```
t_i = s_i + ε_i,    ε_i ~ N(0, β²)
```

where `β²` is performance variance (game-to-game randomness). Archetype *i* beats *j* if `t_i > t_j`:

```
P(i beats j) = Φ((μ_i - μ_j) / sqrt(2β² + σ_i² + σ_j²))
```

where `Φ` is the standard normal CDF (probit model, not logistic).

### Inference

Uses **Expectation Propagation** on a factor graph. Passes Gaussian messages until convergence. Updates both `μ_i` and `σ_i` after each observation.

Conservative skill estimate for display: `TrueSkill_i = μ_i - 3σ_i`

### Strengths & Weaknesses

**Strengths:**
- Full Bayesian uncertainty (posterior distributions on skill)
- Handles multiplayer and team settings
- Inactive archetypes' uncertainty grows over time
- Robust to sparse data (priors regularize)

**Weaknesses:**
- More complex to implement (factor graphs, EP)
- Uses probit link — less interpretable than logistic
- Over-engineered for archetype-vs-archetype analysis
- EP can sometimes fail to converge

---

## 8. Offense-Defense (OD) Rating

### Origin

Govan, Meyer, et al. (~2006–2009, NC State). Covered in Langville & Meyer (2012).

### Core Idea

Decompose each archetype's strength into **offense** (ability to win) and **defense** (ability to not lose). An archetype is strong if it has high offense AND high defense.

### Formulation

Given matchup matrix `A` where `A_ij` = wins of archetype *i* against *j*:

```
o_i = Σ_j [ A_ij / d_j ]    (offensive rating: wins weighted by opponent defensive weakness)
d_i = Σ_j [ A_ji / o_j ]    (defensive rating: losses weighted by opponent offensive weakness)
```

Overall rating: `rating_i = o_i / d_i`

### Iterative Solution

1. Initialize `d = (1, 1, ..., 1)`
2. Compute `o_i = Σ_j A_ij / d_j`
3. Compute `d_i = Σ_j A_ji / o_j`
4. Normalize and repeat until convergence

Convergence is guaranteed by Perron-Frobenius when `A` has positive entries.

### Application to MTG

Particularly interesting because it separates genuinely different axes:
- **Glass cannons**: High offense, low defense (beats what it beats convincingly, loses hard to counters)
- **Fortresses**: Low offense, high defense (grinds out wins, rarely dominates)

This distinction is hidden in a single win-rate number.

---

## 9. HITS Algorithm (Hubs and Authorities)

### Origin

Kleinberg, *"Authoritative Sources in a Hyperlinked Environment"* (1999).

### Adaptation for Matchups

Let `L_ij = 1` if archetype *i* beats archetype *j*. HITS computes two scores:

```
a = L^T × h    (authority: beaten by few/weak archetypes)
h = L × a      (hub: beats many strong authorities)
```

So `a` is the principal eigenvector of `L^T L` and `h` is the principal eigenvector of `L L^T`.

**Reversed edge interpretation**: Use `L_ij = 1` if *j* beats *i*. Then authority scores correlate with archetype strength (archetypes that are hard to beat) and hub scores identify "feeder" decks that lose to the top tier.

### Iterative Computation

1. Initialize `a^(0) = h^(0) = (1, ..., 1)`
2. `a^(k+1) = L^T h^(k)`, normalize
3. `h^(k+1) = L a^(k+1)`, normalize
4. Repeat until convergence

### For MTG

Less directly useful for ranking overall strength, but could identify **meta-defining archetypes** — decks whose presence shapes the rest of the meta (high hub or authority scores).

---

## 10. Copeland Method & Weighted Majority

### Copeland Score

The simplest graph-based ranking. Given a complete matchup matrix:

```
C_i = W_i - L_i
```

where `W_i` = number of archetypes *i* beats (win rate > 50%) and `L_i` = number that beat *i*.

### Weighted Copeland

```
WC_i = Σ_{j: p(i,j) > 0.5} [p(i,j) - 0.5] - Σ_{j: p(j,i) > 0.5} [p(j,i) - 0.5]
```

Rewards dominant matchups more than narrow ones.

### Properties

- Always selects a **Condorcet winner** (an archetype that beats all others) when one exists
- Handles cycles (RPS dynamics) gracefully by averaging
- **Purely local**: does not capture indirect dominance chains. A→B→C does not help A vs. C.
- Simple, interpretable, fast (O(n²))

---

## 11. Rank Aggregation

### Motivation

Each method captures different aspects of archetype strength. No single method is "best." Aggregation combines multiple rankings for robustness.

### Borda Count

Given *m* ranking methods, each producing a complete ordering of *n* archetypes:

```
B(i) = Σ_k (n - rank_k(i))
```

Simple, intuitive. Satisfies the Condorcet loser criterion. Does NOT satisfy the Condorcet winner criterion.

### Kemeny Optimal Aggregation

Minimize total pairwise disagreements with all input rankings:

```
σ* = argmin_σ Σ_k K(σ, τ_k)
```

where `K(σ, τ)` = number of pairs where σ and τ disagree on ordering. NP-hard in general but tractable for n ≤ 30 (typical metagame size).

This is the maximum likelihood estimator under the Mallows model (a probabilistic model of noisy rankings).

### Weighted Aggregation

```
B_w(i) = Σ_k w_k × (n - rank_k(i))
```

Weight selection strategies:
- **Equal weights**: baseline
- **Bootstrap stability**: weight inversely to variance across resampled data
- **Cross-validation**: weight by predictive accuracy on held-out matches
- **Correlation-based**: downweight outlier methods (low average rank correlation with others)

### Markov Chain Rank Aggregation (MC4)

Dwork et al. proposed: construct a Markov chain on archetypes where you pick a random ranking method and transition to whichever archetype it ranks higher. The stationary distribution gives the aggregate ranking.

---

## 12. Generative vs. Descriptive Models

This is the most important conceptual distinction for choosing a method.

### Generative Models (Bradley-Terry, ELO, TrueSkill)

Specify a **data-generating process**: each archetype has intrinsic strength, and outcomes are random draws from a probability distribution.

This means:
- **The model can be wrong.** If true win probabilities aren't of the form `p_i/(p_i+p_j)`, the model is misspecified. You can test for this.
- **Predictions are principled.** Given estimated parameters, you can predict unobserved matchups.
- **Uncertainty quantification is natural.** Standard errors, confidence intervals, hypothesis tests all follow from the likelihood.
- **Model diagnostics flag problems.** If the BT model is a poor fit (e.g., strong RPS dynamics), the diagnostics reveal this.

### Descriptive Models (Keener, PageRank, Massey, Colley, Copeland)

Algorithms that **summarize observed results** into a ranking. No probabilistic model for outcomes.

This means:
- **Cannot be "wrong"** in a statistical sense — just a summary.
- **No natural predictions** for unobserved matchups.
- **No natural uncertainty quantification** without bootstrapping.
- **No model diagnostics** — cannot flag when the 1D ranking is a poor fit.

### Why This Matters for MTG

For a metagame analyzer, the generative property is valuable:
1. Calibrated matchup predictions with confidence intervals, even for sparse data
2. Model checking reveals intransitive (RPS) structure that a ranking would hide
3. Extensible with covariates (play/draw, specific cards) in a principled way
4. Sparse data handled gracefully — fewer matches = wider CIs automatically

The descriptive approaches are simpler and useful as quick summaries, but they discard information.

---

## 13. Comparison Matrix

| Method | Type | Uses MOV? | SoS? | Handles Missing? | Transitivity? | Uncertainty? | Complexity |
|--------|------|-----------|------|-----------------|---------------|-------------|------------|
| **Raw Winrate** (current) | Descriptive | No | No | Empty cells | No | Wilson CI | O(n) |
| **PageRank** | Descriptive | Optional | Yes (recursive) | Damping | Yes | No* | O(n² × iter) |
| **Keener** | Descriptive | Yes (h function) | Yes (eigenvector) | Laplace | Yes | No* | O(n² × iter) |
| **Massey** | Descriptive | Yes (point diff) | Yes (normal eqns) | Connected graph | Yes | No* | O(n³) |
| **Colley** | Descriptive | No | Yes (Bayesian) | Connected graph | Yes | No* | O(n³) |
| **Copeland** | Descriptive | Weighted variant | No | N/A (needs pairs) | No | No | O(n²) |
| **OD Rating** | Descriptive | Yes | Yes (iterative) | Positive entries | Yes | No* | O(n² × iter) |
| **HITS** | Descriptive | Optional | Yes (eigenvector) | N/A | Partial | No | O(n² × iter) |
| **Bradley-Terry** | Generative | Via link function | Yes (MLE) | Connected graph | **Forced** | **Yes (Fisher)** | O(n² × iter) |
| **ELO/Glicko** | Generative | Via link function | Yes (updates) | Prior rating | **Forced** | **Glicko: Yes** | O(matches) |
| **TrueSkill** | Generative | Via link function | Yes (Bayes) | Prior | **Forced** | **Yes (posterior)** | O(n² × iter) |

\* Can be bootstrapped for uncertainty, but not built-in.

Note: "Forced transitivity" means the model cannot represent A > B > C > A (RPS). It will find a best compromise but cannot capture the full structure.

---

## 14. Application to MTG Archetype Ranking

### What Makes MTG Different from Sports

1. **Intransitivity is fundamental.** Aggro beats Combo, Combo beats Control, Control beats Aggro. A single scalar rating **cannot capture this**. This is the biggest limitation of all methods surveyed.

2. **Dense repeated matchups.** Unlike NFL (each team plays 17 games), archetype A might face archetype B hundreds of times across tournaments. Edge weights are statistically robust.

3. **No home field.** Matchups are symmetric in structure (though play/draw matters).

4. **The goal is different.** In sports you want to predict future outcomes. In MTG you want to understand **matchup structure** — which archetypes beat which, and by how much. A single rating collapses the rich matchup matrix into one dimension.

5. **Meta shifts rapidly.** Bans, new sets, and adaptation change the landscape weekly.

### What These Methods Add Over Our Current Approach

Our current system computes raw winrate per archetype (sum of wins / sum of matches). This treats all opponents equally. A deck that farms bad matchups but loses to the top decks gets the same winrate as one that beats top decks but loses to fringe ones.

**All of these methods** provide **strength-of-schedule adjustment**: beating a strong archetype counts for more. The question is which method best fits our needs.

### Practical Application

Given our existing matchup matrix `buildMatchupMatrix()` output:

1. **Extract `S_ij`** = wins of archetype *i* against *j* from each `MatchupCell`
2. **Choose method(s)** and compute ratings
3. **Display alongside** existing winrate and metagame share

### Method Suitability Ranking for Our Use Case

**Tier 1 — Best fit:**
- **Bradley-Terry** via logistic regression: Gives us predicted matchup probabilities, CIs, play/draw covariate support, model diagnostics. We already do logistic regression for card impact — same infrastructure.
- **Keener's Method**: Already analyzed in detail (see `keeners-method.md`). Simple, principled, SoS-adjusted. ~30 lines of code.
- **Colley's Method**: Simplest of all. Always non-singular, no parameters. Ratings in [0,1]. Perfect for a "quick tier list" view.

**Tier 2 — Useful additions:**
- **PageRank**: Nearly identical to Keener in output. The damping factor is a useful tuning knob for sparse data.
- **OD Rating**: Uniquely provides the offense/defense decomposition. "Glass cannon vs. fortress" is a meaningful distinction for MTG deckbuilders.
- **Massey**: Interesting if we use game-count margin (2-0 vs 2-1). Residual analysis identifies surprising matchups.

**Tier 3 — Less useful for our case:**
- **ELO/Glicko**: Online methods add nothing over Bradley-Terry for batch tournament analysis.
- **TrueSkill**: Over-engineered for archetype-level analysis.
- **HITS**: More useful for meta structure analysis than ranking.
- **Copeland**: Too simple — just counts favorable matchups without transitivity.

### The Intransitivity Problem

All single-rating methods share a fundamental limitation: they produce one number per archetype and **cannot represent rock-paper-scissors dynamics**. For MTG, this is a significant constraint.

**Solutions:**
1. **Use ratings as a complement, not a replacement.** The matchup matrix remains the primary tool. Ratings add an SoS-adjusted "overall tier" view.
2. **Use Bradley-Terry residuals.** After fitting BT, examine which matchup predictions are most wrong. Those are the intransitive matchups — exactly the "special" matchups players need to know about.
3. **Multidimensional extensions.** The "Blade-Chest" decomposition and multidimensional Bradley-Terry models extend to multiple latent dimensions, potentially capturing RPS dynamics. This is a research frontier.

---

## 15. Recommendations

### Implement First (Low Effort, High Value)

1. **Keener's Method** — Already planned (see `keeners-method.md`). ~30 lines, pure math, client-side.
2. **Colley's Method** — Similarly simple. Solve `(2I + M)r = b`. Gives a [0,1] rating with nice interpretation.
3. **Bradley-Terry** — We already have logistic regression infrastructure (`logistic-regression.ts`). Reuse it with a different design matrix.

### Implement Later (Higher Effort, Unique Value)

4. **OD Rating** — Offense/defense decomposition is unique insight. ~50 lines of iterative code.
5. **Massey with residual analysis** — The residuals identify "surprising matchups" that break the 1D ranking assumption. This is a novel analysis feature.

### Display Strategy

- Add a **"Power Rankings"** column/view alongside metagame share and raw winrate
- Show the **rating** (Keener or Colley) and optionally the **rank change** vs. raw winrate
- When rankings diverge significantly, that tells a story: "Deck X has a 48% winrate but ranks 3rd by Keener because it primarily faces the top 2 decks"

### What NOT to Implement

- ELO/Glicko for archetype analysis (batch BT is strictly better)
- TrueSkill (over-engineered)
- HITS (doesn't answer the right question)
- Full rank aggregation (unnecessary complexity when individual methods are interpretable)

---

## 16. References

### Primary Sources

- **Bradley, R.A. & Terry, M.E.** (1952). "Rank Analysis of Incomplete Block Designs." *Biometrika* 39(3/4), 324–345.
- **Brin, S. & Page, L.** (1998). "The Anatomy of a Large-Scale Hypertextual Web Search Engine." *Computer Networks* 30(1–7), 107–117.
- **Colley, W.N.** (2002). "Colley's Bias Free College Football Ranking Method: The Colley Matrix Explained."
- **Davidson, R.R.** (1970). "On Extending the Bradley-Terry Model to Accommodate Ties in Paired Comparison Experiments." *JASA* 65(329), 317–328.
- **Elo, A.** (1978). *The Rating of Chess Players, Past and Present.* Arco Publishing.
- **Glickman, M.E.** (1999). "Parameter Estimation in Large Dynamic Paired Comparison Experiments." *Applied Statistics* 48(3), 377–394.
- **Herbrich, R., Minka, T. & Graepel, T.** (2006). "TrueSkill: A Bayesian Skill Rating System." *Advances in NIPS* 19.
- **Hunter, D.R.** (2004). "MM Algorithms for Generalized Bradley-Terry Models." *Annals of Statistics* 32(1), 384–406.
- **Keener, J.P.** (1993). "The Perron-Frobenius Theorem and the Ranking of Football Teams." *SIAM Review* 35(1), 80–93.
- **Kleinberg, J.M.** (1999). "Authoritative Sources in a Hyperlinked Environment." *JACM* 46(5), 604–632.
- **Massey, K.** (1997). "Statistical Models Applied to the Rating of Sports Teams." Honors thesis, Bluefield College.

### Textbooks

- **Langville, A.N. & Meyer, C.D.** (2012). *Who's #1? The Science of Rating and Ranking.* Princeton University Press. — The definitive reference covering Massey, Colley, Keener, PageRank, Markov, OD, and more.

### Sports Applications

- **Callaghan, T., Porter, M.A. & Mucha, P.J.** (2007). "Random Walker Ranking for NCAA Division I-A Football." *American Mathematical Monthly* 114(9), 761–777.
- **Govan, A.Y. & Meyer, C.D.** (2006). "Ranking National Football League Teams Using Google's PageRank." NC State technical report.
- **Park, J. & Newman, M.E.J.** (2005). "A Network-Based Ranking System for US College Football." *JSTAT*.
- **Radicchi, F.** (2011). "Who Is the Best Player Ever? A Complex Network Analysis of the History of Professional Tennis." *PLoS ONE* 6(2): e17249.
