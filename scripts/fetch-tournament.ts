/**
 * Fetch a tournament from melee.gg and save as JSON.
 *
 * Usage:
 *   bun run scripts/fetch-tournament.ts <tournament-url-or-id> [--dry-run]
 *       [--format <name>] [--skip-rounds <comma-list>]
 *
 * Examples:
 *   bun run scripts/fetch-tournament.ts 72980
 *   bun run scripts/fetch-tournament.ts https://melee.gg/Tournament/View/72980
 *   bun run scripts/fetch-tournament.ts 72980 --dry-run
 *   bun run scripts/fetch-tournament.ts 394299 --format Standard
 *   bun run scripts/fetch-tournament.ts 394299 --skip-rounds 1,2,3,9,10,11
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assembleTournament } from "./lib/assembler";
import { parseArgValue } from "./lib/cli-utils";
import { parseTournamentPage } from "./lib/html-parser";
import {
	cleanTournamentName,
	getPrimaryFormat,
	inferImportance,
	toFormatSlug,
} from "./lib/importance";
import { countMatches, updateFormatIndex } from "./lib/index-utils";
import { MeleeApiError, MeleeClient } from "./lib/melee-client";
import { extractRoundNumber } from "./lib/round-utils";
import type { MeleeMatchRow, MeleeStandingRow, ParsedRound } from "./lib/types";

async function main() {
	const args = process.argv.slice(2);
	const dryRun = args.includes("--dry-run");
	const formatFilter = parseArgValue(args, "--format");
	const skipRoundsArg = parseArgValue(args, "--skip-rounds");
	const skipRoundNumbers = skipRoundsArg
		? new Set(skipRoundsArg.split(",").map((n) => Number(n.trim())))
		: null;
	const input = args.find(
		(a) => !a.startsWith("--") && a !== formatFilter && a !== skipRoundsArg,
	);

	if (!input) {
		console.error(
			"Usage: bun run scripts/fetch-tournament.ts <tournament-url-or-id> [--dry-run] [--format <name>] [--skip-rounds <list>]",
		);
		process.exit(1);
	}

	const tournamentId = parseTournamentId(input);
	if (!tournamentId) {
		console.error(`Invalid tournament URL or ID: ${input}`);
		process.exit(1);
	}

	console.log(`Fetching tournament ${tournamentId}...`);
	if (dryRun) console.log("(dry run — will not write file)");
	if (formatFilter) console.log(`Format filter: ${formatFilter}`);
	if (skipRoundNumbers) console.log(`Skip rounds: ${[...skipRoundNumbers].join(", ")}`);

	const client = new MeleeClient({ delayMs: 300 });

	// Step 1: Fetch and parse tournament page
	console.log("\n[1/5] Fetching tournament page...");
	const html = await client.fetchTournamentPage(tournamentId);
	const parsed = parseTournamentPage(html);
	console.log(`  Name: ${parsed.name}`);
	console.log(`  Date: ${parsed.date}`);
	console.log(`  Formats: ${parsed.formats.join(", ")}`);
	console.log(
		`  Rounds: ${parsed.rounds.length} (${parsed.rounds.filter((r) => r.isCompleted).length} completed)`,
	);

	const completedRounds = parsed.rounds.filter((r) => r.isCompleted);
	if (completedRounds.length === 0) {
		console.error("No completed rounds found. Tournament may still be in progress.");
		process.exit(1);
	}

	// Step 2: Fetch standings — walk backward from the last completed round to
	// handle tournaments where the Finals round has no standings (only a match result).
	let standings: MeleeStandingRow[] = [];
	let standingsRound: ParsedRound | null = null;
	const standingsLessRounds: ParsedRound[] = [];

	for (let i = completedRounds.length - 1; i >= 0; i--) {
		const round = completedRounds[i];
		console.log(`\n[2/5] Fetching standings (${round.name}, id=${round.id})...`);
		standings = await client.fetchAllStandings(round.id);
		console.log(`  Players: ${standings.length}`);
		if (standings.length > 0) {
			standingsRound = round;
			break;
		}
		standingsLessRounds.unshift(round);
		console.log(`  (no standings — walking back...)`);
	}

	if (!standingsRound) {
		console.error("No standings found in any completed round. Cannot continue.");
		process.exit(1);
	}
	if (standingsLessRounds.length > 0) {
		console.log(
			`  Fallback: standings from "${standingsRound.name}", skipped: ${standingsLessRounds.map((r) => r.name).join(", ")}`,
		);
	}

	// Step 3: Fetch matches for ALL completed rounds (needed for format detection)
	console.log(`\n[3/5] Fetching matches for ${completedRounds.length} rounds...`);
	const roundMatches = new Map<number, MeleeMatchRow[]>();
	for (const round of completedRounds) {
		const matches = await client.fetchAllMatches(round.id);
		roundMatches.set(round.id, matches);
	}
	console.log(
		`  Total matches: ${[...roundMatches.values()].reduce((sum, m) => sum + m.length, 0)}`,
	);

	// Step 3.5: Adjust ranks from standings-less rounds (e.g. Finals with no standings)
	if (standingsLessRounds.length > 0) {
		console.log(`\n  Adjusting ranks from standings-less rounds...`);
		standings = applyStandingsLessRoundAdjustments(
			standings,
			standingsLessRounds,
			roundMatches,
		);
	}

	// Step 3.6: Filter rounds by format (if --format or --skip-rounds provided)
	let filteredRounds = completedRounds;
	let filteredRoundMatches = roundMatches;

	if (formatFilter || skipRoundNumbers) {
		const roundFormats = detectRoundFormats(completedRounds, roundMatches);

		console.log("\n  Round formats detected:");
		for (const round of completedRounds) {
			const fmt = roundFormats.get(round.id) ?? "unknown";
			const num = extractRoundNumber(round.name);
			console.log(`    ${round.name} (round ${num}): ${fmt}`);
		}

		if (formatFilter) {
			// Validate that the format exists in detected rounds
			const allFormats = new Set(roundFormats.values());
			const hasMatch = [...allFormats].some((f) => formatMatches(f, formatFilter));
			if (!hasMatch) {
				console.error(
					`\nError: Format "${formatFilter}" not found. Detected formats: ${[...allFormats].join(", ")}`,
				);
				process.exit(1);
			}

			filteredRounds = completedRounds.filter((r) => {
				const fmt = roundFormats.get(r.id);
				return fmt ? formatMatches(fmt, formatFilter) : false;
			});
		}

		if (skipRoundNumbers) {
			filteredRounds = filteredRounds.filter((r) => {
				const num = extractRoundNumber(r.name);
				return !skipRoundNumbers.has(num);
			});
		}

		// Build filtered match map
		filteredRoundMatches = new Map();
		for (const round of filteredRounds) {
			const matches = roundMatches.get(round.id);
			if (matches) filteredRoundMatches.set(round.id, matches);
		}

		const excluded = completedRounds.filter((r) => !filteredRounds.includes(r));
		console.log(
			`\n  Rounds included: ${filteredRounds.map((r) => r.name).join(", ")} (${filteredRounds.length})`,
		);
		if (excluded.length > 0) {
			console.log(
				`  Rounds excluded: ${excluded.map((r) => r.name).join(", ")} (${excluded.length})`,
			);
		}
	}

	// Collect unique decklist IDs (filtered by format if applicable)
	const decklistIds = new Set<string>();
	let totalDecklistCount = 0;
	for (const s of standings) {
		for (const d of s.Decklists) {
			if (!d.DecklistId) continue;
			totalDecklistCount++;
			if (formatFilter) {
				if (formatMatches(d.Format, formatFilter)) {
					decklistIds.add(d.DecklistId);
				}
			} else {
				decklistIds.add(d.DecklistId);
			}
		}
	}
	if (formatFilter) {
		console.log(
			`  Decklists to fetch: ${decklistIds.size} (${formatFilter} only, skipped ${totalDecklistCount - decklistIds.size} other-format decklists)`,
		);
	} else {
		console.log(`  Decklists to fetch: ${decklistIds.size}`);
	}

	// Step 4: Fetch decklists
	console.log(`\n[4/5] Fetching decklists...`);
	const decklists = new Map<
		string,
		{ details: import("./lib/types").MeleeDecklistDetails; playerId: number }
	>();
	let fetchedCount = 0;
	let failedCount = 0;

	for (const deckId of decklistIds) {
		try {
			const details = await client.fetchDecklistDetails(deckId);
			// Find which player owns this decklist
			const owner = standings.find((s) =>
				s.Decklists.some((d) => d.DecklistId === deckId),
			);
			const playerId = owner?.Team.Players[0]?.ID ?? 0;
			decklists.set(deckId, { details, playerId });
			fetchedCount++;
			if (fetchedCount % 25 === 0) {
				console.log(`  ${fetchedCount}/${decklistIds.size}...`);
			}
		} catch (e) {
			failedCount++;
			if (e instanceof MeleeApiError) {
				// Skip missing decklists silently (common for redacted/private decklists)
			} else {
				console.warn(`  Warning: failed to fetch decklist ${deckId}: ${e}`);
			}
		}
	}
	console.log(`  Fetched: ${fetchedCount}, Failed: ${failedCount}`);

	// Step 5: Compute match record overrides from filtered rounds (if format-filtering)
	let matchRecordOverrides: Map<string, string> | undefined;
	if (formatFilter || skipRoundNumbers) {
		console.log(
			`\n[5/5] Computing match records from ${filteredRounds.length} constructed rounds...`,
		);
		matchRecordOverrides = computeMatchRecords(filteredRoundMatches);
	} else {
		console.log(`\n[5/5] Assembling tournament data...`);
	}

	// Assemble into TournamentData
	const tournament = assembleTournament({
		tournamentId,
		parsed,
		standings,
		decklists,
		completedRounds: filteredRounds,
		roundMatches: filteredRoundMatches,
		formatFilter: formatFilter ?? undefined,
		matchRecordOverrides,
	});

	// Determine output path: data/{format}/{year-month}/melee-{id}.json
	const primaryFormat = getPrimaryFormat(tournament.meta.formats);
	const formatSlug = toFormatSlug(primaryFormat);
	const yearMonth = tournament.meta.date.slice(0, 7);
	const filename = `melee-${tournamentId}.json`;
	const relPath = `${yearMonth}/${filename}`;
	const dir = join("data", formatSlug, yearMonth);
	const filePath = join(dir, filename);

	// Output
	const json = JSON.stringify(tournament, null, 2);

	if (dryRun) {
		console.log(`\n--- DRY RUN: would write to ${filePath} ---`);
		console.log(`JSON size: ${json.length} bytes`);
	} else {
		mkdirSync(dir, { recursive: true });
		writeFileSync(filePath, json);
		console.log(`\nWritten to ${filePath} (${json.length} bytes)`);

		// Update per-format index.json
		updateFormatIndex(formatSlug, {
			id: tournament.meta.id,
			name: tournament.meta.name,
			cleanName: cleanTournamentName(tournament.meta.name),
			date: tournament.meta.date,
			format: primaryFormat,
			source: tournament.meta.source,
			url: tournament.meta.url,
			playerCount: tournament.meta.playerCount,
			roundCount: tournament.meta.roundCount,
			matchCount: countMatches(tournament.rounds),
			importance: inferImportance(tournament.meta.name),
			tabletop: tournament.meta.tabletop,
			pairings: true,
			path: relPath,
		});
	}

	// Summary
	console.log("\n=== Summary ===");
	console.log(`Tournament: ${tournament.meta.name}`);
	console.log(`Date: ${tournament.meta.date}`);
	console.log(`Formats: ${tournament.meta.formats.join(", ")}`);
	console.log(`Players: ${tournament.meta.playerCount}`);
	console.log(`Rounds: ${tournament.meta.roundCount}`);
	console.log(`Decklists: ${Object.keys(tournament.decklists).length}`);
	console.log(
		`Total matches: ${Object.values(tournament.rounds).reduce((sum, r) => sum + r.matches.length, 0)}`,
	);
}

function applyStandingsLessRoundAdjustments(
	standings: MeleeStandingRow[],
	standingsLessRounds: ParsedRound[],
	roundMatches: Map<number, MeleeMatchRow[]>,
): MeleeStandingRow[] {
	const adjusted = standings.map((s) => ({ ...s }));
	const byPlayerId = new Map<number, MeleeStandingRow>();
	for (const s of adjusted) {
		const id = s.Team.Players[0]?.ID;
		if (id != null) byPlayerId.set(id, s);
	}

	let nextRank = 1;

	for (const round of standingsLessRounds) {
		const matches = roundMatches.get(round.id) ?? [];
		const decided = matches.filter(
			(m) => !m.ByeReasonDescription && m.Competitors.length === 2,
		);

		const winners: number[] = [];
		const losers: number[] = [];

		for (const m of decided) {
			const [c1, c2] = m.Competitors;
			const c1Wins = c1.GameWinsAndGameByes ?? 0;
			const c2Wins = c2.GameWinsAndGameByes ?? 0;
			const p1Id = c1.Team.Players[0]?.ID;
			const p2Id = c2.Team.Players[0]?.ID;
			if (c1Wins > c2Wins) {
				if (p1Id != null) winners.push(p1Id);
				if (p2Id != null) losers.push(p2Id);
			} else if (c2Wins > c1Wins) {
				if (p2Id != null) winners.push(p2Id);
				if (p1Id != null) losers.push(p1Id);
			}
			// draws: neither player gets re-ranked
		}

		for (const id of winners) {
			const entry = byPlayerId.get(id);
			if (entry) {
				console.log(
					`  ${round.name}: ${entry.Team.Players[0]?.DisplayName} → rank ${nextRank}`,
				);
				entry.Rank = nextRank++;
				entry.MatchWins += 1;
			}
		}
		for (const id of losers) {
			const entry = byPlayerId.get(id);
			if (entry) {
				console.log(
					`  ${round.name}: ${entry.Team.Players[0]?.DisplayName} → rank ${nextRank}`,
				);
				entry.Rank = nextRank++;
				entry.MatchLosses += 1;
			}
		}
	}

	adjusted.sort((a, b) => a.Rank - b.Rank);
	return adjusted;
}

/** Detect the format of each round by inspecting match FormatDescription. */
function detectRoundFormats(
	rounds: ParsedRound[],
	roundMatches: Map<number, MeleeMatchRow[]>,
): Map<number, string> {
	const formatMap = new Map<number, string>();
	for (const round of rounds) {
		const matches = roundMatches.get(round.id) ?? [];
		const formatCounts = new Map<string, number>();
		for (const m of matches) {
			if (m.FormatDescription) {
				formatCounts.set(
					m.FormatDescription,
					(formatCounts.get(m.FormatDescription) ?? 0) + 1,
				);
			}
		}
		let bestFormat = "";
		let bestCount = 0;
		for (const [fmt, count] of formatCounts) {
			if (count > bestCount) {
				bestFormat = fmt;
				bestCount = count;
			}
		}
		if (bestFormat) formatMap.set(round.id, bestFormat);
	}
	return formatMap;
}

/** Case-insensitive format matching (e.g. "Standard Constructed" matches "Standard"). */
function formatMatches(roundFormat: string, targetFormat: string): boolean {
	return roundFormat.toLowerCase().includes(targetFormat.toLowerCase());
}

/** Compute match records from a set of rounds' matches. Returns Map<playerId, "W-L-D">. */
function computeMatchRecords(
	roundMatches: Map<number, MeleeMatchRow[]>,
): Map<string, string> {
	const records = new Map<string, { w: number; l: number; d: number }>();

	const getOrCreate = (pid: string) => {
		let r = records.get(pid);
		if (!r) {
			r = { w: 0, l: 0, d: 0 };
			records.set(pid, r);
		}
		return r;
	};

	for (const matches of roundMatches.values()) {
		for (const m of matches) {
			const competitors = m.Competitors;

			if (m.ByeReasonDescription && competitors.length >= 1) {
				// Bye — winner gets +1 win
				const pid = String(competitors[0].Team.Players[0]?.ID ?? competitors[0].TeamId);
				getOrCreate(pid).w++;
				continue;
			}

			if (competitors.length < 2) continue;

			const [c1, c2] = competitors;
			const p1Id = String(c1.Team.Players[0]?.ID ?? c1.TeamId);
			const p2Id = String(c2.Team.Players[0]?.ID ?? c2.TeamId);
			const p1Wins = c1.GameWinsAndGameByes ?? 0;
			const p2Wins = c2.GameWinsAndGameByes ?? 0;

			if (p1Wins > p2Wins) {
				getOrCreate(p1Id).w++;
				getOrCreate(p2Id).l++;
			} else if (p2Wins > p1Wins) {
				getOrCreate(p2Id).w++;
				getOrCreate(p1Id).l++;
			} else {
				getOrCreate(p1Id).d++;
				getOrCreate(p2Id).d++;
			}
		}
	}

	const result = new Map<string, string>();
	for (const [pid, r] of records) {
		result.set(pid, `${r.w}-${r.l}-${r.d}`);
	}
	return result;
}

function parseTournamentId(input: string): number | null {
	// Direct number
	const num = Number(input);
	if (!Number.isNaN(num) && num > 0) return num;

	// URL: https://melee.gg/Tournament/View/72980
	const match = input.match(/Tournament\/View\/(\d+)/);
	if (match) return Number(match[1]);

	return null;
}

main().catch((e) => {
	console.error("Fatal error:", e);
	process.exit(1);
});
