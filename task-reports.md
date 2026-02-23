# Task Reports

## Task 1.1 — Initialize SvelteKit + Bun Project
**Status:** Completed
**Date:** 2026-02-22

### What was done
- Installed Bun 1.3.9
- Scaffolded SvelteKit project (`sv create`) with Svelte 5, TypeScript, minimal template
- Replaced `adapter-auto` with `@sveltejs/adapter-static` (v3.0.10)
- Configured `svelte.config.js`:
  - Static adapter with `404.html` SPA fallback
  - `paths.base` configurable via `BASE_PATH` env var (for GitHub Pages)
- Created `src/routes/+layout.ts` with `prerender = true` and `ssr = false` (SPA mode)
- Added `static/.nojekyll` for GitHub Pages compatibility
- `tsconfig.json` has `strict: true` (default from scaffold)

### Key files
- `svelte.config.js` — adapter-static config
- `src/routes/+layout.ts` — SPA/prerender settings
- `static/.nojekyll` — GitHub Pages marker

### Verification
- `bun run build` succeeds, produces `build/` directory with `index.html`, `404.html`, `_app/`, `robots.txt`

### Dependencies installed
```
@sveltejs/adapter-static: ^3.0.10
@sveltejs/kit: ^2.50.2
@sveltejs/vite-plugin-svelte: ^6.2.4
svelte: ^5.51.0
svelte-check: ^4.3.6
typescript: ^5.9.3
vite: ^7.3.1
```

---

## Task 1.2 — Set Up Testing Infrastructure
**Status:** Completed
**Date:** 2026-02-22

### What was done
- Installed Vitest 4.0.18, @testing-library/svelte 5.3.1, jsdom 28.1.0, @testing-library/jest-dom 6.9.1, @playwright/test 1.58.2
- Created `vitest.config.ts` — SvelteKit plugin, node environment by default, e2e excluded
- Created `playwright.config.ts` — tests in `tests/e2e`, baseURL localhost:4173, webServer builds+previews
- Created `tests/setup.ts` — imports `@testing-library/jest-dom/vitest` for DOM matchers
- Created smoke tests in all 4 directories (unit, integration, component, e2e)
- Component tests use `// @vitest-environment jsdom` inline comment (more reliable in Vitest 4.x than `environmentMatchGlobs`)
- Added `"test"` and `"test:e2e"` scripts to package.json

### Key files
- `vitest.config.ts` — Vitest configuration
- `playwright.config.ts` — Playwright E2E configuration
- `tests/setup.ts` — test setup (jest-dom matchers)
- `tests/unit/smoke.test.ts`, `tests/integration/smoke.test.ts`, `tests/component/smoke.test.ts`, `tests/e2e/smoke.test.ts`

### Verification
- `bun run test` — 3 test files, 6 tests, all passing
- `bun run check` — 0 errors, 0 warnings
- E2E tests not run yet (Playwright browsers not installed)

---

## Task 1.3 — Define TypeScript Types and Data Schemas
**Status:** Completed
**Date:** 2026-02-22

### What was done
- Created `src/lib/types/tournament.ts` — TournamentData, TournamentMeta, PlayerInfo, MatchResult, RoundInfo
- Created `src/lib/types/decklist.ts` — CardEntry, DecklistInfo
- Created `src/lib/types/metagame.ts` — MatchupCell, MatchupMatrix, ArchetypeStats, MetagameReport
- Created `src/lib/types/archetype.ts` — SignatureCard, ArchetypeDefinition, ArchetypeYaml
- Created `src/lib/types/index.ts` — barrel re-export of all types
- Created `scripts/lib/types.ts` — DataTables request/response types, MeleeStandingRow, MeleePairingRow, ParsedTournamentPage, ParsedDecklist

### Key files
- `src/lib/types/` — all frontend type definitions
- `scripts/lib/types.ts` — data pipeline types

### Verification
- `bun run check` — 0 errors, all types compile cleanly

---

## Task 2.1 — Melee.gg HTTP Client
**Status:** Completed
**Date:** 2026-02-22

### What was done
- Created `scripts/lib/melee-client.ts` — `MeleeClient` class with rate limiting, pagination, error handling
- Updated `scripts/lib/types.ts` — corrected to match actual melee.gg API responses (Feb 2026)
- Created `scripts/test-melee-access.ts` — manual smoke test against real endpoints
- Created `tests/integration/melee-client.test.ts` — 13 unit tests with mocked fetch

### API discoveries (differs from reference implementations)
- **Pairings endpoint changed**: `/Tournament/GetRoundPairings/{id}` no longer works. New endpoint is `/Match/GetRoundMatches/{roundId}` with nested `Competitors[]` structure
- **Decklist IDs are now GUIDs** (not integers): e.g. `95bc7d4d-ff64-4f5a-9219-76093c05d5ff`
- **Decklist JSON endpoint** returns structured card records with `c: 0` (mainboard) and `c: 99` (sideboard) — no HTML parsing needed
- **Decklist HTML pages** use client-side Mustache templates — HTML parsing won't get card data
- **No Cloudflare blocking** observed — simple HTTP with User-Agent header works fine

### Endpoints verified working
| Endpoint | Method | Status |
|----------|--------|--------|
| `/Tournament/View/{id}` | GET | OK (HTML) |
| `/Standing/GetRoundStandings` | POST | OK (JSON, paginated) |
| `/Match/GetRoundMatches/{roundId}` | POST | OK (JSON, paginated) |
| `/Decklist/GetDecklistDetails?id={guid}` | GET | OK (JSON) |
| `/Decklist/TournamentSearch` | POST | OK (JSON, paginated) |

### Playwright fallback
Not implemented (not needed — all endpoints work with direct HTTP). Can be added later if Cloudflare protection appears.

### Key files
- `scripts/lib/melee-client.ts` — HTTP client
- `scripts/lib/types.ts` — API response types (updated)
- `scripts/test-melee-access.ts` — manual smoke test
- `tests/integration/melee-client.test.ts` — 13 integration tests
- `melee-api.md` — full API reference documentation

### Verification
- `bun run test` — 19 tests passing (13 melee-client + 6 smoke)
- `bun run scripts/test-melee-access.ts` — all 5 endpoints return valid data

---

## Task 2.2 — HTML Parser for Tournament & Decklist Pages
**Status:** Completed
**Date:** 2026-02-23

### What was done
- Installed `node-html-parser` v7.0.2
- Created `scripts/lib/html-parser.ts` with 3 functions:
  - `parseTournamentPage(html)` — extracts name, date, formats, and round IDs from tournament HTML
  - `parseDecklistString(text)` — parses Arena-format decklist strings (Deck/Sideboard/Companion sections)
  - `parseDecklistRecords(details)` — converts melee.gg JSON Records (c=0 mainboard, c=99 sideboard) to ParsedDecklist
- Created test fixtures: `tournament-minimal.html`, `tournament-no-decklists.html`, `tournament-72980.html` (real Pro Tour page)
- Decklist HTML parsing NOT implemented (not needed — JSON endpoint provides structured data, HTML uses Mustache templates)

### Key files
- `scripts/lib/html-parser.ts` — parser implementation
- `tests/integration/html-parser.test.ts` — 16 tests
- `tests/fixtures/` — HTML test fixtures

### Verification
- `bun run test` — 35 tests passing (16 html-parser + 13 melee-client + 6 smoke)

---

## Task 2.3 — Tournament Fetch CLI Script
**Status:** Completed
**Date:** 2026-02-23

### What was done
- Created `scripts/lib/assembler.ts` — converts raw API data (standings, decklists, matches) into `TournamentData` schema
  - `assembleTournament()` — main assembly function
  - `parseMatchResult()` — extracts winner from Competitors array, handles byes/draws
  - `extractRoundNumber()` — parses "Round N" names, assigns high numbers to playoff rounds
  - `isPlayoffRound()` — detects quarterfinals, semifinals, finals, top 8/4, playoff
- Created `scripts/fetch-tournament.ts` — CLI entry point with 4-step pipeline:
  1. Fetch & parse tournament HTML page
  2. Fetch standings from last completed round
  3. Fetch all decklists (with progress reporting)
  4. Fetch matches for all completed rounds
  - Supports `--dry-run` flag (prints summary without writing file)
  - Outputs JSON to `data/tournaments/{id}.json`
- Updated `src/lib/types/tournament.ts` to match real API data:
  - `PlayerInfo.decklistIds` changed from `number | null` to `string[]` (GUIDs)
  - `PlayerInfo.username` added
  - `PlayerInfo.reportedArchetypes` changed from `string | null` to `string[]`
  - `TournamentMeta.formats` changed from `string` to `string[]`
- Installed `@types/node@25.3.0` (needed for fs/path in tests)
- Created `tests/integration/assembler.test.ts` — 8 tests covering:
  - Basic tournament assembly (players, decklists, rounds, matches)
  - Bye matches, draw matches, empty competitors
  - Playoff round detection and numbering
  - Round number extraction
  - Players with no decklists
  - Multi-format tournaments with multiple decklists per player

### Real tournament test (dry run)
- Tested against Pro Tour Thunder Junction (ID 72980):
  - 207 players, 207 decklists (100% success), 19 rounds, 1327 matches
  - JSON output: 876,575 bytes
  - All data fetched successfully with no errors

### Key files
- `scripts/fetch-tournament.ts` — CLI script
- `scripts/lib/assembler.ts` — data assembly module
- `tests/integration/assembler.test.ts` — 8 assembler tests

### Verification
- `bun run check` — 0 errors, 0 warnings
- `bun run test` — 43 tests passing (8 assembler + 16 html-parser + 13 melee-client + 6 smoke)
- `bun run scripts/fetch-tournament.ts 72980 --dry-run` — completes successfully

---

## Task 2.4 — Sample Data + Fixture Setup
**Status:** Completed
**Date:** 2026-02-23

### What was done
- Fetched 2 real tournaments and saved as JSON in `data/tournaments/`:
  1. **Pro Tour Thunder Junction** (72980) — multi-format (Draft/Standard), 207 players, 207 decklists, 19 rounds, 1327 matches (877KB)
  2. **Magic Spotlight Series - Lyon 2026** (392401) — Standard, 753 players, 746 decklists, 18 rounds, 3440 matches (2.8MB)
- Created `data/archetypes/standard.yaml` — 5 Standard archetypes with signature cards:
  - Izzet Lessons, Simic Rhythm, Dimir Midrange, Jeskai Control, Mono-Red Aggro
  - Each has 4 signature cards with minCopies thresholds based on real tournament data
- Validated both JSON files pass structural checks (meta, players, decklists, rounds, matches)

### Key files
- `data/tournaments/72980.json` — Pro Tour Thunder Junction
- `data/tournaments/392401.json` — Magic Spotlight Series Lyon 2026
- `data/archetypes/standard.yaml` — Standard archetype definitions

### Verification
- Both JSON files validated: correct schema, player counts match, decklists have mainboards, rounds have matches
- Archetype YAML signature cards derived from actual tournament decklist analysis

---

## Task 3.1 — TF-IDF Implementation
**Status:** Completed
**Date:** 2026-02-23

### What was done
- Created `src/lib/algorithms/tfidf.ts`:
  - `buildCorpus(decklists)` — builds vocabulary, computes IDF = ln(N/df) for each card
  - `vectorize(decklist, corpus)` — computes sparse TF-IDF vector (TF = qty/totalCards)
  - `toDense(sparse, size)` — converts sparse to Float64Array for dense operations
  - Uses `Float64Array` for IDF storage (memory efficient)
  - Sparse vector format: `[vocabIndex, tfidfValue][]`
- Created `tests/unit/tfidf.test.ts` — 12 tests

### Key files
- `src/lib/algorithms/tfidf.ts`
- `tests/unit/tfidf.test.ts`

### Verification
- 12 tests passing: vocabulary building, IDF computation, TF proportionality, edge cases

---

## Task 3.2 — Cosine Similarity
**Status:** Completed
**Date:** 2026-02-23

### What was done
- Created `src/lib/algorithms/cosine-similarity.ts`:
  - `cosineSimilarity(a, b)` — dense Float64Array cosine similarity
  - `cosineSimilaritySparse(a, b)` — sparse vector cosine similarity (more efficient for TF-IDF vectors)
  - Handles zero vectors, different-length vectors
- Created `tests/unit/cosine-similarity.test.ts` — 10 tests

### Key files
- `src/lib/algorithms/cosine-similarity.ts`
- `tests/unit/cosine-similarity.test.ts`

### Verification
- 10 tests passing: identical vectors (1.0), orthogonal (0.0), known computation, zero vectors, sparse/dense equivalence

---

## Task 3.3 — KNN Classifier
**Status:** Completed
**Date:** 2026-02-23

### What was done
- Created `src/lib/algorithms/knn.ts`:
  - `knnClassify(target, labeled, k)` — K-Nearest Neighbors using cosine similarity
  - Returns majority label among k nearest neighbors
  - Tie-breaking by highest average similarity
  - Returns confidence score (avg similarity of winning label's neighbors)
- Created `tests/unit/knn.test.ts` — 7 tests

### Key files
- `src/lib/algorithms/knn.ts`
- `tests/unit/knn.test.ts`

### Verification
- 7 tests passing: k=1, majority voting, tie-breaking, fewer points than k, empty set, multi-class

---

## Task 3.4 — Archetype Classifier
**Status:** Completed
**Date:** 2026-02-23

### What was done
- Installed `yaml` v2.8.2
- Created `src/lib/algorithms/archetype-classifier.ts`:
  - `parseArchetypeYaml(yamlContent)` — parses YAML into ArchetypeDefinition[]
  - `classifyBySignatureCards(mainboard, archetypeDefs)` — rule-based matching (pass 1)
  - `classifyAll(decklists, archetypeDefs, options)` — two-pass pipeline:
    1. Signature card matching (confidence=1.0)
    2. KNN classification using TF-IDF vectors from pass-1 labeled data
    3. Unknown for low-confidence or unclassifiable decklists
  - Options: `k` (default 5), `minConfidence` (default 0.3)
- Created `tests/unit/archetype-classifier.test.ts` — 12 tests

### Key files
- `src/lib/algorithms/archetype-classifier.ts`
- `tests/unit/archetype-classifier.test.ts`

### Verification
- `bun run check` — 0 errors
- `bun run test` — 84 tests passing (12 classifier + 7 knn + 10 cosine + 12 tfidf + 43 prior)

---

## Task 3.5 — Winrate Calculator & Matchup Matrix Builder
**Status:** Completed
**Date:** 2026-02-23

### What was done
- Created `src/lib/utils/winrate-calculator.ts` with 3 functions:
  - `buildPlayerArchetypeMap(tournament, results)` — maps player IDs to archetypes via classifier output
  - `buildMatchupMatrix(tournaments, playerArchetypes, options)` — builds N×N matchup matrix with winrates
    - Supports `excludeMirrors` (default true), `excludePlayoffs`, `topN`, `minMetagameShare`
    - "Other" aggregation: collapses small archetypes by top-N or min share threshold
    - Returns both `MatchupMatrix` and `ArchetypeStats[]`
  - `computeMetagameStats(tournaments, playerArchetypes)` — standalone stats (includes all matches)
- Created `tests/unit/winrate-calculator.test.ts` — 20 tests covering:
  - Player-to-archetype mapping (basic, unknown, multi-decklist)
  - 2-archetype symmetric winrates
  - Mirror match exclusion (default) and inclusion
  - Bye skipping, draw handling
  - "Other" aggregation via topN and minMetagameShare
  - Playoff round exclusion
  - Empty tournament, single match
  - Archetype ordering by metagame share
  - Unknown players in matrix
  - Multi-tournament aggregation
  - Metagame shares summing to 1.0
  - computeMetagameStats standalone

### Key files
- `src/lib/utils/winrate-calculator.ts`
- `tests/unit/winrate-calculator.test.ts`

### Verification
- `bun run check` — 0 errors, 0 warnings
- `bun run test` — 104 tests passing (20 winrate + 12 classifier + 7 knn + 10 cosine + 12 tfidf + 43 prior)

---

## Task 3.6 — Card Name Normalizer
**Status:** Completed
**Date:** 2026-02-23

### What was done
- Created `src/lib/utils/card-normalizer.ts` with 3 functions:
  - `normalizeCardName(name)` — trims whitespace, normalizes curly quotes to straight, normalizes `//` separator spacing
  - `getFrontFace(name)` — extracts front face from DFC/split card names (e.g. "Aclazotz, Deepest Betrayal // Temple of the Dead" → "Aclazotz, Deepest Betrayal")
  - `getScryfallImageUrl(cardName, version?)` — builds Scryfall image URL using front face name
- Analyzed real tournament data: 47/697 unique cards are DFCs with `//` separator (main concern), 1 accented character, all apostrophes/hyphens already consistent ASCII

### Key files
- `src/lib/utils/card-normalizer.ts`
- `tests/unit/card-normalizer.test.ts`

### Verification
- `bun run check` — 0 errors, 0 warnings
- `bun run test` — 121 tests passing (17 card-normalizer + 104 prior)

---

## Task 4.1 — App Layout & Navigation
**Status:** Completed
**Date:** 2026-02-23

### What was done
- Created `src/app.css` — global CSS reset, custom properties (colors, fonts, spacing), base typography
- Updated `src/routes/+layout.svelte` — app shell with sticky header nav:
  - Logo linking to home, 4 nav links (Metagame, Tournaments, Archetypes, Players)
  - Active link highlighting via `$app/state` page URL
  - `$app/paths` base support for GitHub Pages deployment
  - Responsive: stacks vertically on small screens
- Updated `src/routes/+page.svelte` — home page with 3 card-style links to main sections
- Created `src/lib/data/loader.ts` — build-time data loading via Vite's `import.meta.glob`:
  - Eagerly imports all `/data/tournaments/*.json` at build time
  - `loadTournaments()` returns a `Map<number, TournamentData>`
- SPA mode was already configured (`+layout.ts`: `prerender = true`, `ssr = false`)

### Key files
- `src/app.css`
- `src/routes/+layout.svelte`
- `src/routes/+page.svelte`
- `src/lib/data/loader.ts`

### Verification
- `bun run check` — 0 errors, 0 warnings
- `bun run test` — 121 tests passing (all prior tests still pass)
- Dev server starts and loads correctly

---

## Task 4.2 — Tournament Data Store & Loading
**Status:** Completed
**Date:** 2026-02-23

### What was done
- Created `src/lib/stores/settings.ts` — user preferences store:
  - `excludeMirrors` (default true), `topN` (default 0 = all), `excludePlayoffs` (default true)
  - `resetSettings()` helper to restore defaults
- Created `src/lib/stores/tournaments.ts` — reactive tournament data store:
  - Loads all tournament JSON at build time via `loadTournaments()`
  - Imports archetype YAML and parses definitions once
  - `selectedTournamentId` — writable store for current tournament selection
  - `tournamentList` — derived: all tournament metadata sorted by date
  - `currentTournament` — derived: full data for selected tournament
  - `playerList` — derived: players sorted by rank
  - `decklistMap` — derived: decklists keyed by ID
  - `classificationResults` — derived: runs archetype classifier on current tournament
  - `playerArchetypes` — derived: player ID → archetype mapping
  - `metagameData` — derived: matchup matrix + stats, reactive to settings changes
  - `archetypeStats` — derived: just the stats array
- Created `tests/unit/stores.test.ts` — 5 tests (settings defaults, update, reset, derived reactivity)

### Key files
- `src/lib/stores/tournaments.ts`
- `src/lib/stores/settings.ts`
- `tests/unit/stores.test.ts`

### Verification
- `bun run check` — 0 errors, 0 warnings
- `bun run test` — 126 tests passing (5 stores + 121 prior)

---

## Task 4.3 — Matchup Matrix Component
**Status:** Completed
**Date:** 2026-02-23

### What was done
- Created `src/lib/components/MatchupMatrix.svelte`:
  - Props: `matrix: MatchupMatrix`, `stats?: ArchetypeStats[]`
  - N×N HTML table with row/column headers = archetype names
  - Each cell: winrate (1 decimal) + match count in parentheses
  - Color gradient: red (low winrate) → white (50%) → green (high winrate)
  - Diagonal cells show "Mirror" with hatched background pattern
  - Hover: highlights entire row + column, cross-cell gets accent border
  - Sticky first column + header row for scrollability
  - Row headers include metagame share % when stats are provided
  - Responsive: horizontal scroll wrapper on small screens
- Added `resolve.conditions: ['browser']` to `vitest.config.ts` to fix Svelte 5 component tests (mount requires client bundle, not server)
- Created `tests/component/MatchupMatrix.test.ts` — 8 tests:
  - Row/column count, archetype name display, winrate format
  - Mirror cell detection + styling, background color application
  - Metagame share in row headers, empty matrix, no-match cells

### Key files
- `src/lib/components/MatchupMatrix.svelte`
- `tests/component/MatchupMatrix.test.ts`
- `vitest.config.ts` (resolve conditions fix)

### Verification
- `bun run check` — 0 errors, 0 warnings
- `bun run test` — 134 tests passing (8 MatchupMatrix + 126 prior)

---

## Task 4.4 — Metagame Scatter Plot Component
**Status:** Completed
**Date:** 2026-02-23

### What was done
- Installed `chart.js` v4.5.1
- Created `src/lib/components/MetagameScatter.svelte`:
  - Chart.js bubble chart: X = metagame share (%), Y = win rate (%), bubble size = match count
  - Horizontal dashed reference line at 50% winrate (custom Chart.js plugin)
  - Custom tooltip: archetype name, share, win rate, players, matches
  - Custom legend below chart (excludes "Unknown" archetype)
  - Reactive: rebuilds chart when stats prop changes via `$effect`
  - Responsive sizing with `maintainAspectRatio: false`
- Added scatter plot to `/metagame` page above the matchup matrix
- Created `tests/component/MetagameScatter.test.ts` — 3 tests:
  - Canvas element mounts
  - Legend items for non-Unknown archetypes
  - Empty stats handling

### Key files
- `src/lib/components/MetagameScatter.svelte`
- `tests/component/MetagameScatter.test.ts`
- `src/routes/metagame/+page.svelte` (updated)

### Verification
- `bun run check` — 0 errors, 0 warnings
- `bun run test` — 137 tests passing (3 MetagameScatter + 134 prior)

---

## Task 4.5 — Card Tooltip Component (Scryfall Images)
**Status:** Completed
**Date:** 2026-02-23

### What was done
- Created `src/lib/components/CardTooltip.svelte`:
  - Wraps any child content (snippet) as a hover trigger
  - On hover: shows floating tooltip with Scryfall card image (normal size, 252px wide)
  - Uses `getScryfallImageUrl` for DFC front-face resolution
  - Lazy loading: image only fetched when tooltip becomes visible
  - Viewport-aware positioning: avoids overflow on right/bottom edges
  - Loading state with "Loading..." placeholder
  - Error fallback: shows card name as text if image fails
  - Dotted underline on trigger to indicate interactivity
- Created `tests/component/CardTooltip.test.ts` — 6 tests:
  - Trigger renders, tooltip hidden by default
  - Shows/hides on mouseenter/mouseleave
  - Correct Scryfall URL in img src
  - DFC front-face extraction in URL

### Key files
- `src/lib/components/CardTooltip.svelte`
- `tests/component/CardTooltip.test.ts`

### Verification
- `bun run check` — 0 errors, 0 warnings
- `bun run test` — 143 tests passing (6 CardTooltip + 137 prior)
