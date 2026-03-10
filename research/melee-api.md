# melee.gg Internal API Reference

> Reverse-engineered from open-source implementations. Not an official API.
>
> **Primary sources:**
> - [Badaro/MTGODecklistCache.Tools](https://github.com/Badaro/MTGODecklistCache.Tools) (C#, most active)
> - [MagicLegacy/mtgmelee-client](https://github.com/MagicLegacy/mtgmelee-client) (PHP, clean implementation)
> - [j6e/mtg_accumulated_data](https://github.com/j6e/mtg_accumulated_data) (curl captures)
> - [gabriel-ballesteros/mtg-metagame-scraper](https://github.com/gabriel-ballesteros/mtg-metagame-scraper) (Python/Selenium)

---

## General Notes

### Base URL

```
https://melee.gg
```

The old domain `https://mtgmelee.com` still works and redirects, but all open-source
tools now use `melee.gg`.

### Required Headers

All requests should include a browser-like User-Agent. The Badaro C# client uses:

```
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0
```

For POST (DataTables) requests, the curl capture from `j6e/mtg_accumulated_data` shows these additional headers:

```
Accept: application/json, text/javascript, */*; q=0.01
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
X-Requested-With: XMLHttpRequest
```

### Authentication

No authentication is required for any of these endpoints.

### Cloudflare / Anti-Bot

As of late 2025, melee.gg does **not** appear to use aggressive Cloudflare anti-bot
(no JS challenge, no Turnstile CAPTCHA). The Badaro C# client uses a simple
`WebClient` with a User-Agent header and no cookie handling, and it works fine.
The Python Selenium scraper (`gabriel-ballesteros`) uses a full headless Chrome
browser, but that's overkill for the current state of the site.

There are no reported Cloudflare blocking issues in the Badaro repo issues. The
known issues (#12, #13) are about melee.gg's **data inconsistencies**, not
about being blocked.

### DataTables Pattern

The POST endpoints use the jQuery DataTables server-side processing protocol.
The body is `application/x-www-form-urlencoded` with these standard parameters:

| Parameter | Description |
|-----------|-------------|
| `draw` | Request sequence counter (use `1`) |
| `columns[N][data]` | Column field name |
| `columns[N][name]` | Column name (same as data) |
| `columns[N][searchable]` | `true` or `false` |
| `columns[N][orderable]` | `true` or `false` |
| `columns[N][search][value]` | Per-column search (empty string) |
| `columns[N][search][regex]` | `false` |
| `order[0][column]` | Index of column to sort by |
| `order[0][dir]` | `asc` or `desc` |
| `start` | Offset (0-based) |
| `length` | Page size (default `25`) |
| `search[value]` | Global search (empty string) |
| `search[regex]` | `false` |

---

## Endpoint 1: Tournament Page (HTML)

### Request

```
GET /Tournament/View/{tournamentId}
```

**Example:** `GET https://melee.gg/Tournament/View/72980`

### Response

Returns full HTML page. Key data is extracted by parsing the DOM:

#### Round IDs (for standings/pairings)

Look for buttons in the rounds selector:

```html
<button class="btn btn-gray round-selector"
        data-id="242297"
        data-is-completed="True"
        data-is-started="True"
        data-name="Round 15">
  Round 15
</button>
```

**Selector (Badaro):**
```
//button[@class='btn btn-gray round-selector' and @data-is-completed='True']
```

**Selector (MagicLegacy PHP):**
```
#pairings-round-selector-container > button
```

Attributes extracted per button:
- `data-id` - the round ID (integer, used for standings/pairings POST endpoints)
- `data-name` - round name (e.g., "Round 1", "Top 8", "Quarterfinals")
- `data-is-completed` - "True" or "False"
- `data-is-started` - "True" or "False"

#### Tournament Formats

```html
<p id="tournament-headline-registration">
  ... | ... | Format: Draft, Standard, Draft2
</p>
```

The format text is the 3rd pipe-delimited segment, after "Format: ", comma-separated.

#### Tournament Name & Date

```html
<div id="tournament-headline-details-card">
  <a href="/Tournament/View/72980">World Championship XXIX</a>
</div>

<p id="tournament-headline-start-date-field">
  <span data-value="9/22/2023 9:00:00 AM">...</span>
</p>
```

### Parsed Result

```typescript
interface TournamentInfo {
  id: number;           // 72980
  roundIds: number[];   // [242278, 242279, ..., 242297]
  formats: string[];    // ["Draft", "Standard", "Draft2"]
}
```

---

## Endpoint 2: Round Standings (POST, JSON)

### Request

```
POST /Standing/GetRoundStandings
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
```

### POST Body Columns

| Index | data | name | searchable | orderable |
|-------|------|------|------------|-----------|
| 0 | Rank | Rank | true | true |
| 1 | Player | Player | false | false |
| 2 | Decklists | Decklists | false | true |
| 3 | MatchRecord | MatchRecord | false | false |
| 4 | GameRecord | GameRecord | false | false |
| 5 | Points | Points | true | true |
| 6 | OpponentMatchWinPercentage | OpponentMatchWinPercentage | false | true |
| 7 | TeamGameWinPercentage | TeamGameWinPercentage | false | true |
| 8 | OpponentGameWinPercentage | OpponentGameWinPercentage | false | true |
| 9 | FinalTiebreaker | FinalTiebreaker | true | true |
| 10 | OpponentCount | OpponentCount | true | true |

**Extra parameters:**
- `order[0][column]` = `0` (sort by Rank)
- `order[0][dir]` = `asc`
- `start` = `{offset}` (0, 25, 50, ...)
- `length` = `25`
- `roundId` = `{roundId}` (from tournament page parsing)

### Full URL-encoded body (template)

```
draw=1&columns%5B0%5D%5Bdata%5D=Rank&columns%5B0%5D%5Bname%5D=Rank&columns%5B0%5D%5Bsearchable%5D=true&columns%5B0%5D%5Borderable%5D=true&columns%5B0%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B0%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B1%5D%5Bdata%5D=Player&columns%5B1%5D%5Bname%5D=Player&columns%5B1%5D%5Bsearchable%5D=false&columns%5B1%5D%5Borderable%5D=false&columns%5B1%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B1%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B2%5D%5Bdata%5D=Decklists&columns%5B2%5D%5Bname%5D=Decklists&columns%5B2%5D%5Bsearchable%5D=false&columns%5B2%5D%5Borderable%5D=true&columns%5B2%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B2%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B3%5D%5Bdata%5D=MatchRecord&columns%5B3%5D%5Bname%5D=MatchRecord&columns%5B3%5D%5Bsearchable%5D=false&columns%5B3%5D%5Borderable%5D=false&columns%5B3%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B3%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B4%5D%5Bdata%5D=GameRecord&columns%5B4%5D%5Bname%5D=GameRecord&columns%5B4%5D%5Bsearchable%5D=false&columns%5B4%5D%5Borderable%5D=false&columns%5B4%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B4%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B5%5D%5Bdata%5D=Points&columns%5B5%5D%5Bname%5D=Points&columns%5B5%5D%5Bsearchable%5D=true&columns%5B5%5D%5Borderable%5D=true&columns%5B5%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B5%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B6%5D%5Bdata%5D=OpponentMatchWinPercentage&columns%5B6%5D%5Bname%5D=OpponentMatchWinPercentage&columns%5B6%5D%5Bsearchable%5D=false&columns%5B6%5D%5Borderable%5D=true&columns%5B6%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B6%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B7%5D%5Bdata%5D=TeamGameWinPercentage&columns%5B7%5D%5Bname%5D=TeamGameWinPercentage&columns%5B7%5D%5Bsearchable%5D=false&columns%5B7%5D%5Borderable%5D=true&columns%5B7%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B7%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B8%5D%5Bdata%5D=OpponentGameWinPercentage&columns%5B8%5D%5Bname%5D=OpponentGameWinPercentage&columns%5B8%5D%5Bsearchable%5D=false&columns%5B8%5D%5Borderable%5D=true&columns%5B8%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B8%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B9%5D%5Bdata%5D=FinalTiebreaker&columns%5B9%5D%5Bname%5D=FinalTiebreaker&columns%5B9%5D%5Bsearchable%5D=true&columns%5B9%5D%5Borderable%5D=true&columns%5B9%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B9%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B10%5D%5Bdata%5D=OpponentCount&columns%5B10%5D%5Bname%5D=OpponentCount&columns%5B10%5D%5Bsearchable%5D=true&columns%5B10%5D%5Borderable%5D=true&columns%5B10%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B10%5D%5Bsearch%5D%5Bregex%5D=false&order%5B0%5D%5Bcolumn%5D=0&order%5B0%5D%5Bdir%5D=asc&start={start}&length=25&search%5Bvalue%5D=&search%5Bregex%5D=false&roundId={roundId}
```

### Response (JSON)

Standard DataTables server-side response:

```json
{
  "draw": 1,
  "recordsTotal": 207,
  "recordsFiltered": 207,
  "data": [
    {
      "Rank": 1,
      "Points": 54,
      "MatchWins": 18,
      "MatchLosses": 1,
      "MatchDraws": 0,
      "OpponentMatchWinPercentage": 0.62502867,
      "TeamGameWinPercentage": 0.75,
      "OpponentGameWinPercentage": 0.57640079,
      "Team": {
        "Players": [
          {
            "DisplayName": "Yoshihiko Ikawa",
            "Username": "ikawa_mtg"
          }
        ]
      },
      "Decklists": [
        {
          "DecklistId": "391788",
          "Format": "Standard"
        }
      ]
    }
  ]
}
```

### Key Response Fields (per `data[]` entry)

| Field | Type | Description |
|-------|------|-------------|
| `Rank` | int | Current standing position |
| `Points` | int | Match points |
| `MatchWins` | int | Match wins |
| `MatchLosses` | int | Match losses |
| `MatchDraws` | int | Match draws |
| `OpponentMatchWinPercentage` | float | OMWP tiebreaker |
| `TeamGameWinPercentage` | float | GWP tiebreaker |
| `OpponentGameWinPercentage` | float | OGWP tiebreaker |
| `Team.Players[0].DisplayName` | string | Player display name |
| `Team.Players[0].Username` | string | Player username (unique ID) |
| `Decklists` | array | List of decklist references |
| `Decklists[].DecklistId` | string | Decklist ID for `/Decklist/View/{id}` |
| `Decklists[].Format` | string | Format name (e.g., "Standard") |

### Pagination

- Page size: `25` (fixed in Badaro implementation)
- Paginate by incrementing `start` by 25 (0, 25, 50, ...)
- Stop when `data` array is empty
- Total count available in `recordsTotal`

### Known Issues (from Badaro repo issue #12)

- For **team tournaments**, `GetRoundStandings` only returns the **first decklist**
  even when multiple formats are played. This is believed to be a melee.gg bug.
- Workaround: use `GetPlayerDetails` endpoint, but it doesn't return format info.
- The Badaro scraper currently **blacklists team tournaments** because of this.

---

## Endpoint 3: Round Pairings (POST, JSON)

### Request

```
POST /Tournament/GetRoundPairings/{roundId}
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
```

The `{roundId}` is the round ID from the tournament page `data-id` attribute
(NOT the tournament ID).

### POST Body Columns

From the PHP (MagicLegacy) client, which includes the `TableNumber` column:

| Index | data | name | searchable | orderable |
|-------|------|------|------------|-----------|
| 0 | TableNumber | TableNumber | true | true |
| 1 | Player1 | Player1 | true | true |
| 2 | Player1Decklist | Player1Decklist | true | true |
| 3 | Player2 | Player2 | true | true |
| 4 | Player2Decklist | Player2Decklist | true | true |
| 5 | Result | Result | false | false |

**Note:** The `j6e` curl capture omits `TableNumber` (starts at Player1 as column 0).
The PHP client includes it as column 0. Both work. The presence of `TableNumber` is
the newer/more complete version.

**Extra parameters:**
- `order[0][column]` = `0` (sort by first column)
- `order[0][dir]` = `asc`
- `start` = `{offset}`
- `length` = `25` (or up to `500` as used by PHP client)

### Full URL-encoded body (MagicLegacy format, with TableNumber)

```
draw=1&columns[0][data]=TableNumber&columns[0][name]=TableNumber&columns[0][searchable]=true&columns[0][orderable]=true&columns[0][search][value]=&columns[0][search][regex]=false&columns[1][data]=Player1&columns[1][name]=Player1&columns[1][searchable]=true&columns[1][orderable]=true&columns[1][search][value]=&columns[1][search][regex]=false&columns[2][data]=Player1Decklist&columns[2][name]=Player1Decklist&columns[2][searchable]=true&columns[2][orderable]=true&columns[2][search][value]=&columns[2][search][regex]=false&columns[3][data]=Player2&columns[3][name]=Player2&columns[3][searchable]=true&columns[3][orderable]=true&columns[3][search][value]=&columns[3][search][regex]=false&columns[4][data]=Player2Decklist&columns[4][name]=Player2Decklist&columns[4][searchable]=true&columns[4][orderable]=true&columns[4][search][value]=&columns[4][search][regex]=false&columns[5][data]=Result&columns[5][name]=Result&columns[5][searchable]=false&columns[5][orderable]=false&columns[5][search][value]=&columns[5][search][regex]=false&order[0][column]=0&order[0][dir]=asc&start=0&length=500&search[value]=&search[regex]=false
```

### Response (JSON)

```json
{
  "draw": 1,
  "recordsTotal": 103,
  "recordsFiltered": 103,
  "data": [
    {
      "TournamentId": 72980,
      "RoundNumber": 1,
      "TableNumber": 1,
      "Player1": "Yoshihiko Ikawa",
      "Player1Id": 12345,
      "Player1Guid": "abc-123",
      "Player1UserId": "user-456",
      "Player1Username": "ikawa_mtg",
      "Player1DisplayNameLastFirst": "Ikawa, Yoshihiko",
      "Player1Decklist": "Esper Control",
      "Player1DecklistId": 391788,
      "Player1CheckedIn": true,
      "Player1Confirmation": true,
      "Player1Discord": "",
      "Player1ScreenName": "",
      "Player1Twitch": "",
      "Player2": "John Doe",
      "Player2Id": 67890,
      "Player2Guid": "def-789",
      "Player2UserId": "user-012",
      "Player2Username": "johndoe",
      "Player2DisplayNameLastFirst": "Doe, John",
      "Player2Decklist": "Mono Red",
      "Player2DecklistId": 391790,
      "Player2CheckedIn": true,
      "Player2Confirmation": true,
      "Player2Discord": "",
      "Player2ScreenName": "",
      "Player2Twitch": "",
      "Result": "Yoshihiko Ikawa won 2-1-0"
    }
  ]
}
```

### Key Response Fields (per `data[]` entry)

| Field | Type | Description |
|-------|------|-------------|
| `TournamentId` | int | Tournament ID |
| `RoundNumber` | int | Round number |
| `TableNumber` | int | Table assignment |
| `Player1` | string | Player 1 display name |
| `Player1Username` | string | Player 1 username |
| `Player1Decklist` | string | Player 1 deck archetype name |
| `Player1DecklistId` | int | Player 1 decklist ID |
| `Player2` | string | Player 2 display name |
| `Player2Username` | string | Player 2 username |
| `Player2Decklist` | string | Player 2 deck archetype name |
| `Player2DecklistId` | int | Player 2 decklist ID |
| `Result` | string | Human-readable result string |

### Result String Formats

From the Badaro and MagicLegacy parsers, the `Result` field uses these patterns:

| Pattern | Meaning |
|---------|---------|
| `{PlayerName} won 2-1-0` | Player won 2 games to 1 |
| `{PlayerName} won 2-0-0` | Player won 2 games to 0 |
| `1-1-0 Draw` | Intentional or actual draw |
| `0-0-3 Draw` | Intentional draw (3 drawn games) |
| `{PlayerName} forfeited the match` | Player conceded |
| `{PlayerName} was awarded a bye` | Bye |
| `{PlayerName} was assigned a bye` | Bye (alternate wording) |
| `Not reported` | Result not yet submitted |

### Pagination

- PHP client uses `length=500` to minimize requests
- Default page size is `25`
- Paginate by incrementing `start`
- Stop when `data` array is empty or `start >= recordsTotal`

---

## Endpoint 4: Decklist Page (HTML)

### Request

```
GET /Decklist/View/{decklistId}
```

**Example:** `GET https://melee.gg/Decklist/View/315233`

### Response

Returns full HTML page. Key data extracted by parsing:

#### Card List

The full decklist is embedded in a copy button's `data-clipboard-text` attribute:

```html
<button class="decklist-builder-copy-button btn-sm btn btn-card text-nowrap "
        data-clipboard-text="Deck\r\n4 Ancient Stirrings\r\n4 Chromatic Sphere\r\n...\r\nSideboard\r\n2 Haywire Mite\r\n...">
</button>
```

**Format of `data-clipboard-text`:**
```
Deck
4 Ancient Stirrings
4 Chromatic Sphere
...
Companion
1 Yorion, Sky Nomad
Sideboard
2 Haywire Mite
1 Cityscape Leveler
...
```

Sections are delimited by the lines `Deck`, `Companion`, and `Sideboard`.
Cards in the `Companion` section also appear in the `Sideboard`, so the Badaro
parser skips the Companion section entirely.

Each card line format: `{count} {cardName}`

#### Player Name

```html
<span class="decklist-card-title-author">
  <a href="/Player/Profile/{username}">Player Name</a>
</span>
```

#### Format

Found in the header div structure:

```html
<div class="card-header decklist-card-header">
  <div>...</div>
  <div>
    <div>...</div>
    <div>...</div>
    <div>Modern</div>  <!-- 3rd child div -->
  </div>
</div>
```

#### Round Results (Tournament Path)

The decklist page also contains a round-by-round results table:

```html
<div id="tournament-path-grid-item">
  <div><div><div><table><tbody>
    <tr>
      <td>Round 1</td>
      <td><a href="/Player/Profile/...">Opponent Name</a></td>
      <td>...</td>
      <td>Player Name won 2-0-0</td>
    </tr>
  </tbody></table></div></div></div>
</div>
```

This is the **primary way** the Badaro scraper gets round-by-round pairings data
(as an alternative to the GetRoundPairings endpoint).

### Alternative: JSON Decklist Endpoint

The MagicLegacy PHP client uses a **different**, JSON-based endpoint:

```
GET /Decklist/GetDecklistDetails?id={decklistId}
```

This returns a JSON response:

```json
{
  "ID": 315233,
  "Name": "Mono Green Tron",
  "ScreenshotUrl": "https://...",
  "ArenaDecklistString": "Deck\n4 Ancient Stirrings\n..."
}
```

| Field | Type | Description |
|-------|------|-------------|
| `ID` | int | Decklist ID |
| `Name` | string | Deck archetype name |
| `ScreenshotUrl` | string | URL to deck screenshot image |
| `ArenaDecklistString` | string | Full decklist in Arena export format |

This JSON endpoint is simpler than HTML parsing, but provides less metadata
(no round results, no player info).

---

## Endpoint 5: Tournament Search/List (POST, JSON)

### Request

```
POST /Decklist/TournamentSearch
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
```

### POST Body Columns

| Index | data | name | searchable | orderable |
|-------|------|------|------------|-----------|
| 0 | ID | ID | false | false |
| 1 | Name | Name | true | true |
| 2 | StartDate | StartDate | false | true |
| 3 | Status | Status | true | true |
| 4 | Format | Format | true | true |
| 5 | OrganizationName | OrganizationName | true | true |
| 6 | Decklists | Decklists | true | true |

**Extra parameters:**
- `order[0][column]` = `2` (sort by StartDate)
- `order[0][dir]` = `desc`
- `start` = `{offset}` (0, 25, 50, ...)
- `length` = `25`
- `q` = `` (empty search query)
- `startDate` = `{yyyy-MM-dd}T00:00:00.000Z`
- `endDate` = `{yyyy-MM-dd}T23:59:59.999Z`

### Full URL-encoded body (template)

```
draw=1&columns%5B0%5D%5Bdata%5D=ID&columns%5B0%5D%5Bname%5D=ID&columns%5B0%5D%5Bsearchable%5D=false&columns%5B0%5D%5Borderable%5D=false&columns%5B0%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B0%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B1%5D%5Bdata%5D=Name&columns%5B1%5D%5Bname%5D=Name&columns%5B1%5D%5Bsearchable%5D=true&columns%5B1%5D%5Borderable%5D=true&columns%5B1%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B1%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B2%5D%5Bdata%5D=StartDate&columns%5B2%5D%5Bname%5D=StartDate&columns%5B2%5D%5Bsearchable%5D=false&columns%5B2%5D%5Borderable%5D=true&columns%5B2%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B2%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B3%5D%5Bdata%5D=Status&columns%5B3%5D%5Bname%5D=Status&columns%5B3%5D%5Bsearchable%5D=true&columns%5B3%5D%5Borderable%5D=true&columns%5B3%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B3%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B4%5D%5Bdata%5D=Format&columns%5B4%5D%5Bname%5D=Format&columns%5B4%5D%5Bsearchable%5D=true&columns%5B4%5D%5Borderable%5D=true&columns%5B4%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B4%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B5%5D%5Bdata%5D=OrganizationName&columns%5B5%5D%5Bname%5D=OrganizationName&columns%5B5%5D%5Bsearchable%5D=true&columns%5B5%5D%5Borderable%5D=true&columns%5B5%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B5%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B6%5D%5Bdata%5D=Decklists&columns%5B6%5D%5Bname%5D=Decklists&columns%5B6%5D%5Bsearchable%5D=true&columns%5B6%5D%5Borderable%5D=true&columns%5B6%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B6%5D%5Bsearch%5D%5Bregex%5D=false&order%5B0%5D%5Bcolumn%5D=2&order%5B0%5D%5Bdir%5D=desc&start={offset}&length=25&search%5Bvalue%5D=&search%5Bregex%5D=false&q=&startDate={startDate}T00%3A00%3A00.000Z&endDate={endDate}T23%3A59%3A59.999Z
```

### Response (JSON)

```json
{
  "draw": 1,
  "recordsTotal": 41,
  "recordsFiltered": 41,
  "data": [
    {
      "ID": 25360,
      "Name": "Legacy League Pavia 23/24 - Tappa 12",
      "StartDate": "2023-09-07T19:00:00Z",
      "OrganizationName": "Legacy Pavia",
      "FormatDescription": "Legacy",
      "StatusDescription": "Ended",
      "Decklists": 13
    }
  ]
}
```

### Key Response Fields (per `data[]` entry)

| Field | Type | Description |
|-------|------|-------------|
| `ID` | int | Tournament ID (for `/Tournament/View/{id}`) |
| `Name` | string | Tournament name |
| `StartDate` | string (ISO 8601) | Tournament start date/time |
| `OrganizationName` | string | Organizing entity |
| `FormatDescription` | string | Format(s) played |
| `StatusDescription` | string | "Ended", "In Progress", etc. |
| `Decklists` | int | Number of submitted decklists |

### Pagination

- Page size: `25`
- Paginate by incrementing `start` by 25
- Total available in `recordsTotal`
- The Badaro client paginates until `offset >= recordsTotal`
- The Badaro client filters by `StatusDescription == "Ended"` or tournaments
  older than 5 days (constant `MaxDaysBeforeTournamentMarkedAsEnded`)

### Filtering

The date range is **required** via `startDate` and `endDate` query parameters
in the POST body. Format: `yyyy-MM-ddTHH:mm:ss.fffZ`

---

## Bonus Endpoint: Player Details

### Request

```
GET /Player/GetPlayerDetails?id={playerId}
```

Referenced in the Badaro constants but not actively used in the current scraper
(due to missing format information). Returns player details including decklists
but **not** the format for each decklist.

---

## Implementation Strategy for Our Project

Based on this research, here is the recommended approach:

1. **Tournament discovery**: Use `POST /Decklist/TournamentSearch` with date ranges
   to find tournaments. Filter for `StatusDescription == "Ended"` and minimum
   decklist count.

2. **Tournament details**: Use `GET /Tournament/View/{id}` to get round IDs and
   formats (HTML parsing required).

3. **Standings**: Use `POST /Standing/GetRoundStandings` with the **last completed
   round ID** to get final standings with player names, records, tiebreakers,
   and decklist IDs. Paginate through all pages (25 per page).

4. **Pairings/Results**: Two options:
   - **Option A (per-round):** Use `POST /Tournament/GetRoundPairings/{roundId}`
     for each round. Returns structured JSON with results. Better for our matchup
     matrix use case.
   - **Option B (per-player):** Parse round results from each player's decklist
     page HTML. This is what Badaro does. More HTTP requests but gets deck content
     at the same time.

5. **Decklists**: Two options:
   - **Option A (HTML):** `GET /Decklist/View/{deckId}` and parse the copy button.
     Gets full card list + round results + player info.
   - **Option B (JSON):** `GET /Decklist/GetDecklistDetails?id={deckId}` for a
     simpler JSON response with card list + archetype name. No round results.

For our meta analyzer, **Option A for pairings** (GetRoundPairings) combined with
**Option B for decklists** (GetDecklistDetails JSON) would minimize HTML parsing
while getting all the data we need.
