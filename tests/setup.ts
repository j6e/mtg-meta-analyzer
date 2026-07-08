import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Mock the build-time data loader so tests never eagerly import the entire
// data/ tree (hundreds of MB of tournament JSON — OOMs local machines).
// One tiny fixture keeps data-derived stores in their normal "populated"
// state (e.g. settingsQueryString emits "" while tournamentList is empty).
vi.mock("../src/lib/data/loader", () => {
	const meta = {
		id: "test-1",
		name: "Setup Fixture Tournament",
		date: "2026-01-01",
		formats: ["Standard"],
		url: "",
		fetchedAt: "",
		playerCount: 0,
		roundCount: 0,
		source: "melee",
		tabletop: true,
	};
	const indexEntry = {
		...meta,
		cleanName: meta.name,
		format: "Standard",
		importance: "other",
		tabletop: true,
		pairings: false,
		path: "2026-01/test-1.json",
	};
	return {
		loadTournaments: () =>
			new Map([["test-1", { meta, players: {}, decklists: {}, rounds: {} }]]),
		loadIndexes: () => new Map([["standard", [indexEntry]]]),
	};
});
