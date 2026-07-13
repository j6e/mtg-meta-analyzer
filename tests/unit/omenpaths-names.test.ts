import { describe, expect, it } from "vitest";
import {
	buildOmenpathsNameMaps,
	convertOmenpathsName,
	parseOmenpathsDirection,
} from "../../scripts/lib/omenpaths-names";

describe("Through the Omenpaths converter options", () => {
	it("parses CLI direction flags without retaining the prefix", () => {
		expect(parseOmenpathsDirection("--to-paper")).toBe("to-paper");
		expect(parseOmenpathsDirection("--to-online")).toBe("to-online");
		expect(parseOmenpathsDirection("--dry-run")).toBeUndefined();
	});
});

describe("Through the Omenpaths name maps", () => {
	const maps = buildOmenpathsNameMaps([
		{
			name: "Spectacular Spider-Man",
			printed_name: "Ademi of the Silkchutes",
		},
		{
			name: "Spider-Man 2099",
			printed_name: "Uharis, the Stormspinner",
		},
		{
			name: "Peter Parker // Amazing Spider-Man",
			card_faces: [
				{
					name: "Peter Parker",
					printed_name: "Surris, Spidersilk Innovator",
				},
				{
					name: "Amazing Spider-Man",
					printed_name: "Surris, Silk-Tech Vanguard",
				},
			],
		},
	]);

	it("converts online names to canonical paper names", () => {
		expect(convertOmenpathsName("Ademi of the Silkchutes", maps, "to-paper")).toBe(
			"Spectacular Spider-Man",
		);
	});

	it("converts canonical paper names back to online names", () => {
		expect(convertOmenpathsName("Spider-Man 2099", maps, "to-online")).toBe(
			"Uharis, the Stormspinner",
		);
	});

	it("converts names from double-faced card faces", () => {
		expect(convertOmenpathsName("Surris, Spidersilk Innovator", maps, "to-paper")).toBe(
			"Peter Parker",
		);
		expect(convertOmenpathsName("Amazing Spider-Man", maps, "to-online")).toBe(
			"Surris, Silk-Tech Vanguard",
		);
	});

	it("leaves names outside the set unchanged", () => {
		expect(convertOmenpathsName("Lightning Bolt", maps, "to-paper")).toBe(
			"Lightning Bolt",
		);
	});
});
