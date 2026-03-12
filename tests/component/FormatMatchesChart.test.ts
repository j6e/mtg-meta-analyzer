// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import FormatMatchesChart from "../../src/lib/components/FormatMatchesChart.svelte";
import type { TournamentListEntry } from "../../src/lib/stores/tournaments";

afterEach(() => cleanup());

function entry(
	id: string,
	format: string,
	date: string,
	matchCount: number,
): TournamentListEntry {
	return {
		id,
		name: id,
		cleanName: id,
		date,
		formats: [format],
		url: "",
		fetchedAt: "",
		playerCount: 10,
		roundCount: 3,
		matchCount,
		source: "melee" as const,
		tabletop: true,
		importance: "other" as const,
	};
}

const tournaments: TournamentListEntry[] = [
	entry("t1", "Standard", "2026-03-01", 100),
	entry("t2", "Standard", "2026-03-05", 200),
	entry("t3", "Modern", "2026-03-02", 150),
	entry("t4", "Pauper", "2026-03-03", 50),
];

describe("FormatMatchesChart", () => {
	it("renders a bar for each format in date range", () => {
		const { container } = render(FormatMatchesChart, {
			props: {
				tournaments,
				format: "Standard",
				dateFrom: "2026-03-01",
				dateTo: "2026-03-10",
				selectedIds: ["t1", "t2", "t3", "t4"],
			},
		});
		const bars = container.querySelectorAll(".bar-col");
		expect(bars).toHaveLength(3);
	});

	it("shows labels for each format", () => {
		const { container } = render(FormatMatchesChart, {
			props: {
				tournaments,
				format: "Standard",
				dateFrom: "2026-03-01",
				dateTo: "2026-03-10",
				selectedIds: ["t1", "t2", "t3", "t4"],
			},
		});
		const labels = container.querySelectorAll(".bar-label");
		const texts = [...labels].map((l) => l.textContent);
		expect(texts).toContain("Standard");
		expect(texts).toContain("Modern");
		expect(texts).toContain("Pauper");
	});

	it("highlights active format label", () => {
		const { container } = render(FormatMatchesChart, {
			props: {
				tournaments,
				format: "Standard",
				dateFrom: "2026-03-01",
				dateTo: "2026-03-10",
				selectedIds: ["t1", "t2", "t3", "t4"],
			},
		});
		const activeLabels = container.querySelectorAll(".bar-label.active");
		expect(activeLabels).toHaveLength(1);
		expect(activeLabels[0].textContent).toBe("Standard");
	});

	it("shows excluded segment when tournaments are deselected", () => {
		const { container } = render(FormatMatchesChart, {
			props: {
				tournaments,
				format: "Standard",
				dateFrom: "2026-03-01",
				dateTo: "2026-03-10",
				selectedIds: ["t1", "t3", "t4"], // t2 (Standard, 200 matches) excluded
			},
		});
		const excluded = container.querySelectorAll(".bar-excluded");
		const selected = container.querySelectorAll(".bar-selected");
		expect(excluded).toHaveLength(1);
		expect(selected).toHaveLength(1);
	});

	it("shows no excluded segment when all format tournaments are selected", () => {
		const { container } = render(FormatMatchesChart, {
			props: {
				tournaments,
				format: "Standard",
				dateFrom: "2026-03-01",
				dateTo: "2026-03-10",
				selectedIds: ["t1", "t2", "t3", "t4"],
			},
		});
		const excluded = container.querySelectorAll(".bar-excluded");
		expect(excluded).toHaveLength(0);
	});

	it("shows legend only when there are excluded matches", () => {
		const { container: withExcluded } = render(FormatMatchesChart, {
			props: {
				tournaments,
				format: "Standard",
				dateFrom: "2026-03-01",
				dateTo: "2026-03-10",
				selectedIds: ["t1"],
			},
		});
		expect(withExcluded.querySelector(".legend")).not.toBeNull();

		cleanup();

		const { container: withoutExcluded } = render(FormatMatchesChart, {
			props: {
				tournaments,
				format: "Standard",
				dateFrom: "2026-03-01",
				dateTo: "2026-03-10",
				selectedIds: ["t1", "t2"],
			},
		});
		expect(withoutExcluded.querySelector(".legend")).toBeNull();
	});

	it("shows empty message when no tournaments in range", () => {
		const { container } = render(FormatMatchesChart, {
			props: {
				tournaments,
				format: "Standard",
				dateFrom: "2025-01-01",
				dateTo: "2025-01-10",
				selectedIds: [],
			},
		});
		expect(container.querySelector(".empty")).not.toBeNull();
		expect(container.querySelector(".bars")).toBeNull();
	});

	it("renders non-active format bars as inactive", () => {
		const { container } = render(FormatMatchesChart, {
			props: {
				tournaments,
				format: "Standard",
				dateFrom: "2026-03-01",
				dateTo: "2026-03-10",
				selectedIds: ["t1", "t2", "t3", "t4"],
			},
		});
		const inactive = container.querySelectorAll(".bar-inactive");
		expect(inactive).toHaveLength(2); // Modern + Pauper
	});
});
