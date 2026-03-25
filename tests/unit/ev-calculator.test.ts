// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { ValuationParams } from "$lib/algorithms/ev-calculator";
import {
	breakEvenWinRate,
	entryCost,
	evCurve,
	expectedValue,
	expectedValueAndStdDev,
	outcomeProbabilities,
	parseEventYaml,
	rewardValue,
} from "$lib/algorithms/ev-calculator";

const SAMPLE_YAML = `
name: Test Event
format: Bo1
entry:
  amount: 8000
  currency: gems
max_wins: 7
max_losses: 3
rewards:
  0-2: {}
  3:
    gems: 3600
    packs: 8
  4:
    gems: 7200
    packs: 16
  5:
    gems: 10800
    packs: 24
  6:
    booster_boxes: 1
  7:
    booster_boxes: 2
`;

const VALUATION: ValuationParams = {
	gems: 0.01, // €0.01 per gem (= €10 per 1000 gems)
	packs: 1, // €1 per pack
	booster_boxes: 120, // €120 per box
};

function getParsedEvent(): ParsedEvent {
	return parseEventYaml(SAMPLE_YAML);
}

// --- outcomeProbabilities ---

describe("outcomeProbabilities", () => {
	it("sums to 1.0 for p=0.5", () => {
		const probs = outcomeProbabilities(7, 3, 0.5);
		let sum = 0;
		for (const p of probs.values()) sum += p;
		expect(sum).toBeCloseTo(1.0, 10);
	});

	it("sums to 1.0 for p=0.0", () => {
		const probs = outcomeProbabilities(7, 3, 0.0);
		let sum = 0;
		for (const p of probs.values()) sum += p;
		expect(sum).toBeCloseTo(1.0, 10);
	});

	it("sums to 1.0 for p=1.0", () => {
		const probs = outcomeProbabilities(7, 3, 1.0);
		let sum = 0;
		for (const p of probs.values()) sum += p;
		expect(sum).toBeCloseTo(1.0, 10);
	});

	it("sums to 1.0 for p=0.3", () => {
		const probs = outcomeProbabilities(7, 3, 0.3);
		let sum = 0;
		for (const p of probs.values()) sum += p;
		expect(sum).toBeCloseTo(1.0, 10);
	});

	it("sums to 1.0 for p=0.7", () => {
		const probs = outcomeProbabilities(7, 3, 0.7);
		let sum = 0;
		for (const p of probs.values()) sum += p;
		expect(sum).toBeCloseTo(1.0, 10);
	});

	it("P(0 wins) = 1.0 when p=0", () => {
		const probs = outcomeProbabilities(7, 3, 0.0);
		expect(probs.get(0)).toBeCloseTo(1.0, 10);
		for (let k = 1; k <= 7; k++) {
			expect(probs.get(k)).toBeCloseTo(0.0, 10);
		}
	});

	it("P(max_wins) = 1.0 when p=1", () => {
		const probs = outcomeProbabilities(7, 3, 1.0);
		expect(probs.get(7)).toBeCloseTo(1.0, 10);
		for (let k = 0; k < 7; k++) {
			expect(probs.get(k)).toBeCloseTo(0.0, 10);
		}
	});

	it("covers all outcomes from 0 to maxWins", () => {
		const probs = outcomeProbabilities(7, 3, 0.5);
		expect(probs.size).toBe(8); // 0 through 7
	});

	it("works for small events (max_wins=3, max_losses=1)", () => {
		const probs = outcomeProbabilities(3, 1, 0.5);
		let sum = 0;
		for (const p of probs.values()) sum += p;
		expect(sum).toBeCloseTo(1.0, 10);
		// P(0 wins) = (1-p)^1 = 0.5
		expect(probs.get(0)).toBeCloseTo(0.5, 10);
	});
});

// --- parseEventYaml ---

describe("parseEventYaml", () => {
	it("parses a valid event YAML", () => {
		const event = getParsedEvent();
		expect(event.name).toBe("Test Event");
		expect(event.format).toBe("Bo1");
		expect(event.entry.amount).toBe(8000);
		expect(event.entry.currency).toBe("gems");
		expect(event.maxWins).toBe(7);
		expect(event.maxLosses).toBe(3);
	});

	it("expands range keys correctly", () => {
		const event = getParsedEvent();
		// 0-2 expands to 3 entries (0, 1, 2) + individual 3,4,5,6,7 = 8 total
		expect(event.rewards.length).toBe(8);
		// Wins 0, 1, 2 should have empty items
		for (let w = 0; w <= 2; w++) {
			const tier = event.rewards.find((r) => r.wins === w);
			expect(tier).toBeDefined();
			expect(Object.keys(tier!.items).length).toBe(0);
		}
	});

	it("parses reward items correctly", () => {
		const event = getParsedEvent();
		const tier3 = event.rewards.find((r) => r.wins === 3);
		expect(tier3).toBeDefined();
		expect(tier3!.items.gems).toBe(3600);
		expect(tier3!.items.packs).toBe(8);
	});

	it("defaults max_losses to 3 when omitted", () => {
		const yaml = `
name: Minimal Event
entry:
  amount: 1000
  currency: gems
max_wins: 3
rewards:
  0: {}
  3:
    gems: 5000
`;
		const event = parseEventYaml(yaml);
		expect(event.maxLosses).toBe(3);
	});

	it("throws on overlapping reward keys", () => {
		const yaml = `
name: Bad Event
entry:
  amount: 1000
  currency: gems
max_wins: 3
rewards:
  0-2: {}
  1:
    gems: 500
`;
		expect(() => parseEventYaml(yaml)).toThrow("Overlapping reward key");
	});

	it("throws on missing name", () => {
		const yaml = `
entry:
  amount: 1000
  currency: gems
max_wins: 3
rewards: {}
`;
		expect(() => parseEventYaml(yaml)).toThrow("name");
	});

	it("throws on missing entry", () => {
		const yaml = `
name: Test
max_wins: 3
rewards: {}
`;
		expect(() => parseEventYaml(yaml)).toThrow("entry");
	});

	it("sorts rewards by wins ascending", () => {
		const event = getParsedEvent();
		for (let i = 1; i < event.rewards.length; i++) {
			expect(event.rewards[i].wins).toBeGreaterThan(event.rewards[i - 1].wins);
		}
	});
});

// --- rewardValue & entryCost ---

describe("rewardValue", () => {
	it("computes value from items and valuation", () => {
		const tier = { wins: 3, items: { gems: 3600, packs: 8 } };
		const val = rewardValue(tier, VALUATION);
		// 3600 * 0.01 + 8 * 1 = 36 + 8 = 44
		expect(val).toBeCloseTo(44, 5);
	});

	it("ignores unknown reward types", () => {
		const tier = { wins: 3, items: { unknown_type: 100 } };
		const val = rewardValue(tier, VALUATION);
		expect(val).toBe(0);
	});
});

describe("entryCost", () => {
	it("computes entry cost from event and valuation", () => {
		const event = getParsedEvent();
		const cost = entryCost(event, VALUATION);
		// 8000 * 0.01 = 80
		expect(cost).toBeCloseTo(80, 5);
	});
});

// --- expectedValueAndStdDev ---

describe("expectedValueAndStdDev", () => {
	it("stdDev is 0 when outcome is deterministic (p=0)", () => {
		const event = getParsedEvent();
		const { ev, stdDev } = expectedValueAndStdDev(event, VALUATION, 0);
		expect(ev).toBeCloseTo(-80, 5);
		expect(stdDev).toBeCloseTo(0, 5);
	});

	it("stdDev is 0 when outcome is deterministic (p=1)", () => {
		const event = getParsedEvent();
		const { stdDev } = expectedValueAndStdDev(event, VALUATION, 1);
		expect(stdDev).toBeCloseTo(0, 5);
	});

	it("stdDev is positive for intermediate winrates", () => {
		const event = getParsedEvent();
		const { stdDev } = expectedValueAndStdDev(event, VALUATION, 0.5);
		expect(stdDev).toBeGreaterThan(0);
	});

	it("ev matches expectedValue", () => {
		const event = getParsedEvent();
		const { ev } = expectedValueAndStdDev(event, VALUATION, 0.6);
		const ev2 = expectedValue(event, VALUATION, 0.6);
		expect(ev).toBeCloseTo(ev2, 10);
	});
});

// --- expectedValue ---

describe("expectedValue", () => {
	it("returns -entry_cost when p=0", () => {
		const event = getParsedEvent();
		const ev = expectedValue(event, VALUATION, 0);
		expect(ev).toBeCloseTo(-80, 5);
	});

	it("returns value(max_wins) - entry_cost when p=1", () => {
		const event = getParsedEvent();
		const ev = expectedValue(event, VALUATION, 1);
		// 7 wins = 2 booster boxes = 2 * 120 = 240
		// EV = 240 - 80 = 160
		expect(ev).toBeCloseTo(160, 5);
	});

	it("returns a value between min and max for p=0.5", () => {
		const event = getParsedEvent();
		const ev = expectedValue(event, VALUATION, 0.5);
		expect(ev).toBeGreaterThan(-80);
		expect(ev).toBeLessThan(160);
	});
});

// --- evCurve ---

describe("evCurve", () => {
	it("returns the correct number of points", () => {
		const event = getParsedEvent();
		const curve = evCurve(event, VALUATION, [0.3, 0.8], 50);
		expect(curve.length).toBe(51); // 0 to 50 inclusive
	});

	it("first and last points match the range endpoints", () => {
		const event = getParsedEvent();
		const curve = evCurve(event, VALUATION, [0.3, 0.8], 100);
		expect(curve[0].winRate).toBeCloseTo(0.3, 10);
		expect(curve[curve.length - 1].winRate).toBeCloseTo(0.8, 10);
	});

	it("EV is monotonically increasing", () => {
		const event = getParsedEvent();
		const curve = evCurve(event, VALUATION, [0, 1], 100);
		for (let i = 1; i < curve.length; i++) {
			expect(curve[i].ev).toBeGreaterThanOrEqual(curve[i - 1].ev);
		}
	});

	it("stdDev is non-negative for all points", () => {
		const event = getParsedEvent();
		const curve = evCurve(event, VALUATION, [0, 1], 100);
		for (const point of curve) {
			expect(point.stdDev).toBeGreaterThanOrEqual(0);
		}
	});

	it("stdDev is 0 at p=0 and p=1 (deterministic outcomes)", () => {
		const event = getParsedEvent();
		const curve = evCurve(event, VALUATION, [0, 1], 100);
		expect(curve[0].stdDev).toBeCloseTo(0, 5);
		expect(curve[curve.length - 1].stdDev).toBeCloseTo(0, 5);
	});

	it("evPlus1SD and evMinus1SD bracket ev", () => {
		const event = getParsedEvent();
		const curve = evCurve(event, VALUATION, [0, 1], 100);
		for (const point of curve) {
			expect(point.evPlus1SD).toBeCloseTo(point.ev + point.stdDev, 5);
			expect(point.evMinus1SD).toBeCloseTo(point.ev - point.stdDev, 5);
		}
	});
});

// --- breakEvenWinRate ---

describe("breakEvenWinRate", () => {
	it("returns a value between 0 and 1 for the sample event", () => {
		const event = getParsedEvent();
		const be = breakEvenWinRate(event, VALUATION);
		expect(be).not.toBeNull();
		expect(be!).toBeGreaterThan(0);
		expect(be!).toBeLessThan(1);
	});

	it("EV is approximately 0 at the break-even point", () => {
		const event = getParsedEvent();
		const be = breakEvenWinRate(event, VALUATION)!;
		const ev = expectedValue(event, VALUATION, be);
		expect(Math.abs(ev)).toBeLessThan(1); // within €1
	});

	it("returns null when always +EV", () => {
		// Free event with rewards at 0 wins
		const yaml = `
name: Free Event
entry:
  amount: 0
  currency: gems
max_wins: 3
max_losses: 3
rewards:
  0:
    gems: 1000
  1:
    gems: 2000
  2:
    gems: 3000
  3:
    gems: 5000
`;
		const event = parseEventYaml(yaml);
		const be = breakEvenWinRate(event, VALUATION);
		expect(be).toBeNull();
	});

	it("returns null when always -EV", () => {
		// Expensive event with no rewards
		const yaml = `
name: Expensive Event
entry:
  amount: 100000
  currency: gems
max_wins: 3
max_losses: 3
rewards:
  0: {}
  1: {}
  2: {}
  3:
    gems: 1
`;
		const event = parseEventYaml(yaml);
		const be = breakEvenWinRate(event, VALUATION);
		expect(be).toBeNull();
	});
});
