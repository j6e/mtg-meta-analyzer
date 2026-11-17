/**
 * Import paper (melee.gg) tournaments from a DeckSnipe database.
 *
 * Reads the local DeckSnipe dev database, which `make db-clone` in
 * ../decksnipe fills with a copy of production. Only events not yet present
 * in any data/<format>/index.json are written (no re-sourcing).
 *
 * Usage:
 *   bun run scripts/fetch-decksnipe.ts --from YYYY-MM-DD [--min-decks N] [--dry-run]
 *
 * Env: DECKSNIPE_DATABASE_URL (default: the decksnipe compose database).
 */
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { SQL } from "bun";
import type { CardEntry, DecklistInfo } from "../src/lib/types/decklist";
import type {
	MatchResult,
	PlayerInfo,
	RoundInfo,
	TournamentData,
	TournamentIndexEntry,
} from "../src/lib/types/tournament";
import { parseArgValue } from "./lib/cli-utils";
import { cleanTournamentName, inferImportance, toFormatSlug } from "./lib/importance";
import { countMatches, updateFormatIndex } from "./lib/index-utils";
import { normalizeImportedCardName } from "./lib/omenpaths-names";
import { PLAYOFF_ROUNDS } from "./lib/round-utils";

const DATABASE_URL =
	process.env.DECKSNIPE_DATABASE_URL ??
	"postgresql://decksnipe:decksnipe@127.0.0.1:5433/decksnipe";

// DeckSnipe stores playoff rounds under fixed numbers (melee_event.rs round_number).
const DECKSNIPE_PLAYOFFS: Record<
	number,
	{ key: string; name: string; number: number }
> = {
	800: { key: "playoffs-t16", name: "Top 16", number: 800 },
	900: PLAYOFF_ROUNDS[2],
	950: PLAYOFF_ROUNDS[1],
	999: PLAYOFF_ROUNDS[0],
};

interface EventRow {
	id: number;
	source_id: string;
	name: string;
	date: string;
	format: string;
	deck_count: number;
	match_rows: number;
}

interface StandingRow {
	entrant: string;
	username: string | null;
	display_name: string | null;
	player: string;
	rank: number | null;
	points: number | null;
	record: string;
}

interface DeckRow {
	source_id: string;
	entrant: string;
	source_archetype: string | null;
	mainboard: { name: string; quantity: number }[];
	sideboard: { name: string; quantity: number }[];
}

interface MatchRow {
	round: number;
	entrant: string;
	opponent_entrant: string | null;
	record: string;
	result: "win" | "loss" | "draw";
	is_bye: boolean;
}

async function main() {
	const args = process.argv.slice(2);
	const dryRun = args.includes("--dry-run");
	const from = parseArgValue(args, "--from");
	const minDecks = Number(parseArgValue(args, "--min-decks") ?? 32);
	if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
		console.error(
			"Usage: bun run scripts/fetch-decksnipe.ts --from YYYY-MM-DD [--min-decks N] [--dry-run]",
		);
		process.exit(1);
	}

	const sql = new SQL(DATABASE_URL);
	const existing = existingIds();

	const events: EventRow[] = await sql`
		SELECT e.id, e.source_id, e.name, e.date::text AS date, e.format,
		       (SELECT count(*)::int FROM decks d WHERE d.event_id = e.id) AS deck_count,
		       (SELECT count(*)::int FROM matches m WHERE m.event_id = e.id) AS match_rows
		FROM events e
		WHERE e.source = 'melee' AND e.platform = 'paper'
		  AND e.rejected_at IS NULL AND e.date >= ${from}::date
		ORDER BY e.date, e.source_id`;

	const candidates = events.filter((e) => !existing.has(`melee-${e.source_id}`));
	console.log(
		`${events.length} paper melee events since ${from}; ${events.length - candidates.length} already local.`,
	);

	let written = 0;
	for (const e of candidates) {
		const tag = `${e.date} ${e.format.padEnd(9)} ${String(e.deck_count).padStart(4)} decks  melee-${e.source_id}  ${e.name}`;
		if (e.deck_count < minDecks) {
			console.log(`  skip (<${minDecks} decks)   ${tag}`);
			continue;
		}
		if (e.match_rows === 0) {
			console.log(`  skip (no matches)     ${tag}`);
			continue;
		}
		console.log(`  take                  ${tag}`);
		if (dryRun) continue;

		const data = await assemble(sql, e);
		const formatSlug = toFormatSlug(e.format);
		const month = e.date.slice(0, 7);
		const dir = join("data", formatSlug, month);
		mkdirSync(dir, { recursive: true });
		const filename = `${data.meta.id}.json`;
		writeFileSync(join(dir, filename), JSON.stringify(data, null, 2));

		const entry: TournamentIndexEntry = {
			id: data.meta.id,
			name: e.name,
			cleanName: cleanTournamentName(e.name),
			date: e.date,
			format: e.format,
			source: "melee",
			url: data.meta.url,
			playerCount: data.meta.playerCount,
			roundCount: data.meta.roundCount,
			matchCount: countMatches(data.rounds),
			importance: inferImportance(e.name),
			tabletop: true,
			pairings: true,
			path: `${month}/${filename}`,
		};
		updateFormatIndex(formatSlug, entry);
		written++;
	}

	console.log(dryRun ? "(dry run, nothing written)" : `Wrote ${written} tournaments.`);
	await sql.close();
}

/** Every tournament id already listed in a per-format index. */
function existingIds(): Set<string> {
	const ids = new Set<string>();
	for (const format of readdirSync("data")) {
		const indexPath = join("data", format, "index.json");
		if (!existsSync(indexPath)) continue;
		const entries: TournamentIndexEntry[] = JSON.parse(
			readFileSync(indexPath, "utf-8"),
		);
		for (const entry of entries) ids.add(entry.id);
	}
	return ids;
}

async function assemble(sql: SQL, e: EventRow): Promise<TournamentData> {
	const standings: StandingRow[] = await sql`
		SELECT entrant, username, display_name, player, rank, points, record
		FROM standings WHERE event_id = ${e.id} ORDER BY rank NULLS LAST`;
	const decks: DeckRow[] = await sql`
		SELECT source_id, entrant, source_archetype,
		       to_json(mainboard) AS mainboard, to_json(sideboard) AS sideboard
		FROM decks WHERE event_id = ${e.id}`;
	const matchRows: MatchRow[] = await sql`
		SELECT round, entrant, opponent_entrant, record, result::text AS result, is_bye
		FROM matches WHERE event_id = ${e.id} ORDER BY round, entrant`;

	const decksByEntrant = new Map<string, DeckRow[]>();
	for (const deck of decks) {
		const list = decksByEntrant.get(deck.entrant);
		if (list) list.push(deck);
		else decksByEntrant.set(deck.entrant, [deck]);
	}

	const players: Record<string, PlayerInfo> = {};
	for (const s of standings) {
		const own = decksByEntrant.get(s.entrant) ?? [];
		players[s.entrant] = {
			name: s.display_name ?? s.player,
			username: s.username ?? s.player,
			rank: s.rank ?? 0,
			points: s.points ?? 0,
			matchRecord: s.record,
			decklistIds: own.map((d) => d.source_id),
			reportedArchetypes: own.map((d) => d.source_archetype ?? "Unknown"),
		};
	}

	const decklists: Record<string, DecklistInfo> = {};
	for (const deck of decks) {
		decklists[deck.source_id] = {
			playerId: deck.entrant,
			mainboard: parseCards(deck.mainboard),
			sideboard: parseCards(deck.sideboard),
			commanders: null,
			companion: null,
			reportedArchetype: deck.source_archetype,
		};
	}

	const rounds = buildRounds(matchRows);

	return {
		meta: {
			id: `melee-${e.source_id}`,
			name: e.name,
			date: e.date,
			formats: [e.format],
			url: `https://melee.gg/Tournament/View/${e.source_id}`,
			fetchedAt: new Date().toISOString(),
			playerCount: standings.length,
			roundCount: Object.keys(rounds).length,
			source: "melee",
			tabletop: true,
		},
		players,
		decklists,
		rounds,
	};
}

function parseCards(cards: { name: string; quantity: number }[]): CardEntry[] {
	return cards.map((c) => ({
		cardName: normalizeImportedCardName(c.name),
		quantity: c.quantity,
	}));
}

/**
 * Collapse DeckSnipe's one-row-per-entrant match rows into one MatchResult per
 * pairing, in the melee assembler's shape: the winner's record as the result,
 * draws kept once (entrant < opponent), byes explicit, and a one-sided
 * forfeit as a pairing with no opponent and no winner.
 */
function collapseRound(rows: MatchRow[]): MatchResult[] {
	const matches: MatchResult[] = [];
	for (const m of rows) {
		if (m.is_bye) {
			matches.push({
				player1Id: m.entrant,
				player2Id: null,
				result: "bye",
				winnerId: m.entrant,
			});
		} else if (m.opponent_entrant === null) {
			matches.push({
				player1Id: m.entrant,
				player2Id: null,
				result: m.record,
				winnerId: m.result === "win" ? m.entrant : null,
			});
		} else if (m.result === "win") {
			matches.push({
				player1Id: m.entrant,
				player2Id: m.opponent_entrant,
				result: m.record,
				winnerId: m.entrant,
			});
		} else if (m.result === "draw" && m.entrant < m.opponent_entrant) {
			matches.push({
				player1Id: m.entrant,
				player2Id: m.opponent_entrant,
				result: m.record,
				winnerId: null,
			});
		}
	}
	return matches;
}

function buildRounds(rows: MatchRow[]): Record<string, RoundInfo> {
	const byRound = new Map<number, MatchRow[]>();
	for (const m of rows) {
		const list = byRound.get(m.round);
		if (list) list.push(m);
		else byRound.set(m.round, [m]);
	}

	const rounds: Record<string, RoundInfo> = {};
	for (const n of [...byRound.keys()].sort((a, b) => a - b)) {
		const matches = collapseRound(byRound.get(n)!);
		const playoff = DECKSNIPE_PLAYOFFS[n];
		if (playoff) {
			rounds[playoff.key] = {
				name: playoff.name,
				number: playoff.number,
				isPlayoff: true,
				matches,
			};
		} else {
			rounds[String(n)] = { name: `Round ${n}`, number: n, isPlayoff: false, matches };
		}
	}
	return rounds;
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
