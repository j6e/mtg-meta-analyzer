# MTG Meta Analyzer - Implementation Plan

## 1. Project Overview

A static web app hosted on GitHub Pages that displays matchup matrices for Magic: The Gathering decks across tournaments. Data is sourced from melee.gg, processed into JSON, and all analysis algorithms run client-side.

---

## 2. Architecture

### Tech Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Framework | SvelteKit + `@sveltejs/adapter-static` | Simplest mental model for Python devs, compiles away (small bundles), file-based routing, SPA mode |
| Language | TypeScript | Runs natively in Bun, type safety |
| Runtime | Bun | Package manager, native TS for CLI scripts, fast startup |
| Charting | Chart.js (bubble chart) | ~60kB, native scatter/bubble support, custom HTML tooltips |
| Matrix | Custom Svelte component | HTML `<table>` + CSS heatmap coloring |
| Card images | Scryfall API | `https://api.scryfall.com/cards/named?exact={name}` for images |
| Testing | Vitest + @testing-library/svelte + Playwright | Unit, component, E2E |
| Deployment | GitHub Actions → GitHub Pages | adapter-static builds to static HTML/JS/CSS |
| Data pipeline | Bun CLI scripts | `bun run scripts/fetch-tournament.ts <url>` |
| HTML parsing | node-html-parser (or cheerio) | Parse melee.gg HTML responses for tournament/deck pages |

### Data Access Strategy: melee.gg Internal Endpoints

We use the same internal endpoints that the melee.gg frontend uses (jQuery DataTables pattern). This approach is used by all known open-source tools (Badaro/MTGODecklistCache.Tools, MagicLegacy/mtgmelee-client).

> **RISK: Cloudflare Protection.** As of March 2025, melee.gg added Cloudflare anti-bot protection that returns 403 for some automated requests. The MTGODecklistCache project reported their scraper stopped working. **Mitigation strategy:**
> 1. **Primary approach:** Direct HTTP with browser-like User-Agent headers (may still work for some endpoints)
> 2. **Fallback:** Use Playwright (headless browser) to bypass JavaScript challenges — this is what `gabriel-ballesteros/mtg-metagame-scraper` does with Selenium
> 3. Task 2.1 should implement both strategies with an automatic fallback

**Base URL:** `https://melee.gg`

| Endpoint | Method | Purpose | Response |
|----------|--------|---------|----------|
| `/Tournament/View/{id}` | GET | Tournament page (metadata + round IDs) | HTML — parse round IDs from `button.round-selector[data-is-completed='True']`, format from headline |
| `/Standing/GetRoundStandings` | POST | Player standings for a round | JSON (DataTables format) — `{data: [...], recordsTotal: N}` |
| `/Tournament/GetRoundPairings/{roundId}` | POST | Round pairings with results | JSON (DataTables format) |
| `/Decklist/View/{deckId}` | GET | Individual decklist page | HTML — parse card list from `button[data-clipboard-text]` |
| `/Decklist/TournamentSearch` | POST | List/search tournaments | JSON (DataTables format) |
| `/Player/GetPlayerDetails?id={id}` | GET | Player details | JSON |

**Key implementation details:**
- POST endpoints use URL-encoded DataTables parameters (columns, pagination, ordering)
- Pagination: 25 items per request, iterate with `start` offset until all records fetched
- User-Agent header required: `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0`
- Card names from `data-clipboard-text` need normalization (split mainboard/sideboard/companion)
- Rate limiting: add delays between requests to be respectful (e.g., 200ms between calls)

### Project Structure

```
mtg-meta-analyzer/
├── src/
│   ├── routes/                    # SvelteKit pages
│   │   ├── +page.svelte           # Home / dashboard
│   │   ├── +layout.svelte         # App shell (nav, theme)
│   │   ├── tournaments/
│   │   │   ├── +page.svelte       # Tournament list
│   │   │   └── [id]/
│   │   │       └── +page.svelte   # Single tournament view
│   │   ├── metagame/
│   │   │   └── +page.svelte       # Metagame report (matrix + scatter)
│   │   ├── archetypes/
│   │   │   ├── +page.svelte       # Archetype list
│   │   │   └── [name]/
│   │   │       └── +page.svelte   # Single archetype view
│   │   └── players/
│   │       ├── +page.svelte       # Player list
│   │       └── [id]/
│   │           └── +page.svelte   # Single player view
│   ├── lib/
│   │   ├── components/            # Reusable Svelte components
│   │   │   ├── MatchupMatrix.svelte
│   │   │   ├── MetagameScatter.svelte
│   │   │   ├── DecklistView.svelte
│   │   │   ├── CardTooltip.svelte
│   │   │   └── FilterPanel.svelte
│   │   ├── algorithms/            # Client-side ML/stats
│   │   │   ├── tfidf.ts
│   │   │   ├── cosine-similarity.ts
│   │   │   ├── knn.ts
│   │   │   └── archetype-classifier.ts
│   │   ├── stores/                # Svelte stores
│   │   │   ├── tournaments.ts
│   │   │   └── settings.ts
│   │   ├── types/                 # TypeScript interfaces
│   │   │   ├── tournament.ts
│   │   │   ├── decklist.ts
│   │   │   └── metagame.ts
│   │   └── utils/
│   │       ├── card-normalizer.ts
│   │       ├── winrate-calculator.ts
│   │       └── scryfall.ts
│   └── app.html
├── scripts/
│   ├── fetch-tournament.ts        # Main CLI: fetch tournament data
│   ├── lib/
│   │   ├── melee-client.ts        # HTTP client for melee.gg endpoints
│   │   ├── html-parser.ts         # Parse tournament/deck HTML pages
│   │   └── types.ts               # Shared types for scripts
│   └── list-tournaments.ts        # Optional: list tournaments by date
├── data/
│   ├── tournaments/               # One JSON per tournament
│   │   └── 339227.json
│   └── archetypes/                # YAML archetype definitions
│       └── standard.yaml
├── static/
│   └── .nojekyll
├── tests/
│   ├── unit/                      # Algorithm tests
│   │   ├── tfidf.test.ts
│   │   ├── cosine-similarity.test.ts
│   │   ├── knn.test.ts
│   │   ├── archetype-classifier.test.ts
│   │   ├── winrate-calculator.test.ts
│   │   └── card-normalizer.test.ts
│   ├── integration/               # Data pipeline tests
│   │   ├── melee-client.test.ts
│   │   └── html-parser.test.ts
│   ├── component/                 # Svelte component tests
│   │   ├── MatchupMatrix.test.ts
│   │   └── MetagameScatter.test.ts
│   └── e2e/                       # Playwright end-to-end
│       └── metagame-report.test.ts
├── .github/
│   └── workflows/
│       ├── deploy.yml             # Build & deploy to GH Pages
│       └── fetch-tournament.yml   # Manual trigger to fetch tournament
├── svelte.config.js
├── vite.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── tsconfig.json
├── package.json
└── bunfig.toml
```

### Data Flow

```
1. CLI (fetch-tournament.ts)
   ├── Input: melee.gg tournament URL
   ├── Fetches: tournament page HTML → round IDs
   ├── Fetches: standings per round → player list + deck IDs
   ├── Fetches: each decklist page HTML → card lists
   ├── Fetches: pairings per round → match results
   └── Output: data/tournaments/{id}.json

2. Build (SvelteKit adapter-static)
   ├── Reads: data/tournaments/*.json + data/archetypes/*.yaml
   ├── Bundles into: static assets served on GitHub Pages
   └── Output: build/ directory

3. Client (browser)
   ├── Loads: tournament JSON files
   ├── Loads: archetype YAML definitions
   ├── Runs: TF-IDF + cosine similarity for archetype classification
   ├── Computes: matchup matrix, winrates, metagame shares
   └── Renders: matrix, scatter plot, navigation
```

---

## 3. JSON Schema: Tournament Data

Each tournament is stored as a single JSON file in `data/tournaments/{id}.json`:

```typescript
interface TournamentData {
  meta: {
    id: number;
    name: string;
    date: string;           // ISO date
    format: string;         // "Standard", "Modern", etc.
    url: string;            // original melee.gg URL
    fetchedAt: string;      // ISO timestamp
    playerCount: number;
    roundCount: number;
  };
  players: {
    [playerId: string]: {
      name: string;
      rank: number;          // final standing
      points: number;
      matchRecord: string;   // "7-2-0"
      gameRecord: string;    // "15-6-1"
      decklistId: number | null;
      reportedArchetype: string | null;
    };
  };
  decklists: {
    [decklistId: string]: {
      playerId: string;
      mainboard: { cardName: string; quantity: number }[];
      sideboard: { cardName: string; quantity: number }[];
      companion: { cardName: string; quantity: number }[] | null;
      reportedArchetype: string | null;
    };
  };
  rounds: {
    [roundId: string]: {
      name: string;          // "Round 1", "Quarterfinals"
      number: number;
      isPlayoff: boolean;
      matches: {
        player1Id: string;
        player2Id: string | null;  // null = bye
        result: string;            // "2-1-0", "bye", "draw"
        winnerId: string | null;
      }[];
    };
  };
}
```

---

## 4. YAML Schema: Archetype Definitions

```yaml
format: standard
date: 2026-02-22       # version/update date
archetypes:
  - name: "Izzet Lessons"
    signature_cards:
      - name: "Artist's Talent"
        min_copies: 3
      - name: "Monument to Endurance"
        min_copies: 3
      - name: "Gran-Gran"
        min_copies: 3
  - name: "MonoG Landfall"
    signature_cards:
      - name: "Badgermole Cub"
        min_copies: 3
      - name: "Icetill Explorer"
        min_copies: 3
```

---

## 5. Implementation Tasks

### Phase 1: Project Setup

#### Task 1.1 — Initialize SvelteKit + Bun Project
**Description:** Create a new SvelteKit project with TypeScript, configure adapter-static, set up Bun as the package manager.

**Steps:**
1. Run `bun create svelte@latest .` (or `bunx sv create .`) with TypeScript, minimal template
2. Install adapter-static: `bun add -d @sveltejs/adapter-static`
3. Configure `svelte.config.js` with adapter-static and `paths.base`
4. Add `.nojekyll` to `static/`
5. Configure `tsconfig.json` with strict mode
6. Create `bunfig.toml` if needed
7. Verify `bun run dev` starts successfully and `bun run build` produces static output

**Verification:** `bun run build` completes without errors and produces a `build/` directory with `index.html`.

**Dependencies:** None

---

#### Task 1.2 — Set Up Testing Infrastructure
**Description:** Configure Vitest for unit/integration tests and Playwright for E2E.

**Steps:**
1. Install: `bun add -d vitest @testing-library/svelte jsdom @testing-library/jest-dom`
2. Install: `bun add -d @playwright/test`
3. Create `vitest.config.ts` with jsdom environment for component tests and node for unit tests
4. Create `playwright.config.ts`
5. Create directory structure: `tests/unit/`, `tests/integration/`, `tests/component/`, `tests/e2e/`
6. Add a trivial passing test in each directory to verify setup
7. Add scripts to `package.json`: `"test": "vitest"`, `"test:e2e": "playwright test"`

**Verification:** `bun run test` runs and passes. `bun run test:e2e` runs and passes.

**Dependencies:** Task 1.1

---

#### Task 1.3 — Define TypeScript Types and Data Schemas
**Description:** Create TypeScript interfaces for tournament data, decklists, metagame analysis, and archetype definitions.

**Steps:**
1. Create `src/lib/types/tournament.ts` — TournamentData, PlayerInfo, DecklistInfo, RoundInfo, MatchResult
2. Create `src/lib/types/decklist.ts` — Card, Decklist, CardEntry
3. Create `src/lib/types/metagame.ts` — MatchupMatrix, ArchetypeStats, MetagameReport
4. Create `src/lib/types/archetype.ts` — ArchetypeDefinition, ArchetypeYaml
5. Create `scripts/lib/types.ts` — MeleeRawResponse types for the data pipeline

**Verification:** TypeScript compiles without errors. Types are importable from other files.

**Dependencies:** Task 1.1

---

### Phase 2: Data Pipeline (CLI)

#### Task 2.1 — Melee.gg HTTP Client (with Playwright Fallback)
**Description:** Implement a TypeScript module that wraps all melee.gg internal endpoints. Must handle Cloudflare anti-bot protection.

**Steps:**
1. Create `scripts/lib/melee-client.ts`
2. **Strategy A (direct fetch):**
   - Implement `fetchTournamentPage(id: number): Promise<string>` — GET `/Tournament/View/{id}`, return HTML
   - Implement `fetchRoundStandings(roundId: number, offset: number): Promise<DataTablesResponse>` — POST with DataTables params
   - Implement `fetchRoundPairings(roundId: number, offset: number): Promise<DataTablesResponse>` — POST with DataTables params
   - Implement `fetchDecklistPage(deckId: number): Promise<string>` — GET `/Decklist/View/{id}`, return HTML
   - Implement `fetchTournamentList(startDate: Date, endDate: Date): Promise<DataTablesResponse>` — POST `/Decklist/TournamentSearch`
   - Add User-Agent header: `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0`
3. **Strategy B (Playwright fallback):**
   - Install: `bun add -d playwright`
   - Create `scripts/lib/melee-browser-client.ts`
   - Launch headless Chromium browser
   - Navigate to tournament page, extract HTML after JS execution
   - Intercept XHR/fetch requests to capture DataTables JSON responses
   - Or: evaluate `fetch()` calls within the page context to hit internal endpoints
4. **Auto-fallback:** If Strategy A gets a 403, automatically switch to Strategy B
5. Add rate limiting: configurable delay between requests (default 200ms)
6. Add pagination helper: auto-fetch all pages for DataTables endpoints
7. **Important:** Test early against a real melee.gg tournament to determine which strategy works

**Verification:** Unit tests with mocked HTTP responses verify correct request formation. Manual integration test against a real tournament URL to validate which strategy works.

**Tests:**
- `tests/integration/melee-client.test.ts` — Mock fetch, verify correct URLs, headers, DataTables body format, pagination logic
- Manual smoke test: `bun run scripts/test-melee-access.ts` — hit a real endpoint, report if 403 or success

**Dependencies:** Task 1.3

---

#### Task 2.2 — HTML Parser for Tournament & Decklist Pages
**Description:** Parse melee.gg HTML pages to extract tournament metadata and decklist cards.

**Steps:**
1. Install `node-html-parser`: `bun add node-html-parser`
2. Create `scripts/lib/html-parser.ts`
3. Implement `parseTournamentPage(html: string)`:
   - Extract tournament name from page title/heading
   - Extract format from headline paragraph
   - Extract completed round IDs from `button.round-selector[data-is-completed='True']`
   - Extract tournament date
4. Implement `parseDecklistPage(html: string)`:
   - Extract card list from `button[data-clipboard-text]` attribute
   - Parse mainboard, sideboard, companion sections
   - Parse card names and quantities (format: `N CardName`)
   - Extract reported archetype if available
5. Implement card name normalization (trim, handle split cards `/​/`, etc.)

**Verification:** Unit tests with saved HTML fixture files verify correct extraction.

**Tests:**
- `tests/integration/html-parser.test.ts` — Use fixture HTML files (save a real tournament page and decklist page as test data)
- Test edge cases: tournaments with no decklists, empty sideboards, companion cards

**Dependencies:** Task 1.3

---

#### Task 2.3 — Tournament Fetch CLI Script
**Description:** Main CLI script that fetches a full tournament from melee.gg and produces a JSON file.

**Steps:**
1. Create `scripts/fetch-tournament.ts`
2. Accept command line argument: tournament URL or ID
3. Pipeline:
   a. Fetch tournament page → parse metadata + round IDs
   b. For each completed round: fetch standings → player list + deck IDs
   c. For each unique decklist ID: fetch decklist page → parse cards
   d. For each completed round: fetch pairings → match results
4. Deduplicate players across rounds
5. Assemble into `TournamentData` JSON structure
6. Write to `data/tournaments/{id}.json`
7. Print summary to stdout (player count, round count, decklists found)
8. Add `--dry-run` flag for testing
9. Add error handling and retry logic (1 retry on network errors)

**Verification:** Run against a real tournament URL. Verify JSON output matches expected structure. Verify against known tournament results.

**Tests:**
- `tests/integration/fetch-tournament.test.ts` — End-to-end with mocked HTTP responses for a complete tournament

**Dependencies:** Task 2.1, Task 2.2

---

#### Task 2.4 — Sample Data + Fixture Setup
**Description:** Fetch 2-3 real tournaments and save them as reference data + test fixtures.

**Steps:**
1. Run `fetch-tournament.ts` against 2-3 real tournament URLs (different formats if possible)
2. Save outputs in `data/tournaments/`
3. Save raw HTML responses as test fixtures in `tests/fixtures/`
4. Create a sample `data/archetypes/standard.yaml` with 3-5 known Standard archetypes
5. Validate JSON files have expected structure

**Verification:** JSON files exist, are valid, and contain reasonable data (players, rounds, decklists).

**Dependencies:** Task 2.3

---

### Phase 3: Client-Side Algorithms

#### Task 3.1 — TF-IDF Implementation
**Description:** Implement TF-IDF (Term Frequency–Inverse Document Frequency) for decklist vectorization.

**Steps:**
1. Create `src/lib/algorithms/tfidf.ts`
2. Implement `buildCorpus(decklists: Decklist[]): TfIdfCorpus` — compute IDF from all decklists
3. Implement `vectorize(decklist: Decklist, corpus: TfIdfCorpus): number[]` — compute TF-IDF vector for a single decklist
4. Each "term" is a card name, each "document" is a decklist (considering quantities)
5. TF = (quantity of card in deck) / (total cards in deck)
6. IDF = log(total decklists / decklists containing card)
7. Return sparse vector representation for efficiency

**Verification:** Unit tests with hand-calculated examples.

**Tests:**
- `tests/unit/tfidf.test.ts`:
  - Two identical decklists produce identical vectors
  - Card appearing in all decklists has IDF ≈ 0
  - Unique card has high IDF
  - Quantity affects TF proportionally

**Dependencies:** Task 1.3

---

#### Task 3.2 — Cosine Similarity
**Description:** Implement cosine similarity between TF-IDF vectors.

**Steps:**
1. Create `src/lib/algorithms/cosine-similarity.ts`
2. Implement `cosineSimilarity(a: number[], b: number[]): number` — returns value in [0, 1]
3. Handle edge case: zero vectors return 0

**Verification:** Unit tests with known vector pairs.

**Tests:**
- `tests/unit/cosine-similarity.test.ts`:
  - Identical vectors → 1.0
  - Orthogonal vectors → 0.0
  - Known example: [1,2,3] vs [4,5,6] → expected value
  - Zero vector handling

**Dependencies:** Task 1.2

---

#### Task 3.3 — KNN Classifier
**Description:** Implement K-Nearest Neighbors for archetype assignment.

**Steps:**
1. Create `src/lib/algorithms/knn.ts`
2. Implement `knnClassify(target: number[], labeled: {vector: number[], label: string}[], k: number): string`
3. Compute cosine similarity to all labeled points
4. Return majority label among k nearest neighbors
5. Handle ties by selecting the label with highest average similarity

**Verification:** Unit tests with constructed scenarios.

**Tests:**
- `tests/unit/knn.test.ts`:
  - Point surrounded by same-label neighbors → correct label
  - Tie-breaking works correctly
  - k=1 returns nearest neighbor's label
  - Edge case: fewer points than k

**Dependencies:** Task 3.2

---

#### Task 3.4 — Archetype Classifier (Integrates TF-IDF + KNN + YAML)
**Description:** Combine TF-IDF, cosine similarity, and KNN with user-defined archetypes from YAML to classify all decklists.

**Steps:**
1. Create `src/lib/algorithms/archetype-classifier.ts`
2. Install YAML parser: `bun add yaml` (or use `js-yaml`)
3. Implement `parseArchetypeYaml(yamlContent: string): ArchetypeDefinition[]`
4. Implement `classifyBySignatureCards(decklist, archetypeDefs): string | null` — rule-based: if decklist contains all signature cards at minimum copies, assign archetype
5. Implement `classifyByML(unclassified, classified, corpus): ClassificationResult[]`:
   a. Build TF-IDF corpus from all decklists
   b. Vectorize all decklists
   c. Use decklists classified by signature cards as labeled training data
   d. Run KNN on unclassified decklists
   e. Return classification with confidence score (similarity to centroid)
6. Implement `classifyAll(decklists, archetypeDefs): Map<decklistId, archetype>`:
   a. First pass: signature card matching
   b. Second pass: KNN for remaining unclassified
   c. Mark low-confidence classifications

**Verification:** Unit tests with synthetic decklists and archetype definitions.

**Tests:**
- `tests/unit/archetype-classifier.test.ts`:
  - Decklist with all signature cards → correct archetype
  - Decklist missing one signature card → falls to KNN
  - Similar-but-not-identical deck classified correctly via KNN
  - YAML parsing produces correct structure
  - Unknown decks get "Unknown" or low-confidence flag

**Dependencies:** Task 3.1, Task 3.3

---

#### Task 3.5 — Winrate Calculator & Matchup Matrix Builder
**Description:** Compute per-archetype matchup winrates and build the matrix data structure.

**Steps:**
1. Create `src/lib/utils/winrate-calculator.ts`
2. Implement `buildMatchupMatrix(tournaments, archetypeMap, options)`:
   a. Filter rounds (exclude/include mirror matches based on option)
   b. For each match: look up both players' archetypes
   c. Accumulate wins/losses per archetype pair
   d. Compute winrate = wins / total matches per cell
   e. Order archetypes by representation (most played first)
3. Implement "Other" category aggregation:
   a. By % threshold: archetypes with <N% metagame share → "Other"
   b. By top-N: keep only top N archetypes, rest → "Other"
4. Implement `computeMetagameStats(tournaments, archetypeMap)`:
   a. Metagame share per archetype (%)
   b. Overall winrate per archetype
   c. Sample size (total matches)
5. Return `MatchupMatrix` and `ArchetypeStats[]` for the UI

**Verification:** Unit tests with hand-constructed tournament data.

**Tests:**
- `tests/unit/winrate-calculator.test.ts`:
  - 2-archetype scenario: verify symmetric winrates (A vs B winrate = 1 - B vs A winrate)
  - Mirror match exclusion works
  - "Other" aggregation at different thresholds
  - Empty tournament produces empty matrix
  - Single-match tournament
  - Metagame share sums to 100%

**Dependencies:** Task 1.3

---

#### Task 3.6 — Card Name Normalizer
**Description:** Normalize card names between melee.gg and Scryfall for consistent matching.

**Steps:**
1. Create `src/lib/utils/card-normalizer.ts`
2. Handle known normalization cases:
   - Trim whitespace
   - Split card names (e.g., "Fire // Ice" → "Fire // Ice" with consistent separator)
   - Adventure cards
   - Modal DFC cards
   - Special characters (accents, apostrophes)
3. Implement `normalizeCardName(name: string): string`
4. Implement `getScryfallImageUrl(cardName: string): string` — construct Scryfall image URL

**Verification:** Unit tests with known problematic card names.

**Tests:**
- `tests/unit/card-normalizer.test.ts`:
  - Standard card name passes through
  - Split card normalization
  - Whitespace trimming
  - Special characters handled

**Dependencies:** Task 1.2

---

### Phase 4: Frontend — Core Components

#### Task 4.1 — App Layout & Navigation
**Description:** Create the app shell with navigation between sections.

**Steps:**
1. Create `src/routes/+layout.svelte` with header nav (Tournaments, Metagame, Archetypes, Players)
2. Add basic CSS/styles (clean, minimalistic)
3. Create `src/routes/+page.svelte` — home page with brief description + link to metagame report
4. Set up SvelteKit SPA mode (disable SSR, enable client-side routing)
5. Configure data loading: import JSON files at build time via Vite's `import.meta.glob`

**Verification:** App loads, navigation between routes works, no console errors.

**Dependencies:** Task 1.1

---

#### Task 4.2 — Tournament Data Store & Loading
**Description:** Create Svelte stores that load tournament JSON data and make it available app-wide.

**Steps:**
1. Create `src/lib/stores/tournaments.ts`
2. Load all tournament JSON files from `data/tournaments/` at build time (Vite glob import)
3. Create derived stores for: tournament list, player list, decklist lookup
4. Create `src/lib/stores/settings.ts` for user preferences (mirror match toggle, "Other" threshold)
5. Ensure data is reactive and components update when filters change

**Verification:** Stores load sample tournament data. Derived values are correct.

**Dependencies:** Task 4.1, Task 2.4

---

#### Task 4.3 — Matchup Matrix Component
**Description:** Build the interactive matchup matrix table.

**Steps:**
1. Create `src/lib/components/MatchupMatrix.svelte`
2. Props: `matrix: MatchupMatrix`, `archetypes: ArchetypeStats[]`
3. Render HTML table:
   - Row/column headers = archetype names (ordered by representation)
   - Each cell = winrate (1 decimal, e.g., "54.3%") + match count
   - Diagonal cells (mirror) highlighted differently
4. Color coding: gradient from red (low winrate) through white (50%) to green (high winrate)
5. Hover effect on cells to highlight row/column
6. Sticky first column and header row for scrollability
7. Responsive: horizontal scroll on small screens

**Verification:** Component renders with sample data. Colors are correct. Hover works.

**Tests:**
- `tests/component/MatchupMatrix.test.ts`:
  - Renders correct number of rows/columns
  - Cell content matches expected winrate format
  - Mirror match cells have distinct styling

**Dependencies:** Task 3.5

---

#### Task 4.4 — Metagame Scatter Plot Component
**Description:** Build the scatter plot showing archetype metagame share vs winrate.

**Steps:**
1. Create `src/lib/components/MetagameScatter.svelte`
2. Use Chart.js bubble chart:
   - X axis: metagame share (%)
   - Y axis: overall winrate (%)
   - Bubble size: normalized match count
3. Add horizontal reference line at 50% winrate
4. Custom tooltip showing archetype name, exact values
5. Click on bubble → navigate to archetype detail page
6. Responsive sizing

**Verification:** Chart renders with sample data. Tooltips show correct info.

**Tests:**
- `tests/component/MetagameScatter.test.ts`:
  - Chart canvas is mounted
  - Correct number of data points

**Dependencies:** Task 3.5

---

#### Task 4.5 — Card Tooltip Component (Scryfall Images)
**Description:** Show card image preview on hover over card names.

**Steps:**
1. Create `src/lib/components/CardTooltip.svelte`
2. On hover over a card name: show floating tooltip with card image
3. Image source: `https://api.scryfall.com/cards/named?format=image&exact={cardName}`
4. Lazy loading: only fetch image on hover
5. Cache fetched image URLs in memory
6. Position tooltip near cursor, avoid viewport overflow
7. Handle errors gracefully (show card name as fallback)

**Verification:** Hover over card name shows image. Image loads from Scryfall.

**Dependencies:** Task 3.6

---

#### Task 4.6 — Decklist View Component
**Description:** Display a decklist with mainboard, sideboard, and card tooltips.

**Steps:**
1. Create `src/lib/components/DecklistView.svelte`
2. Display mainboard and sideboard as separate sections
3. Each card entry: `{quantity}x {CardName}` with hover tooltip (Task 4.5)
4. Group by card type if data available, or just list
5. Show companion separately if present
6. Show deck metadata (archetype, player name)

**Verification:** Component renders a sample decklist correctly.

**Dependencies:** Task 4.5

---

#### Task 4.7 — Filter Panel Component
**Description:** Controls for the metagame report: format, date range, "Other" threshold, mirror match toggle.

**Steps:**
1. Create `src/lib/components/FilterPanel.svelte`
2. Filter controls:
   - Format selector (dropdown populated from available formats)
   - Date range picker (start date, end date)
   - Tournament multi-select (select specific tournaments)
   - "Other" threshold: radio buttons for "Top N" vs "% threshold" + number input
   - Mirror match toggle (include/exclude)
3. Emit filter changes that update the settings store
4. Debounce rapid changes to avoid excessive recomputation

**Verification:** Changing filters updates the store. UI reflects current filter state.

**Dependencies:** Task 4.2

---

### Phase 5: Frontend — Pages

#### Task 5.1 — Metagame Report Page
**Description:** Main analysis page combining the matchup matrix, scatter plot, and filters.

**Steps:**
1. Create `src/routes/metagame/+page.svelte`
2. Layout: FilterPanel at top, then MatchupMatrix, then MetagameScatter below
3. When filters change:
   a. Filter tournaments by format/date/selection
   b. Run archetype classification (Task 3.4)
   c. Build matchup matrix (Task 3.5)
   d. Compute metagame stats
   e. Update both components reactively
4. Show loading state while computing
5. Show "no data" state if no tournaments match filters

**Verification:** Select a format, see the matrix and scatter plot update. Change "Other" threshold, see less-popular decks merge.

**Dependencies:** Task 4.3, Task 4.4, Task 4.7, Task 3.4, Task 3.5

---

#### Task 5.2 — Tournament List & Detail Pages
**Description:** Browse and view individual tournaments.

**Steps:**
1. Create `src/routes/tournaments/+page.svelte` — list all tournaments (name, date, format, player count)
2. Create `src/routes/tournaments/[id]/+page.svelte`:
   - Tournament metadata header
   - Standings table (rank, player, archetype, record)
   - Round-by-round results (expandable)
   - Link to each player's decklist
3. Sortable/filterable tables

**Verification:** Tournament list shows all loaded tournaments. Clicking one shows correct details.

**Dependencies:** Task 4.2, Task 4.6

---

#### Task 5.3 — Archetype & Player Pages
**Description:** Browse archetypes and individual player records.

**Steps:**
1. Create `src/routes/archetypes/+page.svelte` — list all archetypes with metagame share + winrate
2. Create `src/routes/archetypes/[name]/+page.svelte`:
   - Archetype stats (winrate, metagame share, sample size)
   - Matchup breakdown vs other archetypes
   - List of decklists belonging to this archetype
3. Create `src/routes/players/+page.svelte` — searchable player list
4. Create `src/routes/players/[id]/+page.svelte`:
   - Player tournament history
   - Decklists played
   - Win/loss record

**Verification:** All pages render with correct data. Links between pages work.

**Dependencies:** Task 5.1, Task 5.2

---

### Phase 6: CI/CD & Deployment

#### Task 6.1 — GitHub Actions: Deploy to GitHub Pages
**Description:** Automate build and deployment.

**Steps:**
1. Create `.github/workflows/deploy.yml`:
   - Trigger: push to main
   - Steps: checkout, setup Bun, `bun install`, `bun run build`, deploy to Pages
2. Configure: `paths.base` for repo name
3. Enable GitHub Pages in repo settings (source: GitHub Actions)
4. Verify deployment works end-to-end

**Verification:** Push to main triggers deployment. Site is accessible at `https://{user}.github.io/{repo}/`.

**Dependencies:** Task 5.1

---

#### Task 6.2 — GitHub Actions: Fetch Tournament Workflow
**Description:** Manual trigger workflow to fetch new tournament data.

**Steps:**
1. Create `.github/workflows/fetch-tournament.yml`:
   - Trigger: `workflow_dispatch` with `tournament_url` input
   - Steps: checkout, setup Bun, `bun install`, run `fetch-tournament.ts`, commit JSON to repo, push
2. The commit triggers the deploy workflow automatically
3. Add option for auto-PR instead of direct push (safer)

**Verification:** Trigger workflow with a tournament URL. JSON file appears in repo. Site updates.

**Dependencies:** Task 2.3, Task 6.1

---

### Phase 7: Polish & Edge Cases

#### Task 7.1 — Error Handling & Edge Cases
**Description:** Handle real-world data issues.

**Steps:**
1. Handle tournaments with no decklists
2. Handle players with missing/redacted decklists
3. Handle byes and forfeits in winrate calculations
4. Handle partial tournaments (in-progress)
5. Add loading spinners for async operations
6. Add error boundaries for failed API calls (Scryfall)

**Verification:** App doesn't crash with incomplete data. Error states are user-friendly.

**Dependencies:** Task 5.1

---

#### Task 7.2 — E2E Tests
**Description:** End-to-end tests for critical user flows.

**Steps:**
1. `tests/e2e/metagame-report.test.ts`:
   - Load app → navigate to metagame → verify matrix renders
   - Change filters → verify matrix updates
   - Hover card → verify tooltip appears
2. `tests/e2e/tournament-detail.test.ts`:
   - Navigate to tournament → verify standings table
   - Click decklist → verify cards shown

**Verification:** `bun run test:e2e` passes.

**Dependencies:** Task 5.1, Task 5.2

---

## 6. Task Dependency Graph

```
Phase 1 (Setup):
  1.1 ──┬── 1.2
        └── 1.3

Phase 2 (Data Pipeline):
  1.3 ── 2.1 ──┐
  1.3 ── 2.2 ──┼── 2.3 ── 2.4
               │
Phase 3 (Algorithms):
  1.2 ── 3.2 ── 3.3 ──┐
  1.3 ── 3.1 ──────────┼── 3.4
  1.2 ── 3.6           │
  1.3 ── 3.5 ──────────┘

Phase 4 (Components):
  1.1 ── 4.1 ── 4.2
  3.5 ── 4.3
  3.5 ── 4.4
  3.6 ── 4.5 ── 4.6
  4.2 ── 4.7

Phase 5 (Pages):
  4.3 + 4.4 + 4.7 + 3.4 + 3.5 ── 5.1
  4.2 + 4.6 ── 5.2
  5.1 + 5.2 ── 5.3

Phase 6 (CI/CD):
  5.1 ── 6.1
  2.3 + 6.1 ── 6.2

Phase 7 (Polish):
  5.1 ── 7.1
  5.1 + 5.2 ── 7.2
```

## 7. Parallelization Opportunities

These task groups can be worked on **in parallel** by different agents:

- **Group A (Data Pipeline):** Tasks 2.1, 2.2, 2.3, 2.4
- **Group B (Algorithms):** Tasks 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
- **Group C (Frontend):** Tasks 4.1, 4.2, 4.7 (can start before algorithms are done, using mock data)

After Phase 1 is done, Groups A, B, and C can all proceed simultaneously.
