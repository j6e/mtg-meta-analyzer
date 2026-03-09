import { describe, expect, it } from "vitest";
import {
	benjaminiHochberg,
	betaCdf,
	betaQuantile,
	betaRegularized,
	credibleInterval,
	fisherExactTest,
	lnFactorial,
	lnGamma,
	probAGreaterThanB,
	significanceLevel,
	significanceStars,
} from "../../src/lib/algorithms/statistics";

function approx(actual: number, expected: number, tol = 1e-4) {
	expect(actual).toBeCloseTo(expected, -Math.log10(tol));
}

// ── lnGamma ──

describe("lnGamma", () => {
	it("known integer values", () => {
		approx(lnGamma(1), 0); // Gamma(1) = 1
		approx(lnGamma(2), 0); // Gamma(2) = 1
		approx(lnGamma(5), Math.log(24)); // Gamma(5) = 4! = 24
		approx(lnGamma(10), Math.log(362880)); // Gamma(10) = 9!
	});

	it("half-integer value", () => {
		approx(lnGamma(0.5), Math.log(Math.sqrt(Math.PI)), 1e-8);
	});

	it("large value", () => {
		approx(lnGamma(100), 359.1342, 1e-2);
	});

	it("recurrence relation: lnGamma(n+1) = ln(n) + lnGamma(n)", () => {
		for (const n of [2, 5, 10, 20]) {
			approx(lnGamma(n + 1), Math.log(n) + lnGamma(n), 1e-8);
		}
	});

	it("small value does not produce NaN", () => {
		expect(Number.isFinite(lnGamma(0.001))).toBe(true);
	});
});

// ── lnFactorial ──

describe("lnFactorial", () => {
	it("base cases", () => {
		expect(lnFactorial(0)).toBe(0);
		expect(lnFactorial(1)).toBe(0);
	});

	it("known values", () => {
		approx(lnFactorial(5), Math.log(120));
		approx(lnFactorial(10), Math.log(3628800));
	});

	it("large value does not overflow", () => {
		expect(Number.isFinite(lnFactorial(170))).toBe(true);
		expect(Number.isFinite(lnFactorial(1000))).toBe(true);
	});

	it("cache consistency", () => {
		const first = lnFactorial(42);
		const second = lnFactorial(42);
		expect(first).toBe(second);
	});

	it("negative returns NaN", () => {
		expect(Number.isNaN(lnFactorial(-1))).toBe(true);
	});
});

// ── betaRegularized ──

describe("betaRegularized", () => {
	it("boundaries: I_0 = 0, I_1 = 1", () => {
		for (const [a, b] of [
			[1, 1],
			[2, 3],
			[10, 5],
		]) {
			expect(betaRegularized(0, a, b)).toBe(0);
			expect(betaRegularized(1, a, b)).toBe(1);
		}
	});

	it("symmetry: I_0.5(a, a) = 0.5", () => {
		for (const a of [1, 2, 5, 10, 50]) {
			approx(betaRegularized(0.5, a, a), 0.5, 1e-6);
		}
	});

	it("symmetry relation: I_x(a,b) = 1 - I_{1-x}(b,a)", () => {
		const val = betaRegularized(0.3, 2, 5);
		const complement = 1 - betaRegularized(0.7, 5, 2);
		approx(val, complement, 1e-8);
	});

	it("scipy-verified reference values", () => {
		// scipy.special.betainc(2, 5, 0.3) = 0.5798250000
		approx(betaRegularized(0.3, 2, 5), 0.579825, 1e-6);
		// scipy.special.betainc(5, 2, 0.7) = 0.4201750000
		approx(betaRegularized(0.7, 5, 2), 0.420175, 1e-6);
		// scipy.special.betainc(1, 10, 0.1) = 0.6513215599
		approx(betaRegularized(0.1, 1, 10), 0.6513215599, 1e-6);
		approx(betaRegularized(0.5, 10, 10), 0.5, 1e-6);
	});

	it("uniform distribution: I_x(1,1) = x", () => {
		approx(betaRegularized(0.01, 1, 1), 0.01, 1e-6);
		approx(betaRegularized(0.5, 1, 1), 0.5, 1e-6);
		approx(betaRegularized(0.99, 1, 1), 0.99, 1e-6);
	});

	it("extreme parameters", () => {
		approx(betaRegularized(0.5, 100, 100), 0.5, 1e-3);
		// Beta(1, 100) is heavily right-skewed, I_0.5(1,100) should be very close to 1
		expect(betaRegularized(0.5, 1, 100)).toBeGreaterThan(0.99);
	});

	it("does not return NaN", () => {
		expect(Number.isFinite(betaRegularized(0.5, 0.5, 0.5))).toBe(true);
		expect(Number.isFinite(betaRegularized(0.1, 100, 1))).toBe(true);
	});
});

// ── betaCdf / betaQuantile ──

describe("betaCdf / betaQuantile", () => {
	it("roundtrip: betaCdf(betaQuantile(p, a, b), a, b) ≈ p", () => {
		const ps = [0.025, 0.1, 0.5, 0.9, 0.975];
		const params = [
			[1, 1],
			[2, 2],
			[10, 5],
			[50, 50],
		];
		for (const [a, b] of params) {
			for (const p of ps) {
				const q = betaQuantile(p, a, b);
				approx(betaCdf(q, a, b), p, 1e-6);
			}
		}
	});

	it("known quantiles for uniform", () => {
		approx(betaQuantile(0.5, 1, 1), 0.5, 1e-6);
		approx(betaQuantile(0.025, 1, 1), 0.025, 1e-6);
	});

	it("symmetric distribution", () => {
		approx(betaQuantile(0.5, 2, 2), 0.5, 1e-6);
	});
});

// ── credibleInterval ──

describe("credibleInterval", () => {
	it("no data: Beta(1,1) → wide CI around 0.5 (scipy-verified)", () => {
		const ci = credibleInterval(0, 0);
		approx(ci.mean, 0.5);
		// scipy: beta.ppf(0.025, 1, 1) = 0.025, beta.ppf(0.975, 1, 1) = 0.975
		approx(ci.lower, 0.025, 1e-3);
		approx(ci.upper, 0.975, 1e-3);
	});

	it("symmetric: (10,10) → CI around 0.5 (scipy-verified)", () => {
		const ci = credibleInterval(10, 10);
		approx(ci.mean, 0.5);
		// scipy: beta.ppf(0.025, 11, 11) = 0.297807, beta.ppf(0.975, 11, 11) = 0.702193
		approx(ci.lower, 0.297807, 1e-3);
		approx(ci.upper, 0.702193, 1e-3);
	});

	it("extreme win: (50,0) → scipy-verified CI", () => {
		const ci = credibleInterval(50, 0);
		// scipy: mean=0.980769, lower=0.930223, upper=0.999504
		approx(ci.mean, 0.980769, 1e-4);
		approx(ci.lower, 0.930223, 1e-3);
		approx(ci.upper, 0.999504, 1e-3);
	});

	it("extreme loss: (0,50) → scipy-verified CI", () => {
		const ci = credibleInterval(0, 50);
		// scipy: mean=0.019231, lower=0.000496, upper=0.069777
		approx(ci.mean, 0.019231, 1e-4);
		approx(ci.lower, 0.000496, 1e-3);
		approx(ci.upper, 0.069777, 1e-3);
	});

	it("large sample: (100,100) → scipy-verified CI", () => {
		const ci = credibleInterval(100, 100);
		// scipy: lower=0.431291, upper=0.568709, width=0.137418
		approx(ci.lower, 0.431291, 1e-3);
		approx(ci.upper, 0.568709, 1e-3);
	});

	it("CI width decreases with sample size", () => {
		const ci10 = credibleInterval(5, 5);
		const ci100 = credibleInterval(50, 50);
		const w10 = ci10.upper - ci10.lower;
		const w100 = ci100.upper - ci100.lower;
		expect(w100).toBeLessThan(w10);
	});
});

// ── probAGreaterThanB ──

describe("probAGreaterThanB", () => {
	it("equal records → ≈ 0.5", () => {
		approx(probAGreaterThanB(5, 5, 5, 5), 0.5, 0.02);
	});

	it("dominant A → > 0.99", () => {
		expect(probAGreaterThanB(10, 0, 0, 10)).toBeGreaterThan(0.99);
	});

	it("dominant B → < 0.01", () => {
		expect(probAGreaterThanB(0, 10, 10, 0)).toBeLessThan(0.01);
	});

	it("complement property: P(A>B) + P(B>A) ≈ 1", () => {
		const pAB = probAGreaterThanB(8, 2, 3, 7);
		const pBA = probAGreaterThanB(3, 7, 8, 2);
		approx(pAB + pBA, 1.0, 0.02);
	});

	it("no data → ≈ 0.5", () => {
		approx(probAGreaterThanB(0, 0, 0, 0), 0.5, 0.02);
	});

	it("asymmetric: (20,10) vs (10,20) → > 0.5", () => {
		expect(probAGreaterThanB(20, 10, 10, 20)).toBeGreaterThan(0.5);
	});
});

// ── fisherExactTest ──

describe("fisherExactTest", () => {
	it("Lady Tasting Tea: scipy fisher_exact([[3,1],[1,3]]) = 0.4857142857", () => {
		approx(fisherExactTest(3, 1, 1, 3), 0.4857142857, 1e-6);
	});

	it("extreme: scipy fisher_exact([[10,0],[0,10]]) = 0.0000108251", () => {
		approx(fisherExactTest(10, 0, 0, 10), 0.0000108251, 1e-6);
	});

	it("no difference: scipy fisher_exact([[5,5],[5,5]]) = 1.0", () => {
		approx(fisherExactTest(5, 5, 5, 5), 1.0, 1e-6);
	});

	it("asymmetric: scipy fisher_exact([[8,2],[3,7]]) = 0.0697785187", () => {
		approx(fisherExactTest(8, 2, 3, 7), 0.0697785187, 1e-6);
	});

	it("single observation: scipy fisher_exact([[1,0],[0,1]]) = 1.0", () => {
		approx(fisherExactTest(1, 0, 0, 1), 1.0, 1e-6);
	});

	it("large: scipy fisher_exact([[50,50],[60,40]]) = 0.2007076001", () => {
		approx(fisherExactTest(50, 50, 60, 40), 0.2007076001, 1e-4);
	});

	it("p is always in [0, 1]", () => {
		const cases = [
			[5, 3, 2, 8],
			[10, 10, 10, 10],
			[0, 5, 5, 0],
			[3, 7, 8, 2],
		];
		for (const [a, b, c, d] of cases) {
			const p = fisherExactTest(a, b, c, d);
			expect(p).toBeGreaterThanOrEqual(0);
			expect(p).toBeLessThanOrEqual(1);
		}
	});

	it("swapping rows does not change p", () => {
		const p1 = fisherExactTest(8, 2, 3, 7);
		const p2 = fisherExactTest(3, 7, 8, 2);
		approx(p1, p2, 1e-8);
	});
});

// ── benjaminiHochberg ──

describe("benjaminiHochberg", () => {
	it("empty → empty", () => {
		expect(benjaminiHochberg([])).toEqual([]);
	});

	it("single value unchanged", () => {
		const result = benjaminiHochberg([0.03]);
		expect(result).toHaveLength(1);
		approx(result[0], 0.03);
	});

	it("all significant stay significant", () => {
		const result = benjaminiHochberg([0.001, 0.002, 0.003]);
		for (const p of result) {
			expect(p).toBeLessThan(0.05);
		}
	});

	it("none significant stay non-significant", () => {
		const result = benjaminiHochberg([0.5, 0.6, 0.7]);
		for (const p of result) {
			expect(p).toBeGreaterThan(0.05);
		}
	});

	it("statsmodels-verified: BH([0.01, 0.04, 0.03, 0.20])", () => {
		// statsmodels multipletests(method='fdr_bh') reference values
		const raw = [0.01, 0.04, 0.03, 0.2];
		const adjusted = benjaminiHochberg(raw);
		approx(adjusted[0], 0.04, 1e-6); // 0.01 → 0.04
		approx(adjusted[1], 0.0533333333, 1e-6); // 0.04 → 0.0533
		approx(adjusted[2], 0.0533333333, 1e-6); // 0.03 → 0.0533 (enforced monotonicity)
		approx(adjusted[3], 0.2, 1e-6); // 0.20 → 0.20
	});

	it("adjusted ≥ raw for every p-value", () => {
		const raw = [0.01, 0.04, 0.03, 0.2];
		const adjusted = benjaminiHochberg(raw);
		for (let i = 0; i < raw.length; i++) {
			expect(adjusted[i]).toBeGreaterThanOrEqual(raw[i] - 1e-10);
		}
	});

	it("adjusted values sorted by raw p are monotonically non-decreasing", () => {
		const raw = [0.01, 0.04, 0.03, 0.2];
		const adjusted = benjaminiHochberg(raw);
		// Sort both by raw p-value
		const indexed = raw.map((p, i) => ({ raw: p, adj: adjusted[i] }));
		indexed.sort((a, b) => a.raw - b.raw);
		for (let i = 1; i < indexed.length; i++) {
			expect(indexed[i].adj).toBeGreaterThanOrEqual(indexed[i - 1].adj - 1e-10);
		}
	});
});

// ── significanceLevel / significanceStars ──

describe("significanceLevel", () => {
	it("boundary values", () => {
		expect(significanceLevel(0.05)).toBe(0); // at threshold = ns
		expect(significanceLevel(0.049)).toBe(1); // just below = *
		expect(significanceLevel(0.01)).toBe(1); // at threshold = *
		expect(significanceLevel(0.009)).toBe(2); // just below = **
		expect(significanceLevel(0.001)).toBe(2); // at threshold = **
		expect(significanceLevel(0.0009)).toBe(3); // just below = ***
	});
});

describe("significanceStars", () => {
	it("returns correct stars", () => {
		expect(significanceStars(0)).toBe("");
		expect(significanceStars(1)).toBe("*");
		expect(significanceStars(2)).toBe("**");
		expect(significanceStars(3)).toBe("***");
	});
});
