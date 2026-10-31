import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	extractTournamentJson,
	INCOMPLETE_PAGE_STATUS,
	MtgoClient,
	MtgoFetchError,
	parseListingHtml,
} from "../../scripts/lib/mtgo-client";

const FIXTURES = resolve(__dirname, "../fixtures");

describe("parseListingHtml", () => {
	const html = readFileSync(resolve(FIXTURES, "mtgo-listing.html"), "utf-8");
	const entries = parseListingHtml(html);

	it("extracts all listing entries from HTML", () => {
		expect(entries).toHaveLength(6);
	});

	it("extracts title correctly", () => {
		expect(entries[0].title).toBe("Pauper Challenge 32");
		expect(entries[1].title).toBe("Modern Challenge 64");
		expect(entries[2].title).toBe("Modern Showcase Challenge");
		expect(entries[3].title).toBe("Modern League");
	});

	it("extracts href correctly", () => {
		expect(entries[0].href).toBe("/decklist/pauper-challenge-32-2026-03-0812834527");
	});

	it("extracts date from time[datetime]", () => {
		expect(entries[0].date).toBe("2026-03-08");
		expect(entries[1].date).toBe("2026-03-07");
	});

	it("extracts event ID from trailing digits in href", () => {
		expect(entries[0].eventId).toBe("12834527");
		expect(entries[1].eventId).toBe("12834511");
		expect(entries[2].eventId).toBe("12834457");
	});

	it("returns empty array for empty HTML", () => {
		expect(parseListingHtml("<html><body></body></html>")).toEqual([]);
	});

	it("returns empty array for HTML with no decklists-item elements", () => {
		const html = '<html><body><ul class="decklists-list"></ul></body></html>';
		expect(parseListingHtml(html)).toEqual([]);
	});
});

describe("extractTournamentJson", () => {
	const html = readFileSync(resolve(FIXTURES, "mtgo-tournament.html"), "utf-8");

	it("extracts the embedded JSON from tournament page", () => {
		const data = extractTournamentJson(html);
		expect(data).not.toBeNull();
		expect(data!.event_id).toBe("12834527");
		expect(data!.description).toBe("Pauper Challenge 32");
	});

	it("parses tournament metadata", () => {
		const data = extractTournamentJson(html)!;
		expect(data.format).toBe("CPAUPER");
		expect(data.type).toBe("TOURNAMENT");
		expect(data.starttime).toBe("2026-03-08 17:00:00.0");
		expect(data.site_name).toBe("pauper-challenge-32-2026-03-0812834527");
	});

	it("parses decklists array", () => {
		const data = extractTournamentJson(html)!;
		expect(data.decklists).toHaveLength(4);
		expect(data.decklists[0].player).toBe("Boin");
		expect(data.decklists[0].main_deck).toHaveLength(2);
		expect(data.decklists[0].main_deck[0].card_attributes.card_name).toBe(
			"Gladecover Scout",
		);
		expect(data.decklists[0].main_deck[0].qty).toBe("4");
	});

	it("parses standings array", () => {
		const data = extractTournamentJson(html)!;
		expect(data.standings).toHaveLength(4);
		expect(data.standings[0].login_name).toBe("Boin");
		expect(data.standings[0].score).toBe("15");
	});

	it("parses brackets array", () => {
		const data = extractTournamentJson(html)!;
		expect(data.brackets).toHaveLength(2);
		// index 1 = Semifinals, index 0 = Finals
		expect(data.brackets[0].index).toBe(1);
		expect(data.brackets[1].index).toBe(0);
	});

	it("parses player_count", () => {
		const data = extractTournamentJson(html)!;
		expect(data.player_count.players).toBe("32");
	});

	it("returns null when decklists.data line is missing", () => {
		const noData = "<html><body><script>var x = 1;</script></body></html>";
		expect(extractTournamentJson(noData)).toBeNull();
	});

	it("returns null when decklists key is missing from JSON", () => {
		const noDecks = `<html><body><script>
window.MTGO.decklists.data = {"event_id":"123","starttime":"2026-01-01 00:00:00.0"};
</script></body></html>`;
		expect(extractTournamentJson(noDecks)).toBeNull();
	});
});

describe("MtgoClient incomplete-page retries", () => {
	const listingHtml = readFileSync(resolve(FIXTURES, "mtgo-listing.html"), "utf-8");
	// mtgo.com intermittently serves the page shell with the event list missing.
	const emptyListingHtml = '<html><body><ul class="decklists-list"></ul></body></html>';

	function stubPages(...pages: string[]) {
		const fetchMock = vi.fn();
		for (const page of pages) {
			fetchMock.mockResolvedValueOnce(new Response(page, { status: 200 }));
		}
		vi.stubGlobal("fetch", fetchMock);
		return fetchMock;
	}

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("retries an empty listing page until the events appear", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const fetchMock = stubPages(emptyListingHtml, listingHtml);
		const client = new MtgoClient({ delayMs: 0 });

		const entries = await client.fetchListingPage(2026, 3);

		expect(entries).toHaveLength(6);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("throws INCOMPLETE_PAGE_STATUS when the listing stays empty", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		stubPages(emptyListingHtml, emptyListingHtml, emptyListingHtml);
		const client = new MtgoClient({ delayMs: 0, maxRetries: 2 });

		const error = await client.fetchListingPage(2026, 3).catch((e) => e);

		expect(error).toBeInstanceOf(MtgoFetchError);
		expect(error.status).toBe(INCOMPLETE_PAGE_STATUS);
	});

	it("retries a tournament page missing its embedded data", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const tournamentHtml = readFileSync(
			resolve(FIXTURES, "mtgo-tournament.html"),
			"utf-8",
		);
		const fetchMock = stubPages("<html><body></body></html>", tournamentHtml);
		const client = new MtgoClient({ delayMs: 0 });

		const data = await client.fetchTournamentData("/decklist/x");

		expect(data).not.toBeNull();
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});
