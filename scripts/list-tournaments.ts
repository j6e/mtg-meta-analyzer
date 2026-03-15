/**
 * List tournaments from melee.gg and output CSV grouped by format.
 *
 * Note: The TournamentSearch API's FormatDescription field is unreliable
 * (always returns "Standard"), so format is inferred from tournament names.
 *
 * Usage:
 *   bun run scripts/list-tournaments.ts [options]
 *
 * Options:
 *   --start <YYYY-MM-DD>   Start date (default: 30 days ago)
 *   --end <YYYY-MM-DD>     End date (default: today)
 *   --format <name>        Filter by format (case-insensitive match)
 *   --min-players <n>      Minimum player/decklist count (default: 0)
 *   --out <path>           Write CSV to file instead of stdout
 *
 * Examples:
 *   bun run scripts/list-tournaments.ts
 *   bun run scripts/list-tournaments.ts --start 2025-01-01 --end 2025-03-01 --format Pauper
 *   bun run scripts/list-tournaments.ts --min-players 32 --out tournaments.csv
 */
import { writeFileSync } from "node:fs";
import { parseTournamentPage } from "./lib/html-parser";
import { inferImportance } from "./lib/importance";
import { MeleeClient } from "./lib/melee-client";
import type { MeleeTournamentSearchRow } from "./lib/types";

// --- Terminal UI helpers (no dependencies) ---

const isInteractive = process.stderr.isTTY ?? false;
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const BAR_WIDTH = 30;

class Progress {
	private spinnerIdx = 0;
	private timer: ReturnType<typeof setInterval> | null = null;
	private currentMsg = "";
	private total = 0;
	private current = 0;

	/** Show a spinner with a message */
	spin(msg: string): void {
		this.stop();
		this.currentMsg = msg;
		if (isInteractive) {
			this.timer = setInterval(() => {
				const frame = SPINNER_FRAMES[this.spinnerIdx % SPINNER_FRAMES.length];
				process.stderr.write(`\r\x1b[K${frame} ${this.currentMsg}`);
				this.spinnerIdx++;
			}, 80);
		} else {
			process.stderr.write(`${msg}\n`);
		}
	}

	/** Start a progress bar */
	startBar(msg: string, total: number): void {
		this.stop();
		this.currentMsg = msg;
		this.total = total;
		this.current = 0;
		if (isInteractive) {
			this.renderBar();
			this.timer = setInterval(() => this.renderBar(), 80);
		} else {
			process.stderr.write(`${msg} (0/${total})\n`);
		}
	}

	/** Advance the progress bar by 1 */
	tick(): void {
		this.current++;
		if (!isInteractive && this.current === this.total) {
			process.stderr.write(`${this.currentMsg} (${this.current}/${this.total})\n`);
		}
	}

	/** Stop and clear the current spinner/bar, print a final message */
	done(msg: string): void {
		this.stop();
		if (isInteractive) {
			process.stderr.write(`\r\x1b[K✔ ${msg}\n`);
		} else {
			process.stderr.write(`${msg}\n`);
		}
	}

	/** Stop without printing anything */
	stop(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
		if (isInteractive) {
			process.stderr.write("\r\x1b[K");
		}
	}

	private renderBar(): void {
		const pct = this.total > 0 ? this.current / this.total : 0;
		const filled = Math.round(BAR_WIDTH * pct);
		const empty = BAR_WIDTH - filled;
		const bar = `${"█".repeat(filled)}${"░".repeat(empty)}`;
		const frame = SPINNER_FRAMES[this.spinnerIdx++ % SPINNER_FRAMES.length];
		process.stderr.write(
			`\r\x1b[K${frame} ${this.currentMsg} ${bar} ${this.current}/${this.total}`,
		);
	}
}

// --- Arg parsing ---

function parseArgs(argv: string[]) {
	const args = argv.slice(2);
	const opts: {
		start: string | null;
		end: string | null;
		format: string | null;
		minPlayers: number;
		out: string | null;
	} = { start: null, end: null, format: null, minPlayers: 0, out: null };

	for (let i = 0; i < args.length; i++) {
		switch (args[i]) {
			case "--start":
				opts.start = args[++i];
				break;
			case "--end":
				opts.end = args[++i];
				break;
			case "--format":
				opts.format = args[++i];
				break;
			case "--min-players":
				opts.minPlayers = Number(args[++i]);
				break;
			case "--out":
				opts.out = args[++i];
				break;
			default:
				console.error(`Unknown option: ${args[i]}`);
				process.exit(1);
		}
	}

	return opts;
}

// --- Format inference ---

// Ordered so more specific formats match first (e.g. "Duel Commander" before "Commander")
const FORMAT_PATTERNS: { format: string; pattern: RegExp }[] = [
	{ format: "Duel Commander", pattern: /\bduel\s*commander\b/i },
	{ format: "Canadian Highlander", pattern: /\bcana?d(?:ian)?\s*highlander\b/i },
	{ format: "Old School", pattern: /\bold\s*school\b/i },
	{ format: "Premodern", pattern: /\bpremodern\b/i },
	{ format: "Standard", pattern: /\bstandard\b/i },
	{ format: "Modern", pattern: /\bmodern\b/i },
	{ format: "Pioneer", pattern: /\bpioneer\b/i },
	{ format: "Legacy", pattern: /\blegacy\b/i },
	{ format: "Vintage", pattern: /\bvintage\b/i },
	{ format: "Pauper", pattern: /\bpauper\b/i },
	{ format: "Limited", pattern: /\blimited\b/i },
	{ format: "Draft", pattern: /\bdraft\b/i },
	{ format: "Sealed", pattern: /\bsealed\b/i },
	{ format: "Commander", pattern: /\bcommander\b|\bedh\b/i },
	{ format: "Brawl", pattern: /\bbrawl\b/i },
	{ format: "Historic", pattern: /\bhistoric\b/i },
	{ format: "Alchemy", pattern: /\balchemy\b/i },
	{ format: "Timeless", pattern: /\btimeless\b/i },
	{ format: "Explorer", pattern: /\bexplorer\b/i },
	{ format: "Oathbreaker", pattern: /\boathbreaker\b/i },
	{ format: "Centurion", pattern: /\bcenturion\b/i },
	{ format: "Penny Dreadful", pattern: /\bpenny\s*dreadful\b/i },
];

function inferFormat(name: string): string | null {
	for (const { format, pattern } of FORMAT_PATTERNS) {
		if (pattern.test(name)) return format;
	}
	return null;
}

/** Normalize a format string from the tournament page (e.g. "Pauper" -> "Pauper") */
function inferFormatFromPageFormat(pageFormat: string): string | null {
	const lower = pageFormat.toLowerCase().trim();
	for (const { format, pattern } of FORMAT_PATTERNS) {
		if (pattern.test(lower)) return format;
	}
	return null;
}

// --- CSV ---

function escapeCSV(value: string): string {
	if (value.includes(",") || value.includes('"') || value.includes("\n")) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}

// --- Main ---

interface TournamentWithFormat extends MeleeTournamentSearchRow {
	inferredFormat: string;
}

async function main() {
	const opts = parseArgs(process.argv);
	const progress = new Progress();

	const now = new Date();
	const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

	const startDate = opts.start ? new Date(opts.start) : thirtyDaysAgo;
	const endDate = opts.end ? new Date(opts.end) : now;

	const dateRange = `${startDate.toISOString().split("T")[0]} to ${endDate.toISOString().split("T")[0]}`;

	// Step 1: Search tournaments
	progress.spin(`Searching tournaments (${dateRange})...`);
	const client = new MeleeClient({ delayMs: 200, pageSize: 500 });
	const raw = await client.searchTournaments(startDate, endDate);
	progress.done(`Found ${raw.length} tournaments (${dateRange})`);

	// Step 2: Infer format from tournament name
	let tournaments: TournamentWithFormat[] = [];
	const unmatchedTournaments: MeleeTournamentSearchRow[] = [];
	for (const t of raw) {
		const format = inferFormat(t.Name);
		if (format) {
			tournaments.push({ ...t, inferredFormat: format });
		} else {
			unmatchedTournaments.push(t);
		}
	}
	progress.done(
		`Matched format from name: ${tournaments.length}, unmatched: ${unmatchedTournaments.length}`,
	);

	// Step 3: Fallback — fetch tournament page HTML for unmatched tournaments
	if (unmatchedTournaments.length > 0) {
		progress.startBar(
			"Fetching unmatched tournament pages",
			unmatchedTournaments.length,
		);
		let resolved = 0;
		for (const t of unmatchedTournaments) {
			try {
				const html = await client.fetchTournamentPage(t.ID);
				const parsed = parseTournamentPage(html);
				const pageFormat = parsed.formats[0];
				if (pageFormat && inferFormatFromPageFormat(pageFormat)) {
					tournaments.push({
						...t,
						inferredFormat: inferFormatFromPageFormat(pageFormat)!,
					});
					resolved++;
				}
			} catch {
				// Skip tournaments we can't fetch
			}
			progress.tick();
		}
		progress.done(`Resolved ${resolved}/${unmatchedTournaments.length} via page fetch`);
	}

	// Step 4: Apply filters
	if (opts.format) {
		const needle = opts.format.toLowerCase();
		tournaments = tournaments.filter((t) => t.inferredFormat.toLowerCase() === needle);
	}

	if (opts.minPlayers > 0) {
		tournaments = tournaments.filter((t) => t.Decklists >= opts.minPlayers);
	}

	// Sort by players descending
	tournaments.sort((a, b) => b.Decklists - a.Decklists);

	// Collect unique formats for summary
	const formatCounts = new Map<string, number>();
	for (const t of tournaments) {
		formatCounts.set(t.inferredFormat, (formatCounts.get(t.inferredFormat) ?? 0) + 1);
	}

	// Build CSV
	const lines: string[] = [];
	lines.push("Format,Importance,Players,Name,URL,Date,Status,Organization,Tabletop");

	for (const t of tournaments) {
		const url = `"https://melee.gg/Tournament/View/${t.ID}"`;
		const importance = inferImportance(t.Name);
		lines.push(
			[
				escapeCSV(t.inferredFormat),
				importance,
				String(t.Decklists),
				escapeCSV(t.Name),
				url,
				t.StartDate.split("T")[0],
				t.StatusDescription,
				escapeCSV(t.OrganizationName),
				"yes",
			].join(","),
		);
	}

	const csv = `${lines.join("\n")}\n`;

	if (opts.out) {
		writeFileSync(opts.out, csv);
		progress.done(`Written to ${opts.out}`);
	} else {
		process.stdout.write(csv);
	}

	// Summary
	const filters = [
		opts.format && `format=${opts.format}`,
		opts.minPlayers > 0 && `min-players=${opts.minPlayers}`,
	].filter(Boolean);
	const filterStr = filters.length > 0 ? ` (${filters.join(", ")})` : "";

	process.stderr.write(`\n--- Summary${filterStr} ---\n`);
	for (const [format, count] of [...formatCounts.entries()].sort()) {
		process.stderr.write(`  ${format}: ${count} tournaments\n`);
	}
	process.stderr.write(`  Total: ${tournaments.length} tournaments\n`);
}

main().catch((e) => {
	console.error("Fatal error:", e);
	process.exit(1);
});
