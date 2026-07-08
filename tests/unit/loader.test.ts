import { afterEach, describe, expect, it, vi } from "vitest";
import type {
	TournamentData,
	TournamentIndexEntry,
} from "../../src/lib/types/tournament";

// tests/setup.ts mocks the loader module-wide; here we test the real thing
vi.unmock("../../src/lib/data/loader");
const { fetchFormatTournaments } = await import("../../src/lib/data/loader");

function makeEntry(id: string): TournamentIndexEntry {
	return {
		id,
		name: id,
		cleanName: id,
		date: "2026-01-01",
		format: "Standard",
		source: "melee",
		url: "",
		playerCount: 8,
		roundCount: 3,
		matchCount: 12,
		importance: "other",
		tabletop: true,
		pairings: true,
		path: `2026-01/${id}.json`,
	};
}

function makeTournament(id: string): TournamentData {
	return {
		meta: {
			id,
			name: id,
			date: "2026-01-01",
			formats: ["Standard"],
			url: "",
			fetchedAt: "",
			playerCount: 8,
			roundCount: 3,
			source: "melee",
			tabletop: true,
		},
		players: {},
		decklists: {},
		rounds: {},
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("fetchFormatTournaments", () => {
	it("fetches every index entry by its path and returns the parsed data", async () => {
		const urls: string[] = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				urls.push(url);
				const id = url.split("/").pop()!.replace(".json", "");
				return new Response(JSON.stringify(makeTournament(id)));
			}),
		);

		const entries = [makeEntry("melee-1"), makeEntry("melee-2")];
		const result = await fetchFormatTournaments("standard", entries);

		expect(urls.sort()).toEqual([
			"/data/standard/2026-01/melee-1.json",
			"/data/standard/2026-01/melee-2.json",
		]);
		expect(result.map((t) => t.meta.id).sort()).toEqual(["melee-1", "melee-2"]);
	});

	it("skips failing files instead of rejecting the whole format", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				if (url.includes("melee-bad")) return new Response("nope", { status: 404 });
				const id = url.split("/").pop()!.replace(".json", "");
				return new Response(JSON.stringify(makeTournament(id)));
			}),
		);

		const entries = [
			makeEntry("melee-1"),
			makeEntry("melee-bad"),
			makeEntry("melee-3"),
		];
		const result = await fetchFormatTournaments("standard", entries);

		expect(result.map((t) => t.meta.id).sort()).toEqual(["melee-1", "melee-3"]);
		expect(warn).toHaveBeenCalledOnce();
	});

	it("bounds in-flight requests to the concurrency limit", async () => {
		let active = 0;
		let maxActive = 0;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				active++;
				maxActive = Math.max(maxActive, active);
				await new Promise((r) => setTimeout(r, 1));
				active--;
				const id = url.split("/").pop()!.replace(".json", "");
				return new Response(JSON.stringify(makeTournament(id)));
			}),
		);

		const entries = Array.from({ length: 10 }, (_, i) => makeEntry(`melee-${i}`));
		const result = await fetchFormatTournaments("standard", entries, {
			concurrency: 3,
		});

		expect(result).toHaveLength(10);
		expect(maxActive).toBeLessThanOrEqual(3);
	});
});
