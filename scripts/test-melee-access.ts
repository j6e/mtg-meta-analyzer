/**
 * Manual smoke test: hit real melee.gg endpoints to verify access works.
 * Run with: bun run scripts/test-melee-access.ts
 */
import { MeleeClient, MeleeApiError } from './lib/melee-client';

const TOURNAMENT_ID = 72980; // Pro Tour Thunder Junction

async function main() {
	const client = new MeleeClient({ delayMs: 500 });

	console.log('=== melee.gg Access Smoke Test ===\n');

	// Test 1: Tournament page (HTML)
	console.log(`1. GET /Tournament/View/${TOURNAMENT_ID}`);
	let roundId: number | undefined;
	let decklistId: string | undefined;
	try {
		const html = await client.fetchTournamentPage(TOURNAMENT_ID);
		console.log(`   OK — ${html.length} bytes`);
		const hasRoundButtons = html.includes('round-selector');
		console.log(`   Round selector buttons found: ${hasRoundButtons}`);

		// Extract a round ID for next test
		const match = html.match(/data-id="(\d+)"[^>]*data-name="Round 1"/);
		if (match) roundId = Number(match[1]);
	} catch (e) {
		logError(e);
	}

	// Test 2: Standings (last round — has decklists)
	const lastRoundId = 242297; // Last round of Pro Tour Thunder Junction
	console.log(`\n2. POST /Standing/GetRoundStandings (roundId=${lastRoundId}, last round)`);
	try {
		const standings = await client.fetchAllStandings(lastRoundId);
		console.log(`   OK — ${standings.length} players`);
		if (standings.length > 0) {
			const first = standings[0];
			console.log(`   #1: ${first.Team.Players[0]?.DisplayName} (${first.Points} pts)`);
			if (first.Decklists.length > 0) {
				decklistId = first.Decklists[0].DecklistId;
				console.log(`   Decklist: ${first.Decklists[0].DecklistName} (${first.Decklists[0].DecklistId})`);
			}
		}
	} catch (e) {
		logError(e);
	}

	// Test 3: Matches (new endpoint)
	const matchesRoundId = roundId ?? 242279;
	console.log(`\n3. POST /Match/GetRoundMatches/${matchesRoundId}`);
	try {
		const matches = await client.fetchAllMatches(matchesRoundId);
		console.log(`   OK — ${matches.length} matches`);
		if (matches.length > 0) {
			const first = matches.find(m => m.Competitors.length === 2);
			if (first) {
				const p1 = first.Competitors[0].Team.Players[0]?.DisplayName;
				const p2 = first.Competitors[1].Team.Players[0]?.DisplayName;
				console.log(`   Sample: ${p1} vs ${p2} — "${first.ResultString}"`);
			}
		}
	} catch (e) {
		logError(e);
	}

	// Test 4: Decklist details (JSON)
	if (decklistId) {
		console.log(`\n4. GET /Decklist/GetDecklistDetails?id=${decklistId}`);
		try {
			const details = await client.fetchDecklistDetails(decklistId);
			console.log(`   OK — Deck: "${details.DecklistName}" (${details.FormatName})`);
			const mainboard = details.Records.filter(r => r.c === 0);
			const sideboard = details.Records.filter(r => r.c === 99);
			console.log(`   Mainboard: ${mainboard.length} unique cards, Sideboard: ${sideboard.length} unique cards`);
		} catch (e) {
			logError(e);
		}
	} else {
		console.log('\n4. Skipped (no decklist ID found)');
	}

	// Test 5: Tournament search
	console.log('\n5. POST /Decklist/TournamentSearch (last 7 days)');
	try {
		const end = new Date();
		const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
		const tournaments = await client.searchTournaments(start, end);
		console.log(`   OK — ${tournaments.length} tournaments found`);
		const ended = tournaments.filter(t => t.StatusDescription === 'Ended');
		console.log(`   Ended: ${ended.length}`);
		if (ended.length > 0) {
			console.log(`   Latest: "${ended[0].Name}" (${ended[0].FormatDescription}, ${ended[0].Decklists} decklists)`);
		}
	} catch (e) {
		logError(e);
	}

	console.log('\n=== Done ===');
}

function logError(e: unknown) {
	if (e instanceof MeleeApiError) {
		console.log(`   FAILED — HTTP ${e.status}: ${e.request}`);
		if (e.status === 403) {
			console.log('   → Cloudflare may be blocking. Try Playwright fallback.');
		}
	} else {
		console.log(`   FAILED — ${e}`);
	}
}

main();
