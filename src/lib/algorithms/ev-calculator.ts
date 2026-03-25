/**
 * EV Calculator — computes expected value for MTG Arena win-count events
 * using the negative binomial distribution.
 *
 * All winRate parameters are decimals in [0, 1].
 */
import { parse as parseYaml } from "yaml";

// --- Types ---

export interface ParsedEvent {
	name: string;
	format?: string;
	entry: { amount: number; currency: string };
	maxWins: number;
	maxLosses: number;
	rewards: RewardTier[];
}

export interface RewardTier {
	wins: number;
	items: Record<string, number>;
}

export interface ValuationParams {
	[rewardType: string]: number;
}

// --- Combinatorics ---

/** Binomial coefficient C(n, k). */
function choose(n: number, k: number): number {
	if (k < 0 || k > n) return 0;
	if (k === 0 || k === n) return 1;
	// Use the smaller k for efficiency
	if (k > n - k) k = n - k;
	let result = 1;
	for (let i = 0; i < k; i++) {
		result = (result * (n - i)) / (i + 1);
	}
	return result;
}

// --- Probability Model ---

/**
 * Compute the probability of each outcome (0..maxWins wins) for a
 * win-count event with the given per-game win probability.
 *
 * For k < maxWins: P(k) = C(k+L-1, k) * p^k * (1-p)^L
 *   (player exits with k wins and L losses, last game is L-th loss)
 *
 * For k = maxWins (W): P(W) = Σ_{j=0}^{L-1} C(W-1+j, j) * p^W * (1-p)^j
 *   (player reaches W wins with at most L-1 losses)
 */
export function outcomeProbabilities(
	maxWins: number,
	maxLosses: number,
	winRate: number,
): Map<number, number> {
	const p = winRate;
	const q = 1 - p;
	const W = maxWins;
	const L = maxLosses;
	const probs = new Map<number, number>();

	// Outcomes where player exits with k < W wins (accumulated L losses)
	for (let k = 0; k < W; k++) {
		probs.set(k, choose(k + L - 1, k) * p ** k * q ** L);
	}

	// Outcome where player reaches max wins
	let pW = 0;
	for (let j = 0; j < L; j++) {
		pW += choose(W - 1 + j, j) * p ** W * q ** j;
	}
	probs.set(W, pW);

	return probs;
}

// --- YAML Parsing ---

/**
 * Parse a range key like "0-2" into [0, 1, 2], or a single int key into [3].
 */
function parseRewardKey(key: string | number): number[] {
	if (typeof key === "number") return [key];
	const str = String(key);
	const rangeMatch = str.match(/^(\d+)-(\d+)$/);
	if (rangeMatch) {
		const lo = parseInt(rangeMatch[1], 10);
		const hi = parseInt(rangeMatch[2], 10);
		const result: number[] = [];
		for (let i = lo; i <= hi; i++) result.push(i);
		return result;
	}
	const n = parseInt(str, 10);
	if (!Number.isNaN(n)) return [n];
	return [];
}

/**
 * Parse event YAML content into a structured ParsedEvent.
 * Throws on invalid YAML syntax or missing required fields.
 */
export function parseEventYaml(yamlContent: string): ParsedEvent {
	const data = parseYaml(yamlContent) as Record<string, unknown>;

	if (!data || typeof data !== "object") {
		throw new Error("YAML must be an object");
	}

	const name = data.name as string;
	if (!name || typeof name !== "string") {
		throw new Error('Missing required field: "name"');
	}

	const entry = data.entry as Record<string, unknown> | undefined;
	if (!entry || typeof entry !== "object") {
		throw new Error('Missing required field: "entry"');
	}

	const entryAmount = entry.amount as number;
	const entryCurrency = entry.currency as string;
	if (typeof entryAmount !== "number" || typeof entryCurrency !== "string") {
		throw new Error('"entry" must have numeric "amount" and string "currency"');
	}

	const maxWins = data.max_wins as number;
	if (typeof maxWins !== "number" || maxWins < 1) {
		throw new Error('"max_wins" must be a positive integer');
	}

	const maxLosses =
		typeof data.max_losses === "number" ? (data.max_losses as number) : 3;

	// Parse rewards with range key expansion
	const rawRewards = data.rewards as Record<string, unknown> | undefined;
	const rewards: RewardTier[] = [];
	const seenWins = new Set<number>();

	if (rawRewards && typeof rawRewards === "object") {
		for (const [key, value] of Object.entries(rawRewards)) {
			const winCounts = parseRewardKey(key);
			const items: Record<string, number> =
				value && typeof value === "object"
					? Object.fromEntries(
							Object.entries(value as Record<string, unknown>)
								.filter(([, v]) => typeof v === "number")
								.map(([k, v]) => [k, v as number]),
						)
					: {};

			for (const w of winCounts) {
				if (seenWins.has(w)) {
					throw new Error(`Overlapping reward key for wins=${w}`);
				}
				seenWins.add(w);
				rewards.push({ wins: w, items });
			}
		}
	}

	rewards.sort((a, b) => a.wins - b.wins);

	return {
		name,
		format: typeof data.format === "string" ? data.format : undefined,
		entry: { amount: entryAmount, currency: entryCurrency },
		maxWins,
		maxLosses,
		rewards,
	};
}

// --- EV Computation ---

/** Compute the € value of a reward tier given valuation params. */
export function rewardValue(tier: RewardTier, valuation: ValuationParams): number {
	let total = 0;
	for (const [type, amount] of Object.entries(tier.items)) {
		total += amount * (valuation[type] ?? 0);
	}
	return total;
}

/** Compute the € value of the entry cost given valuation params. */
export function entryCost(event: ParsedEvent, valuation: ValuationParams): number {
	return event.entry.amount * (valuation[event.entry.currency] ?? 0);
}

/**
 * Compute expected value and standard deviation of outcome for a single win rate.
 */
export function expectedValueAndStdDev(
	event: ParsedEvent,
	valuation: ValuationParams,
	winRate: number,
): { ev: number; stdDev: number } {
	const probs = outcomeProbabilities(event.maxWins, event.maxLosses, winRate);
	const cost = entryCost(event, valuation);

	// Net value for each outcome (reward - entry cost)
	let ev = 0;
	let eSquared = 0;
	for (const [wins, prob] of probs) {
		const tier = event.rewards.find((r) => r.wins === wins);
		const net = (tier ? rewardValue(tier, valuation) : 0) - cost;
		ev += prob * net;
		eSquared += prob * net * net;
	}

	const variance = eSquared - ev * ev;
	return { ev, stdDev: Math.sqrt(Math.max(0, variance)) };
}

/**
 * Compute expected value for a single win rate.
 * Returns EV in the valuation currency.
 */
export function expectedValue(
	event: ParsedEvent,
	valuation: ValuationParams,
	winRate: number,
): number {
	return expectedValueAndStdDev(event, valuation, winRate).ev;
}

/**
 * Min and max possible net outcome for a single run.
 */
export function outcomeBounds(
	event: ParsedEvent,
	valuation: ValuationParams,
): { minNet: number; maxNet: number } {
	const cost = entryCost(event, valuation);
	let minNet = -cost; // worst case: no rewards
	let maxNet = -cost;
	for (const tier of event.rewards) {
		const net = rewardValue(tier, valuation) - cost;
		if (net < minNet) minNet = net;
		if (net > maxNet) maxNet = net;
	}
	return { minNet, maxNet };
}

export interface EvCurvePoint {
	winRate: number;
	ev: number;
	stdDev: number;
	evPlus1SD: number;
	evMinus1SD: number;
}

/**
 * Compute EV curve over a range of win rates.
 * @param range [min, max] as decimals (0.0–1.0)
 * @param steps Number of points (default 200)
 */
export function evCurve(
	event: ParsedEvent,
	valuation: ValuationParams,
	range: [number, number],
	steps = 200,
): EvCurvePoint[] {
	const [min, max] = range;
	const result: EvCurvePoint[] = [];
	for (let i = 0; i <= steps; i++) {
		const winRate = min + ((max - min) * i) / steps;
		const { ev, stdDev } = expectedValueAndStdDev(event, valuation, winRate);
		result.push({
			winRate,
			ev,
			stdDev,
			evPlus1SD: ev + stdDev,
			evMinus1SD: ev - stdDev,
		});
	}
	return result;
}

/**
 * Find the break-even win rate using bisection.
 * Returns null if EV has the same sign at both endpoints.
 */
export function breakEvenWinRate(
	event: ParsedEvent,
	valuation: ValuationParams,
	tolerance = 0.001,
): number | null {
	const evLow = expectedValue(event, valuation, 0);
	const evHigh = expectedValue(event, valuation, 1);

	// If same sign at both ends, no crossing
	if (evLow * evHigh > 0) return null;
	// Already at zero
	if (Math.abs(evLow) < tolerance) return 0;
	if (Math.abs(evHigh) < tolerance) return 1;

	let lo = 0;
	let hi = 1;
	while (hi - lo > tolerance) {
		const mid = (lo + hi) / 2;
		const evMid = expectedValue(event, valuation, mid);
		if (evMid * evLow > 0) {
			lo = mid;
		} else {
			hi = mid;
		}
	}
	return (lo + hi) / 2;
}
