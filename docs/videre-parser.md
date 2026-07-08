# Videre (mtgo-db) tournament parser

> Design note / proposal. **Status: implemented 2026-07-08** (`scripts/fetch-videre.ts`,
> `scripts/lib/videre-client.ts`, `scripts/lib/videre-assembler.ts`; verified live against
> July 2026 Pauper — 6 events fetched, mtgo twins superseded).
> Date: 2026-07-08. Branch: `feature/videre-parser`.
> Background: `research/videre-mtgo-data-access.md` (access verified live on 2026-07-08).

## Context

The Videre Project grants public read-only SQL access to its MTGO database
(57k events, 2008→today). Compared to our existing `mtgo.com` source
(`scripts/fetch-mtgo.ts`), the same events there come with data we currently
lack:

- **Full Swiss pairings + per-game results** — our mtgo source has playoff
  brackets only (`pairings: false` in every mtgo index entry). Videre has every
  round: verified 53→52→45→42→39→36→8→4→2 player-rows for a 53-player
  Challenge, byes and playoffs included. This unlocks **matchup matrices for
  MTGO events**, which today only melee events provide.
- Standings with full tiebreakers (OMW%, GW%, OW%).
- Historical depth (Challenges back years; Dailies, Leagues, Prelims if ever
  wanted).

Goal: a new fetch pipeline `videre → data/<fmt>/<YYYY-MM>/videre-<id>.json`
producing the exact same `TournamentData` shape as the melee and mtgo
assemblers, plus the per-format `index.json` entry.

## Source data shape (verified live)

One SQL query per event returns everything (~1.2s for a 67-player Challenge,
well under the role's 5s statement timeout):

- `events(id, name, date, format, kind, rounds, players)` — `format` is
  capitalized (`'Pauper'`), `kind ∈ {League, Preliminary, Challenge, Showcase,
  Qualifier, Daily, Premier, Championship}`. `rounds` = **Swiss rounds only**;
  playoff rounds appear in `matches` as rounds `> events.rounds`.
- `decks(id, event_id, player, mainboard, sideboard)` — card entries carry
  `(mtgo_catalog_id, name, quantity)`. Split cards use `"Alive // Well"` form.
- `matches(event_id, round, player, opponent, record, result, isbye, games)` —
  **one row per player per round** (each match appears twice, mirrored, sharing
  game IDs). `result ∈ {win, loss, draw}` exactly. `opponent IS NULL ⟺ isbye`
  (byes are recorded as a `win`). `record` is game-level from the row-owner's
  perspective (`"2-1-0"`).
- `standings(event_id, rank, player, record, points, omwp, gwp, owp)` —
  `record` is match-level **including playoffs** (winner of a 6-round
  Challenge shows `8-1-0`).
- Their `archetypes` table: third-party labels, sparse on recent events —
  **ignored** (we classify ourselves).

## Plan

### 1. NEW `scripts/lib/videre-client.ts`

- Connection via **`Bun.sql`** (native Postgres client in bun 1.3 — zero new
  dependencies) to `postgres://public_api@127.0.0.1:<port>/mtgo`, port from
  `VIDERE_PORT` (default 5432).
- The cloudflared bridge is a **precondition, not managed by the script**: on
  connection failure, fail fast with the exact command to run
  (`cloudflared access tcp --hostname public-db.videreproject.com --url 127.0.0.1:5432`).
  Keeps the client trivial; auto-spawning cloudflared can come later if the
  weekly pipeline wants it.
- Two functions:
  - `listEvents({minDate, maxDate, formats, kinds})` — discovery query over
    `events`, returns `{id, name, date, format, kind, rounds, players}[]`.
  - `fetchEvent(id)` — **one server-side JSON query** (`json_build_object` +
    `json_agg` + `unnest` over the composite arrays, exactly the query
    validated in research). The client receives plain JSON; no composite-type
    parsing in TypeScript at all.

### 2. NEW `scripts/lib/videre-assembler.ts`

`assembleVidereTournament(raw): TournamentData`, mirroring
`mtgo-assembler.ts`:

- **meta**: `id: "videre-<eventId>"`, `source: "videre"`, `date`/`name` from
  `events`, `formats: [format]` (already capitalized),
  `url: "https://api.videreproject.com/events?event_id=<id>"`,
  `playerCount` from `events.players`, `roundCount` = max round seen in
  `matches` (Swiss + playoffs, matching how melee counts), `tabletop: false`.
- **players**: keyed by player name (like mtgo's loginid). `rank`, `points`
  from `standings`; `matchRecord` = `standings.record` as-is;
  `decklistIds: ["videre-deck-<deckId>"]`; `reportedArchetypes: []`.
- **decklists**: `videre-deck-<deckId>` → `CardEntry[]` with
  `getFrontFace(name)` (same DFC/split normalization as the mtgo assembler);
  `commanders/companion/reportedArchetype: null`.
- **rounds** — the new logic, from `matches`:
  - Deduplicate mirrored rows: keep the `result = 'win'` row per pairing
    (winner's perspective gives `result` string directly from `record`); for
    draws keep the row where `player < opponent`, `winnerId: null`; byes
    (`isbye`) → `{player1Id, player2Id: null, result: "bye", winnerId: player1Id}`.
  - Rounds `1..events.rounds` → Swiss: key `String(n)`, name `"Round N"`,
    `isPlayoff: false`.
  - Rounds `> events.rounds` → playoffs, mapped **from the last round
    backwards** to the same keys/numbers the mtgo assembler uses: Finals
    `playoffs-f`/999, Semifinals `playoffs-sf`/950, Quarterfinals
    `playoffs-qf`/900. (Position-from-end, not player-count, so Top-4 events
    map correctly.)

### 3. NEW `scripts/fetch-videre.ts`

CLI mirroring `fetch-mtgo.ts`:

```
bun run scripts/fetch-videre.ts [--from YYYY-MM] [--to YYYY-MM]
    [--format <name>] [--dry-run]
```

- Discovery via `listEvents` instead of scraping listing pages. Event
  filtering by `kind` + name, replicating the current mtgo policy:
  `kind IN ('Challenge','Showcase','Qualifier')` + the existing
  `isTargetEvent`-style name check (Challenge 32/64, Showcase Challenge, Super
  Qualifier). Leagues/Prelims/Dailies out of scope (see locked decisions).
- Formats: the current `TARGET_FORMATS` minus Duel Commander (**not in
  videre** — their `formattype` has no Commander variants; DC keeps coming
  from `fetch-mtgo.ts`).
- Skip an event only if `videre-<id>.json` already exists.
- Write file + `updateFormatIndex` entry with `source: "videre"`,
  **`pairings: true`**, importance/cleanName via the existing helpers.
- **Supersede the mtgo twin** (videre IDs *are* MTGO event IDs): if
  `data/<fmt>/<YYYY-MM>/mtgo-<id>.json` exists, delete the file; the index
  update passes `{ supersedesId: "mtgo-<id>" }` to `updateFormatIndex`, which
  replaces the old entry in place and **carries any manual
  `cleanName`/`importance` overrides onto the new `videre-<id>` entry** using
  its existing manually-edited detection — one atomic read-modify-write of
  `index.json`, no separate remove step. Checked: nothing outside
  `data/<fmt>/` references tournament IDs (archetype YAMLs are signature-card
  based), so the `mtgo-X` → `videre-X` id change is contained to the format
  dir + its index.

### 4. Type change (one line + index type)

`src/lib/types/tournament.ts`: `TournamentSource` gains `"videre"`.
Checked: the app never branches on source values outside this type, so no UI
work.

### 5. Tests

`tests/integration/videre-assembler.test.ts`, with a fixture captured from the
real event 12846504 (Pauper Challenge 32, 2026-07-05 — the event manually
verified in research), trimmed to a handful of players:

- mirrored match rows collapse to one `MatchResult` per pairing, winner's
  perspective
- bye row → `result: "bye"`, `player2Id: null`
- draw row (synthetic) → `winnerId: null`, kept exactly once
- Swiss vs playoff round mapping (rounds 7/8/9 of a 6-round event →
  `playoffs-qf/sf/f`)
- split-card name normalized via `getFrontFace`
- standings → rank/points/matchRecord mapping

Verify: `bun run test tests/integration/videre-assembler.test.ts`, then a live
`--dry-run` and a single-event fetch compared by eye against
`mtgo-12846504.json`.

## What we reuse unchanged

- `scripts/lib/importance.ts` (`inferImportance`, `cleanTournamentName`,
  `toFormatSlug`), `scripts/lib/index-utils.ts` (override-preserving index
  writes), `getFrontFace` from `src/lib/utils/card-normalizer`.
- `TournamentData`/`DecklistInfo` types — no schema changes.

## Decisions locked with the user (2026-07-08)

1. **Videre supersedes mtgo files.** When `videre-<id>.json` is written and a
   reciprocal `mtgo-<id>.json` exists, the mtgo file is **deleted** and its
   index entry replaced (manual overrides carried over). See step 3.
2. **`fetch-mtgo.ts` remains for Duel Commander only.** Its `TARGET_FORMATS`
   shrinks to `Duel Commander`; videre is the source for the other 7 formats.
   (Follow-up: point `.github/workflows/fetch-mtgo.yml` at both scripts, or
   split the cron — out of scope for this parser.)
3. **Leagues and Preliminaries stay out — verified against the live DB:**
   - Leagues: decks + standings only, **zero match rows** (checked the 5 most
     recent leagues) — user's assumption confirmed, no pairings exist.
   - Preliminaries: full pairings and standings, but **zero decklists** — 751
     Preliminary events since 2024-07 checked, not one has a deck. Pairings
     without decklists can't feed archetype classification or matchup
     matrices, so they're useless to us. Revisit only if videre ever ingests
     prelim decklists.
