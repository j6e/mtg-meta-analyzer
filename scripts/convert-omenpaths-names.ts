/**
 * Convert Through the Omenpaths MTGO display names to Scryfall's canonical
 * paper names, or convert canonical paper names back to the online names.
 *
 * Usage:
 *   bun run scripts/convert-omenpaths-names.ts --to-paper
 *   bun run scripts/convert-omenpaths-names.ts --to-online
 *   bun run scripts/convert-omenpaths-names.ts --to-paper --dry-run
 *   bun run scripts/convert-omenpaths-names.ts --to-paper --format duel-commander
 */
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TournamentData } from "../src/lib/types/tournament";
import {
	buildOmenpathsNameMaps,
	convertOmenpathsName,
	type OmenpathsCard,
	type OmenpathsDirection,
	parseOmenpathsDirection,
} from "./lib/omenpaths-names";

const ROOT = join(import.meta.dir, "..");
const DATA_DIR = join(ROOT, "data");
const USER_AGENT = "mtg-meta-analyzer/1.0";

type Direction = OmenpathsDirection;

function usage(): never {
	console.error(
		"Usage: bun run scripts/convert-omenpaths-names.ts --to-paper|--to-online [--format FORMAT] [--dry-run]",
	);
	process.exit(1);
}

export interface ConverterOptions {
	direction: Direction;
	dryRun: boolean;
	format?: string;
}

export function parseOptions(args: string[]): ConverterOptions {
	const directionArgs = args.filter(
		(arg) => parseOmenpathsDirection(arg) !== undefined,
	);
	if (directionArgs.length !== 1) usage();

	const formatIndex = args.indexOf("--format");
	let format: string | undefined;
	if (formatIndex !== -1) {
		format = args[formatIndex + 1];
		if (!format || !/^[a-z0-9-]+$/.test(format)) usage();
	}

	return {
		direction: parseOmenpathsDirection(directionArgs[0]) as Direction,
		dryRun: args.includes("--dry-run"),
		...(format ? { format } : {}),
	};
}

function walkJsonFiles(dir: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) files.push(...walkJsonFiles(path));
		else if (
			entry.isFile() &&
			entry.name.endsWith(".json") &&
			entry.name !== "index.json"
		) {
			files.push(path);
		}
	}
	return files;
}

const wait = (milliseconds: number) =>
	new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchScryfallPage(
	uri: string,
	headers: Record<string, string>,
): Promise<{ data: OmenpathsCard[]; has_more: boolean; next_page?: string }> {
	for (let attempt = 0; attempt < 4; attempt++) {
		const response = await fetch(uri, { headers });
		if (response.ok) {
			return (await response.json()) as {
				data: OmenpathsCard[];
				has_more: boolean;
				next_page?: string;
			};
		}
		if (response.status !== 429) {
			throw new Error(`Scryfall request failed: HTTP ${response.status}`);
		}

		const retryAfter = Number(response.headers.get("Retry-After"));
		await wait(Number.isFinite(retryAfter) ? retryAfter * 1000 : 1000 * 2 ** attempt);
	}

	throw new Error("Scryfall request failed: rate limit did not clear after retries");
}

async function fetchOmenpathsCards(): Promise<OmenpathsCard[]> {
	const headers = { Accept: "application/json", "User-Agent": USER_AGENT };
	let uri = "https://api.scryfall.com/cards/search?q=set%3Aom1&unique=prints";
	const cards: OmenpathsCard[] = [];

	while (uri) {
		const page = await fetchScryfallPage(uri, headers);
		cards.push(...page.data);
		uri = page.has_more && page.next_page ? page.next_page : "";
		if (uri) await wait(100);
	}

	return cards;
}

async function main() {
	const options = parseOptions(process.argv.slice(2));
	const dataDir = options.format ? join(DATA_DIR, options.format) : DATA_DIR;

	const cards = await fetchOmenpathsCards();
	const maps = buildOmenpathsNameMaps(cards);
	const nameMap = options.direction === "to-paper" ? maps.toPaper : maps.toOnline;
	let filesScanned = 0;
	let filesModified = 0;
	let namesConverted = 0;

	for (const filePath of walkJsonFiles(dataDir)) {
		const data = JSON.parse(await Bun.file(filePath).text()) as TournamentData;
		filesScanned++;
		if (!data.decklists) continue;
		let fileChanged = false;

		for (const decklist of Object.values(data.decklists)) {
			for (const section of [
				"mainboard",
				"sideboard",
				"commanders",
				"companion",
			] as const) {
				for (const entry of decklist[section] ?? []) {
					const converted = convertOmenpathsName(
						entry.cardName,
						maps,
						options.direction,
					);
					if (converted === entry.cardName) continue;
					console.log(`  ${entry.cardName} → ${converted}`);
					if (!options.dryRun) entry.cardName = converted;
					fileChanged = true;
					namesConverted++;
				}
			}
		}

		if (fileChanged) {
			if (!options.dryRun) writeFileSync(filePath, JSON.stringify(data, null, 2));
			filesModified++;
		}
	}

	console.log(
		`${options.dryRun ? "Would convert" : "Converted"} ${namesConverted} names in ${filesModified} files (scanned ${filesScanned}; ${nameMap.size} mappings${options.format ? `; format ${options.format}` : ""}).`,
	);
}

if (import.meta.main) {
	main().catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	});
}
