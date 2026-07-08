import { describe, expect, it } from "vitest";
import { formatSlug } from "../../src/lib/utils/format-slug";

describe("formatSlug", () => {
	it("lowercases single-word formats", () => {
		expect(formatSlug("Standard")).toBe("standard");
		expect(formatSlug("Pauper")).toBe("pauper");
	});

	it("hyphenates multi-word formats", () => {
		expect(formatSlug("Duel Commander")).toBe("duel-commander");
	});

	it("collapses repeated whitespace", () => {
		expect(formatSlug("Duel  Commander")).toBe("duel-commander");
	});
});
