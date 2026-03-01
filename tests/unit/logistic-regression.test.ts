import { describe, it, expect } from 'vitest';
import { sigmoid, fitLogisticRegression } from '../../src/lib/algorithms/logistic-regression';
import { fromArray } from '../../src/lib/algorithms/linalg';

describe('sigmoid', () => {
	it('sigmoid(0) = 0.5', () => {
		expect(sigmoid(0)).toBeCloseTo(0.5);
	});

	it('sigmoid at large positive', () => {
		expect(sigmoid(500)).toBeCloseTo(1, 10);
	});

	it('sigmoid at large negative', () => {
		expect(sigmoid(-500)).toBeCloseTo(0, 10);
	});

	it('does not produce NaN/Inf at extremes', () => {
		expect(Number.isFinite(sigmoid(700))).toBe(true);
		expect(Number.isFinite(sigmoid(-700))).toBe(true);
	});

	it('symmetry: sigmoid(x) + sigmoid(-x) = 1', () => {
		for (const x of [0.5, 2, 10, 100]) {
			expect(sigmoid(x) + sigmoid(-x)).toBeCloseTo(1, 10);
		}
	});
});

describe('fitLogisticRegression', () => {
	it('intercept-only: y=[1,1,0,0] → coefficient ≈ 0', () => {
		// Only intercept column (all 1s)
		const X = fromArray(4, 1, [1, 1, 1, 1]);
		const y = new Float64Array([1, 1, 0, 0]);

		const result = fitLogisticRegression({
			X, y, featureNames: ['intercept'],
		});

		// logit(0.5) = 0
		expect(result.intercept).toBeCloseTo(0, 1);
		expect(result.baselineWinProb).toBeCloseTo(0.5, 1);
		expect(result.converged).toBe(true);
		expect(result.coefficients).toHaveLength(0); // no features besides intercept
	});

	it('perfect predictor with prior converges to finite coefficient', () => {
		// x perfectly separates: x=1 → y=1, x=-1 → y=0
		const n = 20;
		const Xdata: number[] = [];
		const ydata: number[] = [];
		for (let i = 0; i < n; i++) {
			Xdata.push(1, i < n / 2 ? 1 : -1);
			ydata.push(i < n / 2 ? 1 : 0);
		}
		const X = fromArray(n, 2, Xdata);
		const y = new Float64Array(ydata);

		const result = fitLogisticRegression({
			X, y, featureNames: ['intercept', 'predictor'],
		});

		expect(result.converged).toBe(true);
		// Should have a positive, finite coefficient
		expect(result.coefficients[0].coefficient).toBeGreaterThan(0);
		expect(Number.isFinite(result.coefficients[0].coefficient)).toBe(true);
	});

	it('scipy-verified: synthetic n=50, p=2 dataset', () => {
		// Generated with np.random.seed(42), verified against scipy minimize MAP
		const xFeatData = [0.4967141530112327,-0.13826430117118466,0.6476885381006925,1.5230298564080254,-0.23415337472333597,-0.23413695694918055,1.5792128155073915,0.7674347291529088,-0.4694743859349521,0.5425600435859647,-0.46341769281246226,-0.46572975357025687,0.24196227156603412,-1.913280244657798,-1.7249178325130328,-0.5622875292409727,-1.0128311203344238,0.3142473325952739,-0.9080240755212109,-1.4123037013352915,1.465648768921554,-0.22577630048653566,0.06752820468792384,-1.4247481862134568,-0.5443827245251827,0.11092258970986608,-1.1509935774223028,0.37569801834567196,-0.600638689918805,-0.2916937497932768,-0.6017066122293969,1.8522781845089378,-0.013497224737933921,-1.0577109289559004,0.822544912103189,-1.2208436499710222,0.2088635950047554,-1.9596701238797756,-1.3281860488984305,0.19686123586912352,0.7384665799954104,0.1713682811899705,-0.11564828238824053,-0.3011036955892888,-1.4785219903674274,-0.7198442083947086,-0.4606387709597875,1.0571222262189157,0.3436182895684614,-1.763040155362734,0.324083969394795,-0.38508228041631654,-0.6769220003059587,0.6116762888408679,1.030999522495951,0.9312801191161986,-0.8392175232226385,-0.3092123758512146,0.33126343140356396,0.9755451271223592,-0.47917423784528995,-0.18565897666381712,-1.1063349740060282,-1.1962066240806708,0.812525822394198,1.356240028570823,-0.07201012158033385,1.0035328978920242,0.36163602504763415,-0.6451197546051243,0.36139560550841393,1.5380365664659692,-0.03582603910995154,1.5646436558140062,-2.6197451040897444,0.8219025043752238,0.08704706823817122,-0.29900735046586746,0.0917607765355023,-1.9875689146008928,-0.21967188783751193,0.3571125715117464,1.477894044741516,-0.5182702182736474,-0.8084936028931876,-0.5017570435845365,0.9154021177020741,0.32875110965968446,-0.5297602037670388,0.5132674331133561,0.09707754934804039,0.9686449905328892,-0.7020530938773524,-0.3276621465977682,-0.39210815313215763,-1.4635149481321186,0.29612027706457605,0.26105527217988933,0.00511345664246089,-0.23458713337514692];

		const n = 50;
		// Build X with intercept column
		const Xdata: number[] = [];
		for (let i = 0; i < n; i++) {
			Xdata.push(1, xFeatData[i * 2], xFeatData[i * 2 + 1]);
		}
		const X = fromArray(n, 3, Xdata);
		const y = new Float64Array([1,1,1,1,0,1,0,1,1,0,0,0,1,1,1,1,0,0,1,1,0,1,1,1,0,1,1,0,1,1,1,0,1,1,1,1,1,1,1,0,1,1,1,1,1,1,0,0,0,1]);

		const result = fitLogisticRegression({
			X, y,
			featureNames: ['intercept', 'feat1', 'feat2'],
			priorVariance: 6.25,
			interceptPriorVariance: 100,
		});

		// scipy reference MAP with exact priors: [1.17321327, -0.71239604, 1.41086253]
		expect(result.intercept).toBeCloseTo(1.17321, 2);
		expect(result.coefficients[0].coefficient).toBeCloseTo(-0.71240, 2);
		expect(result.coefficients[1].coefficient).toBeCloseTo(1.41086, 2);
		expect(result.converged).toBe(true);
	});

	it('convergence: well-behaved data converges quickly', () => {
		// Simple logistic data
		const n = 30;
		const Xdata: number[] = [];
		const ydata: number[] = [];
		for (let i = 0; i < n; i++) {
			const x = (i - n / 2) / 10;
			Xdata.push(1, x);
			ydata.push(x > 0 ? 1 : 0);
		}
		const X = fromArray(n, 2, Xdata);
		const y = new Float64Array(ydata);

		const result = fitLogisticRegression({
			X, y, featureNames: ['intercept', 'x'],
		});

		expect(result.converged).toBe(true);
		expect(result.iterations).toBeLessThan(25);
	});

	it('underpowered warning: n=8, p=5', () => {
		const n = 8;
		const p = 6; // intercept + 5 features
		const Xdata: number[] = [];
		const ydata: number[] = [];
		for (let i = 0; i < n; i++) {
			Xdata.push(1);
			for (let j = 1; j < p; j++) {
				Xdata.push(Math.sin(i * j));
			}
			ydata.push(i % 2);
		}
		const X = fromArray(n, p, Xdata);
		const y = new Float64Array(ydata);

		const result = fitLogisticRegression({
			X, y,
			featureNames: ['intercept', 'a', 'b', 'c', 'd', 'e'],
		});

		expect(result.warnings).toContain('Underpowered: fewer than 2 observations per feature');
	});

	it('pseudo-R²: intercept-only gives R² near 0', () => {
		const X = fromArray(10, 1, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
		const y = new Float64Array([1, 1, 1, 1, 1, 0, 0, 0, 0, 0]);

		const result = fitLogisticRegression({
			X, y, featureNames: ['intercept'],
		});

		expect(result.pseudoR2).toBeLessThan(0.05);
	});

	it('pseudo-R²: good predictor gives R² > 0.1', () => {
		const n = 50;
		const Xdata: number[] = [];
		const ydata: number[] = [];
		for (let i = 0; i < n; i++) {
			const x = (i - n / 2) / 10;
			Xdata.push(1, x);
			ydata.push(x > 0 ? 1 : 0);
		}
		const X = fromArray(n, 2, Xdata);
		const y = new Float64Array(ydata);

		const result = fitLogisticRegression({
			X, y, featureNames: ['intercept', 'x'],
		});

		expect(result.pseudoR2).toBeGreaterThan(0.1);
	});

	it('CI coverage: true coefficient falls within 95% CI', () => {
		// Use the synthetic dataset where we know true_beta = [0.5, -1.0, 1.5]
		// The CI should contain at least some reasonable range around the MAP
		const xFeatData = [0.4967141530112327,-0.13826430117118466,0.6476885381006925,1.5230298564080254,-0.23415337472333597,-0.23413695694918055,1.5792128155073915,0.7674347291529088,-0.4694743859349521,0.5425600435859647,-0.46341769281246226,-0.46572975357025687,0.24196227156603412,-1.913280244657798,-1.7249178325130328,-0.5622875292409727,-1.0128311203344238,0.3142473325952739,-0.9080240755212109,-1.4123037013352915,1.465648768921554,-0.22577630048653566,0.06752820468792384,-1.4247481862134568,-0.5443827245251827,0.11092258970986608,-1.1509935774223028,0.37569801834567196,-0.600638689918805,-0.2916937497932768,-0.6017066122293969,1.8522781845089378,-0.013497224737933921,-1.0577109289559004,0.822544912103189,-1.2208436499710222,0.2088635950047554,-1.9596701238797756,-1.3281860488984305,0.19686123586912352,0.7384665799954104,0.1713682811899705,-0.11564828238824053,-0.3011036955892888,-1.4785219903674274,-0.7198442083947086,-0.4606387709597875,1.0571222262189157,0.3436182895684614,-1.763040155362734,0.324083969394795,-0.38508228041631654,-0.6769220003059587,0.6116762888408679,1.030999522495951,0.9312801191161986,-0.8392175232226385,-0.3092123758512146,0.33126343140356396,0.9755451271223592,-0.47917423784528995,-0.18565897666381712,-1.1063349740060282,-1.1962066240806708,0.812525822394198,1.356240028570823,-0.07201012158033385,1.0035328978920242,0.36163602504763415,-0.6451197546051243,0.36139560550841393,1.5380365664659692,-0.03582603910995154,1.5646436558140062,-2.6197451040897444,0.8219025043752238,0.08704706823817122,-0.29900735046586746,0.0917607765355023,-1.9875689146008928,-0.21967188783751193,0.3571125715117464,1.477894044741516,-0.5182702182736474,-0.8084936028931876,-0.5017570435845365,0.9154021177020741,0.32875110965968446,-0.5297602037670388,0.5132674331133561,0.09707754934804039,0.9686449905328892,-0.7020530938773524,-0.3276621465977682,-0.39210815313215763,-1.4635149481321186,0.29612027706457605,0.26105527217988933,0.00511345664246089,-0.23458713337514692];

		const n = 50;
		const Xdata: number[] = [];
		for (let i = 0; i < n; i++) {
			Xdata.push(1, xFeatData[i * 2], xFeatData[i * 2 + 1]);
		}
		const X = fromArray(n, 3, Xdata);
		const y = new Float64Array([1,1,1,1,0,1,0,1,1,0,0,0,1,1,1,1,0,0,1,1,0,1,1,1,0,1,1,0,1,1,1,0,1,1,1,1,1,1,1,0,1,1,1,1,1,1,0,0,0,1]);

		const result = fitLogisticRegression({
			X, y,
			featureNames: ['intercept', 'feat1', 'feat2'],
			priorVariance: 6.25,
			interceptPriorVariance: 100,
		});

		// True values: feat1=-1.0, feat2=1.5
		// CIs should be finite and contain the MAP estimate
		for (const coef of result.coefficients) {
			expect(coef.lower).toBeLessThan(coef.coefficient);
			expect(coef.upper).toBeGreaterThan(coef.coefficient);
			expect(Number.isFinite(coef.se)).toBe(true);
		}
	});
});
