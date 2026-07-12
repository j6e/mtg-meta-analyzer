/**
 * Card image index: card name → Scryfall CDN image URLs + artist.
 *
 * Generated at ingestion time by scripts/build-card-image-index.ts so the
 * browser only ever fetches images from cards.scryfall.io (no rate limits),
 * never the rate-limited api.scryfall.com. A lookup miss means the index
 * needs a rebuild; callers fall back to text/plain rendering.
 */

import { writable } from "svelte/store";
import { base } from "$app/paths";
import { getFrontFace } from "../utils/card-normalizer";

export interface CardImageEntry {
	normal: string;
	art_crop: string;
	artist: string;
}

/** Front-face card name → image entry; null until the index is fetched. */
export const cardImageIndex = writable<Record<string, CardImageEntry> | null>(null);

let pending: Promise<void> | null = null;

/** Fetch the card image index once; concurrent calls share the same fetch. */
export function ensureCardImagesLoaded(): Promise<void> {
	if (!pending) {
		pending = fetch(`${base}/data/card-images.json`)
			.then((res) => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				return res.json();
			})
			.then((json: Record<string, CardImageEntry>) => cardImageIndex.set(json))
			.catch((e) => {
				console.warn("Failed to load card image index:", e);
				pending = null; // allow a later retry
			});
	}
	return pending;
}

/**
 * Look up a card's images by name (uses the front face for DFCs).
 * Returns null while the index is loading or when the card is unknown.
 */
export function lookupCardImage(
	index: Record<string, CardImageEntry> | null,
	cardName: string,
): CardImageEntry | null {
	return index?.[getFrontFace(cardName)] ?? null;
}
