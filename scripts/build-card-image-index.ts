/**
 * Build data/card-images.json: card name → Scryfall CDN image URLs + artist.
 *
 * Resolves every card name appearing in tournament decklists and archetype
 * signature definitions against Scryfall's default_cards bulk data, so the app
 * never hits the rate-limited api.scryfall.com at runtime (see
 * docs/scryfall-image-compliance.md).
 *
 * The bulk file (~180MB) is cached in .scratch/ and re-downloaded after 24h.
 *
 * Usage:
 *   bun run scripts/build-card-image-index.ts
 */
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { CardImageEntry } from "../src/lib/stores/card-images";
import { getFrontFace } from "../src/lib/utils/card-normalizer";

const ROOT = join(import.meta.dir, "..");
const DATA_DIR = join(ROOT, "data");
const CACHE_DIR = join(ROOT, ".scratch");
const CACHE_FILE = join(CACHE_DIR, "scryfall-default-cards.json");
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const OUTPUT_FILE = join(DATA_DIR, "card-images.json");
const USER_AGENT = "mtg-meta-analyzer/1.0";

export interface ScryfallCard {
	name: string;
	layout?: string;
	released_at?: string;
	set?: string;
	collector_number?: string;
	id?: string;
	image_uris?: Record<string, string>;
	card_faces?: Array<{ image_uris?: Record<string, string>; artist?: string }>;
	artist?: string;
}

/** Scryfall layouts that represent supplements, tokens, or other non-deck cards. */
const NON_PLAYABLE_LAYOUTS = new Set([
	"art_series",
	"token",
	"double_faced_token",
	"emblem",
	"helper",
	"planar",
	"scheme",
	"vanguard",
	"phenomenon",
	"conspiracy",
]);

export function isPlayableCard(card: ScryfallCard): boolean {
	return !NON_PLAYABLE_LAYOUTS.has(card.layout ?? "");
}

function compareCardVersions(a: ScryfallCard, b: ScryfallCard): number {
	const date = (a.released_at ?? "9999-99-99").localeCompare(
		b.released_at ?? "9999-99-99",
	);
	if (date !== 0) return date;

	return [a.set ?? "", a.collector_number ?? "", a.id ?? ""]
		.join("/")
		.localeCompare([b.set ?? "", b.collector_number ?? "", b.id ?? ""].join("/"));
}

/** Select preferred printings for all needed names in one pass through the bulk file. */
export function selectPreferredCards(
	cards: ScryfallCard[],
	names: Set<string>,
): Map<string, ScryfallCard> {
	const selected = new Map<string, ScryfallCard>();
	for (const card of cards) {
		if (!isPlayableCard(card)) continue;
		const name = getFrontFace(card.name);
		if (!names.has(name)) continue;
		const current = selected.get(name);
		if (!current || compareCardVersions(card, current) < 0) {
			selected.set(name, card);
		}
	}
	return selected;
}

/** Collect every card name used in decklists and archetype definitions. */
function collectNeededNames(): Set<string> {
	const needed = new Set<string>();
	const add = (name: string) => needed.add(getFrontFace(name));

	const formatDirs = readdirSync(DATA_DIR, { withFileTypes: true })
		.filter((e) => e.isDirectory() && e.name !== "archetypes")
		.map((e) => e.name);

	for (const format of formatDirs) {
		const formatDir = join(DATA_DIR, format);
		const monthDirs = readdirSync(formatDir, { withFileTypes: true })
			.filter((e) => e.isDirectory())
			.map((e) => e.name);
		for (const month of monthDirs) {
			const monthDir = join(formatDir, month);
			for (const file of readdirSync(monthDir).filter((f) => f.endsWith(".json"))) {
				const data = JSON.parse(readFileSync(join(monthDir, file), "utf-8"));
				for (const decklist of Object.values(data.decklists ?? {}) as Array<
					Record<string, unknown>
				>) {
					for (const key of ["mainboard", "sideboard", "commanders"]) {
						const cards = decklist[key];
						if (!Array.isArray(cards)) continue;
						for (const card of cards) add(card.cardName);
					}
					const companion = decklist.companion as { cardName: string } | null;
					if (companion?.cardName) add(companion.cardName);
				}
			}
		}
	}

	const archetypeDir = join(DATA_DIR, "archetypes");
	for (const file of readdirSync(archetypeDir).filter((f) => f.endsWith(".yaml"))) {
		const doc = parseYaml(readFileSync(join(archetypeDir, file), "utf-8"));
		for (const archetype of doc.archetypes ?? []) {
			for (const card of archetype.signatureCards ?? []) add(card.name);
		}
	}

	return needed;
}

/** Download default_cards bulk data, reusing a <24h-old cached copy. */
async function loadBulkData(): Promise<ScryfallCard[]> {
	if (
		existsSync(CACHE_FILE) &&
		Date.now() - statSync(CACHE_FILE).mtimeMs < CACHE_MAX_AGE_MS
	) {
		console.log(`Using cached bulk data (${CACHE_FILE})`);
		return JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
	}

	const headers = { "User-Agent": USER_AGENT, Accept: "application/json" };
	console.log("Fetching bulk data manifest...");
	const manifestRes = await fetch("https://api.scryfall.com/bulk-data", { headers });
	if (!manifestRes.ok)
		throw new Error(`Manifest fetch failed: HTTP ${manifestRes.status}`);
	const manifest = await manifestRes.json();
	const defaultCards = manifest.data.find(
		(d: { type: string }) => d.type === "default_cards",
	);
	if (!defaultCards) throw new Error("No default_cards entry in bulk data manifest");

	console.log(`Downloading ${defaultCards.download_uri} ...`);
	const res = await fetch(defaultCards.download_uri, { headers });
	if (!res.ok) throw new Error(`Bulk download failed: HTTP ${res.status}`);
	const text = await res.text();

	mkdirSync(CACHE_DIR, { recursive: true });
	writeFileSync(CACHE_FILE, text);
	console.log(`Cached ${(text.length / 1024 / 1024).toFixed(0)}MB to ${CACHE_FILE}`);
	return JSON.parse(text);
}

function extractEntry(card: ScryfallCard): CardImageEntry | null {
	const imageUris = card.image_uris ?? card.card_faces?.[0]?.image_uris;
	if (!imageUris?.normal) return null;
	return {
		normal: imageUris.normal,
		// Rare cards have no art crop; keep the tooltip image regardless
		...(imageUris.art_crop ? { art_crop: imageUris.art_crop } : {}),
		artist: card.artist ?? card.card_faces?.[0]?.artist ?? "",
	};
}

async function main() {
	const needed = collectNeededNames();
	console.log(`Collected ${needed.size} distinct card names from data/`);

	const cards = await loadBulkData();
	console.log(`Bulk data has ${cards.length} cards`);

	const index: Record<string, CardImageEntry> = {};
	const selected = selectPreferredCards(cards, needed);
	for (const key of needed) {
		const entry = selected.has(key) ? extractEntry(selected.get(key)!) : null;
		if (entry) index[key] = entry;
	}

	const misses = [...needed].filter((name) => !index[name]).sort();
	if (misses.length > 0) {
		console.warn(`\n${misses.length} card names not resolved:`);
		for (const name of misses) console.warn(`  - ${name}`);
	}

	const sorted = Object.fromEntries(
		Object.entries(index).sort(([a], [b]) => a.localeCompare(b)),
	);
	writeFileSync(OUTPUT_FILE, `${JSON.stringify(sorted, null, "\t")}\n`);
	console.log(`\nWrote ${Object.keys(sorted).length} entries to ${OUTPUT_FILE}`);
}

if (import.meta.main) main();
