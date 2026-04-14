import { parse } from "node-html-parser";

// ---------------------------------------------------------------------------
// Raw MTGO types (mirrors the embedded JSON structure on mtgo.com)
// ---------------------------------------------------------------------------

export interface MtgoRawCard {
	qty: string;
	sideboard: string;
	card_attributes: {
		card_name: string;
		cost: string;
		rarity: string;
		color: string;
		cardset: string;
		card_type: string;
		colors: string[];
	};
}

export interface MtgoRawDeck {
	loginid: string;
	tournamentid: string;
	decktournamentid: string;
	player: string;
	main_deck: MtgoRawCard[];
	sideboard_deck: MtgoRawCard[];
}

export interface MtgoRawStanding {
	tournamentid: string;
	loginid: string;
	login_name: string;
	rank: string;
	score: string;
	opponentmatchwinpercentage: string;
	gamewinpercentage: string;
	opponentgamewinpercentage: string;
	eliminated: string;
}

export interface MtgoRawWinLoss {
	tournamentid: string;
	loginid: string;
	wins: string;
	losses: string;
}

export interface MtgoRawFinalRank {
	tournamentid: string;
	loginid: string;
	rank: string;
	roundnumber: string;
}

export interface MtgoRawBracketPlayer {
	loginid: number;
	player: string;
	seeding: number;
	wins: number;
	losses: number;
	winner: boolean;
}

export interface MtgoRawBracketRound {
	matches: { players: MtgoRawBracketPlayer[] }[];
	index: number;
}

export interface MtgoRawTournament {
	event_id: string;
	description: string;
	starttime: string;
	format: string;
	type: string;
	inplayoffs: string;
	site_name: string;
	decklists: MtgoRawDeck[];
	brackets: MtgoRawBracketRound[];
	standings: MtgoRawStanding[];
	winloss: MtgoRawWinLoss[];
	final_rank: MtgoRawFinalRank[];
	player_count: { tournamentid: string; players: string; queued_players: string };
}

// ---------------------------------------------------------------------------
// Listing page types
// ---------------------------------------------------------------------------

export interface MtgoListingEntry {
	title: string;
	href: string;
	date: string;
	eventId: string;
}

// ---------------------------------------------------------------------------
// Pure parsing functions (testable without network)
// ---------------------------------------------------------------------------

/** Parse a monthly listing page HTML into tournament entries. */
export function parseListingHtml(html: string): MtgoListingEntry[] {
	const root = parse(html);
	const items = root.querySelectorAll("li.decklists-item");
	const entries: MtgoListingEntry[] = [];

	for (const item of items) {
		const anchor = item.querySelector("a");
		if (!anchor) continue;

		const href = anchor.getAttribute("href") ?? "";
		const h3 = anchor.querySelector("h3");
		const title = h3?.textContent?.trim() ?? "";
		const time = anchor.querySelector("time");
		const datetime = time?.getAttribute("datetime") ?? "";
		const date = datetime.slice(0, 10); // "2026-03-08T00:00:00Z" → "2026-03-08"

		// The href ends with {YYYY-MM-DD}{eventId} (no separator).
		// Use the known date to locate the event ID after the day portion.
		const dateIdx = href.lastIndexOf(date);
		let eventId = "";
		if (dateIdx !== -1) {
			// Skip past "YYYY-MM-DD" (10 chars) to get the event ID
			eventId = href.slice(dateIdx + 10);
		}

		if (href && title && date && eventId) {
			entries.push({ title, href, date, eventId });
		}
	}

	return entries;
}

/** Extract the embedded tournament JSON from a tournament page HTML. */
export function extractTournamentJson(html: string): MtgoRawTournament | null {
	const lines = html.split("\n");
	const dataLine = lines.find((l) =>
		l.trim().startsWith("window.MTGO.decklists.data = "),
	);
	if (!dataLine) return null;

	const trimmed = dataLine.trim();
	// Strip "window.MTGO.decklists.data = " (29 chars) and trailing ";"
	const jsonStr = trimmed.slice(29, trimmed.endsWith(";") ? -1 : undefined);

	const data = JSON.parse(jsonStr) as MtgoRawTournament;

	// Skip if decklists not yet published
	if (!data.decklists || !Array.isArray(data.decklists)) return null;

	// Skip leagues (have publish_date instead of starttime)
	if (!data.starttime) return null;

	return data;
}

// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------

const BASE_URL = "https://www.mtgo.com";

const HTML_HEADERS: Record<string, string> = {
	"User-Agent":
		"Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0",
	Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

export interface MtgoClientOptions {
	/** Delay in ms between requests (default: 2000) */
	delayMs?: number;
	/** Per-request timeout in ms (default: 30000) */
	timeoutMs?: number;
	/** Max retries on transient errors (default: 3) */
	maxRetries?: number;
}

export class MtgoClient {
	private delayMs: number;
	private timeoutMs: number;
	private maxRetries: number;
	private lastRequestTime = 0;

	constructor(options: MtgoClientOptions = {}) {
		this.delayMs = options.delayMs ?? 2000;
		this.timeoutMs = options.timeoutMs ?? 60_000;
		this.maxRetries = options.maxRetries ?? 5;
	}

	/** Fetch and parse a monthly listing page. */
	async fetchListingPage(year: number, month: number): Promise<MtgoListingEntry[]> {
		const monthStr = String(month).padStart(2, "0");
		const html = await this.getHtml(`/decklists/${year}/${monthStr}`);
		return parseListingHtml(html);
	}

	/** Fetch a tournament page and extract the embedded JSON. Returns null if data not yet published. */
	async fetchTournamentData(href: string): Promise<MtgoRawTournament | null> {
		const html = await this.getHtml(href);
		return extractTournamentJson(html);
	}

	private async getHtml(path: string): Promise<string> {
		const url = `${BASE_URL}${path}`;

		for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
			await this.rateLimit();

			try {
				const res = await fetch(url, {
					headers: HTML_HEADERS,
					signal: AbortSignal.timeout(this.timeoutMs),
				});

				if (res.ok) return res.text();

				if (attempt < this.maxRetries && isTransient(res.status)) {
					const backoff = this.delayMs * 2 ** attempt;
					console.warn(
						`  ${res.status} for ${path}, retrying in ${backoff}ms (attempt ${attempt + 1}/${this.maxRetries})`,
					);
					await sleep(backoff);
					continue;
				}

				throw new MtgoFetchError(url, res.status, await res.text());
			} catch (e) {
				if (e instanceof MtgoFetchError) throw e;

				if (attempt < this.maxRetries) {
					const backoff = this.delayMs * 2 ** attempt;
					const reason = e instanceof Error ? e.message : String(e);
					console.warn(
						`  ${reason} for ${path}, retrying in ${backoff}ms (attempt ${attempt + 1}/${this.maxRetries})`,
					);
					await sleep(backoff);
					continue;
				}

				throw new MtgoFetchError(url, 0, e instanceof Error ? e.message : String(e));
			}
		}

		throw new MtgoFetchError(url, 0, "exhausted retries");
	}

	private async rateLimit(): Promise<void> {
		const now = Date.now();
		const elapsed = now - this.lastRequestTime;
		if (elapsed < this.delayMs) {
			await sleep(this.delayMs - elapsed);
		}
		this.lastRequestTime = Date.now();
	}
}

function isTransient(status: number): boolean {
	return status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MtgoFetchError extends Error {
	constructor(
		public readonly url: string,
		public readonly status: number,
		public readonly body: string,
	) {
		super(`MTGO fetch error: GET ${url} returned ${status}`);
		this.name = "MtgoFetchError";
	}
}
