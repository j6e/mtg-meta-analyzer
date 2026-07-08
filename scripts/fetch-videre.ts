/**
 * Fetch MTGO tournament data from the Videre Project database
 * (Challenges, Showcase Challenges, Super Qualifiers — with full pairings).
 *
 * Requires the Cloudflare Tunnel bridge (see scripts/lib/videre-client.ts).
 *
 * Usage:
 *   bun run scripts/fetch-videre.ts [--from YYYY-MM] [--to YYYY-MM]
 *       [--format <name>] [--dry-run]
 *
 * Examples:
 *   bun run scripts/fetch-videre.ts                              # current month
 *   bun run scripts/fetch-videre.ts --from 2026-01 --to 2026-03  # backfill
 *   bun run scripts/fetch-videre.ts --format Pauper --dry-run
 *
 * When an event was previously fetched from mtgo.com, the videre version
 * supersedes it: mtgo-<id>.json is deleted and its index entry replaced
 * (manual cleanName/importance overrides are carried over).
 */
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TournamentIndexEntry } from "../src/lib/types/tournament";
import { parseArgValue } from "./lib/cli-utils";
import { cleanTournamentName, inferImportance, toFormatSlug } from "./lib/importance";
import { updateFormatIndex } from "./lib/index-utils";
import { assembleVidereTournament } from "./lib/videre-assembler";
import { VidereClient } from "./lib/videre-client";

// ---------------------------------------------------------------------------
// Target formats and event type filters
// ---------------------------------------------------------------------------

// Duel Commander is not in videre — it stays on scripts/fetch-mtgo.ts.
const TARGET_FORMATS = [
	"Standard",
	"Modern",
	"Pioneer",
	"Legacy",
	"Pauper",
	"Vintage",
	"Premodern",
];

// Leagues have no pairings, Preliminaries have no decklists (verified live,
// see docs/videre-parser.md) — only these kinds are worth fetching.
const TARGET_KINDS = ["Challenge", "Showcase", "Qualifier"];

/** Same event policy as fetch-mtgo: Challenge 32/64, Showcase Challenge, Super Qualifier. */
function isTargetEvent(name: string): boolean {
	const lower = name.toLowerCase();
	return (
		lower.includes("challenge 32") ||
		lower.includes("challenge 64") ||
		lower.includes("showcase challenge") ||
		lower.includes("super qualifier")
	);
}

// ---------------------------------------------------------------------------
// Date range
// ---------------------------------------------------------------------------

/** Inclusive [minDate, maxDate] covering whole months, from --from/--to (YYYY-MM). */
function buildDateRange(from?: string | null, to?: string | null): [string, string] {
	const now = new Date();
	const currentYM = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

	const startYM = from ?? currentYM;
	const endYM = to ?? (from ? startYM : currentYM);

	const [endYear, endMonth] = endYM.split("-").map(Number);
	const lastDay = new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate();

	return [`${startYM}-01`, `${endYM}-${String(lastDay).padStart(2, "0")}`];
}

// ---------------------------------------------------------------------------
// mtgo twin lookup
// ---------------------------------------------------------------------------

/** Find data/<slug>/<any YYYY-MM>/mtgo-<id>.json (the twin may sit in an adjacent month). */
function findMtgoTwin(formatSlug: string, eventId: number): string | null {
	const base = join("data", formatSlug);
	if (!existsSync(base)) return null;
	for (const entry of readdirSync(base, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const path = join(base, entry.name, `mtgo-${eventId}.json`);
		if (existsSync(path)) return path;
	}
	return null;
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

	const [minDate, maxDate] = buildDateRange(fromArg, toArg);
	console.log(`Videre fetch: ${minDate} → ${maxDate}`);
	if (dryRun) console.log("(dry run — will not write files)");
	if (formatFilter) console.log(`Format filter: ${formatFilter}`);

	const client = new VidereClient();

	try {
		// Phase 1: Discovery
		const events = await client.listEvents({
			minDate,
			maxDate,
			formats: TARGET_FORMATS,
			kinds: TARGET_KINDS,
		});
		console.log(`Found ${events.length} candidate events`);

		// Phase 2: Filter
		const filtered = events.filter((ev) => {
			if (!isTargetEvent(ev.name)) return false;
			if (formatFilter && ev.format.toLowerCase() !== formatFilter.toLowerCase())
				return false;
			return true;
		});

		// Phase 3: Check disk for existing files
		const toFetch = filtered.filter((ev) => {
			const filePath = join(
				"data",
				toFormatSlug(ev.format),
				ev.date.slice(0, 7),
				`videre-${ev.id}.json`,
			);
			return !existsSync(filePath);
		});

		const alreadyOnDisk = filtered.length - toFetch.length;
		console.log(
			`\n${filtered.length} target events, ${toFetch.length} new (${alreadyOnDisk} already on disk)`,
		);

		if (dryRun) {
			const toFetchSet = new Set(toFetch);
			for (const ev of toFetch) {
				const twin = findMtgoTwin(toFormatSlug(ev.format), ev.id);
				const supersede = twin ? ` [supersedes ${twin}]` : "";
				console.log(
					`  [NEW] ${ev.date} ${ev.format} ${ev.name} (${ev.id})${supersede}`,
				);
			}
			for (const ev of filtered) {
				if (!toFetchSet.has(ev))
					console.log(`  [SKIP] ${ev.date} ${ev.format} ${ev.name} (${ev.id})`);
			}
			return;
		}

		// Phase 4: Fetch and transform
		let fetched = 0;
		let skipped = 0;
		let failed = 0;
		let superseded = 0;

		for (const ev of toFetch) {
			try {
				console.log(`\nFetching: ${ev.format} ${ev.name} ${ev.date} (${ev.id})...`);
				const raw = await client.fetchEvent(ev.id);

				if (!raw || raw.decks.length === 0) {
					console.log("  Skipped: no decklists in videre yet");
					skipped++;
					continue;
				}

				const tournament = assembleVidereTournament(raw);

				const formatSlug = toFormatSlug(ev.format);
				const yearMonth = ev.date.slice(0, 7);
				const filename = `videre-${ev.id}.json`;
				const dir = join("data", formatSlug, yearMonth);
				const filePath = join(dir, filename);

				mkdirSync(dir, { recursive: true });
				writeFileSync(filePath, JSON.stringify(tournament, null, 2));
				console.log(`  Written: ${filePath}`);

				// Supersede the mtgo.com twin (videre ids ARE mtgo event ids)
				const twinPath = findMtgoTwin(formatSlug, ev.id);
				if (twinPath) {
					unlinkSync(twinPath);
					console.log(`  Deleted superseded ${twinPath}`);
					superseded++;
				}

				const indexEntry: TournamentIndexEntry = {
					id: tournament.meta.id,
					name: tournament.meta.name,
					cleanName: cleanTournamentName(tournament.meta.name),
					date: tournament.meta.date,
					format: ev.format,
					source: "videre",
					url: tournament.meta.url,
					playerCount: tournament.meta.playerCount,
					roundCount: tournament.meta.roundCount,
					importance: inferImportance(tournament.meta.name),
					tabletop: false,
					pairings: true,
					path: `${yearMonth}/${filename}`,
				};

				// Replaces the mtgo-<id> entry if one lingers, carrying its
				// manual cleanName/importance overrides onto this entry
				updateFormatIndex(formatSlug, indexEntry, {
					supersedesId: `mtgo-${ev.id}`,
				});

				fetched++;
			} catch (e) {
				console.error(`  Failed: ${e}`);
				failed++;
			}
		}

		// Summary
		console.log("\n=== Summary ===");
		console.log(
			`Fetched: ${fetched}, Skipped: ${skipped}, Failed: ${failed}, Superseded mtgo files: ${superseded}`,
		);
	} finally {
		await client.close();
	}
}

main().catch((e) => {
	console.error("Fatal error:", e instanceof Error ? e.message : e);
	process.exit(1);
});
