/**
 * Fetch a tournament from melee.gg and save as JSON.
 *
 * Usage:
 *   bun run scripts/fetch-tournament.ts <tournament-url-or-id> [--dry-run]
 *
 * Examples:
 *   bun run scripts/fetch-tournament.ts 72980
 *   bun run scripts/fetch-tournament.ts https://melee.gg/Tournament/View/72980
 *   bun run scripts/fetch-tournament.ts 72980 --dry-run
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { assembleTournament } from "./lib/assembler";
import { parseTournamentPage } from "./lib/html-parser";
import { MeleeApiError, MeleeClient } from "./lib/melee-client";
import type { MeleeMatchRow, MeleeStandingRow, ParsedRound } from "./lib/types";

async function main() {
	const args = process.argv.slice(2);
	const dryRun = args.includes("--dry-run");
	const input = args.find((a) => !a.startsWith("--"));

	if (!input) {
		console.error(
			"Usage: bun run scripts/fetch-tournament.ts <tournament-url-or-id> [--dry-run]",
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

	const client = new MeleeClient({ delayMs: 300 });

	// Step 1: Fetch and parse tournament page
	console.log("\n[1/4] Fetching tournament page...");
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
		console.log(`\n[2/4] Fetching standings (${round.name}, id=${round.id})...`);
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

	// Collect unique decklist IDs
	const decklistIds = new Set<string>();
	for (const s of standings) {
		for (const d of s.Decklists) {
			if (d.DecklistId) decklistIds.add(d.DecklistId);
		}
	}
	console.log(`  Decklists to fetch: ${decklistIds.size}`);

	// Step 3: Fetch all decklists
	console.log(`\n[3/4] Fetching decklists...`);
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

	// Step 4: Fetch matches for each completed round
	console.log(`\n[4/4] Fetching matches for ${completedRounds.length} rounds...`);
	const roundMatches = new Map<number, MeleeMatchRow[]>();
	for (const round of completedRounds) {
		const matches = await client.fetchAllMatches(round.id);
		roundMatches.set(round.id, matches);
	}
	console.log(
		`  Total matches: ${[...roundMatches.values()].reduce((sum, m) => sum + m.length, 0)}`,
	);

	// Step 4.5: Adjust ranks from standings-less rounds (e.g. Finals with no standings)
	if (standingsLessRounds.length > 0) {
		console.log(`\n[4.5/4] Adjusting ranks from standings-less rounds...`);
		standings = applyStandingsLessRoundAdjustments(
			standings,
			standingsLessRounds,
			roundMatches,
		);
	}

	// Assemble into TournamentData
	const tournament = assembleTournament({
		tournamentId,
		parsed,
		standings,
		decklists,
		completedRounds,
		roundMatches,
	});

	// Output
	const json = JSON.stringify(tournament, null, 2);

	if (dryRun) {
		console.log(
			`\n--- DRY RUN: would write to data/tournaments/${tournamentId}.json ---`,
		);
		console.log(`JSON size: ${json.length} bytes`);
	} else {
		const dir = "data/tournaments";
		mkdirSync(dir, { recursive: true });
		const path = `${dir}/${tournamentId}.json`;
		writeFileSync(path, json);
		console.log(`\nWritten to ${path} (${json.length} bytes)`);
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
