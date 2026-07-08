/**
 * Client for the Videre Project public MTGO database (read-only SQL).
 *
 * Requires the Cloudflare Tunnel bridge to be running locally:
 *   cloudflared access tcp --hostname public-db.videreproject.com --url 127.0.0.1:5432
 *
 * Port is configurable via VIDERE_PORT (default 5432). The public_api role has
 * a 5s statement timeout, so all queries here are per-event or per-window.
 * See research/videre-mtgo-data-access.md.
 */
import { SQL } from "bun";

const VIDERE_PORT = Number(process.env.VIDERE_PORT ?? 5432);

const BRIDGE_HINT = `Could not connect to the Videre database. Is the Cloudflare Tunnel bridge running?

  cloudflared access tcp --hostname public-db.videreproject.com --url 127.0.0.1:${VIDERE_PORT}

(set VIDERE_PORT if the bridge listens on a different local port)`;

export interface VidereEventSummary {
	id: number;
	name: string;
	date: string; // "YYYY-MM-DD"
	format: string; // capitalized, e.g. "Pauper"
	kind: string; // Challenge | Showcase | Qualifier | ...
	rounds: number; // Swiss rounds only
	players: number;
}

export interface VidereRawCard {
	id: number; // MTGO catalog id
	name: string;
	quantity: number;
}

export interface VidereRawDeck {
	id: number;
	player: string;
	mainboard: VidereRawCard[];
	sideboard: VidereRawCard[];
}

export interface VidereRawMatch {
	round: number;
	player: string;
	opponent: string | null; // null ⟺ bye
	record: string; // game-level, row-owner's perspective, "2-1-0"
	result: "win" | "loss" | "draw";
	isbye: boolean;
}

export interface VidereRawStanding {
	rank: number;
	player: string;
	record: string; // match-level, includes playoffs
	points: number;
	omwp: number;
	gwp: number;
	owp: number;
}

export interface VidereRawEvent {
	event: VidereEventSummary;
	decks: VidereRawDeck[];
	matches: VidereRawMatch[];
	standings: VidereRawStanding[];
}

const LIST_EVENTS_QUERY = `
SELECT e.id, e.name, e.date::text AS date, e.format::text AS format,
       e.kind::text AS kind, e.rounds, e.players
FROM events e
WHERE e.date >= $1::date AND e.date <= $2::date
  AND e.format::text = ANY($3::text[])
  AND e.kind::text = ANY($4::text[])
ORDER BY e.date, e.id`;

// One server-side JSON query per event: composite card arrays are unnested and
// re-shaped in SQL so the client never parses Postgres composite-type text.
const FETCH_EVENT_QUERY = `
SELECT json_build_object(
  'event', (
    SELECT json_build_object(
      'id', e.id, 'name', e.name, 'date', e.date::text,
      'format', e.format::text, 'kind', e.kind::text,
      'rounds', e.rounds, 'players', e.players
    )
    FROM events e WHERE e.id = $1
  ),
  'decks', (
    SELECT coalesce(json_agg(json_build_object(
      'id', d.id,
      'player', d.player,
      'mainboard', (
        SELECT coalesce(json_agg(json_build_object('id', (c).id, 'name', (c).name, 'quantity', (c).quantity)), '[]'::json)
        FROM unnest(d.mainboard) c
      ),
      'sideboard', (
        SELECT coalesce(json_agg(json_build_object('id', (c).id, 'name', (c).name, 'quantity', (c).quantity)), '[]'::json)
        FROM unnest(d.sideboard) c
      )
    ) ORDER BY d.id), '[]'::json)
    FROM decks d WHERE d.event_id = $1
  ),
  'matches', (
    SELECT coalesce(json_agg(json_build_object(
      'round', m.round, 'player', m.player, 'opponent', m.opponent,
      'record', m.record, 'result', m.result::text, 'isbye', m.isbye
    ) ORDER BY m.round, m.player), '[]'::json)
    FROM matches m WHERE m.event_id = $1
  ),
  'standings', (
    SELECT coalesce(json_agg(json_build_object(
      'rank', s.rank, 'player', s.player, 'record', s.record,
      'points', s.points, 'omwp', s.omwp, 'gwp', s.gwp, 'owp', s.owp
    ) ORDER BY s.rank), '[]'::json)
    FROM standings s WHERE s.event_id = $1
  )
) AS data`;

export class VidereClient {
	private sql: SQL;

	constructor() {
		this.sql = new SQL(
			`postgresql://public_api@127.0.0.1:${VIDERE_PORT}/mtgo?sslmode=disable`,
		);
	}

	async listEvents(opts: {
		minDate: string; // "YYYY-MM-DD" inclusive
		maxDate: string; // "YYYY-MM-DD" inclusive
		formats: string[];
		kinds: string[];
	}): Promise<VidereEventSummary[]> {
		return this.query<VidereEventSummary>(LIST_EVENTS_QUERY, [
			opts.minDate,
			opts.maxDate,
			toTextArrayLiteral(opts.formats),
			toTextArrayLiteral(opts.kinds),
		]);
	}

	/** Full event export in one query (~1.2s for a 67-player Challenge). */
	async fetchEvent(id: number): Promise<VidereRawEvent | null> {
		const rows = await this.query<{ data: VidereRawEvent }>(FETCH_EVENT_QUERY, [id]);
		const data = rows[0].data;
		return data.event ? data : null;
	}

	async close(): Promise<void> {
		await this.sql.end();
	}

	private async query<T>(text: string, params: unknown[]): Promise<T[]> {
		try {
			return await this.sql.unsafe(text, params);
		} catch (e) {
			if (isConnectionError(e)) {
				throw new Error(BRIDGE_HINT, { cause: e });
			}
			throw e;
		}
	}
}

function isConnectionError(e: unknown): boolean {
	const err = e as { code?: string; message?: string };
	const code = err?.code ?? "";
	const message = err?.message ?? "";
	return (
		code === "ECONNREFUSED" ||
		code.includes("CONNECTION") ||
		message.includes("ECONNREFUSED") ||
		message.toLowerCase().includes("connection refused")
	);
}

/**
 * Build a Postgres text[] literal, e.g. {"Pauper","Modern"}.
 *
 * Required because Bun's Postgres client (as of bun 1.3, both sql.unsafe and
 * tagged templates) serializes a JS array param without braces
 * ("Pauper,Modern"), which Postgres rejects as a malformed array literal —
 * verified live against the Videre DB on 2026-07-08.
 */
function toTextArrayLiteral(values: string[]): string {
	return `{${values.map((v) => `"${v.replace(/(["\\])/g, "\\$1")}"`).join(",")}}`;
}
