# Tournament naming conventions

How tournament **display names** (`cleanName`) and **importance** tiers are
assigned after fetching from melee.gg.

## How `cleanName` and `importance` work

Both fields live **only** in the per-format `data/<format>/index.json` files —
never in the tournament JSON itself. This way they survive re-fetches and can be
edited without touching tournament data.

- On fetch (`scripts/fetch-tournament.ts`), each new index entry gets:
  - `cleanName` = `cleanTournamentName(rawName)` (auto-cleaned, see below)
  - `importance` = `inferImportance(rawName)` (regex tiers, see below)
- You then **manually edit** `cleanName` (and `importance` if needed) in the
  index to follow the conventions on this page.
- `scripts/rebuild-index.ts` and `updateFormatIndex` **preserve manual edits**:
  a `cleanName` that differs from both the raw name and the auto-cleaned name is
  treated as a manual override and kept on future re-fetches.

The auto-cleaner (`cleanTournamentName` in `scripts/lib/importance.ts`) only
*strips* noise — it never adds information. It removes bracketed day/time
prefixes (keeping the location), format names, day-of-week words, time segments,
`Season N - Round M` qualifiers, and dangling separators. It cannot infer a
region, cycle number, or set acronym — those are added by hand.

## Importance tiers

Auto-inferred from the raw name (`inferImportance`). Override manually if wrong.

| Tier | Matched on (examples) |
|------|-----------------------|
| `professional` | Pro Tour, World Championship, Arena Championship |
| `premier` | Regional Championship, Spotlight, MTGO Showcase, Showcase Challenge, PTQ, Super Qualifier |
| `competitive` | RCQ, ReCQ, Destination Qualifier, Challenge, LCQ, Last Chance |
| `other` | everything else (default) |

## `cleanName` conventions

### Regional Championships (RC)

Format: **`RC <REGION> T<cycle> - <City>`**

```
RC USA T12 - Cincinnati
RC USA T12 - Washington DC
RC Europe T11 - Turin
RC ANZ T12 - Adelaide
RC SEA T12 - Kuala Lumpur
```

- **Region codes in use:** `USA`, `Canada`, `Europe`, `ANZ`, `CAMS`,
  `SEA`, `SK & JP`, `South America`, `China`, `Taiwan`.
- **Cycle number (`T<n>`):** for SCG CON RCs the raw name carries a
  `Season N - Round M` segment that maps to the cycle as **`T(M + 9)`** —
  i.e. `Round 2 → T11`, `Round 3 → T12`. For other regions, match the cycle of
  the RCs already in the index for the same date window.
- **USA and Canada hold two RCs per cycle.** Two entries sharing the same
  `T<n>` is expected — the **city** disambiguates them (e.g. `RC USA T12 -
  Cincinnati` and `RC USA T12 - Washington DC`). Not a bug.
- Mark `importance: premier`.

### Spotlight events

Format: **`Spotlight <SetAcronym> - <City>`**

```
Spotlight SOS - London
Spotlight SOS - Chiba
Spotlight TMNT - Richmond
```

- Use the **set acronym**, not the long set name. Known acronyms:
  - `HOB` = The Hobbit
  - `SOS` = Secrets of Strixhaven
  - `TMNT` = Teenage Mutant Ninja Turtles
- The same Spotlight (same set) runs in multiple cities; keep them consistent
  (all `Spotlight SOS - <City>`), distinguished by city.
- Spotlights are `premier` but are **not** RCs — do not give them a `T<cycle>`.
- **The raw name often omits the city** (and may be in Japanese, e.g.
  `マジック・スポットライト： シークレッツ`). The venue field on the melee page is
  loaded via JS and is not in the static HTML, so look the city up from the
  [magic.gg Spotlight announcement](https://magic.gg/spotlight) or a web search.

### RC-weekend side events (Sunday Opens etc.)

Format: **`<Series event> - <City or Con>`**

```
Ultimate Guard Open - Prague
Ultimate Guard Open - Turin
$uper $unday RCQ - SCG CON Washington DC
```

- Large side events held during an RC weekend (the Sunday Open equivalent of
  SCG's `$uper $unday`) are at least `importance: competitive` — never `other`,
  despite what `inferImportance` says (their raw names carry no tier keyword).
- Keep the same series' events consistent across cities, disambiguated by city.

## Workflow

1. Fetch: `bun run scripts/fetch-tournament.ts <id-or-url>`
2. Open the relevant `data/<format>/index.json` and find the new entry.
3. Edit `cleanName` (and `importance` if mis-inferred) per the conventions above.
4. Manual edits are preserved by `rebuild-index.ts` on future re-fetches.
