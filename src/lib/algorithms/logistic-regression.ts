/**
 * Bayesian logistic regression via IRLS with Laplace approximation.
 * Designed for small feature sets (p ≤ 16).
 */

import {
	zeros, fromArray, xTwX, xTv, matAdd, diagMat,
	choleskySolve, choleskyInverse, get, type Matrix,
} from './linalg';

// ── Types ──

export interface LogisticRegressionInput {
	/** Design matrix: n×p (includes intercept column) */
	X: Matrix;
	/** Binary outcomes: n-length, 0 or 1 */
	y: Float64Array;
	/** Feature names (length p, first should be 'intercept') */
	featureNames: string[];
	/** Prior variance for coefficients (default 6.25 → σ=2.5) */
	priorVariance?: number;
	/** Prior variance for intercept (default 100 → σ=10) */
	interceptPriorVariance?: number;
	/** Max IRLS iterations (default 25) */
	maxIter?: number;
	/** Convergence tolerance (default 1e-6) */
	tol?: number;
}

export interface CardCoefficient {
	name: string;
	coefficient: number;
	se: number;
	lower: number;  // 95% CI lower
	upper: number;  // 95% CI upper
	/** Marginal effect: change in probability at baseline */
	marginalEffect: number;
}

export interface LogisticRegressionResult {
	coefficients: CardCoefficient[];
	intercept: number;
	baselineWinProb: number;
	pseudoR2: number;
	nObservations: number;
	nFeatures: number;
	converged: boolean;
	iterations: number;
	warnings: string[];
}

// ── Numerically stable sigmoid ──

export function sigmoid(x: number): number {
	if (x >= 0) {
		const ez = Math.exp(-x);
		return 1 / (1 + ez);
	} else {
		const ez = Math.exp(x);
		return ez / (1 + ez);
	}
}

// ── IRLS solver ──

export function fitLogisticRegression(input: LogisticRegressionInput): LogisticRegressionResult {
	const { X, y, featureNames } = input;
	const priorVar = input.priorVariance ?? 6.25;
	const interceptVar = input.interceptPriorVariance ?? 100;
	const maxIter = input.maxIter ?? 25;
	const tol = input.tol ?? 1e-6;

	const n = X.rows;
	const p = X.cols;
	const warnings: string[] = [];

	if (n < p * 2) {
		warnings.push('Underpowered: fewer than 2 observations per feature');
	}

	// Prior precision matrix Λ = diag(1/σ²)
	const lambdaVec = new Float64Array(p);
	for (let j = 0; j < p; j++) {
		lambdaVec[j] = 1 / (j === 0 ? interceptVar : priorVar);
	}
	const Lambda = diagMat(lambdaVec);

	// Initialize β to zeros
	let beta = new Float64Array(p);

	let converged = false;
	let iterations = 0;

	for (let iter = 0; iter < maxIter; iter++) {
		iterations = iter + 1;

		// Compute μ = sigmoid(Xβ) and weights W = μ(1-μ)
		const mu = new Float64Array(n);
		const w = new Float64Array(n);
		for (let i = 0; i < n; i++) {
			let eta = 0;
			for (let j = 0; j < p; j++) {
				eta += X.data[i * p + j] * beta[j];
			}
			mu[i] = sigmoid(eta);
			w[i] = mu[i] * (1 - mu[i]);
			// Clamp weights away from zero for numerical stability
			if (w[i] < 1e-10) w[i] = 1e-10;
		}

		// Gradient: X^T(y - μ) - Λβ
		const residuals = new Float64Array(n);
		for (let i = 0; i < n; i++) residuals[i] = y[i] - mu[i];
		const grad = xTv(X, residuals);
		for (let j = 0; j < p; j++) {
			grad[j] -= lambdaVec[j] * beta[j];
		}

		// Hessian: H = X^T W X + Λ
		const H = matAdd(xTwX(X, w), Lambda);

		// Newton step: δ = H^{-1} grad
		let delta: Float64Array;
		try {
			delta = choleskySolve(H, grad);
		} catch {
			warnings.push('Hessian not positive definite; stopping early');
			break;
		}

		// Update β
		const newBeta = new Float64Array(p);
		let maxChange = 0;
		for (let j = 0; j < p; j++) {
			newBeta[j] = beta[j] + delta[j];
			maxChange = Math.max(maxChange, Math.abs(delta[j]));
		}
		beta = newBeta;

		if (maxChange < tol) {
			converged = true;
			break;
		}
	}

	// Laplace approximation: posterior covariance = H^{-1} at final β
	const muFinal = new Float64Array(n);
	const wFinal = new Float64Array(n);
	for (let i = 0; i < n; i++) {
		let eta = 0;
		for (let j = 0; j < p; j++) {
			eta += X.data[i * p + j] * beta[j];
		}
		muFinal[i] = sigmoid(eta);
		wFinal[i] = muFinal[i] * (1 - muFinal[i]);
		if (wFinal[i] < 1e-10) wFinal[i] = 1e-10;
	}

	const Hfinal = matAdd(xTwX(X, wFinal), Lambda);
	let covariance: Matrix;
	try {
		covariance = choleskyInverse(Hfinal);
	} catch {
		warnings.push('Could not compute posterior covariance');
		covariance = zeros(p, p);
	}

	// Compute pseudo-R²: McFadden's R² = 1 - LL(model) / LL(null)
	const yMean = y.reduce((s, v) => s + v, 0) / n;
	let llNull = 0;
	let llModel = 0;
	for (let i = 0; i < n; i++) {
		llNull += y[i] * Math.log(yMean + 1e-15) + (1 - y[i]) * Math.log(1 - yMean + 1e-15);
		llModel += y[i] * Math.log(muFinal[i] + 1e-15) + (1 - y[i]) * Math.log(1 - muFinal[i] + 1e-15);
	}
	const pseudoR2 = llNull !== 0 ? 1 - llModel / llNull : 0;

	// Build coefficients
	const baselineProb = sigmoid(beta[0]);
	const coefficients: CardCoefficient[] = [];

	for (let j = 1; j < p; j++) {
		const se = Math.sqrt(Math.max(0, get(covariance, j, j)));
		const coef = beta[j];
		coefficients.push({
			name: featureNames[j],
			coefficient: coef,
			se,
			lower: coef - 1.96 * se,
			upper: coef + 1.96 * se,
			marginalEffect: baselineProb * (1 - baselineProb) * coef,
		});
	}

	return {
		coefficients,
		intercept: beta[0],
		baselineWinProb: baselineProb,
		pseudoR2,
		nObservations: n,
		nFeatures: p - 1,
		converged,
		iterations,
		warnings,
	};
}
