/**
 * Pure statistical math functions. No external dependencies.
 */

// ── Lanczos approximation for ln(Gamma) ──

const LANCZOS_G = 7;
const LANCZOS_COEFFS = [
	0.99999999999980993,
	676.5203681218851,
	-1259.1392167224028,
	771.32342877765313,
	-176.61502916214059,
	12.507343278686905,
	-0.13857109526572012,
	9.9843695780195716e-6,
	1.5056327351493116e-7,
];

export function lnGamma(z: number): number {
	if (z < 0.5) {
		// Reflection formula: Gamma(z) * Gamma(1-z) = pi / sin(pi*z)
		return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
	}
	z -= 1;
	let x = LANCZOS_COEFFS[0];
	for (let i = 1; i < LANCZOS_G + 2; i++) {
		x += LANCZOS_COEFFS[i] / (z + i);
	}
	const t = z + LANCZOS_G + 0.5;
	return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

// ── ln(n!) with caching ──

const LN_FACTORIAL_CACHE: number[] = [];

export function lnFactorial(n: number): number {
	if (n < 0) return NaN;
	if (n <= 1) return 0;
	if (n < 1024 && LN_FACTORIAL_CACHE[n] !== undefined) {
		return LN_FACTORIAL_CACHE[n];
	}
	const val = lnGamma(n + 1);
	if (n < 1024) {
		LN_FACTORIAL_CACHE[n] = val;
	}
	return val;
}

// ── Regularized incomplete beta function via continued fraction ──

/**
 * Continued fraction for incomplete beta (Numerical Recipes method).
 */
function betacf(a: number, b: number, x: number): number {
	const EPS = 1e-14;
	const FPMIN = 1e-30;
	const MAX_ITER = 200;

	const qab = a + b;
	const qap = a + 1;
	const qam = a - 1;

	let c = 1;
	let d = 1 - qab * x / qap;
	if (Math.abs(d) < FPMIN) d = FPMIN;
	d = 1 / d;
	let h = d;

	for (let m = 1; m <= MAX_ITER; m++) {
		const m2 = 2 * m;
		// Even step
		let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
		d = 1 + aa * d;
		if (Math.abs(d) < FPMIN) d = FPMIN;
		c = 1 + aa / c;
		if (Math.abs(c) < FPMIN) c = FPMIN;
		d = 1 / d;
		h *= d * c;
		// Odd step
		aa = -((a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
		d = 1 + aa * d;
		if (Math.abs(d) < FPMIN) d = FPMIN;
		c = 1 + aa / c;
		if (Math.abs(c) < FPMIN) c = FPMIN;
		d = 1 / d;
		const del = d * c;
		h *= del;
		if (Math.abs(del - 1) < EPS) break;
	}

	return h;
}

/**
 * Regularized incomplete beta function I_x(a, b).
 */
export function betaRegularized(x: number, a: number, b: number): number {
	if (x <= 0) return 0;
	if (x >= 1) return 1;

	// Use symmetry relation for better convergence
	if (x > (a + 1) / (a + b + 2)) {
		return 1 - betaRegularized(1 - x, b, a);
	}

	const lnPrefactor = a * Math.log(x) + b * Math.log(1 - x) - lnBeta(a, b);
	return Math.exp(lnPrefactor) * betacf(a, b, x) / a;
}

function lnBeta(a: number, b: number): number {
	return lnGamma(a) + lnGamma(b) - lnGamma(a + b);
}

// ── Beta distribution CDF and quantile ──

export function betaCdf(x: number, a: number, b: number): number {
	return betaRegularized(x, a, b);
}

/**
 * Inverse beta CDF via bisection search.
 */
export function betaQuantile(p: number, a: number, b: number): number {
	if (p <= 0) return 0;
	if (p >= 1) return 1;

	let lo = 0;
	let hi = 1;
	const TOL = 1e-10;

	for (let i = 0; i < 100; i++) {
		const mid = (lo + hi) / 2;
		const cdf = betaCdf(mid, a, b);
		if (cdf < p) {
			lo = mid;
		} else {
			hi = mid;
		}
		if (hi - lo < TOL) break;
	}
	return (lo + hi) / 2;
}

// ── Credible interval from Beta posterior ──

export interface CredibleInterval {
	mean: number;
	lower: number;
	upper: number;
}

/**
 * 95% Bayesian credible interval using Beta(1+wins, 1+losses) posterior
 * (Jeffreys-like uniform prior).
 */
export function credibleInterval(wins: number, losses: number, alpha = 0.05): CredibleInterval {
	const a = 1 + wins;
	const b = 1 + losses;
	return {
		mean: a / (a + b),
		lower: betaQuantile(alpha / 2, a, b),
		upper: betaQuantile(1 - alpha / 2, a, b),
	};
}

// ── P(A's winrate > B's winrate) via numerical integration ──

/**
 * Numerical probability that Beta(1+wA, 1+lA) > Beta(1+wB, 1+lB),
 * computed via Simpson's rule integration over the CDF.
 */
export function probAGreaterThanB(wA: number, lA: number, wB: number, lB: number): number {
	const aA = 1 + wA, bA = 1 + lA;
	const aB = 1 + wB, bB = 1 + lB;

	// Integrate: P(A > B) = ∫₀¹ P(B < x) * f_A(x) dx
	// where P(B < x) = I_x(aB, bB) and f_A(x) is Beta(aA, bA) PDF
	// Use Simpson's rule with N points
	const N = 1000;
	const h = 1 / N;

	let sum = 0;
	for (let i = 0; i <= N; i++) {
		const x = i * h;
		// Beta PDF for A: f(x) = x^(a-1) * (1-x)^(b-1) / B(a,b)
		const lnPdf = (aA - 1) * Math.log(x + 1e-300) + (bA - 1) * Math.log(1 - x + 1e-300) - lnBeta(aA, bA);
		const pdfA = Math.exp(lnPdf);
		const cdfB = betaCdf(x, aB, bB);

		const weight = (i === 0 || i === N) ? 1 : (i % 2 === 0) ? 2 : 4;
		sum += weight * cdfB * pdfA;
	}

	return (h / 3) * sum;
}

// ── Fisher's exact test (two-sided) ──

function hypergeometricLnPmf(k: number, K: number, n: number, N: number): number {
	// P(X=k) = C(K,k) * C(N-K, n-k) / C(N,n)
	return lnFactorial(K) - lnFactorial(k) - lnFactorial(K - k)
		+ lnFactorial(N - K) - lnFactorial(n - k) - lnFactorial(N - K - n + k)
		- lnFactorial(N) + lnFactorial(n) + lnFactorial(N - n);
}

/**
 * Two-sided Fisher's exact test for a 2×2 contingency table.
 * Table: [[gW, gL], [bW, bL]] (group wins/losses vs baseline wins/losses)
 */
export function fisherExactTest(gW: number, gL: number, bW: number, bL: number): number {
	const N = gW + gL + bW + bL;
	const K = gW + bW;       // total wins (column 1)
	const n = gW + gL;       // group total (row 1)

	const observedLnP = hypergeometricLnPmf(gW, K, n, N);

	// Sum probabilities of all tables as extreme or more extreme (two-sided)
	let pValue = 0;
	const kMin = Math.max(0, n - (N - K));
	const kMax = Math.min(n, K);

	for (let k = kMin; k <= kMax; k++) {
		const lnP = hypergeometricLnPmf(k, K, n, N);
		if (lnP <= observedLnP + 1e-10) { // as extreme or more extreme
			pValue += Math.exp(lnP);
		}
	}

	return Math.min(pValue, 1);
}

// ── Benjamini-Hochberg FDR correction ──

/**
 * Benjamini-Hochberg procedure for controlling false discovery rate.
 * Returns adjusted p-values in the same order as the input.
 */
export function benjaminiHochberg(pValues: number[]): number[] {
	const n = pValues.length;
	if (n === 0) return [];

	// Create indexed pairs and sort by p-value
	const indexed = pValues.map((p, i) => ({ p, i }));
	indexed.sort((a, b) => a.p - b.p);

	// Compute adjusted p-values (step-up)
	const adjusted = new Array<number>(n);
	let cumMin = 1;
	for (let rank = n; rank >= 1; rank--) {
		const idx = indexed[rank - 1].i;
		const raw = indexed[rank - 1].p;
		const adj = Math.min(raw * n / rank, cumMin);
		adjusted[idx] = Math.min(adj, 1);
		cumMin = Math.min(cumMin, adjusted[idx]);
	}

	return adjusted;
}

// ── Significance helpers ──

/**
 * Returns significance level: 0=ns, 1=* (p<0.05), 2=** (p<0.01), 3=*** (p<0.001)
 */
export function significanceLevel(p: number): number {
	if (p < 0.001) return 3;
	if (p < 0.01) return 2;
	if (p < 0.05) return 1;
	return 0;
}

export function significanceStars(level: number): string {
	switch (level) {
		case 3: return '***';
		case 2: return '**';
		case 1: return '*';
		default: return '';
	}
}
