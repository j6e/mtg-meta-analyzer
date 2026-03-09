/**
 * Small dense matrix operations for matrices up to ~16×16.
 * Row-major layout using Float64Array.
 */

export interface Matrix {
	rows: number;
	cols: number;
	data: Float64Array;
}

export function zeros(rows: number, cols: number): Matrix {
	return { rows, cols, data: new Float64Array(rows * cols) };
}

export function eye(n: number): Matrix {
	const m = zeros(n, n);
	for (let i = 0; i < n; i++) m.data[i * n + i] = 1;
	return m;
}

export function fromArray(rows: number, cols: number, values: number[]): Matrix {
	const m = zeros(rows, cols);
	m.data.set(values);
	return m;
}

export function get(m: Matrix, i: number, j: number): number {
	return m.data[i * m.cols + j];
}

export function set(m: Matrix, i: number, j: number, v: number): void {
	m.data[i * m.cols + j] = v;
}

export function clone(m: Matrix): Matrix {
	return { rows: m.rows, cols: m.cols, data: new Float64Array(m.data) };
}

/** C = A × B */
export function matMul(a: Matrix, b: Matrix): Matrix {
	const c = zeros(a.rows, b.cols);
	for (let i = 0; i < a.rows; i++) {
		for (let k = 0; k < a.cols; k++) {
			const aik = a.data[i * a.cols + k];
			if (aik === 0) continue;
			for (let j = 0; j < b.cols; j++) {
				c.data[i * b.cols + j] += aik * b.data[k * b.cols + j];
			}
		}
	}
	return c;
}

/** y = A × x */
export function matVecMul(a: Matrix, x: Float64Array): Float64Array {
	const y = new Float64Array(a.rows);
	for (let i = 0; i < a.rows; i++) {
		let sum = 0;
		for (let j = 0; j < a.cols; j++) {
			sum += a.data[i * a.cols + j] * x[j];
		}
		y[i] = sum;
	}
	return y;
}

export function transpose(m: Matrix): Matrix {
	const t = zeros(m.cols, m.rows);
	for (let i = 0; i < m.rows; i++) {
		for (let j = 0; j < m.cols; j++) {
			t.data[j * m.rows + i] = m.data[i * m.cols + j];
		}
	}
	return t;
}

/** C = A + B (element-wise) */
export function matAdd(a: Matrix, b: Matrix): Matrix {
	const c = zeros(a.rows, a.cols);
	for (let i = 0; i < a.data.length; i++) {
		c.data[i] = a.data[i] + b.data[i];
	}
	return c;
}

/** Extract diagonal as a vector */
export function diag(m: Matrix): Float64Array {
	const n = Math.min(m.rows, m.cols);
	const d = new Float64Array(n);
	for (let i = 0; i < n; i++) d[i] = m.data[i * m.cols + i];
	return d;
}

/** Create diagonal matrix from vector */
export function diagMat(v: Float64Array): Matrix {
	const n = v.length;
	const m = zeros(n, n);
	for (let i = 0; i < n; i++) m.data[i * n + i] = v[i];
	return m;
}

/**
 * Compute X^T W X where W is a diagonal matrix given as a vector.
 * Result is p×p where X is n×p.
 */
export function xTwX(x: Matrix, w: Float64Array): Matrix {
	const n = x.rows;
	const p = x.cols;
	const result = zeros(p, p);
	for (let j = 0; j < p; j++) {
		for (let k = j; k < p; k++) {
			let sum = 0;
			for (let i = 0; i < n; i++) {
				sum += x.data[i * p + j] * w[i] * x.data[i * p + k];
			}
			result.data[j * p + k] = sum;
			result.data[k * p + j] = sum; // symmetric
		}
	}
	return result;
}

/**
 * Compute X^T v where v is a vector.
 * Result is a p-length vector where X is n×p.
 */
export function xTv(x: Matrix, v: Float64Array): Float64Array {
	const p = x.cols;
	const n = x.rows;
	const result = new Float64Array(p);
	for (let j = 0; j < p; j++) {
		let sum = 0;
		for (let i = 0; i < n; i++) {
			sum += x.data[i * p + j] * v[i];
		}
		result[j] = sum;
	}
	return result;
}

/**
 * Cholesky decomposition: A = L L^T for symmetric positive-definite A.
 * Returns lower-triangular L in-place (modifies a copy).
 */
function cholesky(a: Matrix): Matrix {
	const n = a.rows;
	const L = clone(a);

	for (let j = 0; j < n; j++) {
		let sum = 0;
		for (let k = 0; k < j; k++) {
			sum += L.data[j * n + k] * L.data[j * n + k];
		}
		const diag = L.data[j * n + j] - sum;
		if (diag <= 0) {
			throw new Error("Matrix is not positive definite");
		}
		L.data[j * n + j] = Math.sqrt(diag);

		for (let i = j + 1; i < n; i++) {
			let s = 0;
			for (let k = 0; k < j; k++) {
				s += L.data[i * n + k] * L.data[j * n + k];
			}
			L.data[i * n + j] = (L.data[i * n + j] - s) / L.data[j * n + j];
		}

		// Zero out upper triangle
		for (let i = 0; i < j; i++) {
			L.data[i * n + j] = 0;
		}
	}

	return L;
}

/**
 * Solve Ax = b for symmetric positive-definite A using Cholesky.
 * Returns x.
 */
export function choleskySolve(a: Matrix, b: Float64Array): Float64Array {
	const n = a.rows;
	const L = cholesky(a);

	// Forward substitution: Ly = b
	const y = new Float64Array(n);
	for (let i = 0; i < n; i++) {
		let sum = 0;
		for (let j = 0; j < i; j++) {
			sum += L.data[i * n + j] * y[j];
		}
		y[i] = (b[i] - sum) / L.data[i * n + i];
	}

	// Back substitution: L^T x = y
	const x = new Float64Array(n);
	for (let i = n - 1; i >= 0; i--) {
		let sum = 0;
		for (let j = i + 1; j < n; j++) {
			sum += L.data[j * n + i] * x[j]; // L^T[i][j] = L[j][i]
		}
		x[i] = (y[i] - sum) / L.data[i * n + i];
	}

	return x;
}

/**
 * Compute A^{-1} for symmetric positive-definite A using Cholesky.
 * Returns the inverse matrix.
 */
export function choleskyInverse(a: Matrix): Matrix {
	const n = a.rows;
	const inv = zeros(n, n);

	// Solve A * col = e_i for each column i
	for (let i = 0; i < n; i++) {
		const ei = new Float64Array(n);
		ei[i] = 1;
		const col = choleskySolve(a, ei);
		for (let j = 0; j < n; j++) {
			inv.data[j * n + i] = col[j];
		}
	}

	return inv;
}
