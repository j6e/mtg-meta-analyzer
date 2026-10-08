// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DecklistView from "../../src/lib/components/DecklistView.svelte";
import { cardImageIndex } from "../../src/lib/stores/card-images";
import type { DecklistInfo } from "../../src/lib/types/decklist";

beforeEach(() => {
	vi.stubGlobal(
		"fetch",
		vi.fn(() => new Promise(() => {})),
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	cardImageIndex.set(null);
});

const sampleDecklist: DecklistInfo = {
	playerId: "p1",
	mainboard: [
		{ cardName: "Lightning Bolt", quantity: 4 },
		{ cardName: "Mountain", quantity: 20 },
		{ cardName: "Goblin Guide", quantity: 4 },
	],
	sideboard: [
		{ cardName: "Searing Blood", quantity: 3 },
		{ cardName: "Roiling Vortex", quantity: 2 },
	],
	commanders: null,
	companion: null,
	reportedArchetype: "Mono-Red Aggro",
};

describe("DecklistView component", () => {
	it("renders mainboard cards with quantities", () => {
		const { container } = render(DecklistView, {
			props: { decklist: sampleDecklist },
		});
		const items = container.querySelectorAll("li");
		// 3 mainboard + 2 sideboard = 5
		expect(items.length).toBe(5);
		expect(container.textContent).toContain("4x");
		expect(container.textContent).toContain("Lightning Bolt");
		expect(container.textContent).toContain("Mountain");
	});

	it("shows mainboard and sideboard counts", () => {
		const { container } = render(DecklistView, {
			props: { decklist: sampleDecklist },
		});
		// Mainboard: 4+20+4 = 28
		expect(container.textContent).toContain("(28)");
		// Sideboard: 3+2 = 5
		expect(container.textContent).toContain("(5)");
	});

	it("shows player name and archetype when provided", () => {
		const { container } = render(DecklistView, {
			props: {
				decklist: sampleDecklist,
				playerName: "Alice",
				archetype: "Mono-Red Aggro",
			},
		});
		expect(container.textContent).toContain("Alice");
		expect(container.textContent).toContain("Mono-Red Aggro");
	});

	it("shows tournament, date and finish", () => {
		const { container } = render(DecklistView, {
			props: {
				decklist: sampleDecklist,
				tournamentName: "Premodern Championship",
				tournamentDate: "2026-09-08",
				tournamentUrl: "https://melee.gg/Tournament/View/42",
				tournamentPlayerCount: 32,
				playerRank: 3,
				matchRecord: "6-1-0",
			},
		});
		expect(container.querySelector(".meta")?.textContent).toContain(
			"Premodern Championship, 32 players",
		);
		const link = container.querySelector(".tournament a");
		expect(link?.textContent).toBe("Premodern Championship");
		expect(link?.getAttribute("href")).toBe("https://melee.gg/Tournament/View/42");
		expect(container.querySelector(".rank")?.textContent).toBe("#3 (6-1-0)");
		expect(container.querySelector("time")?.textContent).toBe("2026-09-08");
		expect(container.querySelector("time")?.getAttribute("datetime")).toBe(
			"2026-09-08",
		);
	});

	it("hides metadata section when no player/archetype", () => {
		const { container } = render(DecklistView, {
			props: { decklist: sampleDecklist },
		});
		expect(container.querySelector(".meta")).toBeNull();
	});

	it("hides sideboard section when empty", () => {
		const noSideboard: DecklistInfo = {
			...sampleDecklist,
			sideboard: [],
		};
		const { container } = render(DecklistView, {
			props: { decklist: noSideboard },
		});
		const headings = container.querySelectorAll("h3");
		const headingTexts = [...headings].map((h) => h.textContent);
		expect(headingTexts.some((t) => t?.includes("Sideboard"))).toBe(false);
	});

	it("shows companion section when present", () => {
		const withCompanion: DecklistInfo = {
			...sampleDecklist,
			companion: [{ cardName: "Lurrus of the Dream-Den", quantity: 1 }],
		};
		const { container } = render(DecklistView, {
			props: { decklist: withCompanion },
		});
		expect(container.textContent).toContain("Companion");
		expect(container.textContent).toContain("Lurrus of the Dream-Den");
	});

	it("renders card names inside CardTooltip triggers", () => {
		const { container } = render(DecklistView, {
			props: { decklist: sampleDecklist },
		});
		const triggers = container.querySelectorAll(".card-tooltip-trigger");
		expect(triggers.length).toBe(5); // 3 mainboard + 2 sideboard
	});

	it("splits the mainboard into lands, creatures and other cards", () => {
		const image = { normal: "https://example.test/normal.jpg", artist: "" };
		cardImageIndex.set({
			Mountain: { ...image, kind: "land" },
			"Goblin Guide": { ...image, kind: "creature" },
			"Lightning Bolt": image,
		});
		const { container } = render(DecklistView, {
			props: { decklist: sampleDecklist },
		});
		const groups = [...container.querySelectorAll("section:first-of-type ul")].map(
			(list) => [
				list.getAttribute("aria-label"),
				...[...list.querySelectorAll(".card-name")].map((name) => name.textContent),
			],
		);
		expect(groups).toEqual([
			["Lands", "Mountain"],
			["Creatures", "Goblin Guide"],
			["Other cards", "Lightning Bolt"],
		]);
	});
});
