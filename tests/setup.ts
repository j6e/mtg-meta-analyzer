import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Mock the data loader so tests neither bundle the real per-format indexes
// nor hit the network for tournament data. One tiny fixture keeps
// data-derived stores in their normal "populated" state (e.g.
// settingsQueryString emits "" while tournamentList is empty).
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
		matchCount: 0,
		importance: "other",
		tabletop: true,
		pairings: false,
		path: "2026-01/test-1.json",
	};
	return {
		loadIndexes: () => new Map([["standard", [indexEntry]]]),
		fetchFormatTournaments: () =>
			Promise.resolve([{ meta, players: {}, decklists: {}, rounds: {} }]),
	};
});
