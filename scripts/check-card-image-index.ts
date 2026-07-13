/**
 * Check whether data/card-images.json covers all current card names and was
 * built against the current Scryfall default_cards bulk-data version.
 *
 * Usage:
 *   bun run scripts/check-card-image-index.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CardImageEntry } from "../src/lib/stores/card-images";
import {
	collectNeededNames,
	fetchDefaultCardsManifest,
	getUncoveredCardNames,
	isCardImageIndexCurrent,
	isValidCardImageStatus,
} from "./lib/card-image-index";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "data");
const OUTPUT_FILE = join(DATA_DIR, "card-images.json");
const STATUS_FILE = join(DATA_DIR, "card-images-status.json");

function readJsonFile(path: string): unknown {
	return JSON.parse(readFileSync(path, "utf-8"));
}

async function main(): Promise<void> {
	const neededNames = collectNeededNames(DATA_DIR);
	if (!existsSync(OUTPUT_FILE) || !existsSync(STATUS_FILE)) {
		throw new Error("card image output or status file is missing");
	}

	const output = readJsonFile(OUTPUT_FILE);
	const status = readJsonFile(STATUS_FILE);
	if (
		typeof output !== "object" ||
		output === null ||
		!Object.values(output).every((entry) => entry !== null && typeof entry === "object")
	) {
		throw new Error("card image output has an invalid shape");
	}
	if (!isValidCardImageStatus(status)) {
		throw new Error("card image status has an invalid shape or schema version");
	}

	const manifest = await fetchDefaultCardsManifest();
	const resolvedNames = Object.keys(output as Record<string, CardImageEntry>);
	const uncoveredNames = getUncoveredCardNames(
		neededNames,
		resolvedNames,
		status.unresolved,
	);

	if (
		!isCardImageIndexCurrent({
			neededNames,
			resolvedNames,
			status,
			currentBulkDataUpdatedAt: manifest.updated_at,
		})
	) {
		if (status.bulkDataUpdatedAt !== manifest.updated_at) {
			console.error(
				`Scryfall bulk data changed: ${status.bulkDataUpdatedAt} -> ${manifest.updated_at}`,
			);
		}
		if (uncoveredNames.length > 0) {
			console.error(`Uncovered card names (${uncoveredNames.length}):`);
			for (const name of uncoveredNames) console.error(`  - ${name}`);
		}
		if (status.unresolved.some((name) => resolvedNames.includes(name))) {
			console.error("Status metadata overlaps resolved card entries");
		}
		process.exitCode = 1;
		return;
	}

	console.log(
		`Card image index is current (${resolvedNames.length} resolved, ${status.unresolved.length} unresolved)`,
	);
}

if (import.meta.main) {
	main().catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
