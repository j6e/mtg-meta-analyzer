/**
 * Build data/card-images.json: card name → Scryfall CDN image URLs + artist.
 *
 * Resolves every card name appearing in tournament decklists and archetype
 * signature definitions against Scryfall's default_cards bulk data, so the app
 * never hits the rate-limited api.scryfall.com at runtime (see
 * docs/scryfall-image-compliance.md).
 *
 * The bulk file is cached in .scratch/ and re-downloaded after 24h.
 *
 * Usage:
 *   bun run scripts/build-card-image-index.ts
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CardImageEntry } from "../src/lib/stores/card-images";
import { getFrontFace } from "../src/lib/utils/card-normalizer";
import {
	CARD_IMAGE_STATUS_SCHEMA_VERSION,
	collectNeededNames,
	type DefaultCardsManifest,
	fetchDefaultCardsManifest,
} from "./lib/card-image-index";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "data");
const CACHE_DIR = join(ROOT, ".scratch");
const CACHE_FILE = join(CACHE_DIR, "scryfall-default-cards.jsonl.gz");
const CACHE_METADATA_FILE = join(CACHE_DIR, "scryfall-default-cards-status.json");
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const OUTPUT_FILE = join(DATA_DIR, "card-images.json");
const STATUS_FILE = join(DATA_DIR, "card-images-status.json");

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

function considerPreferredCard(
	selected: Map<string, ScryfallCard>,
	card: ScryfallCard,
	names: Set<string>,
): void {
	if (!isPlayableCard(card)) return;
	const name = getFrontFace(card.name);
	if (!names.has(name)) return;
	const current = selected.get(name);
	if (!current || compareCardVersions(card, current) < 0) {
		selected.set(name, card);
	}
}

/** Select preferred printings for all needed names in one pass through the bulk file. */
export function selectPreferredCards(
	cards: ScryfallCard[],
	names: Set<string>,
): Map<string, ScryfallCard> {
	const selected = new Map<string, ScryfallCard>();
	for (const card of cards) considerPreferredCard(selected, card, names);
	return selected;
}

function openCompressedBulkDataStream(): ReadableStream<Uint8Array> {
	return Bun.file(CACHE_FILE).stream().pipeThrough(new DecompressionStream("gzip"));
}

/** Open default_cards as a decompressed JSONL stream, reusing a matching cache. */
async function openBulkDataStream(
	manifest: DefaultCardsManifest,
): Promise<ReadableStream<Uint8Array>> {
	let cachedVersion = "";
	if (existsSync(CACHE_METADATA_FILE)) {
		try {
			const metadata = JSON.parse(readFileSync(CACHE_METADATA_FILE, "utf-8")) as {
				bulkDataUpdatedAt?: unknown;
			};
			if (typeof metadata.bulkDataUpdatedAt === "string") {
				cachedVersion = metadata.bulkDataUpdatedAt;
			}
		} catch {
			// Treat malformed cache metadata as a cache miss.
		}
	}

	if (
		existsSync(CACHE_FILE) &&
		cachedVersion === manifest.updated_at &&
		Date.now() - statSync(CACHE_FILE).mtimeMs < CACHE_MAX_AGE_MS
	) {
		console.log(`Using cached bulk data (${CACHE_FILE})`);
		return openCompressedBulkDataStream();
	}

	console.log(`Downloading ${manifest.jsonl_download_uri} ...`);
	mkdirSync(CACHE_DIR, { recursive: true });
	const download = Bun.spawn(
		[
			"curl",
			"--fail",
			"--location",
			"--retry",
			"3",
			"--silent",
			"--show-error",
			"--user-agent",
			"mtg-meta-analyzer/1.0",
			"--output",
			CACHE_FILE,
			manifest.jsonl_download_uri,
		],
		{ stdout: "inherit", stderr: "inherit" },
	);
	const exitCode = await download.exited;
	if (exitCode !== 0) throw new Error(`Bulk download failed: curl exited ${exitCode}`);

	await Bun.write(
		CACHE_METADATA_FILE,
		`${JSON.stringify({ bulkDataUpdatedAt: manifest.updated_at })}\n`,
	);
	console.log(
		`Cached ${(statSync(CACHE_FILE).size / 1024 / 1024).toFixed(0)}MB to ${CACHE_FILE}`,
	);
	return openCompressedBulkDataStream();
}

/** Process Scryfall's JSONL bulk file without retaining it in memory. */
async function forEachJsonLine(
	stream: ReadableStream<Uint8Array>,
	onObject: (json: string) => void,
): Promise<void> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let pending = "";

	const consume = (text: string) => {
		pending += text;
		const lines = pending.split("\n");
		pending = lines.pop() ?? "";
		for (const line of lines) {
			if (line.trim()) onObject(line);
		}
	};

	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		consume(decoder.decode(value, { stream: true }));
	}
	consume(decoder.decode());
	if (pending.trim()) onObject(pending);
}

async function selectPreferredCardsFromBulk(
	names: Set<string>,
	manifest: DefaultCardsManifest,
): Promise<{ selected: Map<string, ScryfallCard>; count: number }> {
	const selected = new Map<string, ScryfallCard>();
	let count = 0;
	const consumeCard = (json: string) => {
		count++;
		considerPreferredCard(selected, JSON.parse(json) as ScryfallCard, names);
	};
	const stream = await openBulkDataStream(manifest);
	await forEachJsonLine(stream, consumeCard);
	return { selected, count };
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
	const needed = collectNeededNames(DATA_DIR);
	console.log(`Collected ${needed.size} distinct card names from data/`);

	const manifest = await fetchDefaultCardsManifest();
	const { selected, count } = await selectPreferredCardsFromBulk(needed, manifest);
	console.log(`Bulk data has ${count} cards`);

	const index: Record<string, CardImageEntry> = {};
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
	writeFileSync(
		STATUS_FILE,
		`${JSON.stringify(
			{
				schemaVersion: CARD_IMAGE_STATUS_SCHEMA_VERSION,
				bulkDataUpdatedAt: manifest.updated_at,
				unresolved: misses,
			},
			null,
			2,
		)}\n`,
	);
	console.log(`\nWrote ${Object.keys(sorted).length} entries to ${OUTPUT_FILE}`);
	console.log(`Wrote status metadata to ${STATUS_FILE}`);
}

if (import.meta.main) main();
