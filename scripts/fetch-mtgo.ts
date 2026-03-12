/**
 * Fetch MTGO tournament data (Challenges & Showcases).
 *
 * Usage:
 *   bun run scripts/fetch-mtgo.ts [--from YYYY-MM] [--to YYYY-MM]
 *       [--format <name>] [--dry-run]
 *
 * Examples:
 *   bun run scripts/fetch-mtgo.ts                          # current month
 *   bun run scripts/fetch-mtgo.ts --from 2026-01 --to 2026-03  # backfill
 *   bun run scripts/fetch-mtgo.ts --format Pauper --dry-run
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanTournamentName, inferImportance, toFormatSlug } from "./lib/importance";
import { updateFormatIndex } from "./lib/index-utils";
import { assembleMtgoTournament } from "./lib/mtgo-assembler";
import { MtgoClient, MtgoFetchError, type MtgoListingEntry } from "./lib/mtgo-client";

// ---------------------------------------------------------------------------
// Target formats and event type filters
// ---------------------------------------------------------------------------

const TARGET_FORMATS = new Set([
	"Standard",
	"Modern",
	"Legacy",
	"Pauper",
	"Vintage",
	"Premodern",
]);

/** Returns true for Challenge 32/64 and Showcase Challenge events. */
function isTargetEvent(title: string): boolean {
	const lower = title.toLowerCase();
	if (lower.includes("league")) return false;
	if (lower.includes("preliminary")) return false;
	if (lower.includes("trial")) return false;
	return (
		lower.includes("challenge 32") ||
		lower.includes("challenge 64") ||
		lower.includes("showcase challenge") ||
		lower.includes("super qualifier")
	);
}

/** Extract the MTG format name from an MTGO event title. */
function inferFormatFromTitle(title: string): string | null {
	const match = title.match(
		/^(Standard|Modern|Pioneer|Legacy|Pauper|Vintage|Premodern)\b/i,
	);
	return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Month range builder
// ---------------------------------------------------------------------------

interface YearMonth {
	year: number;
	month: number;
}

function buildMonthRange(from?: string | null, to?: string | null): YearMonth[] {
	const now = new Date();
	const currentYear = now.getUTCFullYear();
	const currentMonth = now.getUTCMonth() + 1;

	if (!from && !to) {
		return [{ year: currentYear, month: currentMonth }];
	}

	const parseYM = (s: string): YearMonth => {
		const [y, m] = s.split("-").map(Number);
		return { year: y, month: m };
	};

	const start = from ? parseYM(from) : { year: currentYear, month: currentMonth };
	const end = to ? parseYM(to) : { year: currentYear, month: currentMonth };

	const months: YearMonth[] = [];
	let y = start.year;
	let m = start.month;

	while (y < end.year || (y === end.year && m <= end.month)) {
		months.push({ year: y, month: m });
		m++;
		if (m > 12) {
			m = 1;
			y++;
		}
	}

	return months;
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgValue(args: string[], flag: string): string | null {
	const idx = args.indexOf(flag);
	if (idx === -1 || idx + 1 >= args.length) return null;
	return args[idx + 1];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	const args = process.argv.slice(2);
	const dryRun = args.includes("--dry-run");
	const fromArg = parseArgValue(args, "--from");
	const toArg = parseArgValue(args, "--to");
	const formatFilter = parseArgValue(args, "--format");

	const months = buildMonthRange(fromArg, toArg);
	console.log(
		`MTGO fetch: ${months.map((m) => `${m.year}-${String(m.month).padStart(2, "0")}`).join(", ")}`,
	);
	if (dryRun) console.log("(dry run — will not write files)");
	if (formatFilter) console.log(`Format filter: ${formatFilter}`);

	const client = new MtgoClient({ delayMs: 1000 });

	// Phase 1: Discovery
	const allEntries: MtgoListingEntry[] = [];
	for (const { year, month } of months) {
		const label = `${year}-${String(month).padStart(2, "0")}`;
		console.log(`\nDiscovering ${label}...`);
		try {
			const entries = await client.fetchListingPage(year, month);
			console.log(`  Found ${entries.length} events`);
			allEntries.push(...entries);
		} catch (e) {
			if (e instanceof MtgoFetchError && e.status === 404) {
				console.log(`  No listing page for ${label} (404)`);
			} else {
				throw e;
			}
		}
	}

	// Phase 2: Filter
	const filtered = allEntries.filter((entry) => {
		if (!isTargetEvent(entry.title)) return false;
		const format = inferFormatFromTitle(entry.title);
		if (!format || !TARGET_FORMATS.has(format)) return false;
		if (formatFilter && format.toLowerCase() !== formatFilter.toLowerCase())
			return false;
		return true;
	});

	// Phase 3: Check disk for existing files
	const toFetch = filtered.filter((entry) => {
		const format = inferFormatFromTitle(entry.title)!;
		const formatSlug = toFormatSlug(format);
		const yearMonth = entry.date.slice(0, 7);
		const filePath = join("data", formatSlug, yearMonth, `mtgo-${entry.eventId}.json`);
		return !existsSync(filePath);
	});

	const alreadyOnDisk = filtered.length - toFetch.length;
	console.log(
		`\n${filtered.length} target events, ${toFetch.length} new (${alreadyOnDisk} already on disk)`,
	);

	if (dryRun) {
		for (const entry of toFetch) {
			console.log(`  [NEW] ${entry.date} ${entry.title} (${entry.eventId})`);
		}
		for (const entry of filtered.filter((e) => !toFetch.includes(e))) {
			console.log(`  [SKIP] ${entry.date} ${entry.title} (${entry.eventId})`);
		}
		return;
	}

	// Phase 4: Fetch and transform
	let fetched = 0;
	let skipped = 0;
	let failed = 0;

	for (const entry of toFetch) {
		try {
			console.log(`\nFetching: ${entry.title} (${entry.eventId})...`);
			const raw = await client.fetchTournamentData(entry.href);

			if (!raw) {
				console.log("  Skipped: data not yet published");
				skipped++;
				continue;
			}

			const tournament = assembleMtgoTournament(raw, entry.href);

			const format = inferFormatFromTitle(entry.title)!;
			const formatSlug = toFormatSlug(format);
			const yearMonth = entry.date.slice(0, 7);
			const filename = `mtgo-${entry.eventId}.json`;
			const dir = join("data", formatSlug, yearMonth);
			const filePath = join(dir, filename);

			mkdirSync(dir, { recursive: true });
			writeFileSync(filePath, JSON.stringify(tournament, null, 2));
			console.log(`  Written: ${filePath}`);

			updateFormatIndex(formatSlug, {
				id: tournament.meta.id,
				name: tournament.meta.name,
				cleanName: cleanTournamentName(tournament.meta.name),
				date: tournament.meta.date,
				format,
				source: "mtgo",
				url: tournament.meta.url,
				playerCount: tournament.meta.playerCount,
				roundCount: tournament.meta.roundCount,
				importance: inferImportance(tournament.meta.name),
				tabletop: false,
				pairings: false,
				path: `${yearMonth}/${filename}`,
			});

			fetched++;
		} catch (e) {
			console.error(`  Failed: ${e}`);
			failed++;
		}
	}

	// Summary
	console.log("\n=== Summary ===");
	console.log(`Fetched: ${fetched}, Skipped: ${skipped}, Failed: ${failed}`);
}

main().catch((e) => {
	console.error("Fatal error:", e);
	process.exit(1);
});
