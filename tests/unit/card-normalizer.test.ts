import { describe, expect, it } from "vitest";
import {
	getCommanderShortName,
	getFrontFace,
	normalizeCardName,
} from "../../src/lib/utils/card-normalizer";

describe("normalizeCardName", () => {
	it("passes through a standard card name unchanged", () => {
		expect(normalizeCardName("Lightning Bolt")).toBe("Lightning Bolt");
	});

	it("trims leading and trailing whitespace", () => {
		expect(normalizeCardName("  Lightning Bolt  ")).toBe("Lightning Bolt");
	});

	it("normalizes // separator spacing", () => {
		expect(normalizeCardName("Fire//Ice")).toBe("Fire // Ice");
		expect(normalizeCardName("Fire  //  Ice")).toBe("Fire // Ice");
		expect(normalizeCardName("Fire //Ice")).toBe("Fire // Ice");
	});

	it("normalizes curly single quotes to straight quotes", () => {
		expect(normalizeCardName("Nature\u2019s Rhythm")).toBe("Nature's Rhythm");
		expect(normalizeCardName("\u2018quoted\u2019")).toBe("'quoted'");
	});

	it("normalizes curly double quotes to straight quotes", () => {
		expect(normalizeCardName("\u201CHello\u201D")).toBe('"Hello"');
	});

	it("handles accented characters (preserves them)", () => {
		expect(normalizeCardName("Bartolom\u00E9 del Presidio")).toBe(
			"Bartolom\u00E9 del Presidio",
		);
	});

	it("handles card names with apostrophes", () => {
		expect(normalizeCardName("Agatha's Soul Cauldron")).toBe("Agatha's Soul Cauldron");
	});

	it("handles card names with hyphens", () => {
		expect(normalizeCardName("Callous Sell-Sword // Burn Together")).toBe(
			"Callous Sell-Sword // Burn Together",
		);
	});
});

describe("getFrontFace", () => {
	it("extracts front face from a DFC name", () => {
		expect(getFrontFace("Aclazotz, Deepest Betrayal // Temple of the Dead")).toBe(
			"Aclazotz, Deepest Betrayal",
		);
	});

	it("returns the full name for a regular card", () => {
		expect(getFrontFace("Lightning Bolt")).toBe("Lightning Bolt");
	});

	it("handles split cards", () => {
		expect(getFrontFace("Fire // Ice")).toBe("Fire");
	});

	it("handles adventure cards", () => {
		expect(getFrontFace("Bonecrusher Giant // Stomp")).toBe("Bonecrusher Giant");
	});

	it("normalizes before splitting", () => {
		expect(getFrontFace("  Fire//Ice  ")).toBe("Fire");
	});
});

describe("getCommanderShortName", () => {
	it("drops the comma-separated title from a commander name", () => {
		expect(getCommanderShortName("Aragorn, King of Gondor")).toBe("Aragorn");
	});

	it("returns the full name if no comma exists", () => {
		expect(getCommanderShortName("Emrakul")).toBe("Emrakul");
	});

	it("handles DFC commanders by using front face only", () => {
		expect(
			getCommanderShortName("Aclazotz, Deepest Betrayal // Temple of the Dead"),
		).toBe("Aclazotz");
	});

	it("handles names with multiple commas (drops at first comma)", () => {
		expect(getCommanderShortName("Ojer Axonil, Deepest Might")).toBe("Ojer Axonil");
	});
});
