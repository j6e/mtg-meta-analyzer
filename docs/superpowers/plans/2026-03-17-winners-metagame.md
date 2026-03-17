# Winners Metagame Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Field/Winners toggle to the metagame evolution chart that filters to only the top X% of tournament finishers.

**Architecture:** The `computeMetagameEvolution()` function gains a rank-based player filter controlled by new `EvolutionOptions` fields. The component adds a toggle + dropdown. A new return type wraps the existing `EvolutionSeries[]` with an incomplete-data flag for MTGO tournaments.

**Tech Stack:** SvelteKit, Svelte 5 runes, Chart.js, Vitest

**Spec:** `docs/superpowers/specs/2026-03-17-winners-metagame-design.md`

**Tooling:** Use `bun` at `/home/joan-ge/.local/share/mise/installs/bun/latest/bin/bun`. No `node`/`npm`/`npx` on PATH. Tests: `bun vitest run <path>`. Commits need `PATH="/home/joan-ge/.local/share/mise/installs/bun/latest/bin:$PATH"` prefixed to `git commit`.

---

## Chunk 1: Data model and core logic

### Task 1: Add `EvolutionOptions` type and `EvolutionResult` return type

**Files:**
- Modify: `src/lib/utils/metagame-evolution.ts:1-10` (types section)

- [ ] **Step 1: Add the new types at the top of `metagame-evolution.ts`**

After the existing imports and type definitions (after line 14), add:

```ts
export interface EvolutionOptions {
	topN?: number;
	minMetagameShare?: number;
	winnersMode?: boolean;
	winnersCutoff?: number; // 0.10–0.50
}

export interface EvolutionResult {
	series: EvolutionSeries[];
	incompleteData: boolean;
}
```

- [ ] **Step 2: Update `computeMetagameEvolution` signature**

Change the function signature at line 163 from:

```ts
export function computeMetagameEvolution(
	tournaments: TournamentData[],
	playerArchetypes: Map<string, string>,
	periodSize: PeriodSize,
	options: Pick<MatrixOptions, "topN" | "minMetagameShare">,
): EvolutionSeries[] {
```

to:

```ts
export function computeMetagameEvolution(
	tournaments: TournamentData[],
	playerArchetypes: Map<string, string>,
	periodSize: PeriodSize,
	options: EvolutionOptions = {},
): EvolutionResult {
```

Also remove the `MatrixOptions` import at line 2 since it's no longer needed.

- [ ] **Step 3: Update the function body — destructure new options**

Change the destructuring at line 170 from:

```ts
const { topN = 0, minMetagameShare = 0 } = options;
```

to:

```ts
const { topN = 0, minMetagameShare = 0, winnersMode = false, winnersCutoff = 0.25 } = options;
```

- [ ] **Step 4: Add a `shouldIncludePlayer` helper inside the function**

After the destructuring, add:

```ts
let incompleteData = false;

function shouldIncludePlayer(
	player: { rank: number },
	tournament: TournamentData,
): boolean {
	if (!winnersMode) return true;
	const cutoffRank = Math.ceil(tournament.meta.playerCount * winnersCutoff);
	if (cutoffRank > Object.keys(tournament.players).length) {
		incompleteData = true;
	}
	return player.rank <= cutoffRank;
}
```

- [ ] **Step 5: Update the per-period loop to filter by rank**

Change the per-period counting loop (lines 219–237) from iterating with `Object.keys` to `Object.entries`, and add the filter:

```ts
const periodShares: Map<string, number>[] = periods.map((period) => {
	const counts = new Map<string, number>();
	let total = 0;
	const periodTournaments = tournaments.filter(
		(t) => t.meta.date >= period.startDate && t.meta.date <= period.endDate,
	);
	for (const t of periodTournaments) {
		for (const [playerId, player] of Object.entries(t.players)) {
			if (!shouldIncludePlayer(player, t)) continue;
			const rawArch = playerArchetypes.get(playerId);
			if (!rawArch || rawArch === "Unknown") continue;
			const displayArch = otherSet.has(rawArch) ? "Other" : rawArch;
			counts.set(displayArch, (counts.get(displayArch) ?? 0) + 1);
			total++;
		}
	}
	if (total === 0) return new Map<string, number>();
	const shares = new Map<string, number>();
	for (const [name, count] of counts) shares.set(name, count / total);
	return shares;
});
```

Note: the global archetype count loop (lines 180–187) is NOT filtered — it always uses the full field per the spec.

- [ ] **Step 6: Update the return statement to wrap in `EvolutionResult`**

Change the return at lines 245–251 from:

```ts
return seriesNames.map((name) => ({
	name,
	points: periods.map((period, i) => ({
		label: period.label,
		share: emptyPeriods.has(i) ? null : (periodShares[i].get(name) ?? 0),
	})),
}));
```

to:

```ts
return {
	series: seriesNames.map((name) => ({
		name,
		points: periods.map((period, i) => ({
			label: period.label,
			share: emptyPeriods.has(i) ? null : (periodShares[i].get(name) ?? 0),
		})),
	})),
	incompleteData,
};
```

Also update the early return at line 169 from `return [];` to `return { series: [], incompleteData: false };`.

- [ ] **Step 7: Update the JSDoc comment**

Update the JSDoc block above the function (lines 152–162). Change the description of the return type from `EvolutionSeries[]` references to reflect the new `EvolutionResult` wrapper:
- "Returns [] if tournaments is empty." → "Returns `{ series: [], incompleteData: false }` if tournaments is empty."
- Add a note: "When `winnersMode` is true, only players within the top `winnersCutoff` percentile of each tournament contribute to per-period shares. `incompleteData` is true if any tournament's cutoff rank exceeds its available player data."

- [ ] **Step 8: Commit**

```bash
git add src/lib/utils/metagame-evolution.ts
git commit -m "feat(metagame-evolution): add EvolutionOptions and rank-based winners filtering"
```

### Task 2: Update existing tests for new return type

**Files:**
- Modify: `tests/unit/metagame-evolution.test.ts`

- [ ] **Step 1: Update `makeT` helper to accept ranks**

Replace the `makeT` helper (lines 12–43) to support per-player ranks:

```ts
function makeT(
	date: string,
	players: Record<string, string>,
	opts?: { playerCount?: number; ranks?: Record<string, number> },
): TournamentData {
	const ids = Object.keys(players);
	return {
		meta: {
			id: `t-${date}`,
			name: date,
			date,
			formats: ["Standard"],
			url: "",
			fetchedAt: "",
			playerCount: opts?.playerCount ?? ids.length,
			roundCount: 1,
			source: "melee",
			tabletop: true,
		},
		players: Object.fromEntries(
			ids.map((id, i) => [
				id,
				{
					name: id,
					username: id,
					rank: opts?.ranks?.[id] ?? i + 1,
					points: 0,
					matchRecord: "0-0-0",
					decklistIds: [],
					reportedArchetypes: [],
				},
			]),
		),
		decklists: {},
		rounds: {},
	};
}
```

- [ ] **Step 2: Update all existing test assertions to use `.series`**

Every existing call to `computeMetagameEvolution` returns `EvolutionResult` now. Apply these changes to every test in the `computeMetagameEvolution` describe block:

1. **"returns [] for empty tournaments"** (line 182): Destructure and check `series`:
   ```ts
   const { series } = computeMetagameEvolution([], new Map(), "1w", {});
   expect(series).toEqual([]);
   ```

2. **"basic share computation"** (line 185-196): Destructure `{ series }`, then use `series.find(...)` instead of `result.find(...)`.

3. **"empty period → share null"** (line 198-207): Destructure `{ series }`, access `series[0].points`.

4. **"output ordered oldest-to-newest"** (line 209-217): Destructure `{ series }`, access `series[0].points`.

5. **"topN collapsing"** (line 219-227): Destructure `{ series }`, map `series.map(s => s.name)`.

6. **"minMetagameShare collapsing"** (line 229-243): Destructure `{ series }`, map names from `series`.

7. **"global archetype set"** (line 245-261): Destructure `{ series }`, find from `series`.

8. **"excludes Unknown players"** (line 263-274): Destructure `{ series }`, find from `series`.

9. **"date range bounds"** (line 276-283): Destructure `{ series }`, access `series[0].points`.

The pattern for each: replace `const result = computeMetagameEvolution(...)` with `const { series } = computeMetagameEvolution(...)`, then replace `result` with `series` in assertions. For inline calls like `computeMetagameEvolution(...).toEqual([])`, wrap with destructuring.

- [ ] **Step 3: Run tests to verify existing behavior is preserved**

Run: `bun vitest run tests/unit/metagame-evolution.test.ts`
Expected: All existing tests PASS

- [ ] **Step 4: Commit**

```bash
git add tests/unit/metagame-evolution.test.ts
git commit -m "test: update metagame evolution tests for EvolutionResult return type"
```

### Task 3: Write winners mode tests (TDD)

**Files:**
- Modify: `tests/unit/metagame-evolution.test.ts`

- [ ] **Step 1: Write failing tests for winners mode**

Add a new `describe("computeMetagameEvolution — winners mode")` block after the existing tests:

```ts
describe("computeMetagameEvolution — winners mode", () => {
	it("basic filtering: top 25% of 20 players → only top 5 contribute", () => {
		// 20 players, ranks 1-20. Top 10 play A, bottom 10 play B.
		const players: Record<string, string> = {};
		const ranks: Record<string, number> = {};
		for (let i = 1; i <= 20; i++) {
			players[`p${i}`] = i <= 10 ? "A" : "B";
			ranks[`p${i}`] = i;
		}
		const t = makeT("2026-03-11", players, { ranks });
		const archetypes = makeMap(players);
		const { series } = computeMetagameEvolution([t], archetypes, "1w", {
			winnersMode: true,
			winnersCutoff: 0.25,
		});
		// Top 5 (rank 1-5) are all A → A=100%, B=0%
		const a = series.find((s) => s.name === "A")!;
		const b = series.find((s) => s.name === "B")!;
		expect(a.points[0].share).toBeCloseTo(1);
		expect(b.points[0].share).toBe(0);
	});

	it("cross-tournament normalization: each tournament contributes its own top X%", () => {
		// Small tournament: 8 players, top 25% = top 2
		const small: Record<string, string> = {};
		const smallRanks: Record<string, number> = {};
		for (let i = 1; i <= 8; i++) {
			small[`s${i}`] = i <= 2 ? "A" : "B";
			smallRanks[`s${i}`] = i;
		}
		// Large tournament: 200 players, top 25% = top 50
		const large: Record<string, string> = {};
		const largeRanks: Record<string, number> = {};
		for (let i = 1; i <= 200; i++) {
			large[`l${i}`] = i <= 50 ? "B" : "A";
			largeRanks[`l${i}`] = i;
		}
		const t1 = makeT("2026-03-11", small, { ranks: smallRanks });
		const t2 = makeT("2026-03-12", large, { ranks: largeRanks });
		const archetypes = new Map([
			...makeMap(small),
			...makeMap(large),
		]);
		const { series } = computeMetagameEvolution([t1, t2], archetypes, "1w", {
			winnersMode: true,
			winnersCutoff: 0.25,
		});
		// Winners: small top 2 = 2A, large top 50 = 50B → A=2/52, B=50/52
		const a = series.find((s) => s.name === "A")!;
		const b = series.find((s) => s.name === "B")!;
		expect(a.points[0].share).toBeCloseTo(2 / 52);
		expect(b.points[0].share).toBeCloseTo(50 / 52);
	});

	it("rounding: 7 players at 25% → ceil(7*0.25)=2 qualify", () => {
		const players: Record<string, string> = {};
		const ranks: Record<string, number> = {};
		for (let i = 1; i <= 7; i++) {
			players[`p${i}`] = i <= 2 ? "A" : "B";
			ranks[`p${i}`] = i;
		}
		const t = makeT("2026-03-11", players, { ranks });
		const archetypes = makeMap(players);
		const { series } = computeMetagameEvolution([t], archetypes, "1w", {
			winnersMode: true,
			winnersCutoff: 0.25,
		});
		const a = series.find((s) => s.name === "A")!;
		expect(a.points[0].share).toBeCloseTo(1); // both qualifying are A
	});

	it("default behavior: winnersMode false → all players count", () => {
		const players: Record<string, string> = {};
		const ranks: Record<string, number> = {};
		for (let i = 1; i <= 10; i++) {
			players[`p${i}`] = i <= 5 ? "A" : "B";
			ranks[`p${i}`] = i;
		}
		const t = makeT("2026-03-11", players, { ranks });
		const archetypes = makeMap(players);
		const { series } = computeMetagameEvolution([t], archetypes, "1w", {
			winnersMode: false,
		});
		const a = series.find((s) => s.name === "A")!;
		expect(a.points[0].share).toBeCloseTo(0.5); // 5/10
	});

	it("homogeneous field: all same archetype → 100% in both modes", () => {
		const players: Record<string, string> = {};
		const ranks: Record<string, number> = {};
		for (let i = 1; i <= 10; i++) {
			players[`p${i}`] = "A";
			ranks[`p${i}`] = i;
		}
		const t = makeT("2026-03-11", players, { ranks });
		const archetypes = makeMap(players);
		const { series: fieldSeries } = computeMetagameEvolution([t], archetypes, "1w", {});
		const { series: winnersSeries } = computeMetagameEvolution([t], archetypes, "1w", {
			winnersMode: true,
			winnersCutoff: 0.25,
		});
		expect(fieldSeries.find((s) => s.name === "A")!.points[0].share).toBeCloseTo(1);
		expect(winnersSeries.find((s) => s.name === "A")!.points[0].share).toBeCloseTo(1);
	});

	it("incomplete data: cutoff exceeds available players → flag set", () => {
		// playerCount=78 but only 32 players in data. At 50%: ceil(78*0.5)=39 > 32
		const players: Record<string, string> = {};
		const ranks: Record<string, number> = {};
		for (let i = 1; i <= 32; i++) {
			players[`p${i}`] = "A";
			ranks[`p${i}`] = i;
		}
		const t = makeT("2026-03-11", players, { playerCount: 78, ranks });
		const archetypes = makeMap(players);
		const { incompleteData } = computeMetagameEvolution([t], archetypes, "1w", {
			winnersMode: true,
			winnersCutoff: 0.5,
		});
		expect(incompleteData).toBe(true);
	});

	it("incomplete data: cutoff within available players → flag not set", () => {
		// playerCount=78, 32 players in data. At 25%: ceil(78*0.25)=20 <= 32
		const players: Record<string, string> = {};
		const ranks: Record<string, number> = {};
		for (let i = 1; i <= 32; i++) {
			players[`p${i}`] = "A";
			ranks[`p${i}`] = i;
		}
		const t = makeT("2026-03-11", players, { playerCount: 78, ranks });
		const archetypes = makeMap(players);
		const { incompleteData } = computeMetagameEvolution([t], archetypes, "1w", {
			winnersMode: true,
			winnersCutoff: 0.25,
		});
		expect(incompleteData).toBe(false);
	});

	it("tied ranks at boundary: both players with cutoff rank are included", () => {
		// 4 players, ranks 1, 2, 2, 4. Cutoff 50% → ceil(4*0.5)=2. Rank<=2 → 3 players.
		const players: Record<string, string> = { p1: "A", p2: "A", p3: "B", p4: "B" };
		const ranks: Record<string, number> = { p1: 1, p2: 2, p3: 2, p4: 4 };
		const t = makeT("2026-03-11", players, { ranks });
		const archetypes = makeMap(players);
		const { series } = computeMetagameEvolution([t], archetypes, "1w", {
			winnersMode: true,
			winnersCutoff: 0.5,
		});
		// 3 players qualify (rank 1, 2, 2): 2 A + 1 B
		const a = series.find((s) => s.name === "A")!;
		const b = series.find((s) => s.name === "B")!;
		expect(a.points[0].share).toBeCloseTo(2 / 3);
		expect(b.points[0].share).toBeCloseTo(1 / 3);
	});

	it("global archetype set uses full field, not filtered winners", () => {
		// 10 players: 6 play A (ranks 1-6), 4 play B (ranks 7-10)
		// topN=1 from full field → A qualifies, B → Other
		// winners top 50% = ranks 1-5, all A → A=100%, Other=0%
		const players: Record<string, string> = {};
		const ranks: Record<string, number> = {};
		for (let i = 1; i <= 10; i++) {
			players[`p${i}`] = i <= 6 ? "A" : "B";
			ranks[`p${i}`] = i;
		}
		const t = makeT("2026-03-11", players, { ranks });
		const archetypes = makeMap(players);
		const { series } = computeMetagameEvolution([t], archetypes, "1w", {
			topN: 1,
			winnersMode: true,
			winnersCutoff: 0.5,
		});
		const names = series.map((s) => s.name);
		// A is top-1 from full field, B collapsed to Other
		expect(names).toContain("A");
		expect(names).toContain("Other");
		expect(names).not.toContain("B");
	});
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `bun vitest run tests/unit/metagame-evolution.test.ts`
Expected: All tests PASS (both existing and new)

- [ ] **Step 3: Commit**

```bash
git add tests/unit/metagame-evolution.test.ts
git commit -m "test: add winners mode tests for metagame evolution"
```

## Chunk 2: Settings and UI

### Task 4: Add winners mode settings

**Files:**
- Modify: `src/lib/stores/settings.ts`

- [ ] **Step 1: Add `winnersMode` and `winnersCutoff` to `MetaSettings`**

Add two fields to the `MetaSettings` interface after the `minMetagameShare` field (line 24):

```ts
	// Winners mode
	winnersMode: boolean;
	winnersCutoff: number; // 0.10–0.50
```

- [ ] **Step 2: Add defaults to `makeDefaults()`**

Add to the return object in `makeDefaults()` (after `minMetagameShare: 2,`):

```ts
		winnersMode: false,
		winnersCutoff: 0.25,
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/stores/settings.ts
git commit -m "feat(settings): add winnersMode and winnersCutoff settings"
```

### Task 5: Update `MetagameEvolution.svelte` component

**Files:**
- Modify: `src/lib/components/MetagameEvolution.svelte`

- [ ] **Step 1: Update imports and props**

Replace the `MatrixOptions` import (line 13) and update the props type. The component no longer needs `MatrixOptions` — it receives `EvolutionOptions` fields directly. Replace lines 13-34:

```ts
	import type { TournamentData } from '../types/tournament';
	import {
		computeMetagameEvolution,
		type EvolutionSeries,
		type PeriodSize,
	} from '../utils/metagame-evolution';
	import { getScryfallImageUrl } from '../utils/card-normalizer';
	import { settings } from '../stores/settings';

	Chart.register(CategoryScale, Legend, LineController, LineElement, LinearScale, PointElement, Tooltip);

	let {
		tournaments,
		playerArchetypes,
		matrixOptions,
		archetypeCardMap,
	}: {
		tournaments: TournamentData[];
		playerArchetypes: Map<string, string>;
		matrixOptions: { topN?: number; minMetagameShare?: number };
		archetypeCardMap: Map<string, string>;
	} = $props();
```

- [ ] **Step 2: Update the `series` derived to use new return type and settings**

Replace the `series` derived (lines 38-43):

```ts
	const evolutionResult = $derived(
		computeMetagameEvolution(tournaments, playerArchetypes, periodSize, {
			topN: matrixOptions.topN,
			minMetagameShare: matrixOptions.minMetagameShare,
			winnersMode: $settings.winnersMode,
			winnersCutoff: $settings.winnersCutoff,
		}),
	);

	const series = $derived(
		evolutionResult.series.filter((s) => s.name !== 'Other'),
	);
```

- [ ] **Step 3: Add the Field/Winners toggle and cutoff dropdown to the controls**

Replace the controls div (lines 270-280):

```svelte
<div class="controls">
	<span class="label">Period:</span>
	{#each [['1w', '1 week'], ['2w', '2 weeks'], ['1m', '1 month']] as [value, label] (value)}
		<button
			type="button"
			class="period-btn"
			class:active={periodSize === value}
			onclick={() => (periodSize = value as PeriodSize)}
		>{label}</button>
	{/each}

	<span class="separator"></span>

	<span class="label">View:</span>
	<button
		type="button"
		class="period-btn"
		class:active={!$settings.winnersMode}
		onclick={() => ($settings.winnersMode = false)}
	>Field</button>
	<button
		type="button"
		class="period-btn"
		class:active={$settings.winnersMode}
		onclick={() => ($settings.winnersMode = true)}
	>Winners</button>

	{#if $settings.winnersMode}
		<select
			class="cutoff-select"
			value={$settings.winnersCutoff}
			onchange={(e) => ($settings.winnersCutoff = Number(e.currentTarget.value))}
		>
			{#each [0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50] as pct}
				<option value={pct}>{Math.round(pct * 100)}%</option>
			{/each}
		</select>
	{/if}
</div>
```

- [ ] **Step 4: Add chart subtitle and incomplete data warning**

After the `<div class="chart-container">` opening tag (before the `<canvas>`), add:

```svelte
	{#if $settings.winnersMode}
		<span class="chart-subtitle">Top {Math.round($settings.winnersCutoff * 100)}%</span>
	{/if}
```

After the legend's `{#each}` block (before the closing `</div>` of `.legend`), add:

```svelte
	{#if evolutionResult.incompleteData && $settings.winnersMode}
		<span class="legend-warning">
			⚠ Some tournaments have incomplete data for this cutoff
		</span>
	{/if}
```

- [ ] **Step 4b: Fix `$effect` dependency tracking for chart rebuilds**

The existing `$effect` (line 264-267) tracks `series.length` which won't change when toggling Field/Winners if the archetype count stays the same. Replace:

```ts
	$effect(() => {
		void series.length; // track dependency
		if (canvas) buildChart(series);
	});
```

with:

```ts
	$effect(() => {
		const s = series;
		if (canvas) buildChart(s);
	});
```

This ensures Svelte 5 tracks the full `series` derived as a dependency, not just the length primitive.

- [ ] **Step 5: Add CSS for new elements**

Add these styles inside the `<style>` block:

```css
	.separator {
		width: 1px;
		height: 1.2rem;
		background: var(--color-border);
		margin: 0 0.4rem;
	}

	.cutoff-select {
		padding: 0.15rem 0.4rem;
		border-radius: 9999px;
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		font-size: 0.8rem;
		color: var(--color-text);
		cursor: pointer;
	}

	.chart-subtitle {
		display: block;
		font-size: 0.8rem;
		color: var(--color-text-muted);
		margin-bottom: 0.5rem;
	}

	.legend-warning {
		font-size: 0.75rem;
		color: var(--color-warning, #b45309);
		font-style: italic;
	}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/MetagameEvolution.svelte
git commit -m "feat(ui): add Field/Winners toggle and cutoff dropdown to evolution chart"
```

### Task 6: Update page component to not pass `MatrixOptions` type

**Files:**
- Modify: `src/routes/metagame/+page.svelte`

- [ ] **Step 1: Verify the page still compiles**

The page passes `matrixOptions={matrixOpts}` to `MetagameEvolution`. Since we changed the prop type from `MatrixOptions` to `{ topN?: number; minMetagameShare?: number }`, the existing `matrixOpts` object (which has those fields plus extras) is still compatible — no change needed to the page. Verify with a build:

Run: `bun run build`
Expected: Build succeeds with no type errors

- [ ] **Step 2: Run the full test suite**

Run: `bun vitest run`
Expected: All tests pass

- [ ] **Step 3: Commit if any fixes were needed**

Only commit if changes were required. Otherwise skip.

### Task 7: Manual verification

- [ ] **Step 1: Start dev server and verify**

Run: `bun run dev`

Verify in browser:
1. Navigate to the metagame page
2. Period selector still works as before
3. "Field" button is active by default — chart looks the same as before
4. Click "Winners" — cutoff dropdown appears, defaulting to 25%
5. Chart updates to show winners-only metagame shares
6. Change cutoff to 10% — chart shows more concentrated top decks
7. Change cutoff to 50% — chart looks closer to the field view
8. Switch back to "Field" — dropdown disappears, chart returns to baseline
9. For Standard format (which has MTGO data), check if the incomplete data warning appears at higher cutoff percentages
