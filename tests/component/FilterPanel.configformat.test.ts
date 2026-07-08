// @vitest-environment jsdom
//
// Regression: the left-panel "Archetype config" dropdown must key off the format
// declared in the config's YAML (the field the user actually edits), not a stale
// separate metadata field. Previously a config whose YAML said `format: Premodern`
// was hidden because its metadata format defaulted to "Standard".

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TournamentListEntry } from "../../src/lib/stores/tournaments";

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
	};
});

import FilterPanel from "../../src/lib/components/FilterPanel.svelte";
import {
	saveConfig,
	savedConfigs,
	setActiveConfig,
} from "../../src/lib/stores/archetype-configs";
import { resetSettings, settings } from "../../src/lib/stores/settings";

const premodernTournament: TournamentListEntry = {
	id: "mtgo-pm-1",
	name: "Premodern Challenge",
	cleanName: "Premodern Challenge",
	importance: "other",
	date: "2026-06-01",
	formats: ["Premodern"],
	url: "",
	playerCount: 64,
	roundCount: 8,
	source: "mtgo",
	tabletop: false,
	matchCount: 56,
};

afterEach(() => cleanup());
beforeEach(() => {
	localStorage.clear();
	savedConfigs.set([]);
	resetSettings();
	settings.update((s) => ({
		...s,
		format: "Premodern",
		dateFrom: "2026-01-01",
		dateTo: "2026-12-31",
	}));
	mockTournamentList.set([premodernTournament]);
	mockAvailableFormats.set(["Premodern", "Standard"]);
});

/** The "Archetype config" select is the one whose options include "Built-in:". */
function configOptionLabels(container: HTMLElement): string[] {
	const select = [...container.querySelectorAll("select")].find((s) =>
		[...s.options].some((o) => o.textContent?.includes("Built-in:")),
	);
	if (!select) throw new Error("Archetype config select not found");
	return [...select.options].map((o) => o.textContent ?? "");
}

describe("FilterPanel archetype-config dropdown keys off YAML format", () => {
	it("shows a config whose YAML declares the current format, even if its metadata field is stale", () => {
		// Mimics the editor before the fix: metadata format defaulted to "Standard",
		// but the user wrote `format: Premodern` in the YAML they edited.
		const id = saveConfig(
			"My PM Brew",
			"Standard",
			"format: Premodern\narchetypes: []\n",
		);
		setActiveConfig(id);
		const { container } = render(FilterPanel);
		expect(configOptionLabels(container).some((l) => l.includes("My PM Brew"))).toBe(
			true,
		);
	});

	it("hides a config whose YAML declares a different format", () => {
		saveConfig("My Modern Brew", "Premodern", "format: Modern\narchetypes: []\n");
		const { container } = render(FilterPanel);
		expect(
			configOptionLabels(container).some((l) => l.includes("My Modern Brew")),
		).toBe(false);
	});
});
