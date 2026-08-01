import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { getFrontFace } from "../../src/lib/utils/card-normalizer";

export const CARD_IMAGE_STATUS_SCHEMA_VERSION = 1;
const USER_AGENT = "mtg-meta-analyzer/1.0";

export interface DefaultCardsManifest {
	updated_at: string;
	jsonl_download_uri: string;
}

export interface CardImageIndexStatus {
	schemaVersion: number;
	bulkDataUpdatedAt: string;
	unresolved: string[];
}

/** Collect every card name used in decklists and archetype definitions. */
export function collectNeededNames(
	dataDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data"),
): Set<string> {
	const needed = new Set<string>();
	const add = (name: string) => needed.add(getFrontFace(name));

	const formatDirs = readdirSync(dataDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && entry.name !== "archetypes")
		.map((entry) => entry.name);

	for (const format of formatDirs) {
		const formatDir = join(dataDir, format);
		const monthDirs = readdirSync(formatDir, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name);
		for (const month of monthDirs) {
			const monthDir = join(formatDir, month);
			for (const file of readdirSync(monthDir).filter((name) =>
				name.endsWith(".json"),
			)) {
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

	const archetypeDir = join(dataDir, "archetypes");
	for (const file of readdirSync(archetypeDir).filter((name) =>
		name.endsWith(".yaml"),
	)) {
		const doc = parseYaml(readFileSync(join(archetypeDir, file), "utf-8"));
		for (const archetype of doc.archetypes ?? []) {
			for (const card of archetype.signatureCards ?? []) add(card.name);
		}
	}

	return needed;
}

export function parseDefaultCardsManifest(value: unknown): DefaultCardsManifest {
	const manifest = value as {
		data?: Array<Partial<DefaultCardsManifest> & { type?: string }>;
	};
	const defaultCards = manifest?.data?.find((data) => data.type === "default_cards");
	if (!defaultCards?.updated_at || !defaultCards.jsonl_download_uri) {
		throw new Error(
			"default_cards manifest is missing updated_at or jsonl_download_uri",
		);
	}
	return {
		updated_at: defaultCards.updated_at,
		jsonl_download_uri: defaultCards.jsonl_download_uri,
	};
}

export async function fetchDefaultCardsManifest(): Promise<DefaultCardsManifest> {
	console.log("Fetching bulk data manifest...");
	const headers = { "User-Agent": USER_AGENT, Accept: "application/json" };
	const response = await fetch("https://api.scryfall.com/bulk-data", { headers });
	if (!response.ok) throw new Error(`Manifest fetch failed: HTTP ${response.status}`);
	return parseDefaultCardsManifest(await response.json());
}

export function isValidCardImageStatus(value: unknown): value is CardImageIndexStatus {
	if (typeof value !== "object" || value === null) return false;
	const status = value as Record<string, unknown>;
	return (
		status.schemaVersion === CARD_IMAGE_STATUS_SCHEMA_VERSION &&
		typeof status.bulkDataUpdatedAt === "string" &&
		status.bulkDataUpdatedAt.length > 0 &&
		Array.isArray(status.unresolved) &&
		status.unresolved.every((name) => typeof name === "string")
	);
}

export function getUncoveredCardNames(
	neededNames: Iterable<string>,
	resolvedNames: Iterable<string>,
	unresolvedNames: Iterable<string>,
): string[] {
	const resolved = new Set(resolvedNames);
	const unresolved = new Set(unresolvedNames);
	return [...neededNames].filter(
		(name) => !resolved.has(name) && !unresolved.has(name),
	);
}

export function isCardImageIndexCurrent(input: {
	neededNames: Iterable<string>;
	resolvedNames: Iterable<string>;
	status: unknown;
	currentBulkDataUpdatedAt: string;
}): boolean {
	if (!isValidCardImageStatus(input.status)) return false;
	if (input.status.bulkDataUpdatedAt !== input.currentBulkDataUpdatedAt) return false;

	const resolved = new Set(input.resolvedNames);
	const unresolved = new Set(input.status.unresolved);
	if ([...unresolved].some((name) => resolved.has(name))) return false;
	return getUncoveredCardNames(input.neededNames, resolved, unresolved).length === 0;
}
