/**
 * Win-rate bias analysis for Pioneer MTGO standings data.
 *
 * Data reality:
 *   - Matches (pairings): only top-8 playoffs (7 per tournament)
 *   - Standings: top-32 W-L-D records, no pairings for swiss rounds
 *   - Win surplus: top-32 players beat non-top-32 → more W than L
 *
 * Two correction approaches:
 *   A) Linear de-bias: subtract the uniform bias from each archetype's WR
 *   B) Surplus redistribution: model the invisible losses from non-top-32
 *      opponents using metagame share as weights
 *
 * Usage: bun run scripts/winrate-bias-analysis.ts
 */
import { globSync, readFileSync } from "node:fs";
import {
	classifyAllPooled,
	parseArchetypeYaml,
} from "../src/lib/algorithms/archetype-classifier";
import type { DecklistInfo } from "../src/lib/types/decklist";
import type { TournamentData } from "../src/lib/types/tournament";
import {
	buildMatchupMatrix,
	buildPlayerArchetypeMap,
} from "../src/lib/utils/winrate-calculator";

// ---------------------------------------------------------------------------
// 1. Load Pioneer March 2026 tournaments
// ---------------------------------------------------------------------------
const files = globSync("data/pioneer/2026-03/*.json");
const tournaments = new Map<string, TournamentData>();
for (const file of files) {
	const data: TournamentData = JSON.parse(readFileSync(file, "utf-8"));
	tournaments.set(data.meta.id, data);
}
console.log(`Loaded ${tournaments.size} Pioneer tournaments from March 2026`);

// ---------------------------------------------------------------------------
// 2. Classify archetypes
// ---------------------------------------------------------------------------
const yaml = readFileSync("data/archetypes/pioneer.yaml", "utf-8");
const { archetypes: archetypeDefs, nameEqualsCommander } = parseArchetypeYaml(yaml);

const tournamentDecklists = new Map<string, Record<string, DecklistInfo>>();
for (const [id, t] of tournaments) {
	tournamentDecklists.set(id, t.decklists);
}

const classificationResults = classifyAllPooled(tournamentDecklists, archetypeDefs, {
	minConfidence: 0.4,
	nameEqualsCommander,
});

const playerArchetypes = new Map<string, string>();
for (const [tournamentId, results] of classificationResults) {
	const tournament = tournaments.get(tournamentId)!;
	const map = buildPlayerArchetypeMap(tournament, results);
	for (const [playerId, arch] of map) {
		playerArchetypes.set(`${tournamentId}:${playerId}`, arch);
	}
}

// ---------------------------------------------------------------------------
// 3. Build the raw matchup matrix (with standings remainder)
// ---------------------------------------------------------------------------
const { stats } = buildMatchupMatrix([...tournaments.values()], playerArchetypes, {
	excludeMirrors: true,
	topN: 15,
	useStandings: true,
});

// ---------------------------------------------------------------------------
// 4. Compute data overview
// ---------------------------------------------------------------------------
let totalPlayoffMatches = 0;
let totalSwissMissing = 0;
for (const t of tournaments.values()) {
	const rounds = Object.values(t.rounds);
	totalPlayoffMatches += rounds.reduce((s, r) => s + r.matches.length, 0);
	totalSwissMissing += t.meta.roundCount - rounds.length;
}

const totalW = stats.reduce((s, a) => s + a.wins, 0);
const totalL = stats.reduce((s, a) => s + a.losses, 0);
const totalD = stats.reduce((s, a) => s + a.draws, 0);
const totalMatches = totalW + totalL + totalD;
const surplus = totalW - totalL;

console.log(`\n--- Data Overview ---`);
console.log(
	`  Top-32 players:          ${stats.reduce((s, a) => s + a.playerCount, 0)}`,
);
console.log(
	`  Playoff matches (top 8): ${totalPlayoffMatches} (only these have pairings)`,
);
console.log(
	`  Missing swiss rounds:    ${totalSwissMissing} (no pairings, only standings W-L-D)`,
);
console.log(`  Standings W-L-D:         ${totalW}-${totalL}-${totalD}`);
console.log(
	`  Win surplus (W − L):     ${surplus} (wins against non-top-32 opponents)`,
);
console.log(
	`  Raw overall WR:          ${((totalW / totalMatches) * 100).toFixed(1)}%`,
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtPct(value: number | null, width = 7): string {
	if (value === null) return "—".padStart(width);
	return `${(value * 100).toFixed(1)}%`.padStart(width);
}

// ---------------------------------------------------------------------------
// 5. Approach A: Linear de-bias (uniform shift)
// ---------------------------------------------------------------------------
// Since swiss pairings are random, each archetype faces roughly the same
// proportion of non-top-32 opponents. The bias is therefore uniform:
//   bias = weighted_avg_WR - 50%
//   adjusted_wr = raw_wr - bias
//
// Simple, preserves all relative differences, but doesn't account for
// sample size (small archetypes get the same adjustment as large ones).
// ---------------------------------------------------------------------------
let rawWeightedAvg = 0;
let shareSum = 0;
for (const stat of stats) {
	if (stat.totalMatches === 0) continue;
	rawWeightedAvg += stat.metagameShare * stat.overallWinrate;
	shareSum += stat.metagameShare;
}
rawWeightedAvg /= shareSum;
const uniformBias = rawWeightedAvg - 0.5;

// ---------------------------------------------------------------------------
// 5b. Linear v2: de-bias + confidence shrinkage
// ---------------------------------------------------------------------------
// Step 1: debiased = raw_wr - bias           (remove systemic inflation)
// Step 2: adjusted = 50% + (debiased - 50%) × N/(N+K)  (shrink small-N → 50%)
//
// K = median N across archetypes — at median sample size you keep ~50% of
// the signal, above median you keep more, below you regress toward 50%.
// ---------------------------------------------------------------------------
const sortedN = stats
	.filter((s) => s.totalMatches > 0)
	.map((s) => s.totalMatches)
	.sort((a, b) => a - b);
const medianN = sortedN[Math.floor(sortedN.length / 2)];

function linearV2(rawWr: number, n: number): number {
	const debiased = rawWr - uniformBias;
	const confidence = n / (n + medianN);
	return 0.5 + (debiased - 0.5) * confidence;
}

console.log(`\n${"=".repeat(72)}`);
console.log(
	`  A) LINEAR DE-BIAS + CONFIDENCE (bias=${(uniformBias * 100).toFixed(1)}pp, K=${medianN})`,
);
console.log(`${"=".repeat(72)}`);
console.log(
	`${"Archetype".padEnd(26)} ${"Share".padStart(6)} ${"Raw".padStart(7)} ${"Flat".padStart(7)} ${"v2".padStart(7)} ${"Conf".padStart(5)} ${"N".padStart(5)}`,
);
console.log("-".repeat(60));

let v2WeightedAvg = 0;
let v2ShareSum = 0;
const v2Wrs: number[] = [];
for (const stat of stats) {
	const flat = stat.overallWinrate - uniformBias;
	const v2 =
		stat.totalMatches > 0 ? linearV2(stat.overallWinrate, stat.totalMatches) : 0.5;
	const conf = stat.totalMatches / (stat.totalMatches + medianN);
	v2Wrs.push(v2);
	v2WeightedAvg += stat.metagameShare * v2;
	v2ShareSum += stat.metagameShare;

	console.log(
		`${stat.name.padEnd(26)} ${`${(stat.metagameShare * 100).toFixed(1)}%`.padStart(6)} ${fmtPct(stat.overallWinrate)} ${fmtPct(flat)} ${fmtPct(v2)} ${`${(conf * 100).toFixed(0)}%`.padStart(5)} ${String(stat.totalMatches).padStart(5)}`,
	);
}
v2WeightedAvg /= v2ShareSum;

console.log("-".repeat(60));
console.log(
	`${"Weighted avg".padEnd(26)} ${"".padStart(6)} ${fmtPct(rawWeightedAvg)} ${fmtPct(0.5)} ${fmtPct(v2WeightedAvg)}`,
);

// ---------------------------------------------------------------------------
// 6. Approach B: Surplus redistribution weighted by share × loss rate
// ---------------------------------------------------------------------------
// The 784 surplus wins came from top-32 players beating non-top-32 opponents.
// The non-top-32 ("bottom") metagame isn't a random slice — it's skewed
// toward decks that lose more. High-WR decks are overrepresented in top-32
// and underrepresented at the bottom. Low-WR decks are the opposite.
//
// Model: the bottom metagame is the top-32 metagame reweighted by loss rate.
//   weight_i = share_i × (1 - raw_wr_i)
//
// A deck with 60% WR has loss_rate 0.4 → less common at the bottom.
// A deck with 45% WR has loss_rate 0.55 → more common at the bottom.
//
// Then normalize weights and distribute the surplus:
//   virtual_losses_i = (weight_i / Σweights) × surplus
// ---------------------------------------------------------------------------

// Compute weights: share × loss_rate
const weights: number[] = [];
let weightSum = 0;
for (const stat of stats) {
	const lossRate = stat.totalMatches > 0 ? 1 - stat.overallWinrate : 0.5;
	const w = stat.metagameShare * lossRate;
	weights.push(w);
	weightSum += w;
}

console.log(`\n${"=".repeat(72)}`);
console.log(`  B) SURPLUS REDISTRIBUTION: share × loss_rate weighting`);
console.log(`${"=".repeat(72)}`);
console.log(
	`${"Archetype".padEnd(26)} ${"Share".padStart(6)} ${"Raw".padStart(7)} ${"Adj".padStart(7)} ${"Weight".padStart(7)} ${"+Loss".padStart(6)} ${"N".padStart(5)}`,
);
console.log("-".repeat(62));

let adjWeightedAvg = 0;
let adjShareSum = 0;
const redistWrs: number[] = [];
for (let idx = 0; idx < stats.length; idx++) {
	const stat = stats[idx];
	const normWeight = weightSum > 0 ? weights[idx] / weightSum : 0;
	const rawExtraLosses = normWeight * surplus;
	// Cap: virtual losses can't exceed half the real match count
	const extraLosses = Math.min(rawExtraLosses, 0.5 * stat.totalMatches);
	const adjTotal = stat.wins + stat.losses + stat.draws + extraLosses;
	const adjWr = adjTotal > 0 ? stat.wins / adjTotal : 0;
	redistWrs.push(adjWr);

	adjWeightedAvg += stat.metagameShare * adjWr;
	adjShareSum += stat.metagameShare;

	console.log(
		`${stat.name.padEnd(26)} ${`${(stat.metagameShare * 100).toFixed(1)}%`.padStart(6)} ${fmtPct(stat.overallWinrate)} ${fmtPct(adjWr)} ${`${(normWeight * 100).toFixed(1)}%`.padStart(7)} ${`+${extraLosses.toFixed(0)}`.padStart(6)} ${String(stat.totalMatches).padStart(5)}`,
	);
}
adjWeightedAvg /= adjShareSum;

console.log("-".repeat(62));
console.log(
	`${"Weighted avg".padEnd(26)} ${"".padStart(6)} ${fmtPct(rawWeightedAvg)} ${fmtPct(adjWeightedAvg)}`,
);

// ---------------------------------------------------------------------------
// 8. Side by side comparison
// ---------------------------------------------------------------------------
console.log(`\n${"=".repeat(78)}`);
console.log(`  COMPARISON: Raw vs Flat Linear vs Linear v2 vs Redistribution`);
console.log(`${"=".repeat(78)}`);
console.log(
	`${"Archetype".padEnd(26)} ${"Share".padStart(6)} ${"Raw".padStart(7)} ${"Flat".padStart(7)} ${"Lin v2".padStart(7)} ${"Redist".padStart(7)} ${"N".padStart(5)}`,
);
console.log("-".repeat(64));

for (let idx = 0; idx < stats.length; idx++) {
	const stat = stats[idx];
	const flat = stat.overallWinrate - uniformBias;

	console.log(
		`${stat.name.padEnd(26)} ${`${(stat.metagameShare * 100).toFixed(1)}%`.padStart(6)} ${fmtPct(stat.overallWinrate)} ${fmtPct(flat)} ${fmtPct(v2Wrs[idx])} ${fmtPct(redistWrs[idx])} ${String(stat.totalMatches).padStart(5)}`,
	);
}

console.log("-".repeat(64));
console.log(
	`${"Weighted avg".padEnd(26)} ${"".padStart(6)} ${fmtPct(rawWeightedAvg)} ${fmtPct(0.5)} ${fmtPct(v2WeightedAvg)} ${fmtPct(adjWeightedAvg)}`,
);
