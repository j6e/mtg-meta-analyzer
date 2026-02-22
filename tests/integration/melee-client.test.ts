import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MeleeClient, MeleeApiError } from '../../scripts/lib/melee-client';
import type { DataTablesResponse, MeleeStandingRow, MeleeMatchRow, MeleeTournamentSearchRow } from '../../scripts/lib/types';

function mockResponse(body: unknown, status = 200): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: () => Promise.resolve(body),
		text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
		headers: new Headers(),
	} as Response;
}

function standingsPage(data: Partial<MeleeStandingRow>[], total: number): DataTablesResponse<MeleeStandingRow> {
	return {
		draw: 1,
		recordsTotal: total,
		recordsFiltered: total,
		data: data.map((d) => ({
			Rank: 1,
			Points: 0,
			MatchWins: 0,
			MatchLosses: 0,
			MatchDraws: 0,
			OpponentMatchWinPercentage: 0,
			TeamGameWinPercentage: 0,
			OpponentGameWinPercentage: 0,
			Team: { Players: [{ ID: 1, DisplayName: 'Test Player', Username: 'test', TeamId: 1 }] },
			Decklists: [],
			...d,
		})),
	};
}

describe('MeleeClient', () => {
	let client: MeleeClient;
	let fetchSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		client = new MeleeClient({ delayMs: 0 });
		fetchSpy = vi.spyOn(globalThis, 'fetch');
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('fetchTournamentPage', () => {
		it('sends GET request with correct URL and HTML headers', async () => {
			const html = '<html><body>Tournament Page</body></html>';
			fetchSpy.mockResolvedValueOnce(mockResponse(html));

			const result = await client.fetchTournamentPage(72980);

			expect(fetchSpy).toHaveBeenCalledOnce();
			const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
			expect(url).toBe('https://melee.gg/Tournament/View/72980');
			expect(opts.method).toBeUndefined(); // GET is default
			expect(opts.headers).toHaveProperty('User-Agent');
			expect(result).toBe(html);
		});

		it('throws MeleeApiError on non-200 response', async () => {
			fetchSpy.mockResolvedValueOnce(mockResponse('Forbidden', 403));
			await expect(client.fetchTournamentPage(72980)).rejects.toThrow(MeleeApiError);
		});

		it('MeleeApiError includes status code', async () => {
			fetchSpy.mockResolvedValueOnce(mockResponse('Forbidden', 403));
			try {
				await client.fetchTournamentPage(72980);
				expect.fail('Should have thrown');
			} catch (e) {
				expect(e).toBeInstanceOf(MeleeApiError);
				expect((e as MeleeApiError).status).toBe(403);
			}
		});
	});

	describe('fetchAllStandings', () => {
		it('sends POST with correct DataTables body format', async () => {
			const page = standingsPage([{ Rank: 1 }], 1);
			fetchSpy.mockResolvedValueOnce(mockResponse(page));

			await client.fetchAllStandings(242297);

			const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
			expect(url).toBe('https://melee.gg/Standing/GetRoundStandings');
			expect(opts.method).toBe('POST');
			expect(opts.headers).toHaveProperty('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');

			const body = opts.body as string;
			expect(body).toContain('draw=1');
			expect(body).toContain('roundId=242297');
			expect(body).toContain('columns%5B0%5D%5Bdata%5D=Rank');
			expect(body).toContain('start=0');
			expect(body).toContain('length=25');
		});

		it('paginates through multiple pages', async () => {
			const page1 = standingsPage(
				Array.from({ length: 25 }, (_, i) => ({ Rank: i + 1 })),
				30,
			);
			const page2 = standingsPage(
				Array.from({ length: 5 }, (_, i) => ({ Rank: i + 26 })),
				30,
			);

			fetchSpy.mockResolvedValueOnce(mockResponse(page1));
			fetchSpy.mockResolvedValueOnce(mockResponse(page2));

			const results = await client.fetchAllStandings(100);

			expect(fetchSpy).toHaveBeenCalledTimes(2);
			expect(results).toHaveLength(30);
			expect(results[0].Rank).toBe(1);
			expect(results[29].Rank).toBe(30);

			const secondBody = (fetchSpy.mock.calls[1] as [string, RequestInit])[1].body as string;
			expect(secondBody).toContain('start=25');
		});

		it('stops pagination when page is empty', async () => {
			const page: DataTablesResponse<MeleeStandingRow> = {
				draw: 1, recordsTotal: 0, recordsFiltered: 0, data: [],
			};
			fetchSpy.mockResolvedValueOnce(mockResponse(page));

			const results = await client.fetchAllStandings(100);
			expect(results).toHaveLength(0);
			expect(fetchSpy).toHaveBeenCalledOnce();
		});
	});

	describe('fetchAllMatches', () => {
		it('sends POST to /Match/GetRoundMatches/{roundId}', async () => {
			const page: DataTablesResponse<MeleeMatchRow> = {
				draw: 1, recordsTotal: 0, recordsFiltered: 0, data: [],
			};
			fetchSpy.mockResolvedValueOnce(mockResponse(page));

			await client.fetchAllMatches(242279);

			const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
			expect(url).toBe('https://melee.gg/Match/GetRoundMatches/242279');
		});

		it('includes match columns in POST body', async () => {
			const page: DataTablesResponse<MeleeMatchRow> = {
				draw: 1, recordsTotal: 0, recordsFiltered: 0, data: [],
			};
			fetchSpy.mockResolvedValueOnce(mockResponse(page));

			await client.fetchAllMatches(242279);

			const body = (fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string;
			expect(body).toContain('columns%5B0%5D%5Bdata%5D=TableNumber');
			expect(body).toContain('columns%5B1%5D%5Bdata%5D=Player1');
			expect(body).toContain('columns%5B5%5D%5Bdata%5D=Result');
		});
	});

	describe('fetchDecklistDetails', () => {
		it('sends GET to JSON endpoint with GUID id', async () => {
			const details = {
				Guid: '95bc7d4d-ff64-4f5a-9219-76093c05d5ff',
				DecklistName: 'Domain Ramp',
				FormatName: 'Standard',
				Game: 'MagicTheGathering',
				Records: [{ l: 'island', n: 'Island', s: null, q: 4, c: 0, t: 'Land' }],
				LinkToCards: true,
				Components: [],
			};
			fetchSpy.mockResolvedValueOnce(mockResponse(details));

			const result = await client.fetchDecklistDetails('95bc7d4d-ff64-4f5a-9219-76093c05d5ff');

			const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
			expect(url).toBe('https://melee.gg/Decklist/GetDecklistDetails?id=95bc7d4d-ff64-4f5a-9219-76093c05d5ff');
			expect(result.Guid).toBe('95bc7d4d-ff64-4f5a-9219-76093c05d5ff');
			expect(result.DecklistName).toBe('Domain Ramp');
			expect(result.Records).toHaveLength(1);
		});

		it('throws on API error response (200 with error body)', async () => {
			const errorBody = { Error: true, Code: 404, Message: 'Decklist not found' };
			fetchSpy.mockResolvedValueOnce(mockResponse(errorBody));

			await expect(client.fetchDecklistDetails('nonexistent')).rejects.toThrow(MeleeApiError);
		});
	});

	describe('searchTournaments', () => {
		it('sends POST with date range parameters', async () => {
			const page: DataTablesResponse<MeleeTournamentSearchRow> = {
				draw: 1, recordsTotal: 0, recordsFiltered: 0, data: [],
			};
			fetchSpy.mockResolvedValueOnce(mockResponse(page));

			const start = new Date('2026-01-01T00:00:00Z');
			const end = new Date('2026-01-31T00:00:00Z');
			await client.searchTournaments(start, end);

			const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
			expect(url).toBe('https://melee.gg/Decklist/TournamentSearch');
			const body = opts.body as string;
			expect(body).toContain('startDate=2026-01-01T00%3A00%3A00.000Z');
			expect(body).toContain('endDate=2026-01-31T23%3A59%3A59.999Z');
		});
	});

	describe('rate limiting', () => {
		it('delays between consecutive requests', async () => {
			const slowClient = new MeleeClient({ delayMs: 50 });
			const html = '<html></html>';
			fetchSpy.mockResolvedValue(mockResponse(html));

			const start = Date.now();
			await slowClient.fetchTournamentPage(1);
			await slowClient.fetchTournamentPage(2);
			const elapsed = Date.now() - start;

			expect(elapsed).toBeGreaterThanOrEqual(40);
		});
	});

	describe('error handling', () => {
		it('MeleeApiError contains status and request info', async () => {
			fetchSpy.mockResolvedValueOnce(mockResponse('Server Error', 500));

			try {
				await client.fetchTournamentPage(1);
				expect.fail('Should have thrown');
			} catch (e) {
				expect(e).toBeInstanceOf(MeleeApiError);
				const err = e as MeleeApiError;
				expect(err.status).toBe(500);
				expect(err.request).toContain('Tournament/View/1');
			}
		});
	});
});
