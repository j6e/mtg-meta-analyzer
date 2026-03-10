import { describe, expect, it } from "vitest";
import { makeDefaults } from "../../src/lib/stores/settings";
import type { TournamentListEntry } from "../../src/lib/stores/tournaments";
import {
	getInitialExcludeIds,
	searchParamsToSettings,
	settingsToSearchParams,
} from "../../src/lib/stores/url-settings";

function makeTournament(id: string, format: string, date: string): TournamentListEntry {
	return {
		id,
		name: id,
		cleanName: id,
		date,
		formats: [format],
		url: "",
		fetchedAt: "",
		playerCount: 32,
		roundCount: 5,
		source: "melee" as const,
		tabletop: true,
		matchCount: 100,
		importance: "other",
	};
}

const TOURNAMENTS: TournamentListEntry[] = [
	makeTournament("t1", "Standard", "2026-02-15"),
	makeTournament("t2", "Standard", "2026-02-20"),
	makeTournament("t3", "Modern", "2026-02-18"),
	makeTournament("t4", "Standard", "2026-03-01"),
];

describe("settingsToSearchParams", () => {
	it("serializes default settings with minimal params", () => {
		const defaults = makeDefaults();
		defaults.selectedTournamentIds = ["t1", "t2", "t4"]; // all Standard in range
		const params = settingsToSearchParams(defaults, TOURNAMENTS);

		// format=Standard is the default, so omitted
		expect(params.has("format")).toBe(false);
		expect(params.get("from")).toBe(defaults.dateFrom);
		expect(params.get("to")).toBe(defaults.dateTo);
		expect(params.has("mirrors")).toBe(false); // default is true
		expect(params.has("other")).toBe(false); // default is minShare
		expect(params.has("top")).toBe(false);
		expect(params.has("minShare")).toBe(false); // default value
	});

	it("serializes non-default format", () => {
		const s = makeDefaults();
		s.format = "Modern";
		s.selectedTournamentIds = ["t3"];
		const params = settingsToSearchParams(s, TOURNAMENTS);
		expect(params.get("format")).toBe("Modern");
	});

	it("serializes empty format (all formats)", () => {
		const s = makeDefaults();
		s.format = "";
		s.selectedTournamentIds = TOURNAMENTS.map((t) => t.id);
		const params = settingsToSearchParams(s, TOURNAMENTS);
		expect(params.get("format")).toBe("");
	});

	it("serializes excludeMirrors=false", () => {
		const s = makeDefaults();
		s.excludeMirrors = false;
		s.selectedTournamentIds = ["t1", "t2", "t4"];
		const params = settingsToSearchParams(s, TOURNAMENTS);
		expect(params.get("mirrors")).toBe("0");
	});

	it("serializes topN mode", () => {
		const s = makeDefaults();
		s.otherMode = "topN";
		s.topN = 8;
		s.selectedTournamentIds = ["t1", "t2", "t4"];
		const params = settingsToSearchParams(s, TOURNAMENTS);
		expect(params.get("other")).toBe("topN");
		expect(params.get("top")).toBe("8");
	});

	it("serializes non-default minMetagameShare", () => {
		const s = makeDefaults();
		s.minMetagameShare = 5;
		s.selectedTournamentIds = ["t1", "t2", "t4"];
		const params = settingsToSearchParams(s, TOURNAMENTS);
		expect(params.get("minShare")).toBe("5");
	});

	it("computes exclude from deselected tournaments", () => {
		const s = makeDefaults();
		s.format = "Standard";
		s.dateFrom = "2026-02-01";
		s.dateTo = "2026-03-10";
		// t1, t2, t4 are Standard in range; deselect t2
		s.selectedTournamentIds = ["t1", "t4"];
		const params = settingsToSearchParams(s, TOURNAMENTS);
		expect(params.get("exclude")).toBe("t2");
	});

	it("omits exclude when all eligible are selected", () => {
		const s = makeDefaults();
		s.format = "Standard";
		s.dateFrom = "2026-02-01";
		s.dateTo = "2026-03-10";
		s.selectedTournamentIds = ["t1", "t2", "t4"];
		const params = settingsToSearchParams(s, TOURNAMENTS);
		expect(params.has("exclude")).toBe(false);
	});
});

describe("searchParamsToSettings", () => {
	it("returns defaults for empty params", () => {
		const defaults = makeDefaults();
		const result = searchParamsToSettings(new URLSearchParams());
		expect(result.format).toBe(defaults.format);
		expect(result.dateFrom).toBe(defaults.dateFrom);
		expect(result.dateTo).toBe(defaults.dateTo);
		expect(result.excludeMirrors).toBe(true);
		expect(result.otherMode).toBe("minShare");
		expect(result.minMetagameShare).toBe(2);
		expect(result.selectedTournamentIds).toEqual([]);
	});

	it("parses format", () => {
		const params = new URLSearchParams("format=Modern");
		expect(searchParamsToSettings(params).format).toBe("Modern");
	});

	it("parses empty format as all formats", () => {
		const params = new URLSearchParams("format=");
		expect(searchParamsToSettings(params).format).toBe("");
	});

	it("parses date range", () => {
		const params = new URLSearchParams("from=2026-01-01&to=2026-02-28");
		const result = searchParamsToSettings(params);
		expect(result.dateFrom).toBe("2026-01-01");
		expect(result.dateTo).toBe("2026-02-28");
	});

	it("parses mirrors=0 as excludeMirrors=false", () => {
		const params = new URLSearchParams("mirrors=0");
		expect(searchParamsToSettings(params).excludeMirrors).toBe(false);
	});

	it("parses topN mode", () => {
		const params = new URLSearchParams("other=topN&top=8");
		const result = searchParamsToSettings(params);
		expect(result.otherMode).toBe("topN");
		expect(result.topN).toBe(8);
	});

	it("parses minShare", () => {
		const params = new URLSearchParams("minShare=5");
		expect(searchParamsToSettings(params).minMetagameShare).toBe(5);
	});

	it("stores exclude IDs for getInitialExcludeIds", () => {
		const params = new URLSearchParams("exclude=t1,t3");
		searchParamsToSettings(params);
		const ids = getInitialExcludeIds();
		expect(ids).toEqual(new Set(["t1", "t3"]));
		// Second call should return empty (consumed)
		expect(getInitialExcludeIds()).toEqual(new Set());
	});

	it("handles invalid top value gracefully", () => {
		const params = new URLSearchParams("other=topN&top=abc");
		const defaults = makeDefaults();
		expect(searchParamsToSettings(params).topN).toBe(defaults.topN);
	});
});

describe("round-trip", () => {
	it("preserves settings through serialize → deserialize", () => {
		const original = makeDefaults();
		original.format = "Modern";
		original.dateFrom = "2026-01-15";
		original.dateTo = "2026-03-01";
		original.excludeMirrors = false;
		original.otherMode = "topN";
		original.topN = 5;
		original.selectedTournamentIds = ["t3"]; // only Modern tournament

		const params = settingsToSearchParams(original, TOURNAMENTS);
		const restored = searchParamsToSettings(params);

		expect(restored.format).toBe(original.format);
		expect(restored.dateFrom).toBe(original.dateFrom);
		expect(restored.dateTo).toBe(original.dateTo);
		expect(restored.excludeMirrors).toBe(original.excludeMirrors);
		expect(restored.otherMode).toBe(original.otherMode);
		expect(restored.topN).toBe(original.topN);
		// selectedTournamentIds is not round-tripped (filled by FilterPanel)
		expect(restored.selectedTournamentIds).toEqual([]);
	});
});
