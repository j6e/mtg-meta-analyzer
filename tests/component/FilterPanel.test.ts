// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { get } from "svelte/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TournamentListEntry } from "../../src/lib/stores/tournaments";

// vi.hoisted ensures these are initialised before the hoisted vi.mock factory runs
const { mockTournamentList, mockAvailableFormats } = vi.hoisted(() => {
	const { writable } = require("svelte/store");
	return {
		mockTournamentList: writable([]),
		mockAvailableFormats: writable([]),
	};
});

vi.mock("../../src/lib/stores/tournaments", () => {
	const { writable } = require("svelte/store");
	return {
		tournamentList: mockTournamentList,
		availableFormats: mockAvailableFormats,
		filteredTournaments: writable([]),
		archetypeCardMap: writable(new Map()),
		classificationResults: writable(new Map()),
		playerArchetypes: writable(new Map()),
		metagameData: writable(null),
		archetypeStats: writable([]),
		attributionMatrix: writable(null),
	};
});

import FilterPanel from "../../src/lib/components/FilterPanel.svelte";
import { resetSettings, settings } from "../../src/lib/stores/settings";

afterEach(() => cleanup());
beforeEach(() => {
	resetSettings();
	// Widen date range to include sample tournament dates
	settings.update((s) => ({ ...s, dateFrom: "2025-01-01", dateTo: "2025-12-31" }));
	mockTournamentList.set(sampleTournaments);
	mockAvailableFormats.set(sampleFormats);
});

const sampleTournaments: TournamentListEntry[] = [
	{
		id: "melee-1",
		name: "Tournament A",
		cleanName: "Tournament A",
		importance: "other",
		date: "2025-06-01",
		formats: ["Standard"],
		url: "",
		fetchedAt: "",
		playerCount: 100,
		roundCount: 8,
		source: "melee",
		tabletop: true,
		matchCount: 56,
	},
	{
		id: "melee-2",
		name: "Tournament B",
		cleanName: "Tournament B",
		importance: "other",
		date: "2025-07-15",
		formats: ["Standard", "Draft"],
		url: "",
		fetchedAt: "",
		playerCount: 200,
		roundCount: 12,
		source: "melee",
		tabletop: true,
		matchCount: 132,
	},
];

const sampleFormats = ["Draft", "Standard"];

describe("FilterPanel component", () => {
	it("renders the filter panel", () => {
		mockTournamentList.set(sampleTournaments);
		mockAvailableFormats.set(sampleFormats);
		const { container } = render(FilterPanel);
		expect(container.querySelector('[data-testid="filter-panel"]')).toBeTruthy();
	});

	it("shows format options", () => {
		mockTournamentList.set(sampleTournaments);
		mockAvailableFormats.set(sampleFormats);
		const { container } = render(FilterPanel);
		const options = container.querySelectorAll("select option");
		const labels = [...options].map((o) => o.textContent);
		expect(labels).not.toContain("All formats");
		expect(labels).toContain("Standard");
		expect(labels).toContain("Draft");
	});

	it("shows date range inputs", () => {
		mockTournamentList.set(sampleTournaments);
		mockAvailableFormats.set(sampleFormats);
		const { container } = render(FilterPanel);
		const dateInputs = container.querySelectorAll('input[type="date"]');
		expect(dateInputs.length).toBe(2);
	});

	it("lists all tournaments with checkboxes", () => {
		mockTournamentList.set(sampleTournaments);
		mockAvailableFormats.set(sampleFormats);
		const { container } = render(FilterPanel);
		const checks = container.querySelectorAll(".tournament-check");
		expect(checks.length).toBe(2);
		expect(checks[0].textContent).toContain("Tournament A");
		expect(checks[1].textContent).toContain("Tournament B");
	});

	it("shows mirror match toggle", () => {
		mockTournamentList.set(sampleTournaments);
		mockAvailableFormats.set(sampleFormats);
		const { container } = render(FilterPanel);
		const checkboxes = container.querySelectorAll('.toggle input[type="checkbox"]');
		// Two toggles: "Exclude mirror matches" and "Use self-reported archetypes"
		expect(checkboxes.length).toBe(2);
	});

	it('shows "Other" threshold radio buttons', () => {
		mockTournamentList.set(sampleTournaments);
		mockAvailableFormats.set(sampleFormats);
		const { container } = render(FilterPanel);
		const radios = container.querySelectorAll('input[type="radio"]');
		expect(radios.length).toBe(2);
	});

	it("updates settings store when format changes", async () => {
		mockTournamentList.set(sampleTournaments);
		mockAvailableFormats.set(sampleFormats);
		const { container } = render(FilterPanel);
		const select = container.querySelector("select")!;
		await fireEvent.change(select, { target: { value: "Standard" } });
		expect(get(settings).format).toBe("Standard");
	});

	it("updates settings store when mirror toggle changes", async () => {
		mockTournamentList.set(sampleTournaments);
		mockAvailableFormats.set(sampleFormats);
		const { container } = render(FilterPanel);
		const toggles = container.querySelectorAll('.toggle input[type="checkbox"]');
		const mirrorToggle = toggles[0] as HTMLInputElement;
		// Default is checked (excludeMirrors: true)
		expect(mirrorToggle.checked).toBe(true);
		await fireEvent.click(mirrorToggle);
		expect(get(settings).excludeMirrors).toBe(false);
	});

	it("shows Top N input when topN mode selected", () => {
		mockTournamentList.set(sampleTournaments);
		mockAvailableFormats.set(sampleFormats);
		const { container } = render(FilterPanel);
		const numberInput = container.querySelector(
			'.threshold-input input[type="number"]',
		);
		expect(numberInput).toBeTruthy();
		// Default mode is topN, so should show "archetypes" label
		expect(container.textContent).toContain("archetypes");
	});
});
