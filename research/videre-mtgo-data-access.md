# Videre Project — MTGO Data Access

Research notes from [videre-project/api-services#3](https://github.com/videre-project/api-services/issues/3)
("Request read-only database access for MTG metagame analysis project", opened 2026-02-23 by j6e).

**Status: granted and closed as completed (2026-07-04).** The maintainer (Qonfused) missed the
original notification and replied 2026-06-27. Since then two access paths exist for the raw
granular MTGO tournament data (decks, matches, events, standings) we requested.

## Option 1: Direct read-only SQL access (best for bulk export)

Documented in [mtgo-db/PUBLIC-API.md](https://github.com/videre-project/mtgo-db/blob/main/PUBLIC-API.md).
Public, passwordless, read-only PostgreSQL role via Cloudflare Tunnel (no raw Postgres socket exposed).

```bash
# terminal 1 — bridge (requires cloudflared)
cloudflared access tcp --hostname public-db.videreproject.com --url 127.0.0.1:5432

# terminal 2
psql 'postgresql://public_api@127.0.0.1:5432/mtgo?sslmode=disable'
```

- NodeJS alternative to vendoring the binary: [scripts/start-bridge.ts](https://github.com/videre-project/mtgo-db/blob/main/scripts/start-bridge.ts) using the `cloudflared` npm package.
- Connection params for GUI/other tools: host `127.0.0.1`, port `5432` (or any local port), db `mtgo`, user `public_api`, empty password, SSL disabled (tunnel carries encryption).

### Granted tables

`events`, `decks`, `matches`, `standings`, `archetypes`, `cards`, `oracle_cards`, `card_faces`,
`card_legalities`, `card_catalog_variants`, `catalog_items`, `catalog_price_definitions`,
`catalog_price_history`, `products`, `sets`.

### Role limits (shape queries accordingly)

- 20 connection limit, read-only transactions only
- **Statement timeout: 5 seconds** — chunk bulk exports by date window / format / event
- Idle transaction timeout 15s, idle session timeout 60s, lock timeout 500ms
- `work_mem` 4MB, temp file limit 64MB

Docs explicitly say: for sustained high-volume access, ask the maintainer for a scheduled
dump/export or run your own replica rather than hammering the shared role.

## Option 2: Raw HTTP API endpoints

New since our issue: `https://api.videreproject.com` now has raw (non-aggregated) routes,
documented in [docs/api/](https://github.com/videre-project/api-services/tree/main/docs/api):

| Route | Returns |
|---|---|
| `/events` | Event ID, name, date, format, kind, rounds, player count |
| `/decks` | Full main/sideboard card quantities per player + current Videre archetype label |
| `/matches` | Round-by-round match rows, game-level results when available |
| `/standings` | Rank, record, points, tiebreakers |

- Unauthenticated, cacheable (`max-age=3600`)
- Pagination: `limit` (default 100, max 500) + `offset`, page via `meta.next_offset` / `meta.has_more`
- Filters: `format`, `event_id`, `min_date`/`max_date` (`YYYY-MM-DD`; defaults to last 31 days if omitted)
- Aggregated routes (`/metagame`, `/archetypes`, `/matchups`) still exist but embed Videre's
  classification choices — we want the raw routes and our own pipeline

## Caveats & context from the thread

- **Archetype labels are NOT authoritative.** Maintainer warned twice: classification is being
  reworked in [manafold](https://github.com/videre-project/manafold). Fine for us — we run our
  own classification — but don't ingest their labels as ground truth.
- **Historical backfill in progress**: events being backdated to the 2008/2009 MTGO era.
- **League 5-0 data available** (issue [#4](https://github.com/videre-project/api-services/issues/4),
  closed): Leagues share one MTGO event ID per season, so each MTGO.com publication is inserted
  under a unique **negative event ID**. Negative IDs also appear on some 2008–2010 recovered events.
- **No GitHub Releases dumps yet** (checked 2026-07-08: both `mtgo-db` and `api-services` have
  zero releases). Dumps were offered — worth requesting if we want to bulk-seed `data/tournaments/`.
- Data provenance: event data ingested by [MTGOBot](https://github.com/videre-project/MTGOBot),
  card catalog by [CardExporter](https://github.com/videre-project/CardExporter); freshness
  depends on those import jobs, not request time. See
  [data-sources.md](https://github.com/videre-project/api-services/blob/main/docs/reference/data-sources.md).

## Verified live (2026-07-08)

Connected successfully from this machine: `cloudflared` (standalone binary, no install needed)
bridging `public-db.videreproject.com` → local port, then `psql` as `public_api`. Server is
PostgreSQL 17.7.

### Coverage (as of 2026-07-08)

- **57,407 events, 2008-09-08 → today.**
- By format: Standard 15.8k (2008→), Modern 12.8k (2011→), Pauper 9.1k (2009→), Legacy 7.5k
  (2010→), Vintage 5.9k (2014→), Pioneer 5.2k (2019→), Premodern 84 (2026→), plus dead formats
  (Extended, Classic).
- By kind: League 22.6k, Daily 15.4k, Challenge 8.1k, Preliminary 5.4k, Premier 3.4k,
  Qualifier 1.7k, Showcase 441, Championship 391.
- Deck coverage is near-total: 286/298 events since 2026-06-01 have decks; 1020/1020 in a
  2012 sample.
- Format values are capitalized in SQL (`'Modern'`, not `'modern'` as in the HTTP API).

### Row shapes

- `decks.mainboard`/`sideboard`: `cardquantitypair[]` composite arrays — text form
  `("(130215,""Abhorrent Oculus"",4)", ...)`. Easiest to consume via `unnest()` +
  `json_build_object((c).id, (c).name, (c).quantity)` server-side rather than parsing the
  composite text client-side.
- `matches`: `(event_id, round, player, opponent, record, result, isbye, games)` where `games`
  is a `gameresult[]` like `{"(955670402,loss)","(955670840,win)"}` — per-game results included.
- `standings`: `(event_id, rank, player, record, points, omwp, gwp, owp)`.
- `archetypes`: 282k rows keyed by `deck_id` with a `provider` column (mtggoldfish 238k,
  mtgtop8 40k, others small) — third-party labels, sparse on recent events (empty for a
  2026-07-07 Challenge), confirming "not authoritative".
- Leagues confirmed under **negative event IDs**, one per MTGO.com publication (small player
  counts = 5-0 deck dumps). Verified: decks + standings only, **zero match rows**.
- Preliminaries have **full pairings + standings but zero decklists** (751 events since
  2024-07 checked, none has a deck) — unusable for archetype/matchup analysis.

### Performance

A full single-event export (event + all decks as JSON + all matches + standings, one
`json_build_object` query) takes **~1.2s** for a 67-player Challenge (~150KB JSON) — comfortably
under the 5s statement timeout. Per-event chunking is the right export granularity.

## Recommendation for our pipeline

- **One-time bulk seed**: SQL path with date-windowed queries (chunk by month/event to stay under
  the 5s statement timeout), or ask for a dump.
- **Incremental weekly updates**: HTTP raw routes (`/events` → `/decks` + `/matches` + `/standings`)
  alongside the existing melee.gg fetching.
