import { describe, expect, it } from "vitest";
import { type CardImageEntry, lookupCardImage } from "../../src/lib/stores/card-images";

const INDEX: Record<string, CardImageEntry> = {
	"Lightning Bolt": {
		normal: "https://cards.scryfall.io/normal/front/x/x/bolt.jpg",
		art_crop: "https://cards.scryfall.io/art_crop/front/x/x/bolt.jpg",
		artist: "Christopher Rush",
	},
	"Aclazotz, Deepest Betrayal": {
		normal: "https://cards.scryfall.io/normal/front/x/x/aclazotz.jpg",
		art_crop: "https://cards.scryfall.io/art_crop/front/x/x/aclazotz.jpg",
		artist: "Chris Rahn",
	},
};

describe("lookupCardImage", () => {
	it("resolves a regular card name", () => {
		expect(lookupCardImage(INDEX, "Lightning Bolt")?.artist).toBe("Christopher Rush");
	});

	it("resolves a DFC by its full name via the front face", () => {
		const entry = lookupCardImage(
			INDEX,
			"Aclazotz, Deepest Betrayal // Temple of the Dead",
		);
		expect(entry?.normal).toContain("aclazotz");
	});

	it("normalizes whitespace and separators before lookup", () => {
		expect(lookupCardImage(INDEX, "  Lightning Bolt  ")).not.toBeNull();
	});

	it("returns null for unknown cards", () => {
		expect(lookupCardImage(INDEX, "Storm Crow")).toBeNull();
	});

	it("returns null while the index has not loaded", () => {
		expect(lookupCardImage(null, "Lightning Bolt")).toBeNull();
	});
});
