# MTG Meta Analyzer - Implementation Plan (WIP)

## Project Summary

Static web app (GitHub Pages) that displays matchup matrices for Magic: The Gathering decks in tournaments. Data sourced from melee.gg.

## Draft Requirements (from draft.md)

### Data Source: melee.gg
- Parse tournament data from melee.gg (e.g. https://melee.gg/Tournament/View/339227)
- Extract: tournament metadata, every round/result, player decks/decklists, automatic archetype assignment
- Output: JSON files stored in repo, served as static assets
- Run via GitHub Actions or local CLI command

### Archetype Assignment
- User-defined archetypes via YAML (format, date, card signatures)
- ML-based auto-assignment for remaining decks: cosine similarity or KNN on decklist TF-IDF
- Handles misreported/missing archetypes

### Metagame Report
- Select format + date range or specific events
- Non-mirror match winrates per archetype pair (toggleable)
- Matrix ordered by representation (most popular top-left)
- Cells show: winrate (1 decimal) + match count
- "Other" category: configurable by % threshold or top-N
- Scatter plot: X=metagame share, Y=winrate, dot size=sample size

### Frontend
- Clean, minimalistic design
- Navigable: tournaments, archetypes, decklists, players
- Card image previews on hover (Scryfall API)

### Constraints
- TypeScript + Bun
- All algorithms run client-side
- Card name normalization between melee and Scryfall

---

## Architecture Decision: Tech Stack

### Recommended Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Framework | **SvelteKit + adapter-static** | Simplest mental model for Python dev, compiles away (small bundles), file-based routing, SPA mode for client-side nav |
| Language | **TypeScript** | Per user preference, runs natively in Bun |
| Runtime | **Bun** | Package manager, native TS execution for CLI scripts, fast startup |
| Charting | **Chart.js** | ~60kB, native scatter/bubble charts, custom HTML tooltips for card images |
| Matrix | **Custom Svelte component** | HTML table + CSS heatmap coloring, more controllable than any chart lib |
| Card images | **Scryfall API** | `<img>` tags in custom tooltips |
| Testing | **Vitest + @testing-library/svelte + Playwright** | Unit (algorithms), component, and E2E |
| Deployment | **GitHub Actions -> GitHub Pages** | adapter-static builds to static HTML/JS/CSS |
| Data pipeline | **Bun CLI scripts** | `bun run scripts/fetch-tournament.ts <url>` |

### Why NOT other options

- **React**: Too complex (hooks, re-renders, state management) for solo Python dev
- **Astro**: Wrong architecture - this is >90% interactive, not a content site. Islands model would fight the design.
- **Vue**: Good but no compelling advantage over Svelte here; Svelte is simpler and smaller bundles
- **Vanilla TS**: Too much DIY for routing, reactivity, component lifecycle
- **Plotly.js**: 1MB+ bundle, overkill. Chart.js does everything needed at 1/15th size
- **D3.js**: Massive learning curve for one scatter plot

### GitHub Pages Deployment

SvelteKit + adapter-static has well-established GitHub Actions workflow:
- `.nojekyll` file in `static/` folder
- `paths.base` set to repo name in `svelte.config.js`
- Repo Settings > Pages > source: "GitHub Actions"

### Testing Strategy

| Layer | Tool | What |
|-------|------|------|
| Algorithm unit tests | Vitest | TF-IDF, cosine similarity, KNN - pure functions |
| Component tests | Vitest + @testing-library/svelte | Matrix renders, scatter plot mounts, filters |
| E2E tests | Playwright | Full user flows |
| CLI script tests | Vitest | Data fetching, JSON output (mock HTTP) |

Note: Use `bun run test` (not `bun test`) to invoke Vitest, since `bun test` invokes Bun's built-in runner.

---

## Melee.gg Data Investigation

**STATUS: PENDING** - Need to investigate:
- How to programmatically get tournament metadata (name, format, date)
- How to get round-by-round results
- How to get player decklists
- API endpoints / page structure
- Authentication requirements
- Rate limiting
- Existing open-source parsers/scrapers

---

## Proposed Project Structure (Draft)

```
mtg-meta-analyzer/
├── src/
│   ├── routes/                # SvelteKit pages
│   │   ├── +page.svelte       # Home
│   │   ├── +layout.svelte     # App layout/nav
│   │   ├── tournaments/
│   │   ├── metagame/
│   │   ├── archetypes/
│   │   └── players/
│   ├── lib/
│   │   ├── components/        # Reusable Svelte components
│   │   ├── algorithms/        # TF-IDF, cosine sim, KNN
│   │   ├── stores/            # Svelte stores for app state
│   │   ├── types/             # TypeScript interfaces
│   │   └── utils/             # Helpers (card normalization, etc.)
│   └── app.html
├── scripts/
│   └── fetch-tournament.ts    # CLI data pipeline
├── data/
│   ├── tournaments/           # Fetched tournament JSONs
│   └── archetypes/            # YAML archetype definitions
├── static/
│   └── .nojekyll
├── tests/
│   ├── unit/                  # Algorithm tests
│   ├── component/             # Svelte component tests
│   └── e2e/                   # Playwright tests
├── .github/
│   └── workflows/
│       ├── deploy.yml
│       └── fetch-tournament.yml
├── svelte.config.js
├── vite.config.ts
├── tsconfig.json
├── package.json
└── bunfig.toml
```

---

## TODO for Plan Completion

- [ ] Investigate melee.gg data access (API, scraping, existing tools)
- [ ] Research existing melee.gg parsers on GitHub (look for recently active ones)
- [ ] Define JSON schema for tournament data
- [ ] Detail each implementation task with acceptance criteria
- [ ] Define task dependencies and ordering
