# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "numpy",
#     "matplotlib",
# ]
# ///
"""
Matches vs Players regression analysis.
Reads all tournament JSON files, fits linear/cubic/scaled-Swiss models,
identifies outliers (leagues with fewer rounds), and generates plots.

Usage: uv run research/matches-vs-players.py
"""

import json
import math
import os
from pathlib import Path

import numpy as np

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
OUT_DIR = Path(__file__).resolve().parent


def load_tournaments():
    """Read all melee-*.json files and extract (players, matches) pairs."""
    tournaments = []
    for json_path in sorted(DATA_DIR.rglob("melee-*.json")):
        with open(json_path) as f:
            data = json.load(f)

        player_count = data["meta"]["playerCount"]
        total_games = 0
        for pid, pdata in data["players"].items():
            w, l, d = map(int, pdata["matchRecord"].split("-"))
            total_games += w + l + d
        total_matches = total_games // 2

        rel = json_path.relative_to(DATA_DIR)
        tournaments.append((str(rel), player_count, total_matches))

    return tournaments


def r2_score(actual, predicted):
    ss_res = np.sum((actual - predicted) ** 2)
    ss_tot = np.sum((actual - actual.mean()) ** 2)
    return 1 - ss_res / ss_tot


def mae_score(actual, predicted):
    return np.mean(np.abs(actual - predicted))


def swiss_matches(p):
    """Theoretical max matches in Swiss: p * ceil(log2(p)) / 2."""
    return p * math.ceil(math.log2(p)) / 2


def main():
    tournaments = load_tournaments()
    print(f"Loaded {len(tournaments)} tournaments from {DATA_DIR}\n")

    names = [t[0] for t in tournaments]
    players = np.array([t[1] for t in tournaments], dtype=float)
    matches = np.array([t[2] for t in tournaments], dtype=float)

    # --- Fit on all data ---
    swiss_all = np.array([swiss_matches(p) for p in players])
    X_sw = np.column_stack([swiss_all, np.ones(len(players))])
    cs_init, _, _, _ = np.linalg.lstsq(X_sw, matches, rcond=None)

    # Identify outliers: matches/player ratio far below expected Swiss rounds.
    # Use ratio-based detection: in full Swiss, matches/player ≈ ceil(log2(p))/2.
    # Leagues/short events have much lower ratios.
    expected_ratio = np.array([math.ceil(math.log2(p)) / 2 for p in players])
    actual_ratio = matches / players
    ratio_frac = actual_ratio / expected_ratio
    outlier_mask = ratio_frac < 0.55  # less than 55% of expected Swiss matches/player

    print(f"Outliers ({outlier_mask.sum()} tournaments with <55% of expected Swiss ratio):")
    for i in np.where(outlier_mask)[0]:
        print(f"  {names[i]:50s}  p={int(players[i]):5d}  m={int(matches[i]):5d}  ratio={ratio_frac[i]:.1%}")

    # --- Fit on clean data ---
    p_clean = players[~outlier_mask]
    m_clean = matches[~outlier_mask]
    n_clean = len(p_clean)

    c1 = np.polyfit(p_clean, m_clean, 1)
    c3 = np.polyfit(p_clean, m_clean, 3)
    swiss_clean = np.array([swiss_matches(p) for p in p_clean])
    X_clean = np.column_stack([swiss_clean, np.ones(n_clean)])
    cs, _, _, _ = np.linalg.lstsq(X_clean, m_clean, rcond=None)

    pred_lin = np.polyval(c1, p_clean)
    pred_cub = np.polyval(c3, p_clean)
    pred_sw = cs[0] * swiss_clean + cs[1]

    print(f"\nFitted on {n_clean} clean tournaments:\n")
    print(f"  Linear:       m = {c1[0]:.2f}p + {c1[1]:.1f}")
    print(f"  Cubic:        m = {c3[0]:.10f}p³ + {c3[1]:.6f}p² + {c3[2]:.2f}p + {c3[3]:.1f}")
    print(f"  Scaled Swiss: m = {cs[0]:.4f} · p·⌈log₂p⌉/2 + {cs[1]:.1f}")

    print(f"\n{'Formula':<16} {'R²':>8} {'MAE':>6}")
    print(f"{'Linear':<16} {r2_score(m_clean, pred_lin):>8.6f} {mae_score(m_clean, pred_lin):>6.0f}")
    print(f"{'Cubic':<16} {r2_score(m_clean, pred_cub):>8.6f} {mae_score(m_clean, pred_cub):>6.0f}")
    print(f"{'Scaled Swiss':<16} {r2_score(m_clean, pred_sw):>8.6f} {mae_score(m_clean, pred_sw):>6.0f}")

    # 500+ subset
    mask500 = p_clean >= 500
    if mask500.any():
        p5, m5 = p_clean[mask500], m_clean[mask500]
        sw5 = np.array([swiss_matches(p) for p in p5])
        print(f"\nMAE on {mask500.sum()} tournaments with 500+ players:")
        print(f"  Linear:       {mae_score(m5, np.polyval(c1, p5)):.0f}")
        print(f"  Cubic:        {mae_score(m5, np.polyval(c3, p5)):.0f}")
        print(f"  Scaled Swiss: {mae_score(m5, cs[0]*sw5 + cs[1]):.0f}")

    # --- Plot ---
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("\nmatplotlib not available, skipping plots.")
        return

    fig, axes = plt.subplots(1, 2, figsize=(18, 7))

    # Full view
    ax = axes[0]
    for i in range(len(players)):
        color = "#e74c3c" if outlier_mask[i] else "#3498db"
        ax.scatter(players[i], matches[i], c=color, s=50, zorder=5,
                   edgecolors="white", linewidth=0.5)
    p_range = np.linspace(20, players.max() * 1.05, 500)
    sw_range = np.array([cs[0] * swiss_matches(p) + cs[1] for p in p_range])
    lin_range = np.polyval(c1, p_range)
    ax.plot(p_range, sw_range, color="#2ecc71", linewidth=2, label="Scaled Swiss")
    ax.plot(p_range, lin_range, color="#f39c12", linewidth=2, linestyle="--", label="Linear")
    ax.set_xlabel("Players", fontsize=12)
    ax.set_ylabel("Matches", fontsize=12)
    ax.set_title("All Tournaments (red = outlier leagues)", fontsize=12)
    ax.legend(fontsize=10)
    ax.grid(True, alpha=0.3)

    # Zoomed view (<=250 players)
    ax = axes[1]
    mask_zoom = players <= 250
    for i in range(len(players)):
        if not mask_zoom[i]:
            continue
        color = "#e74c3c" if outlier_mask[i] else "#3498db"
        ax.scatter(players[i], matches[i], c=color, s=60, zorder=5,
                   edgecolors="white", linewidth=0.5)
        label = f"{int(players[i])}p, {int(matches[i])}m"
        offset_y = 8 if outlier_mask[i] else -14
        ax.annotate(label, (players[i], matches[i]), fontsize=6,
                    color="#c0392b" if outlier_mask[i] else "#2c3e50",
                    xytext=(5, offset_y), textcoords="offset points")
    p_zoom = np.linspace(20, 260, 300)
    ax.plot(p_zoom, [cs[0] * swiss_matches(p) + cs[1] for p in p_zoom],
            color="#2ecc71", linewidth=2, label="Scaled Swiss")
    ax.plot(p_zoom, np.polyval(c1, p_zoom),
            color="#f39c12", linewidth=2, linestyle="--", label="Linear")
    ax.set_xlabel("Players", fontsize=12)
    ax.set_ylabel("Matches", fontsize=12)
    ax.set_title("Zoomed ≤250 Players", fontsize=12)
    ax.legend(fontsize=10)
    ax.grid(True, alpha=0.3)

    plt.tight_layout()
    out_path = OUT_DIR / "matches-vs-players.png"
    plt.savefig(out_path, dpi=150)
    print(f"\nPlot saved to {out_path}")


if __name__ == "__main__":
    main()
