# mtgo.com Decklist Data Reference

> Reverse-engineered from live site inspection (Mar 2026) and the archived
> [Badaro/MTGODecklistCache.Tools](https://github.com/Badaro/MTGODecklistCache.Tools) (C#) repository.
>
> **Status (Mar 2026):** The Badaro project was archived Sep 2025 but mtgo.com
> continues to publish decklists in the same embedded-JSON format.

---

## General Notes

### Base URL

```
https://www.mtgo.com
```

### Architecture

The site is a **server-rendered Java web app** (Apache/JSESSIONID). There is no
REST API. All data extraction is done by:

1. Fetching server-rendered listing pages for tournament discovery
2. Fetching individual tournament pages and extracting the embedded
   `window.MTGO.decklists.data` JSON blob from an inline `<script>` tag

### Required Headers

A browser-like User-Agent is sufficient:

```
User-Agent: Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0
```

### Anti-Bot

No Cloudflare challenge, CAPTCHA, or JS challenge observed as of March 2026.
Simple `curl` requests with a User-Agent header work. No cookie handling needed
(the JSESSIONID is set but not required for subsequent requests).

---

## URL Format

### Listing Pages

```
GET /decklists/{year}/{month}
```

**Example:** `GET https://www.mtgo.com/decklists/2026/03`

Month is zero-padded (`01`–`12`). Data available from November 2015 onward.

### Individual Tournament Pages

```
GET /decklist/{slug}{id}
```

**Important:** The slug and numeric event ID are concatenated with **no separator**.
The listing page `<a>` tags provide the exact href.

```
✅ /decklist/pauper-challenge-32-2026-03-0812834527     → 200 OK
❌ /decklist/pauper-challenge-32-2026-03-08/12834527    → 302 redirect to /decklists
```

The slug format is: `{name-slug}-{YYYY-MM-DD}{eventId}`.

**More examples:**
```
/decklist/modern-challenge-64-2026-03-0712834511
/decklist/modern-showcase-challenge-2026-03-0812834457
/decklist/legacy-rc-super-qualifier-2026-03-0712834456
/decklist/premodern-challenge-32---contraption-2026-01-3112831739
```

---

## Step 1: Tournament Discovery (HTML Parsing)

### Request

```
GET /decklists/{year}/{month}
```

### Response

Server-rendered HTML. No pagination — the entire month is returned in one page.

### HTML Structure

```html
<ul class="decklists-list">
  <li class="decklists-item">
    <a href="/decklist/pauper-challenge-32-2026-03-0812834527" class="decklists-link">
      <div class="decklists-icon"></div>
      <div class="decklists-details">
        <h3>Pauper Challenge 32</h3>
      </div>
      <time datetime="2026-03-08T00:00:00Z" class="decklists-date">
        <span class="month">March</span>
        <span class="day">8</span>
        <span class="year">2026</span>
      </time>
    </a>
  </li>
</ul>
```

### XPath Selectors (from Badaro)

| Data | Selector |
|------|----------|
| Tournament container | `//li[@class='decklists-item']` |
| Title | `a/div/h3` → `InnerHtml` |
| URL | `a` → `href` attribute |
| Date | `a/time` → `datetime` attribute (ISO 8601 UTC) |

### Filtering for Challenges & Showcases

Filter by matching the `<h3>` text:

| Pattern | Event Type | Include? |
|---------|-----------|----------|
| `*Challenge 32*` | 32-player Challenge | Yes |
| `*Challenge 64*` | 64-player Challenge | Yes |
| `*Showcase Challenge*` | Showcase Challenge | Yes |
| `*Super Qualifier*` | RC Super Qualifier | Optional |
| `*Trial*` | Duel Commander Trial | No |
| `*League*` | League (no pairings) | No |
| `*Preliminary*` | Preliminary event | No |

### Available Formats & Frequency (observed Jan–Mar 2026)

| Format | Slug prefix | Challenge sizes | ~Events/week |
|--------|-------------|----------------|-------------|
| Modern | `modern-challenge-` | 32, 64 | 8–10 |
| Standard | `standard-challenge-` | 32, 64 | 5–6 |
| Pioneer | `pioneer-challenge-` | 32 | 4–5 |
| Legacy | `legacy-challenge-` | 32 | 4–5 |
| Pauper | `pauper-challenge-` | 32 | 3–4 |
| Vintage | `vintage-challenge-` | 32 | 2–3 |
| Premodern | `premodern-challenge-` | 32 | 2–3 |

**Showcase events** occur ~1/month for Standard, Modern, Legacy, and Vintage.

**Our target formats:** Standard, Modern, Legacy, Pauper, Vintage, Premodern.
Pioneer is available but not currently in our `data/` directory.

---

## Step 2: Tournament Details (Embedded JSON)

### Request

```
GET /decklist/{slug}{id}
```

### JSON Extraction

The HTML page contains a `<script>` block with:

```javascript
window.MTGO = window.MTGO || {};
window.MTGO.decklists = window.MTGO.decklists || {};
window.MTGO.decklists.data = { ... };
window.MTGO.decklists.type = 'tournament';
window.MTGO.decklists.roundNames = [
    'Final', 'Semifinals', 'Quarterfinals',
    'Eighth-finals', '16th-finals', '32nd-finals', '64th-finals'
];
```

Extract the JSON payload:

```typescript
const line = htmlLines.find(l => l.trim().startsWith('window.MTGO.decklists.data = '));
const json = line.trim().slice(29, -1); // strip prefix (29 chars) and trailing ;
const data = JSON.parse(json);
```

### Data Availability

Newly completed tournaments may temporarily show only `brackets` data (no decklists,
standings, or winloss). Full data appears within ~24–48 hours of event completion.
Skip events where the `decklists` key is missing.

### Tournament vs League Detection

If `starttime` exists → tournament. If `publish_date` exists → league.

---

## JSON Data Structure

### Top-Level Fields

```json
{
  "event_id": "12834527",
  "description": "Pauper Challenge 32",
  "starttime": "2026-03-08 17:00:00.0",
  "format": "CPAUPER",
  "type": "TOURNAMENT",
  "inplayoffs": "1",
  "url": "https://www.mtgo.com/premier-play-prelims-and-format-challenges#challenges",
  "site_name": "pauper-challenge-32-2026-03-0812834527",
  "decklists": [ ... ],
  "brackets": [ ... ],
  "standings": [ ... ],
  "winloss": [ ... ],
  "final_rank": [ ... ],
  "player_count": { ... }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `event_id` | string | Unique event identifier |
| `description` | string | Human-readable event name |
| `starttime` | string | `"YYYY-MM-DD HH:mm:ss.0"` (UTC). Present for tournaments, absent for leagues. |
| `format` | string | Internal format code (see table below) |
| `type` | string | `"TOURNAMENT"` for challenges, `"LEAGUE"` for leagues |
| `inplayoffs` | string | `"1"` if event has a playoff bracket |
| `url` | string | Link to event info page on mtgo.com |
| `site_name` | string | URL slug for this event's decklist page |

### Format Codes

| Code | Format |
|------|--------|
| `CSTANDARD` | Standard |
| `CMODERN` | Modern |
| `CPIONEER` | Pioneer |
| `CLEGACY` | Legacy |
| `CPAUPER` | Pauper |
| `CVINTAGE` | Vintage |
| `CPREMODERN` | Premodern (March 2026+) |
| `CHULAHOOP` | Contraption / Premodern+Contraption (pre-March 2026) |
| `CCMDRDUEL` | Duel Commander |

### `player_count` Object

```json
{
  "tournamentid": "12834527",
  "players": "62",
  "queued_players": "62"
}
```

`players` is the **total entrants**, not the number of published decklists. A
Challenge 32 with 62 entrants still publishes exactly 32 decklists.

---

### `decklists[]` Array

Always **32 entries** for challenges and showcases.

```typescript
interface MtgoDeck {
  loginid: string;           // Player's MTGO account ID
  tournamentid: string;      // Event ID
  decktournamentid: string;  // Unique decklist submission ID
  player: string;            // MTGO username
  main_deck: MtgoCard[];     // Mainboard cards
  sideboard_deck: MtgoCard[];// Sideboard cards
  wins?: { wins: string };   // League-only: win count
}
```

#### Card Entry Structure

```json
{
  "decktournamentid": "58471820",
  "docid": "41361",
  "ptc": "0",
  "qty": "4",
  "sideboard": "false",
  "card_attributes": {
    "digitalobjectcatalogid": "41361",
    "card_name": "Gladecover Scout",
    "cost": "1",
    "rarity": "COMMON",
    "color": "GREEN",
    "cardset": "M12",
    "card_type": "ISCREA",
    "colors": ["COLOR_GREEN"]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `qty` | string | Number of copies |
| `sideboard` | string | `"true"` or `"false"` |
| `card_attributes.card_name` | string | Card name |
| `card_attributes.cost` | string | Converted mana cost |
| `card_attributes.rarity` | string | `COMMON`, `UNCOMMON`, `RARE`, `MYTHIC`, `PROMO` |
| `card_attributes.color` | string | `WHITE`, `BLUE`, `BLACK`, `RED`, `GREEN`, `MULTICOLORED`, `COLORLESS` |
| `card_attributes.cardset` | string | Set code (e.g., `M12`, `GPT`, `DMR`) |
| `card_attributes.card_type` | string | `ISCREA` (creature), `SORCRY`, `INSANT`, `ENCHMT`, `ARTFCT`, `LAND  `, `PLNSWK` |
| `card_attributes.colors` | array | `COLOR_WHITE`, `COLOR_BLUE`, `COLOR_BLACK`, `COLOR_RED`, `COLOR_GREEN`, `COLOR_COLORLESS` |

`main_deck` contains unique card entries (aggregated), so `qty` is the total copies.
Typically 12–18 entries per deck (not 60 individual cards).

---

### `standings[]` Array

Swiss standings after the last Swiss round. Contains **32 entries** (matching
decklists). **Not ordered by rank** — sort by `rank` for display.

```json
{
  "tournamentid": "12834527",
  "loginid": "181637",
  "login_name": "Boin",
  "rank": "3",
  "score": "15",
  "opponentmatchwinpercentage": "0.6389",
  "gamewinpercentage": "0.6471",
  "opponentgamewinpercentage": "0.5752",
  "eliminated": "false"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `loginid` | string | Player's MTGO account ID |
| `login_name` | string | Player's MTGO username |
| `rank` | string | Swiss standing rank (1-based) |
| `score` | string | Match points (3 per win) |
| `opponentmatchwinpercentage` | string | OMWP tiebreaker (decimal) |
| `gamewinpercentage` | string | GWP tiebreaker (decimal) |
| `opponentgamewinpercentage` | string | OGWP tiebreaker (decimal) |
| `eliminated` | string | `"true"` if eliminated in playoffs |

**All values are strings.** Parse to numbers as needed.

---

### `winloss[]` Array

Win-loss records for all 32 published players.

```json
{
  "tournamentid": "12834527",
  "loginid": "667393",
  "losses": "3",
  "wins": "3"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `loginid` | string | Player's MTGO account ID |
| `wins` | string | Total match wins (Swiss only) |
| `losses` | string | Total match losses (Swiss only) |

**No draws field.** Infer draws: `draws = totalRounds - wins - losses`, where
`totalRounds` comes from `final_rank[0].roundnumber`.

---

### `final_rank[]` Array

Final rankings after playoffs complete. Includes all 32 published players.

```json
{
  "tournamentid": "12834527",
  "loginid": "3190187",
  "rank": "1",
  "roundnumber": "9"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `loginid` | string | Player's MTGO account ID |
| `rank` | string | Final rank after playoffs |
| `roundnumber` | string | Total rounds in the event (Swiss + playoffs) |

This is the authoritative source for both **final ranking** (post-playoffs) and
**total round count**.

---

### `brackets[]` Array

Playoff bracket. Contains **3 entries** for a standard top-8:

| Array position | Match count | `index` | Round name |
|---------------|-------------|---------|------------|
| `brackets[0]` | 4 | 2 | Quarterfinals |
| `brackets[1]` | 2 | 1 | Semifinals |
| `brackets[2]` | 1 | 0 | Finals |

The `index` field counts down: QF = `len(brackets) - 1`, Finals = `0`.

```json
{
  "matches": [
    {
      "players": [
        {
          "loginid": 2386103,
          "player": "NickNorman",
          "seeding": 4,
          "wins": 2,
          "losses": 0,
          "winner": true
        },
        {
          "loginid": 3329234,
          "player": "AnpanMoeMoe",
          "seeding": 5,
          "wins": 0,
          "losses": 2,
          "winner": false
        }
      ]
    }
  ],
  "index": 2
}
```

#### Bracket Player Entry

| Field | Type | Description |
|-------|------|-------------|
| `loginid` | **number** | Player's MTGO account ID |
| `player` | string | MTGO username |
| `seeding` | **number** | Seed in bracket (1–8) |
| `wins` | **number** | Games won in this match |
| `losses` | **number** | Games lost in this match |
| `winner` | **boolean** | `true` if this player won |

**Type inconsistency:** Bracket data uses **numbers** for `loginid`, `wins`,
`losses`, `seeding`. All other arrays use **strings**. Handle both when building
the `loginid → player` lookup.

---

## Data Limitations vs Melee

| Aspect | melee.gg | mtgo.com |
|--------|----------|----------|
| Swiss pairings (per round) | Full pairings per round | **Not available** |
| Game scores per match | In Result string | **Only in playoffs** |
| Standings | Full with all tiebreakers | Full with all tiebreakers |
| Decklists | Per player (via decklist ID) | Top 32 only (embedded) |
| Player count | Exact from metadata | Exact from `player_count.players` |
| Round count | From round selectors | From `final_rank[].roundnumber` |
| Reported archetypes | From decklist metadata | **Not available** |
| Match draws | Tracked | **Must infer** (rounds - W - L) |
| Multiple formats | Supported | Single format per event |

### Critical Gap: No Swiss Pairings

We only get:
- **7 playoff matches** (4 QF + 2 SF + 1 F) with game scores
- **32 decklists** with final W-L records
- **Full standings** for 32 players with tiebreakers

We do **not** get the ~80 Swiss matches that occurred in a 32-player Challenge
(5 rounds × 16 matches/round).

---

## Mapping to Our Tournament JSON Structure

### Tournament Metadata

```typescript
{
  id: `mtgo-${data.event_id}`,
  name: data.description,                         // "Pauper Challenge 32"
  date: data.starttime.slice(0, 10),              // "2026-03-08"
  formats: [formatCodeToName(data.format)],       // ["Pauper"]
  url: `https://www.mtgo.com/decklist/${data.site_name}`,
  fetchedAt: new Date().toISOString(),
  playerCount: parseInt(data.player_count.players),
  roundCount: parseInt(data.final_rank[0].roundnumber),
  source: "mtgo",
  tabletop: false
}
```

### Players

```typescript
// Key: loginid (as string)
{
  [loginid]: {
    name: standing.login_name,
    username: standing.login_name,
    rank: parseInt(finalRank.rank),               // From final_rank, not standings
    points: parseInt(standing.score),
    matchRecord: `${wl.wins}-${wl.losses}-${draws}`,
    decklistIds: [generatedUuid],                 // From decktournamentid, or [] if no decklist
    reportedArchetypes: []                        // Not available — needs classification
  }
}
```

### Decklists

```typescript
// Key: generated UUID (e.g., uuid5 from "mtgo-{decktournamentid}")
{
  [uuid]: {
    playerId: String(deck.loginid),
    mainboard: deck.main_deck.map(c => ({
      cardName: c.card_attributes.card_name,
      quantity: parseInt(c.qty)
    })),
    sideboard: deck.sideboard_deck.map(c => ({
      cardName: c.card_attributes.card_name,
      quantity: parseInt(c.qty)
    })),
    commanders: null,
    companion: null,                              // Would need card-level detection
    reportedArchetype: null                       // Not available from MTGO
  }
}
```

### Rounds (Playoffs Only)

```typescript
{
  "playoffs-qf": {
    name: "Quarterfinals",
    number: 900,
    isPlayoff: true,
    matches: brackets[0].matches.map(m => {
      const winner = m.players.find(p => p.winner);
      const loser  = m.players.find(p => !p.winner);
      return {
        player1Id: String(winner.loginid),
        player2Id: String(loser.loginid),
        result: `${winner.wins}-${loser.wins}-0`,
        winnerId: String(winner.loginid)
      };
    })
  },
  "playoffs-sf": { name: "Semifinals",  number: 950, isPlayoff: true, matches: [...] },
  "playoffs-f":  { name: "Finals",      number: 999, isPlayoff: true, matches: [...] }
}
```

### Index Entry

```typescript
{
  id: "mtgo-12834527",
  name: "Pauper Challenge 32",
  cleanName: "Pauper Challenge 32",
  date: "2026-03-08",
  format: "Pauper",
  source: "mtgo",
  url: "https://www.mtgo.com/decklist/pauper-challenge-32-2026-03-0812834527",
  playerCount: 62,
  roundCount: 9,
  importance: "competitive",
  tabletop: false,
  pairings: false,
  path: "2026-03/mtgo-12834527.json"
}
```

### Importance Mapping

| MTGO Event Type | Our Importance |
|----------------|----------------|
| Showcase Challenge | premier |
| Super Qualifier | premier |
| Challenge 64 | competitive |
| Challenge 32 | competitive |

---

## Implementation Strategy

### 1. Tournament Discovery

For each month from 2026-01 to current:

```
GET /decklists/{year}/{month}
```

Parse `li.decklists-item` elements. For each:
1. Extract `a[href]` for the URL slug
2. Extract `h3` text for the tournament name
3. Extract `time[datetime]` for the date
4. Filter: keep `*Challenge*` and `*Showcase*`; skip `*League*`, `*Preliminary*`, `*Trial*`
5. Filter by target formats

### 2. Tournament Data Fetch

```
GET /decklist/{slug}{id}
```

1. Fetch full HTML page
2. Find line starting with `window.MTGO.decklists.data = `
3. Extract JSON (strip 29-char prefix and trailing `;`)
4. Verify `starttime` exists (tournament, not league)
5. Skip if `decklists` key is missing (data not yet published)

### 3. Transform to Our Format

- Parse all string numbers to integers/floats
- Generate stable UUIDs for decklists (e.g., `uuid5` from `"mtgo-{decktournamentid}"`)
- Infer draws: `totalRounds - wins - losses`
- Build playoff rounds from brackets (winner as player1)
- Leave `reportedArchetype` as `null` (classification happens downstream)

### 4. Rate Limiting

- ~1 second delay between requests
- ~150–200 challenge/showcase events per month across all formats
- Each event is a single HTTP request (all data embedded in page)

---

## Appendix A: Event Naming & Slug Patterns

| Name Pattern | Slug Pattern | Published Decklists |
|-------------|-------------|-------------------|
| `{Format} Challenge 32` | `{format}-challenge-32-{date}{id}` | 32 |
| `{Format} Challenge 64` | `{format}-challenge-64-{date}{id}` | 32 |
| `{Format} Showcase Challenge` | `{format}-showcase-challenge-{date}{id}` | 32 |
| Premodern+Contraption (pre-Mar 2026) | `premodern-challenge-32---contraption-{date}{id}` | 32 |

## Appendix B: Historical Format Changes

- **Jan–Feb 2026**: Premodern and Contraption share a combined event
  (`premodern-challenge-32---contraption`, format code `CHULAHOOP`)
- **March 2026+**: Split into separate events — `premodern-challenge-32`
  (`CPREMODERN`) and `contraption-challenge-32` (`CHULAHOOP`)

## Appendix C: Open Questions

1. **Companion detection:** MTGO decklists don't tag companion cards separately.
   Would need card-level detection (check if a legal companion is in the sideboard
   and the deck satisfies its constraint). Low priority.

2. **Duel Commander:** MTGO runs "Duel Commander Trial 16" events with a different
   naming pattern and 16-player format. Skip unless we add Duel Commander.

3. **Contraption:** New MTGO format (`CHULAHOOP`). Not in our scope.
