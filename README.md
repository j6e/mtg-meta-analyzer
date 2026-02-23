# MTG Meta Analyzer

Tournament metagame analysis for competitive Magic: The Gathering.

## Features

- **Matchup matrices** — win rates between deck archetypes with color-coded cells and tooltips
- **Metagame scatter plots** — archetype share vs. win rate visualization
- **Tournament browser** — standings, round-by-round results, and decklists
- **Archetype classification** — signature-card rules with KNN fallback for unmatched decks
- **Export** — save matchup matrices as images

## Open data, open community

MTG Meta Analyzer will **never** be monetized, paywalled, or gated behind a subscription. Metagame data belongs to the community that generates it — from the first-time FNM player looking up matchups to the seasoned grinder tuning a sideboard. All data and source code are freely available under open licenses.

## Getting Started

**Prerequisites:** [Bun](https://bun.sh)

```bash
bun install          # install dependencies
bun run dev          # start dev server at http://localhost:5173
bun run build        # production build (static site)
bun run preview      # preview the production build
```

### Tests

```bash
bun vitest run                  # all tests
bun vitest run tests/unit       # unit tests only
bun run test:e2e                # Playwright end-to-end tests
```

### Adding tournament data

Fetch a tournament from melee.gg by ID or URL:

```bash
bun run scripts/fetch-tournament.ts <tournament-id-or-url>
bun run scripts/fetch-tournament.ts 72980 --dry-run   # preview without writing
```

Tournament JSON files are saved to `data/tournaments/` and loaded at build time.

## Tech Stack

- [SvelteKit 5](https://svelte.dev) with Svelte runes and static adapter
- TypeScript
- [Chart.js](https://www.chartjs.org) for visualizations
- [Vitest](https://vitest.dev) + [@testing-library/svelte](https://testing-library.com/docs/svelte-testing-library/intro) + [Playwright](https://playwright.dev)

## Contributing

Found a bug or have feedback? [Open an issue on GitHub](https://github.com/j6e/mtg-meta-analyzer/issues). Contributions are welcome — whether it's reporting data issues, improving classification rules, or anything else.

## License

Dual-licensed:

- **Code** (source files, build config, scripts) — [MIT](LICENSE)
- **Content** (analysis, archetype classification, site design) — [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

Tournament data sourced from [melee.gg](https://melee.gg). Card data and images from [Scryfall](https://scryfall.com). Magic: The Gathering is property of Wizards of the Coast — this project is not affiliated with or endorsed by WotC.
