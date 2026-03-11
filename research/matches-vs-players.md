# Matches vs Players Relationship

**Date**: 2026-03-11

Regression analysis on 56 tournaments (Standard, Modern, Duel Commander, Pauper).
Matches extracted as sum of all player W/L/D divided by 2 from `data/**/melee-*.json`.

## Polynomial Fits (all 56 tournaments)

| Degree | R² | Formula |
|--------|------|---------|
| 1 | 0.9892 | `matches = 4.11p - 86.09` |
| 2 | 0.9892 | `matches = 0.000061p² + 4.05p - 81.58` |
| 3 | 0.9898 | `matches = 0.0000011p³ - 0.00176p² + 4.70p - 116.42` |

Quadratic and cubic terms are negligible — the relationship is essentially linear across the full dataset.

## Swiss-Based Formula

The theoretical Swiss formula is `matches = p * ceil(log2(p)) / 2`. Fitting a scaling factor on all 56 tournaments gives:

```
matches = 0.77 * p * ceil(log2(p)) / 2 + 23
```

The 0.77 factor accounts for drops and byes (~23% of theoretical matches not played). This serves as a ceiling estimate of rounds played.

## Comparison Across Tournament Sizes

All formulas fitted on all 56 tournaments:

| Formula | R² (all) | MAE (all) | R² (500+) | MAE (500+) |
|---------|----------|-----------|-----------|------------|
| Linear | 0.9892 | 55 | 0.884 | 289 |
| Cubic | 0.9898 | 56 | 0.903 | 263 |
| Scaled Swiss | 0.9895 | 58 | 0.933 | 197 |

- **Small tournaments (< 100 players)**: all models perform similarly (MAE ~55). High variance in actual match counts due to some events running fewer rounds than full Swiss.
- **Large tournaments (500+ players)**: scaled Swiss is clearly best, especially for the 1193-player event (error of +27 vs -219 for linear). It captures the round-count step that polynomials miss.

## Takeaway

Use `matches ≈ 4.1p - 86` for quick estimates. For large events, prefer the scaled Swiss formula as it better models the ceil(log2(p)) round structure.
