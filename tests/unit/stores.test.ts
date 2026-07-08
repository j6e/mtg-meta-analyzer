import { derived, get, writable } from "svelte/store";
import { describe, expect, it } from "vitest";
import { resetSettings, settings } from "../../src/lib/stores/settings";
import {
	availableFormats,
	ensureFormatLoaded,
	filteredTournaments,
	tournamentList,
} from "../../src/lib/stores/tournaments";

describe("settings store", () => {
	it("has correct defaults", () => {
		resetSettings();
		const s = get(settings);
		expect(s.excludeMirrors).toBe(true);
		expect(s.topN).toBe(0);

		expect(s.format).toBe("Standard");
		expect(s.dateFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(s.dateTo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(s.selectedTournamentIds).toEqual([]);
		expect(s.otherMode).toBe("minShare");
		expect(s.minMetagameShare).toBe(2);
	});

	it("can update individual settings", () => {
		resetSettings();
		settings.update((s) => ({
			...s,
			excludeMirrors: false,
			topN: 5,
			format: "Standard",
		}));
		const s = get(settings);
		expect(s.excludeMirrors).toBe(false);
		expect(s.topN).toBe(5);
		expect(s.format).toBe("Standard");
	});

	it("can update tournament filters", () => {
		resetSettings();
		settings.update((s) => ({
			...s,
			dateFrom: "2025-01-01",
			dateTo: "2025-12-31",
			selectedTournamentIds: ["melee-123", "melee-456"],
		}));
		const s = get(settings);
		expect(s.dateFrom).toBe("2025-01-01");
		expect(s.dateTo).toBe("2025-12-31");
		expect(s.selectedTournamentIds).toEqual(["melee-123", "melee-456"]);
	});

	it("can switch other mode", () => {
		resetSettings();
		settings.update((s) => ({ ...s, otherMode: "topN", minMetagameShare: 5 }));
		const s = get(settings);
		expect(s.otherMode).toBe("topN");
		expect(s.minMetagameShare).toBe(5);
	});

	it("resets to defaults", () => {
		settings.update((s) => ({
			...s,
			excludeMirrors: false,
			topN: 10,

			format: "Standard",
			dateFrom: "2025-01-01",
			selectedTournamentIds: ["melee-123"],
			otherMode: "topN" as const,
			minMetagameShare: 5,
		}));
		resetSettings();
		const s = get(settings);
		expect(s.excludeMirrors).toBe(true);
		expect(s.topN).toBe(0);

		expect(s.format).toBe("Standard");
		expect(s.selectedTournamentIds).toEqual([]);
		expect(s.otherMode).toBe("minShare");
	});
});

describe("lazy tournament loading", () => {
	// tests/setup.ts mocks the loader: index fixture has one Standard entry
	// ("test-1") and fetchFormatTournaments resolves its full data.

	it("exposes the catalog synchronously from the bundled indexes", () => {
		expect(get(tournamentList).map((t) => t.id)).toEqual(["test-1"]);
		expect(get(availableFormats)).toEqual(["Standard"]);
	});

	it("populates filteredTournaments once the format is loaded", async () => {
		resetSettings();
		settings.update((s) => ({
			...s,
			format: "Standard",
			dateFrom: "2026-01-01",
			dateTo: "2026-12-31",
			selectedTournamentIds: ["test-1"],
		}));
		expect(get(filteredTournaments)).toEqual([]);
		await ensureFormatLoaded("Standard");
		expect(get(filteredTournaments).map((t) => t.meta.id)).toEqual(["test-1"]);
		resetSettings();
	});

	it("is a no-op for formats without indexed data", async () => {
		await expect(ensureFormatLoaded("Vintage")).resolves.toBeUndefined();
	});
});

describe("derived store reactivity", () => {
	it("derived stores update when source changes", () => {
		const source = writable(1);
		const doubled = derived(source, ($s) => $s * 2);

		expect(get(doubled)).toBe(2);
		source.set(5);
		expect(get(doubled)).toBe(10);
	});

	it("multi-source derived stores react to any input change", () => {
		const a = writable(2);
		const b = writable(3);
		const sum = derived([a, b], ([$a, $b]) => $a + $b);

		expect(get(sum)).toBe(5);
		a.set(10);
		expect(get(sum)).toBe(13);
		b.set(7);
		expect(get(sum)).toBe(17);
	});
});
