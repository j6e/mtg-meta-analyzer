# Scryfall image compliance plan

Status: IMPLEMENTED & verified 2026-07-12 (branch scryfall-image-compliance).
Written 2026-07-12 after auditing our card-preview usage against Scryfall's API
docs (Overview & Rules, Rate Limits, Card Imagery).

Implementation note: the legend `<img>`s needed `crossorigin="anonymous"` — a
plain image request poisons the browser cache for the CORS-mode canvas-plugin
load of the same URL (this cache incoherence is what the old double-request
fallback had been papering over).

Post-deploy follow-up (2026-07-12): returning visitors saw plain colored
bubbles instead of chart art. Cause: the pre-index site had already loaded the
same `cards.scryfall.io` art-crop URLs via no-CORS `<img>` requests (the old
`api.scryfall.com/cards/named` hotlinks 302-redirect there), and Scryfall only
sends `Access-Control-Allow-Origin` when the request carries an `Origin`
header — no `Vary` otherwise — with `max-age` of one year. The browser reuses
that headerless cached response for the new CORS-mode loads and fails them
without touching the network, so no redeploy can fix it server-side.
Mitigation: on image error, retry once with a `cors=1` query param
(`corsRetryUrl` in `src/lib/stores/card-images.ts`) — a different cache key
forces a fresh CORS-mode fetch, which then caches correctly. Applied to the
chart art loader and the legend icons; `CardTooltip` is unaffected (its
`normal`-size URLs are never loaded in CORS mode). The old "retry without
crossOrigin" fallback was deliberately NOT restored: a tainted image would
taint the chart canvas and break both color extraction and "Export as image"
(`toDataURL` throws on tainted canvases).

Deviations from the plan below, accepted after review:

- The index covers **every** signature card (not just `signatureCards[0]`) and
  companion cards — a few hundred extra entries buys resilience to future
  representative-card changes.
- `art_crop` is optional in the index: rare cards without a Scryfall art crop
  keep their `normal` tooltip image; charts fall back to the colored point.
- If fetching `card-images.json` fails at runtime, the store settles on an
  empty index so previews fall back to text instead of loading forever
  (`null` strictly means "loading"); the next preview interaction retries.

Ingestion wiring: each tournament-fetch workflow (`fetch-mtgo.yml`,
`fetch-videre.yml`, `fetch-tournament.yml`) rebuilds the index after a fetch
that changed `data/` and commits it alongside the tournament files. For
manual/local ingestion, run `bun run build:card-images`.

## Problems found

1. **We hotlink the rate-limited API endpoint.** `getScryfallImageUrl`
   (`src/lib/utils/card-normalizer.ts:60`) builds
   `https://api.scryfall.com/cards/named?format=image&...` and we embed that URL
   directly in `<img>` tags. Scryfall hard-limits `/cards/named` to **2 requests/second**
   (it's one of the four specially restricted endpoints) and says explicitly:
   *"If you need to … resolve a large number of card images, you must use the bulk data
   files."* The un-rate-limited path is the CDN: *"The direct file origins located at
   `*.scryfall.io` do not have rate limits."*

   Where we violate it:
   - `MetagameScatter.svelte` / `MetagameEvolution.svelte` — `loadArchetypeImages()`
     fires `art_crop` requests for every archetype in an unthrottled loop on chart load
     (dozens of parallel `/cards/named` hits per visitor).
   - `CardTooltip.svelte` — one request per hover; mousing down a decklist exceeds 2/sec.
   - This runs in every visitor's browser, so aggregate rate is uncontrollable. Repeated
     429s can get the app blocked.

2. **Missing artist attribution on `art_crop`.** Imagery guidelines: when using
   `art_crop`, *"list the artist name and copyright elsewhere in the same interface
   presenting the art crop, or use the full card image elsewhere in the same
   interface."* The scatter/evolution charts show art crops with no artist credit
   anywhere in that view.

3. Minor: both chart components retry the same URL without `crossOrigin` on error,
   doubling hits against the limited endpoint.

What's already fine: the Scryfall credit in the footer, using documented image sizes,
and headers (browser `<img>` requests keep the browser UA, which the docs endorse).

## Proposed design

Resolve card names to CDN image URLs **at build/ingestion time** from Scryfall bulk
data, so the browser only ever touches `cards.scryfall.io`.

### 1. Build-time card image index

New script `scripts/build-card-image-index.ts` (bun):

- Fetch the bulk-data manifest from `https://api.scryfall.com/bulk-data` (one request,
  with an accurate `User-Agent` like `mtg-meta-analyzer/1.0` and an `Accept` header),
  then download the `oracle_cards` bulk file (~150 MB, from `*.scryfall.io`, no rate
  limit). Cache the download locally ≥24h (docs ask for this).
- Collect the set of card names we actually need:
  - every distinct maindeck/sideboard card name across `data/<format>/*.json`
    (this also covers commander `representativeCard` values, since those come from
    decklists), plus
  - every `signatureCards[0].name` from `data/archetypes/*.yaml`.
- Emit `data/card-images.json`: `name → { normal, art_crop, artist }` taken from the
  card's `image_uris` (front face for DFCs). Storing the real `image_uris` avoids
  depending on the undocumented `cards.scryfall.io/{size}/front/{a}/{b}/{id}.jpg`
  path pattern.
- Size estimate: ~10k distinct names × ~2 URLs ≈ 1–2 MB raw, well under 500 KB gzipped
  if we store only the UUID-bearing path suffixes. Start with full URLs; optimize only
  if it matters.

Run it as part of ingestion (hook into the weekly melee pipeline / after
`rebuild-index.ts`) so new cards get covered as data lands.

### 2. Runtime changes

- Load `card-images.json` lazily (same pattern as per-format tournament data —
  it's only needed by pages that render previews).
- `getScryfallImageUrl(name, version)` becomes a lookup against the index.
  Miss → return `null`; `CardTooltip` shows its existing text fallback and the charts
  fall back to the plain colored point. **No live `/cards/named` fallback** — a miss
  means the index needs a rebuild, and a silent trickle of API hits would hide that.
- Charts: drop the no-CORS retry (`cards.scryfall.io` serves CORS headers; if color
  extraction fails, fall back to the default point color, not a second request).

### 3. Artist attribution

- Chart tooltips (scatter + evolution) append `Art: <artist> © Wizards of the Coast`
  for the archetype's art crop, using the `artist` field from the index.

## Verification

1. Unit test: index lookup returns CDN URLs for known names, null for unknown.
2. Grep check: no `api.scryfall.com` left in `src/` (script-side manifest fetch only).
3. Manual: metagame page → network tab shows only `cards.scryfall.io` image requests;
   hover tooltips work; chart tooltips show artist credit.
4. e2e: existing suite still passes (`bun run test`).

## Open questions

- Single global `card-images.json` vs per-format files. Global is simpler and the
  overlap between formats is high; revisit only if size becomes a problem.
- Whether to also swap tooltip images to the newer WEBP variants (`grid` replaces
  `normal`) — smaller files, same dimensions. Easy to do since we store URLs verbatim.
