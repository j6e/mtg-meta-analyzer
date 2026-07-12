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
	/** Absent for the rare cards whose Scryfall record has no art crop. */
	art_crop?: string;
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
				// Settle on an empty index so consumers fall back to text
				// rendering instead of waiting forever; null keeps meaning
				// "not attempted yet / loading".
				cardImageIndex.update((v) => v ?? {});
				pending = null; // allow a later retry
			});
	}
	return pending;
}

/**
 * Same image under a cache key the pre-index site never used.
 *
 * Browsers that visited the site before the CDN index (pre 2425a9d,
 * 2026-07-12) cached these cards.scryfall.io URLs from no-CORS <img>
 * requests; Scryfall omits Access-Control-Allow-Origin on those and
 * caches for a year, so every CORS-mode load of the same URL fails
 * against that cache entry without ever hitting the network. A retry
 * with an extra query param bypasses it and gets a proper CORS
 * response. Use on image error only — an unconditional param would
 * needlessly refetch for visitors whose cache is healthy.
 */
export function corsRetryUrl(url: string): string {
	return `${url}${url.includes("?") ? "&" : "?"}cors=1`;
}

/**
 * Look up a card's images by name (uses the front face for DFCs).
 * Returns null while the index is loading or when the card is unknown.
 */
export function lookupCardImage(
	index: Record<string, CardImageEntry> | null,
	cardName: string | undefined,
): CardImageEntry | null {
	if (!cardName) return null;
	return index?.[getFrontFace(cardName)] ?? null;
}
