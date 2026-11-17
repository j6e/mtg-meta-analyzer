// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DecklistView from "../../src/lib/components/DecklistView.svelte";
import { cardImageIndex } from "../../src/lib/stores/card-images";
import type {
	DecklistInfo,
	DecklistPlayer,
	DecklistTournament,
} from "../../src/lib/types/decklist";

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

const alice: DecklistPlayer = { id: "p1", name: "Alice", rank: 3, record: "6-1-0" };

const championship: DecklistTournament = {
	id: "melee-42",
	name: "Premodern Championship",
	date: "2026-09-08",
	url: "https://melee.gg/Tournament/View/42",
	playerCount: 32,
};

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
				player: alice,
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
				tournament: championship,
				player: alice,
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

	it("shows the tournament name without a link when it has no url", () => {
		const { container } = render(DecklistView, {
			props: {
				decklist: sampleDecklist,
				tournament: { ...championship, url: "", playerCount: 0 },
			},
		});
		expect(container.querySelector(".tournament")?.textContent).toBe(
			"Premodern Championship",
		);
		expect(container.querySelector(".tournament a")).toBeNull();
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

	it.each([
		["loading", null],
		["failed to load", {}],
	])("shows one ungrouped mainboard list while the index is %s", (_state, index) => {
		cardImageIndex.set(index);
		const { container } = render(DecklistView, {
			props: { decklist: sampleDecklist },
		});
		const lists = container.querySelectorAll("section:first-of-type ul");
		expect(lists).toHaveLength(1);
		expect(lists[0].getAttribute("aria-label")).toBe("Mainboard");
		expect(lists[0].querySelectorAll(".card-name")).toHaveLength(
			sampleDecklist.mainboard.length,
		);
	});
});
