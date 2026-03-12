# spicerack.gg API Reference

> Reverse-engineered from official docs, client-side JS, and live testing.
>
> **Sources:**
> - [Spicerack API docs](https://docs.spicerack.gg/) (Mintlify-hosted, official)
> - [OpenAPI schema](https://api.spicerack.gg/docs/schema) (DRF-generated)
> - Client JS bundle analysis (`/events/discover` page chunk)
> - [InTrustABC/pauperoppkoelsch](https://github.com/InTrustABC/pauperoppkoelsch) (Python, Pauper metagame tracker)
> - [vermosi/offmeta](https://github.com/vermosi/offmeta) (Supabase importer)
> - Discord: `https://discord.gg/cA9ExSF3TC`

---

## General Notes

### Platform Overview

Spicerack.gg is a tournament management and event discovery platform for TCGs (MTG,
Flesh and Blood, Lorcana, etc.). It is the most popular event search tool for MTG in
North America. Built on Next.js (frontend) with a Django REST Framework backend.
**Acquired by carde.io in 2025.**

### Base URL

```
https://api.spicerack.gg
```

### Authentication

Most V1 endpoints require an API key via header:

```
X-API-Key: sk_*****
```

Keys are created in the organization/store admin panel. Role-based permissions.

**However, several endpoints work without authentication** — see details below.

### Event IDs

Events use sequential numeric integer IDs (observed range: ~2,500,000 to ~3,100,000
as of March 2026). The `TID` field in the export endpoint is a string representation
of the same ID.

### Rate Limiting

Not officially documented. Community implementations (e.g., pauperoppkoelsch) use
~300ms delays between requests as a courtesy.

---

## Public Endpoints (No Auth Required)

### 1. Export Decklists — Bulk Tournament Data

```
GET /api/export-decklists/
```

The single most useful endpoint for metagame analysis. Returns finished tournaments
with published decklists and full standings.

#### Parameters

| Parameter         | Type    | Default | Description                                |
|-------------------|---------|---------|--------------------------------------------|
| `num_days`        | integer | 14      | Number of days to look back                |
| `decklist_as_text`| boolean | false   | Include plaintext decklist in response     |
| `event_format`    | string  | null    | Filter by format (**requires API key**)    |
| `organization_id` | integer | null    | Filter by store ID (**requires API key**)  |

> **Note:** Without an API key, `event_format` and `organization_id` cause HTTP 400.
> The `num_days` parameter works without auth.

#### Response

JSON array of tournament objects (no pagination wrapper):

```json
[
  {
    "TID": "2884857",
    "tournamentName": "LVEL Up Legacy - Winter Cup (2026) - Video Game Galaxy",
    "format": "Legacy",
    "bracketUrl": "https://www.spicerack.gg/events/2884857/tournament",
    "players": 17,
    "startDate": 1772982000,
    "swissRounds": 3,
    "topCut": 8,
    "standings": [
      {
        "name": "patrick olds",
        "decklist": "https://www.moxfield.com/decks/hL9WAerX_EWF5TmEtI6flw",
        "winsSwiss": 3,
        "lossesSwiss": 1,
        "draws": 1,
        "winsBracket": 3,
        "lossesBracket": 0
      }
    ]
  }
]
```

#### Field Notes

- `TID` — string, matches event URL path (e.g., `/events/2884857`)
- `startDate` — Unix timestamp in **seconds**
- `format` — human-readable, mixed case (`"Legacy"`, `"Premodern"`, `"Commander"`)
  NOT the enum values (`LEGACY`, `PREMODERN`, `COMMANDER2`)
- `standings` — ordered by final placement (winner first)
- `decklist` — Moxfield URL or empty string `""`
- Only returns events with lifecycle status `DECKLISTS_PUBLISHED` or `EVENT_FINISHED`

#### Limitations

- **Small result set** — only ~12 events returned for a 69-day window (March 2026)
- Only includes events where organizers explicitly published decklists
- Heavily skewed toward Pauper/Premodern/Legacy community
- No Modern, Pioneer, or Standard events observed
- No pagination — flat array
- No archetype labels (use V1 decklists endpoint per event for that)

#### Supported `event_format` Values (with API key)

`STANDARD`, `MODERN`, `PIONEER`, `LEGACY`, `VINTAGE`, `COMMANDER2`, `PAUPER`,
`BOOSTER_DRAFT`, `SEALED_DECK`, `HISTORIC`, `EXPLORER`, `TIMELESS`, `GLADIATOR`,
`OATHBREAKER`, `PREMODERN`, `STANDARD_BRAWL`, `PAUPER_COMMANDER`, `DUEL`,
`OLDSCHOOL`, `PREDH`, `TRIOS_CONSTRUCTED`, `OTHER`

---

### 2. Magic Events List — Future Events Discovery

```
GET /api/magic-events/
```

Paginated listing of **future/scheduled events only**. Powers the `/events/discover`
page. No auth required.

#### Parameters

| Parameter                  | Type    | Default | Description                          |
|----------------------------|---------|---------|--------------------------------------|
| `page`                     | integer | 1       | Page number                          |
| `page_size`                | integer | 25      | Results per page                     |
| `formats`                  | string  | null    | Format filter (e.g., `MODERN`)       |
| `event_types`              | string  | null    | e.g., `locals`, `regional_championship_qualifier` |
| `num_days`                 | integer | 14      | Forward-looking window in days       |
| `num_miles`                | integer | null    | Distance radius from lat/lng         |
| `latitude`                 | float   | null    | Location filter                      |
| `longitude`                | float   | null    | Location filter                      |
| `rules_enforcement_levels` | string  | null    | e.g., `REGULAR`, `CASUAL`            |
| `selected_stores`          | string  | null    | Store ID filter                      |
| `selected_states`          | string  | null    | State/region filter                  |

#### Response

```json
{
  "page_size": 25,
  "total": 121010,
  "current": 1,
  "next": "https://api.spicerack.gg/api/magic-events/?page=2&page_size=25",
  "previous": null,
  "results": [
    {
      "id": 2985166,
      "name": "Event Name",
      "wizards_event_id": "10360595",
      "description": "...",
      "game_type": "MTG",
      "event_status": "SCHEDULED",
      "event_format": "COMMANDER2",
      "event_type": "LOCALS",
      "start_datetime": "2026-03-10T05:30-0400",
      "end_datetime": null,
      "aware_start_datetime": "2026-03-10T09:30:00Z",
      "full_address": "...",
      "latitude": 35.46974,
      "longitude": 139.62433,
      "timezone": null,
      "cost_in_cents": 50000,
      "currency": "JPY",
      "capacity": 60,
      "number_of_rounds": null,
      "top_cut_size": null,
      "rules_enforcement_level": "REGULAR",
      "pairing_system": null,
      "queue_status": "ACCEPTING_SIGNUPS",
      "event_is_online": false,
      "is_headlining_event": false,
      "is_test_event": false,
      "format_pretty": "Commander",
      "game_type_pretty": "Magic: The Gathering",
      "name_pretty": "Event Name",
      "store": {
        "id": 2990,
        "name": "Store Name",
        "full_address": "...",
        "country": "Japan",
        "latitude": 35.46974,
        "longitude": 139.62433,
        "is_premium": false,
        "wizards_store_id": 12834
      },
      "convention": null,
      "settings": null
    }
  ]
}
```

#### Limitations

- **Future events only** — does not return past/finished events
- Unknown/unsupported query params are silently ignored
- `event_status`, `event_lifecycle_status`, `start_datetime__lte` filters do NOT work
- Cannot be used to discover past tournaments

---

### 3. Individual Event Detail (Public, No Auth)

These V1 endpoints work for **any event ID** (past or future) without authentication:

#### Event Overview

```
GET /api/v1/magic-events/{id}/overview/
```

Returns tournament structure, phases, round info, and lifecycle status.

```json
{
  "id": 2041196,
  "name": "Paupergeddon Main Event",
  "current_round": "...",
  "number_of_incomplete_matches": "0",
  "lifecycle_status": "EVENT_FINISHED",
  "timer_is_running": false,
  "event_format": "PAUPER",
  "game_type": "MTG",
  "maximum_number_of_players_in_match": "2",
  "timezone": "Europe/Rome",
  "aware_start_datetime": "2025-07-05T09:30:00+02:00",
  "tournament_phases": [
    {
      "round_number": 1,
      "status": "COMPLETE",
      "phase_type": "SWISS"
    }
  ]
}
```

#### Event Full Detail

```
GET /api/v1/magic-events/{id}/
```

or equivalently:

```
GET /api/magic-events/{id}/
```

Returns full event object including nested `settings` with `event_lifecycle_status`
and `decklist_status`.

Key `settings` fields:
```json
{
  "event_lifecycle_status": "EVENT_FINISHED",
  "decklist_status": "PUBLISHED",
  "capacity": 150,
  "number_of_rounds": 5,
  "round_duration_in_minutes": 80,
  "points_given_per_win": 5,
  "points_given_per_draw": 1,
  "points_given_per_loss": 0,
  "maximum_number_of_players_in_match": 4,
  "pairings_on_spicerack": true,
  "decklists_on_spicerack": true,
  "decklist_publish_service": "MOXFIELD"
}
```

`event_lifecycle_status` values: `REGISTRATION_OPEN`, `WAITLIST_ONLY`,
`REGISTRATION_CLOSED`, `EVENT_IN_PROGRESS`, `EVENT_FINISHED`,
`DECKLISTS_PUBLISHING`, `DECKLISTS_PUBLISHED`

---

## Authenticated V1 Endpoints (Require API Key)

### Standings

```
GET /api/v1/magic-events/{id}/current_standings/
```

```json
{
  "round_number": 5,
  "standings": [
    {
      "rank": 1,
      "player_id": 123,
      "name": "PlayerName",
      "match_points": 15,
      "record": "5-0-0",
      "match_win_percentage": 100.0,
      "opponent_match_win_percentage": 55.0,
      "game_win_percentage": 80.0,
      "opponent_game_win_percentage": 50.0,
      "wins": 5, "losses": 0, "draws": 0,
      "games_won": 10, "games_lost": 2, "games_drawn": 0,
      "playoff_wins": 0, "playoff_losses": 0
    }
  ]
}
```

### Decklists (with Archetypes)

```
GET /api/v1/magic-events/{id}/decklists/
```

```json
[
  {
    "id": 456,
    "name": "PlayerName - TournamentName",
    "archetype": "Mono Red Aggro",
    "moxfield_deck_json": "...",
    "moxfield_public_id": "abc123",
    "plaintext_list": "4 Lightning Bolt\n...",
    "deck_image_url": "https://..."
  }
]
```

> The `archetype` field is only available here — not in the export endpoint.

### Registrations

```
GET /api/v1/magic-events/{id}/registrations/
```

Returns player registration status, match records, decklist references, byes, payment.

### Tournament Rounds (Pairings)

```
GET /api/v1/tournament-rounds/
GET /api/v1/tournament-rounds/{id}/
GET /api/v1/tournament-rounds/{id}/matches/
GET /api/v1/tournament-rounds/{id}/standings/
```

Round objects include `round_number`, `status` (`IN_PROGRESS`/`UPCOMING`/`COMPLETE`),
and `matches[]` with `table_number`, `player_match_relationships[]` containing
`games_won`, `points_gained`, and player identity.

Optional param on matches: `teams` (boolean) — include team matches.

### Event List (Authenticated)

```
GET /api/v1/magic-events/
```

Returns all events accessible to the authenticated API key (scoped to org/store).

### Conventions

```
GET /api/v1/conventions/
GET /api/v1/conventions/{slug}/
```

Returns convention details including nested `magic_events[]`.

---

## Strategies for Past Tournament Discovery

### Strategy A: Export + Enrichment (No Auth)

1. `GET /api/export-decklists/?num_days=N` → get finished events with decklists
2. For each `TID`, call `/api/v1/magic-events/{TID}/overview/` for metadata
3. Optionally call per-event decklists/standings endpoints

**Yield:** ~12 events for 69 days. Limited to published-decklists events.

### Strategy B: ID Range Scanning (No Auth, Heavy)

Event IDs are sequential integers. Scan a range and hit the overview endpoint:

1. Iterate IDs in range (e.g., 2,800,000 → 3,100,000)
2. `GET /api/v1/magic-events/{id}/overview/` for each
3. Filter by `lifecycle_status == "EVENT_FINISHED"` and date range
4. Fetch decklists/standings for matches

**Yield:** All finished events. **Cost:** ~300K+ requests. Rate limiting likely.

### Strategy C: API Key (Recommended)

With an `sk_*` key:
- `/api/export-decklists/?event_format=MODERN&num_days=69` works with filters
- `/api/v1/magic-events/` returns all org-scoped events
- Full access to all V1 endpoints

Keys are obtained through the Spicerack org admin panel or by contacting support
via Discord (`discord.gg/cA9ExSF3TC`).

---

## Comparison with melee.gg

| Feature                    | spicerack.gg                          | melee.gg                    |
|----------------------------|---------------------------------------|-----------------------------|
| Past event discovery       | Limited (export endpoint only)        | Full (tournament search)    |
| Public API access          | Partial (some endpoints)              | Full (scraping-based)       |
| Auth required              | API key for most V1 endpoints         | None (browser headers only) |
| Decklists                  | Via Moxfield URLs + plaintext         | Embedded in pages           |
| Archetype labels           | Server-assigned (V1 decklists)        | None (must classify)        |
| Standings tiebreakers      | Full (OMW%, GW%, OGW%)               | Full                        |
| Pairings                   | Via tournament-rounds endpoints       | Via DataTables POST         |
| Event ID format            | Sequential integers                   | Sequential integers         |
| Pagination                 | page/page_size (DRF standard)         | DataTables draw/start/length|
| Dominant formats           | Pauper, Premodern, Legacy (community) | All competitive formats     |
| Geographic focus           | North America, Europe, Japan          | Global                      |

---

## Live Test Results (2026-03-10)

### Export Endpoint — All Events (num_days=69, no auth)

| TID     | Tournament Name                                       | Format     | Players | Date       |
|---------|-------------------------------------------------------|------------|---------|------------|
| 2884857 | LVEL Up Legacy - Winter Cup (2026)                    | Legacy     | 17      | 2026-03-01 |
| 3031115 | Tremor Cup - Road to Valencia - Groningen             | Premodern  | 48      | 2026-02-28 |
| 3049399 | cEDH 5K - SCG CON Richmond                           | Commander  | 69      | 2026-02-27 |
| 3067381 | TOP 8 - Lega Pauper Vittorio Veneto WINTER 25-26      | Pauper     | 8       | 2026-02-26 |
| 3001829 | Fantasy Standard Weekly - Mar. 04, 2026               | Other      | 21      | 2026-02-24 |
| 2954082 | 6° Tappa - Lega Pauper Novara                         | Pauper     | 14      | 2026-02-24 |
| 3060430 | Pauper Wednesday - Card & Board Games Cologne         | Pauper     | 19      | 2026-02-24 |
| 2971841 | Swords to Plowshares - Rochester Royals               | Legacy     | 25      | 2026-02-20 |
| 3062809 | Pauper-Tiny - Cacio & Filo                            | Pauper     | 10      | 2026-02-20 |
| 3049396 | FNM Spring Road to Lucca 2026 #6 - LP Chambery       | Pauper     | 20      | 2026-02-19 |
| 3044018 | LyonPauper Top8 Saison1                               | Pauper     | 8       | 2026-02-19 |
| 2720247 | PreModern Cologne                                     | Premodern  | 23      | 2026-02-17 |

**12 total** — Pauper (6), Legacy (2), Premodern (2), Commander (1), Other (1).
No Modern, Pioneer, or Standard.
