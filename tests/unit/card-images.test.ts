import { get } from "svelte/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	cardImageIndex,
	ensureCardImagesLoaded,
	lookupCardImage,
} from "../../src/lib/stores/card-images";
import { CARD_IMAGE_INDEX } from "../fixtures/card-image-index";

describe("lookupCardImage", () => {
	it("resolves a regular card name", () => {
		expect(lookupCardImage(CARD_IMAGE_INDEX, "Lightning Bolt")?.artist).toBe(
			"Christopher Rush",
		);
	});

	it("resolves a DFC by its full name via the front face", () => {
		const entry = lookupCardImage(
			CARD_IMAGE_INDEX,
			"Aclazotz, Deepest Betrayal // Temple of the Dead",
		);
		expect(entry?.normal).toContain("aclazotz");
	});

	it("normalizes whitespace and separators before lookup", () => {
		expect(lookupCardImage(CARD_IMAGE_INDEX, "  Lightning Bolt  ")).not.toBeNull();
	});

	it("returns null for unknown cards", () => {
		expect(lookupCardImage(CARD_IMAGE_INDEX, "Storm Crow")).toBeNull();
	});

	it("returns null while the index has not loaded", () => {
		expect(lookupCardImage(null, "Lightning Bolt")).toBeNull();
	});
});

// Order matters: a failed fetch resets the module's pending promise so the
// retry test below actually refetches; a success would cache forever.
describe("ensureCardImagesLoaded", () => {
	afterEach(() => {
		cardImageIndex.set(null);
		vi.unstubAllGlobals();
	});

	it("settles on an empty index when the fetch fails", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(() => Promise.reject(new Error("offline"))),
		);
		await ensureCardImagesLoaded();
		expect(get(cardImageIndex)).toEqual({});
	});

	it("loads the index on a retry after a failure", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(() =>
				Promise.resolve({
					ok: true,
					json: () => Promise.resolve(CARD_IMAGE_INDEX),
				}),
			),
		);
		await ensureCardImagesLoaded();
		expect(lookupCardImage(get(cardImageIndex), "Lightning Bolt")).not.toBeNull();
	});
});
