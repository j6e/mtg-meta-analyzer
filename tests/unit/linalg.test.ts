import { describe, it, expect } from 'vitest';
import {
	zeros, eye, fromArray, get, matMul, matVecMul,
	transpose, matAdd, diag, xTwX, xTv,
	choleskySolve, choleskyInverse,
} from '../../src/lib/algorithms/linalg';

function approxArr(actual: Float64Array | number[], expected: number[], tol = 1e-8) {
	expect(actual.length).toBe(expected.length);
	for (let i = 0; i < expected.length; i++) {
		expect(actual[i]).toBeCloseTo(expected[i], -Math.log10(tol));
	}
}

describe('matMul', () => {
	it('identity × A = A', () => {
		const I = eye(2);
		const A = fromArray(2, 2, [1, 2, 3, 4]);
		const result = matMul(I, A);
		approxArr(result.data, [1, 2, 3, 4]);
	});

	it('2×3 × 3×2 hand-computed', () => {
		// A = [[1,2,3],[4,5,6]], B = [[7,8],[9,10],[11,12]]
		// AB = [[1*7+2*9+3*11, 1*8+2*10+3*12], [4*7+5*9+6*11, 4*8+5*10+6*12]]
		//    = [[58, 64], [139, 154]]
		const A = fromArray(2, 3, [1, 2, 3, 4, 5, 6]);
		const B = fromArray(3, 2, [7, 8, 9, 10, 11, 12]);
		const C = matMul(A, B);
		expect(C.rows).toBe(2);
		expect(C.cols).toBe(2);
		approxArr(C.data, [58, 64, 139, 154]);
	});

	it('associativity: (AB)C = A(BC)', () => {
		const A = fromArray(2, 2, [1, 2, 3, 4]);
		const B = fromArray(2, 2, [5, 6, 7, 8]);
		const C = fromArray(2, 2, [9, 10, 11, 12]);
		const AB_C = matMul(matMul(A, B), C);
		const A_BC = matMul(A, matMul(B, C));
		approxArr(AB_C.data, Array.from(A_BC.data));
	});
});

describe('matVecMul', () => {
	it('identity × v = v', () => {
		const I = eye(3);
		const v = new Float64Array([1, 2, 3]);
		approxArr(matVecMul(I, v), [1, 2, 3]);
	});

	it('known 2×2 system', () => {
		// [[2,1],[0,3]] × [1,2] = [4, 6]
		const A = fromArray(2, 2, [2, 1, 0, 3]);
		const v = new Float64Array([1, 2]);
		approxArr(matVecMul(A, v), [4, 6]);
	});
});

describe('choleskySolve', () => {
	it('2×2 SPD system', () => {
		// A = [[4, 2], [2, 3]], b = [1, 2]
		// Solution: x = [-0.125, 0.75]
		const A = fromArray(2, 2, [4, 2, 2, 3]);
		const b = new Float64Array([1, 2]);
		const x = choleskySolve(A, b);

		// Verify Ax ≈ b
		const Ax = matVecMul(A, x);
		approxArr(Ax, [1, 2]);
	});

	it('3×3 SPD system', () => {
		// A = [[4, 2, 1], [2, 5, 3], [1, 3, 6]]
		const A = fromArray(3, 3, [4, 2, 1, 2, 5, 3, 1, 3, 6]);
		const b = new Float64Array([1, 2, 3]);
		const x = choleskySolve(A, b);

		// Verify Ax ≈ b
		const Ax = matVecMul(A, x);
		approxArr(Ax, [1, 2, 3]);
	});

	it('throws for non-PD matrix', () => {
		// Negative eigenvalue: [[1, 0], [0, -1]]
		const A = fromArray(2, 2, [1, 0, 0, -1]);
		const b = new Float64Array([1, 1]);
		expect(() => choleskySolve(A, b)).toThrow('not positive definite');
	});
});

describe('choleskyInverse', () => {
	it('A × A^{-1} ≈ I for 3×3 SPD', () => {
		const A = fromArray(3, 3, [4, 2, 1, 2, 5, 3, 1, 3, 6]);
		const Ainv = choleskyInverse(A);
		const I = matMul(A, Ainv);

		// Should be close to identity
		for (let i = 0; i < 3; i++) {
			for (let j = 0; j < 3; j++) {
				expect(get(I, i, j)).toBeCloseTo(i === j ? 1 : 0, 10);
			}
		}
	});

	it('result is symmetric', () => {
		const A = fromArray(3, 3, [4, 2, 1, 2, 5, 3, 1, 3, 6]);
		const Ainv = choleskyInverse(A);

		for (let i = 0; i < 3; i++) {
			for (let j = i + 1; j < 3; j++) {
				expect(get(Ainv, i, j)).toBeCloseTo(get(Ainv, j, i), 10);
			}
		}
	});
});

describe('xTwX', () => {
	it('matches naive X^T diag(w) X', () => {
		// X = [[1, 2], [3, 4], [5, 6]], w = [0.5, 1.0, 1.5]
		const X = fromArray(3, 2, [1, 2, 3, 4, 5, 6]);
		const w = new Float64Array([0.5, 1.0, 1.5]);

		const result = xTwX(X, w);

		// Naive: X^T × diag(w) × X
		const Xt = transpose(X);
		const diagW = fromArray(3, 3, [0.5, 0, 0, 0, 1, 0, 0, 0, 1.5]);
		const naive = matMul(matMul(Xt, diagW), X);

		approxArr(result.data, Array.from(naive.data));
	});
});

describe('xTv', () => {
	it('computes X^T v correctly', () => {
		const X = fromArray(3, 2, [1, 2, 3, 4, 5, 6]);
		const v = new Float64Array([1, 2, 3]);
		// X^T v = [[1,3,5],[2,4,6]] × [1,2,3] = [1+6+15, 2+8+18] = [22, 28]
		approxArr(xTv(X, v), [22, 28]);
	});
});

describe('1×1 edge case', () => {
	it('single-element matrix operations', () => {
		const A = fromArray(1, 1, [4]);
		const b = new Float64Array([8]);
		const x = choleskySolve(A, b);
		expect(x[0]).toBeCloseTo(2);

		const Ainv = choleskyInverse(A);
		expect(get(Ainv, 0, 0)).toBeCloseTo(0.25);
	});
});
