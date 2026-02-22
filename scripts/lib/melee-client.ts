import type {
	DataTablesColumn,
	DataTablesResponse,
	MeleeStandingRow,
	MeleeMatchRow,
	MeleeTournamentSearchRow,
	MeleeDecklistDetails,
} from './types';

const BASE_URL = 'https://melee.gg';

const DEFAULT_HEADERS: Record<string, string> = {
	'User-Agent':
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
	Accept: 'application/json, text/javascript, */*; q=0.01',
	'X-Requested-With': 'XMLHttpRequest',
};

const HTML_HEADERS: Record<string, string> = {
	'User-Agent':
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
	Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

export interface MeleeClientOptions {
	/** Delay in ms between requests (default: 200) */
	delayMs?: number;
	/** Page size for DataTables requests (default: 25) */
	pageSize?: number;
}

export class MeleeClient {
	private delayMs: number;
	private pageSize: number;
	private lastRequestTime = 0;

	constructor(options: MeleeClientOptions = {}) {
		this.delayMs = options.delayMs ?? 200;
		this.pageSize = options.pageSize ?? 25;
	}

	// --- Public API ---

	/** Fetch tournament page HTML */
	async fetchTournamentPage(tournamentId: number): Promise<string> {
		return this.getHtml(`/Tournament/View/${tournamentId}`);
	}

	/** Fetch all standings for a round (auto-paginates) */
	async fetchAllStandings(roundId: number): Promise<MeleeStandingRow[]> {
		return this.fetchAllPages<MeleeStandingRow>(
			'/Standing/GetRoundStandings',
			STANDINGS_COLUMNS,
			{ sortColumn: 0, sortDir: 'asc' },
			{ roundId: String(roundId) },
		);
	}

	/** Fetch all matches for a round (auto-paginates) */
	async fetchAllMatches(roundId: number): Promise<MeleeMatchRow[]> {
		return this.fetchAllPages<MeleeMatchRow>(
			`/Match/GetRoundMatches/${roundId}`,
			MATCHES_COLUMNS,
			{ sortColumn: 0, sortDir: 'asc' },
		);
	}

	/** Fetch decklist details (JSON endpoint — decklist IDs are GUIDs) */
	async fetchDecklistDetails(decklistId: string): Promise<MeleeDecklistDetails> {
		const url = `${BASE_URL}/Decklist/GetDecklistDetails?id=${decklistId}`;
		await this.rateLimit();
		const res = await fetch(url, { headers: DEFAULT_HEADERS });
		if (!res.ok) {
			throw new MeleeApiError(`GET ${url}`, res.status, await res.text());
		}
		const data = await res.json() as MeleeDecklistDetails & { Error?: boolean; Code?: number; Message?: string };
		// The API returns 200 with error body for not-found decklists
		if ('Error' in data && data.Error) {
			throw new MeleeApiError(`GET ${url}`, data.Code ?? 404, data.Message ?? 'Unknown error');
		}
		return data;
	}

	/** Fetch decklist page HTML (fallback if JSON endpoint fails) */
	async fetchDecklistPage(decklistId: string): Promise<string> {
		return this.getHtml(`/Decklist/View/${decklistId}`);
	}

	/** Search tournaments by date range (auto-paginates) */
	async searchTournaments(
		startDate: Date,
		endDate: Date,
	): Promise<MeleeTournamentSearchRow[]> {
		const extra = {
			q: '',
			startDate: toIsoStartOfDay(startDate),
			endDate: toIsoEndOfDay(endDate),
		};
		return this.fetchAllPages<MeleeTournamentSearchRow>(
			'/Decklist/TournamentSearch',
			TOURNAMENT_SEARCH_COLUMNS,
			{ sortColumn: 2, sortDir: 'desc' },
			extra,
		);
	}

	/** Fetch a single page of a DataTables endpoint */
	async fetchPage<T>(
		path: string,
		columns: DataTablesColumn[],
		sort: { sortColumn: number; sortDir: 'asc' | 'desc' },
		offset: number,
		extra: Record<string, string> = {},
	): Promise<DataTablesResponse<T>> {
		const body = buildDataTablesBody(columns, sort, offset, this.pageSize, extra);
		const url = `${BASE_URL}${path}`;

		await this.rateLimit();
		const res = await fetch(url, {
			method: 'POST',
			headers: {
				...DEFAULT_HEADERS,
				'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
			},
			body,
		});

		if (!res.ok) {
			throw new MeleeApiError(`POST ${url}`, res.status, await res.text());
		}

		return res.json() as Promise<DataTablesResponse<T>>;
	}

	// --- Private helpers ---

	private async getHtml(path: string): Promise<string> {
		const url = `${BASE_URL}${path}`;
		await this.rateLimit();
		const res = await fetch(url, { headers: HTML_HEADERS });
		if (!res.ok) {
			throw new MeleeApiError(`GET ${url}`, res.status, await res.text());
		}
		return res.text();
	}

	private async fetchAllPages<T>(
		path: string,
		columns: DataTablesColumn[],
		sort: { sortColumn: number; sortDir: 'asc' | 'desc' },
		extra: Record<string, string> = {},
	): Promise<T[]> {
		const allData: T[] = [];
		let offset = 0;

		while (true) {
			const page = await this.fetchPage<T>(path, columns, sort, offset, extra);
			allData.push(...page.data);

			if (page.data.length === 0 || offset + this.pageSize >= page.recordsTotal) {
				break;
			}
			offset += this.pageSize;
		}

		return allData;
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

// --- Error class ---

export class MeleeApiError extends Error {
	constructor(
		public readonly request: string,
		public readonly status: number,
		public readonly body: string,
	) {
		super(`Melee API error: ${request} returned ${status}`);
		this.name = 'MeleeApiError';
	}
}

// --- DataTables body builder ---

function buildDataTablesBody(
	columns: DataTablesColumn[],
	sort: { sortColumn: number; sortDir: 'asc' | 'desc' },
	start: number,
	length: number,
	extra: Record<string, string> = {},
): string {
	const params = new URLSearchParams();
	params.set('draw', '1');

	for (let i = 0; i < columns.length; i++) {
		const col = columns[i];
		params.set(`columns[${i}][data]`, col.data);
		params.set(`columns[${i}][name]`, col.name);
		params.set(`columns[${i}][searchable]`, String(col.searchable));
		params.set(`columns[${i}][orderable]`, String(col.orderable));
		params.set(`columns[${i}][search][value]`, col.search.value);
		params.set(`columns[${i}][search][regex]`, String(col.search.regex));
	}

	params.set('order[0][column]', String(sort.sortColumn));
	params.set('order[0][dir]', sort.sortDir);
	params.set('start', String(start));
	params.set('length', String(length));
	params.set('search[value]', '');
	params.set('search[regex]', 'false');

	for (const [key, value] of Object.entries(extra)) {
		params.set(key, value);
	}

	return params.toString();
}

// --- Column definitions (match melee.gg frontend exactly) ---

function col(data: string, searchable: boolean, orderable: boolean): DataTablesColumn {
	return {
		data,
		name: data,
		searchable,
		orderable,
		search: { value: '', regex: false },
	};
}

const STANDINGS_COLUMNS: DataTablesColumn[] = [
	col('Rank', true, true),
	col('Player', false, false),
	col('Decklists', false, true),
	col('MatchRecord', false, false),
	col('GameRecord', false, false),
	col('Points', true, true),
	col('OpponentMatchWinPercentage', false, true),
	col('TeamGameWinPercentage', false, true),
	col('OpponentGameWinPercentage', false, true),
	col('FinalTiebreaker', true, true),
	col('OpponentCount', true, true),
];

const MATCHES_COLUMNS: DataTablesColumn[] = [
	col('TableNumber', true, true),
	col('Player1', true, true),
	col('Player1Decklist', true, true),
	col('Player2', true, true),
	col('Player2Decklist', true, true),
	col('Result', false, false),
];

const TOURNAMENT_SEARCH_COLUMNS: DataTablesColumn[] = [
	col('ID', false, false),
	col('Name', true, true),
	col('StartDate', false, true),
	col('Status', true, true),
	col('Format', true, true),
	col('OrganizationName', true, true),
	col('Decklists', true, true),
];

// --- Utilities ---

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function toIsoStartOfDay(date: Date): string {
	return date.toISOString().split('T')[0] + 'T00:00:00.000Z';
}

function toIsoEndOfDay(date: Date): string {
	return date.toISOString().split('T')[0] + 'T23:59:59.999Z';
}
