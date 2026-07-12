import type { CardImageEntry } from "../../src/lib/stores/card-images";

/** Minimal card image index: one regular card and one DFC (front face key). */
export const CARD_IMAGE_INDEX: Record<string, CardImageEntry> = {
	"Lightning Bolt": {
		normal: "https://cards.scryfall.io/normal/front/x/x/lightning-bolt.jpg",
		art_crop: "https://cards.scryfall.io/art_crop/front/x/x/lightning-bolt.jpg",
		artist: "Christopher Rush",
	},
	"Aclazotz, Deepest Betrayal": {
		normal: "https://cards.scryfall.io/normal/front/x/x/aclazotz.jpg",
		art_crop: "https://cards.scryfall.io/art_crop/front/x/x/aclazotz.jpg",
		artist: "Chris Rahn",
	},
};
