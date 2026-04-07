/**
 * Read a candidates CSV (from list-tournaments.ts) and fetch each tournament.
 *
 * Usage:
 *   bun run scripts/fetch-candidates.ts <csv-path> [--dry-run]
 *
 * The CSV must have the header: Format,Importance,Players,Name,URL,Date,Status,Organization,Tabletop
 * Each row's URL is parsed for the tournament ID, and --format is passed from the Format column.
 *
 * Examples:
 *   bun run scripts/fetch-candidates.ts candidates.csv
 *   bun run scripts/fetch-candidates.ts candidates.csv --dry-run
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

interface Candidate {
	format: string;
	name: string;
	url: string;
	tournamentId: string;
	players: string;
}

function parseCSV(path: string): Candidate[] {
	const content = readFileSync(path, "utf-8");
	const lines = content.trim().split("\n");
	if (lines.length < 2) return [];

	// Skip header
	const candidates: Candidate[] = [];
	for (const line of lines.slice(1)) {
		// Parse CSV respecting quoted fields
		const fields: string[] = [];
		let current = "";
		let inQuotes = false;
		for (const ch of line) {
			if (ch === '"') {
				inQuotes = !inQuotes;
			} else if (ch === "," && !inQuotes) {
				fields.push(current);
				current = "";
			} else {
				current += ch;
			}
		}
		fields.push(current);

		const [format, , players, name, url] = fields;
		const idMatch = url?.match(/\/(\d+)/);
		if (!idMatch) {
			console.error(`  Skipping line (no ID in URL): ${line}`);
			continue;
		}
		candidates.push({
			format: format.trim(),
			name: name.trim(),
			url: url.trim(),
			tournamentId: idMatch[1],
			players: players.trim(),
		});
	}
	return candidates;
}

function main() {
	const args = process.argv.slice(2);
	const dryRun = args.includes("--dry-run");
	const csvPath = args.find((a) => !a.startsWith("--"));

	if (!csvPath) {
		console.error("Usage: bun run scripts/fetch-candidates.ts <csv-path> [--dry-run]");
		process.exit(1);
	}

	const candidates = parseCSV(csvPath);
	if (candidates.length === 0) {
		console.error("No candidates found in CSV.");
		process.exit(1);
	}

	console.log(`Found ${candidates.length} candidates to fetch.\n`);

	let succeeded = 0;
	let failed = 0;

	for (let i = 0; i < candidates.length; i++) {
		const c = candidates[i];
		const label = `[${i + 1}/${candidates.length}] ${c.format} | ${c.players}p | ${c.name}`;
		console.log(label);

		const fetchArgs = [
			"run",
			"scripts/fetch-tournament.ts",
			c.tournamentId,
			"--format",
			c.format,
		];
		if (dryRun) fetchArgs.push("--dry-run");

		const result = spawnSync("bun", fetchArgs, {
			stdio: "inherit",
			cwd: `${import.meta.dirname}/..`,
		});

		if (result.status === 0) {
			succeeded++;
			console.log(`  ✔ Done\n`);
		} else {
			failed++;
			console.error(`  ✘ Failed (exit ${result.status})\n`);
		}
	}

	console.log(`\n--- Results: ${succeeded} succeeded, ${failed} failed ---`);
}

main();
