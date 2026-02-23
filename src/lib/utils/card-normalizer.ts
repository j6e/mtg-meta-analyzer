/**
 * Card name normalization for consistent matching between melee.gg data and Scryfall.
 *
 * Main concern: double-faced cards (DFCs) like "Aclazotz, Deepest Betrayal // Temple of the Dead".
 * Scryfall accepts either the full name or just the front face.
 */

const SPLIT_SEPARATOR = /\s*\/\/\s*/;

/**
 * Normalize a card name for consistent matching.
 * - Trims whitespace
 * - Normalizes curly quotes to straight quotes
 * - Normalizes whitespace around // separator
 */
export function normalizeCardName(name: string): string {
	let normalized = name.trim();

	// Curly quotes → straight quotes
	normalized = normalized.replace(/[\u2018\u2019\u201A]/g, "'");
	normalized = normalized.replace(/[\u201C\u201D\u201E]/g, '"');

	// Normalize // separator spacing: ensure exactly " // "
	normalized = normalized.replace(SPLIT_SEPARATOR, ' // ');

	return normalized;
}

/**
 * Extract the front face name from a DFC or split card.
 * "Aclazotz, Deepest Betrayal // Temple of the Dead" → "Aclazotz, Deepest Betrayal"
 * Regular cards pass through unchanged.
 */
export function getFrontFace(name: string): string {
	const normalized = normalizeCardName(name);
	const parts = normalized.split(' // ');
	return parts[0];
}

/**
 * Construct a Scryfall image URL for a card.
 * Uses the front face name for DFCs (Scryfall resolves these correctly).
 *
 * @param cardName - Card name (may include // for DFCs)
 * @param version - Image version: 'normal', 'small', 'large', 'art_crop', 'border_crop'
 */
export function getScryfallImageUrl(
	cardName: string,
	version: 'normal' | 'small' | 'large' | 'art_crop' | 'border_crop' = 'normal',
): string {
	const frontFace = getFrontFace(cardName);
	return `https://api.scryfall.com/cards/named?format=image&version=${version}&exact=${encodeURIComponent(frontFace)}`;
}
