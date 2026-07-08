/** Format display name → data directory slug, e.g. "Duel Commander" → "duel-commander". */
export function formatSlug(format: string): string {
	return format.toLowerCase().replace(/\s+/g, "-");
}
