# Plan: Per-format lazy loading of tournament data

> Status: **IMPLEMENTED** (2026-07-08, branch `worktree-per-format-lazy-loading`) —
> pending Joan's build + preview verification (step 7 checklist below).
> Deviations from the plan as written: the dev-server middleware of D2 turned out
> to be unnecessary and harmful (Vite already serves `/data/*` raw in dev; the
> middleware broke the module imports of the bundled indexes), so the plugin is
> build-only; `formatSlug` lives in `src/lib/utils/format-slug.ts` instead of
> `loader.ts` (the module-wide loader mock in tests/setup.ts would hide it);
> plus a chart-teardown fix in MetagameScatter/MetagameEvolution (format
> switches now unmount charts while card art is loading).
> Date: 2026-07-08. Branch: `worktree-per-format-lazy-loading` (rebased onto `master` @ `f46b663`).
> Context: follow-up to `docs/build-memory-investigation.md` (build OOM root cause).
> Prep already merged on master: `adbe437` (unused `global*` stores) and `f46b663`
> (unused single-tournament store chain) — the store surface below reflects that.

## Goal

Stop bundling ~273 MB of tournament JSON into the client bundle
(`import.meta.glob(..., { eager: true })` in `src/lib/data/loader.ts`). Instead,
serve tournament files as static assets and fetch **only the selected format's
data** at runtime.

What this buys:

- **Build OOM: fixed permanently.** Rollup never sees tournament JSON; build
  memory stops depending on dataset size. The `NODE_OPTIONS=--max-old-space-size=8192`
  workaround in `deploy.yml` can be dropped.
- **Client payload: bounded by one format.** Worst case today: Standard ≈ 96 MB
  raw → **~7 MB gzipped** over the wire (GitHub Pages compresses). Pauper ≈ 1 MB,
  Modern ≈ 3 MB. Today every visitor downloads all 273 MB as part of the JS bundle.
- **Interactivity: unchanged.** The browser still receives raw decklists for the
  loaded format, so live classification, the archetype editor, matrix toggles,
  filters etc. all keep working exactly as now (this is what ruled out the
  precompute approach, "Enfoque B", in the investigation doc).

The one unavoidable cost (see investigation doc §4): with `ssr = false`, data
outside the bundle can only arrive via `fetch`, so raw tournament data becomes
**async** and pages need a (brief) loading state.

## Key facts from investigation (2026-07-08)

- Dataset: 8 formats, 91–352 tournament files each (1,533 total), 13–96 MB per
  format raw, **1–7 MB gzipped**.
- `data/{format}/index.json` (~564 KB total for all 8) already contains, per
  entry: `id, name, cleanName, date, format, source, url, playerCount,
  roundCount, importance, tabletop, pairings, path`. The **`path`** field
  (e.g. `"2026-07/melee-436111.json"`, relative to the format dir) is written by
  all generators but **consumed nowhere** — it is the ready-made fetch key.
  **`matchCount` is missing** (today computed at runtime from full data).
- Two catalog stores are `derived([], …)` — they compute **once at module
  init and never re-emit** (`tournamentList` and `availableFormats` in
  `src/lib/stores/tournaments.ts`). Under
  lazy loading they'd silently stay empty forever unless repointed. This is the
  main trap of the refactor.
- `FilterPanel.svelte` is the **only** place that populates
  `settings.selectedTournamentIds` (onMount + every filter/format handler), and
  it computes the selection **synchronously from `tournamentList`**. If
  `tournamentList` stayed synchronous, none of that timing needs re-plumbing.
  → This drives decision D3 below.
- Format display name → directory slug mapping already exists:
  `builtinConfigId()` in `src/lib/stores/archetype-configs.ts:27-29`
  (`toLowerCase().replace(/\s+/g, "-")`, handles "Duel Commander" → `duel-commander`).
- Base path: prod serves under `/mtg-meta-analyzer` (`BASE_PATH` in deploy.yml);
  dev serves at `""`. **Every fetch URL must be prefixed with `base` from
  `$app/paths`** — hardcoded `/data/...` works in dev and 404s only in prod.
- Nothing serves `/data/**` over HTTP today: `server.fs.allow: ["data"]` in
  `vite.config.ts` only whitelists module resolution for the globs, it is not a
  static mount. `static/` contains only `.nojekyll` + `robots.txt`.
- Every data-consuming page is format-scoped via `filteredTournaments` and
  already guards on empty data (no crashes; they show empty states).
- Only `FilterPanel` and `MetagameScatter` import tournament stores directly;
  every other component receives data via props. The reactive surface to fix is
  concentrated in `stores/tournaments.ts` + `FilterPanel`.
- Tests: `tests/setup.ts` mocks `$lib/data/loader` module-wide (prevents test
  OOM); FilterPanel component tests already mock `tournamentList` /
  `availableFormats` as writables — aligned with this refactor.
- GitHub Pages artifact limit is 1 GB; 273 MB of static data fits comfortably
  (and the artifact *shrinks* vs. today's JSON-embedded-in-JS bundle). Long-term
  growth toward that cap is a separate, distant problem.

## Design decisions

### D1. Fetch granularity: per-tournament files (using `index.path`)

Fetch each tournament JSON individually, driven by the format's index entries,
with bounded concurrency (e.g. 24 in flight), then commit results to the store
in **one batched update** (a single store `set` — critical so KNN classification
and matrix derivations recompute once, not 352 times).

- Pros: zero new build artifacts; uses the existing (currently dead) `path`
  field; per-file HTTP caching is perfect (tournament files are immutable once
  written — only `index.json` changes daily).
- Cons: 91–352 requests per format. Over HTTP/2 on Pages/Fastly this is a few
  seconds for the worst format; acceptable for a v1.
- Alternatives considered:
  - *Per-format bundle* (one `all.json` per format, built at deploy): 1 request,
    but needs a new streaming build step, and the daily data commit invalidates
    the whole bundle → every returning visitor re-downloads 7 MB.
  - *Per-month bundles* (`data/{format}/{year-month}.json`): best of both
    (~15 requests, past months immutable/cacheable). **Deferred as follow-up** —
    only worth the extra tooling if per-file proves slow in practice.

### D2. Serving `/data/**`: small custom Vite plugin, data stays at repo root

A ~30-line plugin in `vite.config.ts`:

- **dev**: `configureServer` middleware that serves `GET /data/*` from the repo
  `data/` dir (with `.json` content-type; Vite handles the rest).
- **build**: `closeBundle` hook copies `data/` → `build/data/` (recursive copy;
  a few seconds for 273 MB, negligible in CI).

Alternatives considered:

- *Move `data/` under `static/`*: works with zero plugin code, but changes the
  data path for every fetch script, workflow, `rebuild-index.ts` and doc —
  large blast radius for no functional gain.
- *Symlink `static/data → ../data`*: adapter-static / `fs.cp` symlink handling
  is unreliable; rejected as fragile.

### D3. Per-format indexes stay eagerly bundled (synchronous)

Keep the `import.meta.glob("/data/*/index.json", { eager: true })` import.
Rationale:

- It's ~564 KB raw (small once gzipped in the bundle) — not a build-memory or
  payload problem.
- It keeps `tournamentList` / `availableFormats` **synchronous at startup**,
  which means FilterPanel's existing onMount auto-selection and all its
  handlers keep working *unchanged* — the biggest timing risk of the refactor
  disappears. Only heavy per-tournament data (players/decklists/rounds)
  becomes async.
- Growth: index grows ~370 bytes/tournament (~0.4 MB/yr at current pace). If it
  ever matters, switching indexes to fetched-at-startup is a small follow-up
  (it would reintroduce the auto-select timing question, so not done now).

Consequence — two small semantic changes when `tournamentList` derives from the
index instead of full data:

- `availableFormats` becomes "the 8 indexed formats" instead of "every format
  string appearing in any tournament's `meta.formats`". Secondary formats of
  multi-format events (e.g. a "Standard, Draft" event) disappear from the
  dropdown. Since no per-format data exists for those anyway, this is arguably
  a fix, not a regression.
- `TournamentListEntry` gets its fields from the index (`formats` becomes
  `[entry.format]`; `fetchedAt` is dropped — it has no list consumers).

### D4. Add `matchCount` to the index schema

Needed so the tournaments list page, `FormatMatchesChart` and FilterPanel's
match-count summary render without fetching full data. `matchCount` =
`Σ rounds[*].matches.length`. Written in all five index-entry producers (see
step 2); backfilled once via `rebuild-index.ts`.

## Implementation steps

Each step is a separate commit and leaves the app working (the switch-over
happens in step 4). Prep (removal of the dead `global*` and single-tournament
store chains) is already merged on master (`adbe437`, `f46b663`).

### 1. Add `matchCount` to the index

- `src/lib/types/tournament.ts` (~line 71): add `matchCount: number` to
  `TournamentIndexEntry`.
- Add it at every entry construction site (each has the full tournament object
  in scope): `scripts/rebuild-index.ts` (~line 77), `scripts/fetch-mtgo.ts`
  (~line 200), `scripts/fetch-videre.ts` (~line 208), `scripts/fetch-tournament.ts`
  (~line 297), `scripts/migrate-tournaments.ts` (~line 79). Extract a tiny
  `countMatches(rounds)` helper in `scripts/lib/index-utils.ts` to avoid five
  copies.
- Backfill: `bun run scripts/rebuild-index.ts` (all formats), verifying manual
  `cleanName`/`importance` overrides survive (the script preserves them —
  spot-check diff before committing).
- Update the fixture index entry in `tests/setup.ts`.
- Verify: `git diff data/*/index.json` shows only added `matchCount` fields
  (+ key order); tests green.

### 2. Vite plugin: serve `data/` in dev, copy into `build/` at build

- `vite.config.ts`: inline `serveDataPlugin()` — dev middleware for
  `${base}/data/*` → repo `data/`; `closeBundle` copy `data/` → `build/data`
  (client build only, skip during the SSR pass).
- Keep `server.fs.allow: ["data"]` (still needed by the index + YAML globs).
- Verify: `bun run dev` → `curl localhost:5173/data/pauper/index.json` returns
  JSON; build verification deferred to step 7.

### 3. Loader: replace eager tournament glob with fetch functions

Rewrite `src/lib/data/loader.ts`:

- **Remove** the `/data/*/*/*.json` eager glob (the OOM cause).
- **Keep** `loadIndexes()` (eager index glob, per D3).
- **Add**:
  - `formatSlug(format: string): string` — extracted/shared with
    `builtinConfigId` in `archetype-configs.ts`.
  - `fetchFormatTournaments(slug, entries, { concurrency = 24 }): Promise<TournamentData[]>`
    — fetches `` `${base}/data/${slug}/${entry.path}` `` for each index entry
    with bounded concurrency; skips (with `console.warn`) individual failures
    rather than failing the whole format.
- Unit-test `fetchFormatTournaments` + `formatSlug` with a mocked `fetch`
  (new `tests/unit/loader.test.ts`).

### 4. Store: reactive `allTournaments` + `ensureFormatLoaded`

`src/lib/stores/tournaments.ts`:

- `const loadedTournaments = writable<Map<string, TournamentData>>(new Map())`
  replaces the module-level `allTournaments` Map.
- Repoint (this fixes the `derived([])` compute-once trap):
  - `tournamentList` → derive from `allIndexes` only (uses `matchCount`,
    `cleanName`, `importance` from index; `formats: [entry.format]`). Synchronous.
  - `availableFormats` → derive from `allIndexes` (sorted unique
    `entry.format` display names).
  - `filteredTournaments` → `derived([settings, loadedTournaments], …)` (add
    the missing reactive dependency; filter logic unchanged).
  - Everything downstream (`classificationResults`, `playerArchetypes`,
    `metagameData`, `archetypeStats`, `attributionMatrix`, `archetypeCardMap`)
    already derives from `filteredTournaments` — inherits reactivity untouched.
- Add load-state tracking + trigger:
  - `const formatLoadState = writable<Map<string, "loading" | "loaded" | "error">>()`
  - `export async function ensureFormatLoaded(format: string)` — no-op if the
    slug is already loading/loaded; otherwise fetch via
    `fetchFormatTournaments` and merge results into `loadedTournaments` with a
    **single** `update` call.
  - `export const isCurrentFormatLoading = derived([settings, formatLoadState], …)`
    for the UI.

### 5. Trigger + loading UX

- `src/routes/+layout.svelte`: `$effect(() => ensureFormatLoaded($settings.format))`
  — the layout wraps every route and `settings.format` is already initialized
  from the URL before children mount, so this single hook covers all pages,
  including format switches from FilterPanel.
- Minimal loading states (only where "empty" currently renders a misleading
  message): metagame page (`"No data available"` → spinner/­"Loading {format}
  data…" while `isCurrentFormatLoading`), tournaments page, archetypes page.
  Existing empty-state guards stay as fallbacks. No skeleton framework, no new
  components beyond (possibly) one tiny `LoadingNotice.svelte`.

### 6. Tests

- `tests/setup.ts`: keep mocking `$lib/data/loader`, now with the new surface —
  `loadIndexes()` → same fixture map; `fetchFormatTournaments()` → resolves the
  fixture tournament. Keep the fixture non-empty (prevents the 2026-07-08 OOM
  regression and keeps `settingsQueryString` behavior stable).
- `tests/unit/stores.test.ts`: adapt to async population (populate via the
  mocked fetch + `ensureFormatLoaded`, or set the writable directly).
- FilterPanel component tests: already mock catalog stores as writables —
  expected to pass with at most mock-shape tweaks.
- New: `tests/unit/loader.test.ts` (step 3).
- Verify: full `bun run test` green.

### 7. CI/deploy cleanup + end-to-end verification

- `.github/workflows/deploy.yml`: drop `NODE_OPTIONS: --max-old-space-size=8192`.
- Verification (build executed by Joan, not automated here):
  1. `bun run build` — must succeed **without** `NODE_OPTIONS`, on default heap.
  2. `build/data/` exists and `build/` JS chunks contain no tournament JSON
     (sanity: `du -sh build/_app` should drop from hundreds of MB to a few MB).
  3. `bun run preview` → pick each format, confirm metagame/archetypes/
     tournaments/archetype-cleaner render after load; confirm network tab shows
     only the picked format's files; confirm deep links with query params
     (`?format=…&exclude=…`) still restore state.
  4. Optional: `bun run test:e2e` locally.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| `derived([])` stores silently stay empty | Step 5 repoints them explicitly; component tests + preview walkthrough cover it |
| Hardcoded `/data/` URL works in dev, 404s in prod (base path) | Single URL-builder in `loader.ts` using `base` from `$app/paths`; preview check with `BASE_PATH` set if wanted |
| Per-arrival store updates re-trigger KNN classification 352× | Single batched `update` per format in `ensureFormatLoaded` |
| FilterPanel auto-select races async data | Avoided by design: selection derives from the still-synchronous index-based `tournamentList` (D3) |
| `rebuild-index.ts` backfill clobbers manual `cleanName`/`importance` overrides | Script preserves them by design; diff reviewed before committing |
| Fetch of one corrupt/missing file breaks a format | Per-file try/catch in `fetchFormatTournaments`, warn + continue |
| Multi-format events lose secondary format in dropdown (D3) | Accepted; no per-format data exists for those formats anyway — noted here for the record |

## Out of scope / follow-ups (not in this change)

- **Per-month bundles** or date-range-scoped fetching (only fetch tournaments
  inside the active date filter) — natural next step if load times bother.
- Fetching indexes at runtime instead of bundling them (only if index size ever
  matters; reopens auto-select timing).
- Restoring the E2E job to CI (removed due to build OOM — becomes viable again
  once the build is light; separate change).
- Videre fetch workflow not triggering deploys (pre-existing quirk, unrelated).
- GitHub Pages 1 GB ceiling for the growing `data/` dir (distant; would move
  data hosting elsewhere, orthogonal to this refactor).
