/**
 * Card name normalization for consistent matching between melee.gg data and Scryfall.
 *
 * Main concern: double-faced cards (DFCs) like "Aclazotz, Deepest Betrayal // Temple of the Dead".
 * Scryfall accepts either the full name or just the front face.
 */

const DOUBLE_SLASH_SEPARATOR = /\s*\/\/\s*/g;
const SINGLE_SLASH_SEPARATOR = /(?<!\/)\s*\/\s*(?!\/)/g;

// This is a literal slash in a regular card name, not a face separator.
const LITERAL_SLASH_CARD_NAMES = new Set(["Summon: Choco/Mog"]);

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

	// Normalize both canonical // and importer-style / separators to " // ".
	normalized = normalized.replace(DOUBLE_SLASH_SEPARATOR, " // ");
	if (!LITERAL_SLASH_CARD_NAMES.has(normalized)) {
		normalized = normalized.replace(SINGLE_SLASH_SEPARATOR, " // ");
	}

	return normalized;
}

/**
 * Extract the front face name from a DFC or split card.
 * "Aclazotz, Deepest Betrayal // Temple of the Dead" → "Aclazotz, Deepest Betrayal"
 * Regular cards pass through unchanged.
 */
export function getFrontFace(name: string): string {
	const normalized = normalizeCardName(name);
	const parts = normalized.split(" // ");
	return parts[0];
}

/**
 * Get a short display name from a commander card name by dropping the ", Title" suffix.
 * Used for partner commanders to keep combined names concise.
 * "Aragorn, King of Gondor" → "Aragorn"
 * "Aclazotz, Deepest Betrayal // Temple of the Dead" → "Aclazotz"
 * Cards without a comma are returned as-is.
 */
export function getCommanderShortName(name: string): string {
	const frontFace = getFrontFace(name);
	const commaIndex = frontFace.indexOf(",");
	return commaIndex === -1 ? frontFace : frontFace.slice(0, commaIndex);
}
