// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/svelte";
import type { Snippet } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CardTooltip from "../../src/lib/components/CardTooltip.svelte";
import { cardImageIndex } from "../../src/lib/stores/card-images";
import { CARD_IMAGE_INDEX } from "../fixtures/card-image-index";

beforeEach(() => {
	// Hovering triggers ensureCardImagesLoaded; pin its fetch so the store
	// state stays exactly what each test set on cardImageIndex.
	vi.stubGlobal(
		"fetch",
		vi.fn(() => new Promise(() => {})),
	);
	cardImageIndex.set(CARD_IMAGE_INDEX);
});
afterEach(() => {
	cardImageIndex.set(null);
	vi.unstubAllGlobals();
	cleanup();
});

describe("CardTooltip component", () => {
	it("renders the trigger text", () => {
		render(CardTooltip, {
			props: { cardName: "Lightning Bolt", children: undefined as unknown as Snippet },
		});
		// With snippets, children may not render text in the test — check trigger exists
		const trigger = document.querySelector(".card-tooltip-trigger");
		expect(trigger).toBeTruthy();
	});

	it("does not show tooltip by default", () => {
		render(CardTooltip, {
			props: { cardName: "Lightning Bolt", children: undefined as unknown as Snippet },
		});
		const tooltip = document.querySelector(".card-tooltip");
		expect(tooltip).toBeNull();
	});

	it("shows tooltip on mouseenter", async () => {
		render(CardTooltip, {
			props: { cardName: "Lightning Bolt", children: undefined as unknown as Snippet },
		});
		const trigger = document.querySelector(".card-tooltip-trigger")!;
		await fireEvent.mouseEnter(trigger, { clientX: 100, clientY: 100 });
		const tooltip = document.querySelector(".card-tooltip");
		expect(tooltip).toBeTruthy();
	});

	it("hides tooltip on mouseleave", async () => {
		render(CardTooltip, {
			props: { cardName: "Lightning Bolt", children: undefined as unknown as Snippet },
		});
		const trigger = document.querySelector(".card-tooltip-trigger")!;
		await fireEvent.mouseEnter(trigger, { clientX: 100, clientY: 100 });
		expect(document.querySelector(".card-tooltip")).toBeTruthy();
		await fireEvent.mouseLeave(trigger);
		expect(document.querySelector(".card-tooltip")).toBeNull();
	});

	it("tooltip contains an img with the CDN URL from the index", async () => {
		render(CardTooltip, {
			props: { cardName: "Lightning Bolt", children: undefined as unknown as Snippet },
		});
		const trigger = document.querySelector(".card-tooltip-trigger")!;
		await fireEvent.mouseEnter(trigger, { clientX: 100, clientY: 100 });
		const img = document.querySelector(".card-tooltip img") as HTMLImageElement;
		expect(img).toBeTruthy();
		expect(img.src).toContain("cards.scryfall.io");
		expect(img.src).toContain("lightning-bolt");
	});

	it("uses front face for DFC card names", async () => {
		render(CardTooltip, {
			props: {
				cardName: "Aclazotz, Deepest Betrayal // Temple of the Dead",
				children: undefined as unknown as Snippet,
			},
		});
		const trigger = document.querySelector(".card-tooltip-trigger")!;
		await fireEvent.mouseEnter(trigger, { clientX: 100, clientY: 100 });
		const img = document.querySelector(".card-tooltip img") as HTMLImageElement;
		expect(img.src).toContain("aclazotz");
	});

	it("shows a text fallback for cards missing from the index", async () => {
		render(CardTooltip, {
			props: { cardName: "Storm Crow", children: undefined as unknown as Snippet },
		});
		const trigger = document.querySelector(".card-tooltip-trigger")!;
		await fireEvent.mouseEnter(trigger, { clientX: 100, clientY: 100 });
		expect(document.querySelector(".card-tooltip img")).toBeNull();
		expect(document.querySelector(".card-tooltip .fallback")?.textContent).toBe(
			"Storm Crow",
		);
	});

	it("shows a loading placeholder while the index has not loaded", async () => {
		cardImageIndex.set(null);
		render(CardTooltip, {
			props: { cardName: "Lightning Bolt", children: undefined as unknown as Snippet },
		});
		const trigger = document.querySelector(".card-tooltip-trigger")!;
		await fireEvent.mouseEnter(trigger, { clientX: 100, clientY: 100 });
		expect(document.querySelector(".card-tooltip img")).toBeNull();
		expect(document.querySelector(".card-tooltip .placeholder")).toBeTruthy();
	});

	it("shows the text fallback when the index failed to load (settled empty)", async () => {
		cardImageIndex.set({});
		render(CardTooltip, {
			props: { cardName: "Lightning Bolt", children: undefined as unknown as Snippet },
		});
		const trigger = document.querySelector(".card-tooltip-trigger")!;
		await fireEvent.mouseEnter(trigger, { clientX: 100, clientY: 100 });
		expect(document.querySelector(".card-tooltip .placeholder")).toBeNull();
		expect(document.querySelector(".card-tooltip .fallback")?.textContent).toBe(
			"Lightning Bolt",
		);
	});
});
