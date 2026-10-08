import { describe, expect, it } from "vitest";
import {
	cardKind,
	type ScryfallCard,
	selectPreferredCards,
} from "../../scripts/build-card-image-index";

const card = (overrides: Partial<ScryfallCard>): ScryfallCard => ({
	name: "Lightning Bolt",
	layout: "normal",
	released_at: "2026-06-26",
	image_uris: { normal: "https://example.test/normal.jpg" },
	...overrides,
});

describe("selectPreferredCards", () => {
	it("ignores non-playable layouts and chooses the oldest playable printing", () => {
		const selected = selectPreferredCards(
			[
				card({
					name: "Lightning Bolt // Lightning Bolt",
					layout: "art_series",
					released_at: "2021-04-23",
					set: "astx",
				}),
				card({
					released_at: "2026-06-26",
					set: "msc",
				}),
				card({
					released_at: "1993-08-05",
					set: "lea",
				}),
			],
			new Set(["Lightning Bolt"]),
		).get("Lightning Bolt");

		expect(selected?.set).toBe("lea");
	});
});

describe("cardKind", () => {
	it.each([
		["Land Creature — Forest Dryad", "land"],
		["Artifact Land", "land"],
		["Artifact Creature — Construct", "creature"],
		["Creature — Human Wizard // Sorcery — Adventure", "creature"],
		["Sorcery // Land", undefined],
		["Legendary Planeswalker — Jace", undefined],
	])("classifies %s as %s", (typeLine, kind) => {
		expect(cardKind(card({ type_line: typeLine }))).toBe(kind);
	});
});
