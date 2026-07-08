# MTGO events missing from the Videre database (May–July 2026)

> Generated 2026-07-08 while backfilling from the Videre public DB
> (`scripts/fetch-videre.ts`). Every event below was verified individually
> absent from `events` (queried by id over the SQL tunnel); each links to the
> mtgo.com decklist page proving the event took place.

## Pattern

- **Zero events of any kind exist in Videre from 2026-06-08 through 2026-06-15
  (inclusive)** — an 8-day ingestion outage. 2026-06-16/17 have only 3 events
  each (partial recovery). 49 of the 51 events fall in this window.
- Two isolated one-off misses outside the window: Modern Challenge 32 on
  2026-06-01 (12843430) and Premodern Challenge 32 on 2026-06-04 (12843772).
- Note when reporting: Videre dates events in UTC, so mtgo.com dates can be
  one day later (e.g. 12841335 is 2026-04-30 in Videre, 2026-05-01 on
  mtgo.com). The ids below are MTGO event ids, which Videre uses directly.

## Missing events (51)

| Date (mtgo.com) | Format | Event | MTGO event id | Players | Source |
|---|---|---|---|---|---|
| 2026-06-01 | Modern | Modern Challenge 32 | 12843430 | 79 | [decklist](https://www.mtgo.com/decklist/modern-challenge-32-2026-06-0112843430) |
| 2026-06-04 | Premodern | Premodern Challenge 32 | 12843772 | 41 | [decklist](https://www.mtgo.com/decklist/premodern-challenge-32-2026-06-0412843772) |
| 2026-06-08 | Modern | Modern Challenge 32 | 12843822 | 75 | [decklist](https://www.mtgo.com/decklist/modern-challenge-32-2026-06-0812843822) |
| 2026-06-08 | Modern | Modern Challenge 64 | 12843826 | 110 | [decklist](https://www.mtgo.com/decklist/modern-challenge-64-2026-06-0812843826) |
| 2026-06-08 | Pioneer | Pioneer Challenge 32 | 12843832 | 40 | [decklist](https://www.mtgo.com/decklist/pioneer-challenge-32-2026-06-0812843832) |
| 2026-06-08 | Standard | Standard Challenge 32 | 12843830 | 42 | [decklist](https://www.mtgo.com/decklist/standard-challenge-32-2026-06-0812843830) |
| 2026-06-09 | Modern | Modern Challenge 64 | 12843841 | 98 | [decklist](https://www.mtgo.com/decklist/modern-challenge-64-2026-06-0912843841) |
| 2026-06-09 | Premodern | Premodern Challenge 32 | 12843839 | 55 | [decklist](https://www.mtgo.com/decklist/premodern-challenge-32-2026-06-0912843839) |
| 2026-06-09 | Standard | Standard Challenge 32 | 12843840 | 47 | [decklist](https://www.mtgo.com/decklist/standard-challenge-32-2026-06-0912843840) |
| 2026-06-10 | Legacy | Legacy Challenge 32 | 12844282 | 45 | [decklist](https://www.mtgo.com/decklist/legacy-challenge-32-2026-06-1012844282) |
| 2026-06-10 | Modern | Modern Challenge 64 | 12843851 | 123 | [decklist](https://www.mtgo.com/decklist/modern-challenge-64-2026-06-1012843851) |
| 2026-06-11 | Modern | Modern Challenge 64 | 12844290 | 113 | [decklist](https://www.mtgo.com/decklist/modern-challenge-64-2026-06-1112844290) |
| 2026-06-11 | Pauper | Pauper Challenge 32 | 12844295 | 52 | [decklist](https://www.mtgo.com/decklist/pauper-challenge-32-2026-06-1112844295) |
| 2026-06-11 | Pioneer | Pioneer Challenge 32 | 12844297 | 43 | [decklist](https://www.mtgo.com/decklist/pioneer-challenge-32-2026-06-1112844297) |
| 2026-06-11 | Premodern | Premodern Challenge 32 | 12844294 | 48 | [decklist](https://www.mtgo.com/decklist/premodern-challenge-32-2026-06-1112844294) |
| 2026-06-11 | Standard | Standard Challenge 32 | 12844284 | 43 | [decklist](https://www.mtgo.com/decklist/standard-challenge-32-2026-06-1112844284) |
| 2026-06-11 | Vintage | Vintage Challenge 32 | 12844292 | 37 | [decklist](https://www.mtgo.com/decklist/vintage-challenge-32-2026-06-1112844292) |
| 2026-06-12 | Modern | Modern Challenge 64 | 12844307 | 104 | [decklist](https://www.mtgo.com/decklist/modern-challenge-64-2026-06-1212844307) |
| 2026-06-12 | Pauper | Pauper Challenge 32 | 12844305 | 54 | [decklist](https://www.mtgo.com/decklist/pauper-challenge-32-2026-06-1212844305) |
| 2026-06-12 | Pioneer | Pioneer Challenge 32 | 12844304 | 44 | [decklist](https://www.mtgo.com/decklist/pioneer-challenge-32-2026-06-1212844304) |
| 2026-06-12 | Pioneer | Pioneer Challenge 32 | 12844312 | 40 | [decklist](https://www.mtgo.com/decklist/pioneer-challenge-32-2026-06-1212844312) |
| 2026-06-12 | Premodern | Premodern Challenge 32 | 12844311 | 40 | [decklist](https://www.mtgo.com/decklist/premodern-challenge-32-2026-06-1212844311) |
| 2026-06-12 | Standard | Standard Challenge 32 | 12844299 | 46 | [decklist](https://www.mtgo.com/decklist/standard-challenge-32-2026-06-1212844299) |
| 2026-06-12 | Standard | Standard Challenge 32 | 12844309 | 36 | [decklist](https://www.mtgo.com/decklist/standard-challenge-32-2026-06-1212844309) |
| 2026-06-12 | Vintage | Vintage Challenge 32 | 12844313 | 37 | [decklist](https://www.mtgo.com/decklist/vintage-challenge-32-2026-06-1212844313) |
| 2026-06-13 | Legacy | Legacy Challenge 32 | 12844315 | 46 | [decklist](https://www.mtgo.com/decklist/legacy-challenge-32-2026-06-1312844315) |
| 2026-06-13 | Legacy | Legacy Challenge 32 | 12844321 | 37 | [decklist](https://www.mtgo.com/decklist/legacy-challenge-32-2026-06-1312844321) |
| 2026-06-13 | Modern | Modern Showcase Challenge | 12844280 | 306 | [decklist](https://www.mtgo.com/decklist/modern-showcase-challenge-2026-06-1312844280) |
| 2026-06-13 | Modern | Modern Challenge 32 | 12844316 | 64 | [decklist](https://www.mtgo.com/decklist/modern-challenge-32-2026-06-1312844316) |
| 2026-06-13 | Modern | Modern Challenge 32 | 12844318 | 39 | [decklist](https://www.mtgo.com/decklist/modern-challenge-32-2026-06-1312844318) |
| 2026-06-13 | Modern | Modern Challenge 32 | 12844324 | 48 | [decklist](https://www.mtgo.com/decklist/modern-challenge-32-2026-06-1312844324) |
| 2026-06-13 | Pauper | Pauper Challenge 32 | 12844320 | 44 | [decklist](https://www.mtgo.com/decklist/pauper-challenge-32-2026-06-1312844320) |
| 2026-06-13 | Pioneer | Pioneer Challenge 32 | 12844327 | 37 | [decklist](https://www.mtgo.com/decklist/pioneer-challenge-32-2026-06-1312844327) |
| 2026-06-13 | Premodern | Premodern Challenge 32 | 12844328 | 39 | [decklist](https://www.mtgo.com/decklist/premodern-challenge-32-2026-06-1312844328) |
| 2026-06-13 | Standard | Standard Challenge 32 | 12844317 | 32 | [decklist](https://www.mtgo.com/decklist/standard-challenge-32-2026-06-1312844317) |
| 2026-06-13 | Standard | Standard Challenge 32 | 12844322 | 34 | [decklist](https://www.mtgo.com/decklist/standard-challenge-32-2026-06-1312844322) |
| 2026-06-13 | Vintage | Vintage Challenge 32 | 12844325 | 48 | [decklist](https://www.mtgo.com/decklist/vintage-challenge-32-2026-06-1312844325) |
| 2026-06-14 | Legacy | Legacy Challenge 32 | 12844331 | 32 | [decklist](https://www.mtgo.com/decklist/legacy-challenge-32-2026-06-1412844331) |
| 2026-06-14 | Legacy | Legacy Challenge 32 | 12844337 | 61 | [decklist](https://www.mtgo.com/decklist/legacy-challenge-32-2026-06-1412844337) |
| 2026-06-14 | Modern | Modern Challenge 32 | 12844330 | 75 | [decklist](https://www.mtgo.com/decklist/modern-challenge-32-2026-06-1412844330) |
| 2026-06-14 | Modern | Modern Challenge 32 | 12844334 | 72 | [decklist](https://www.mtgo.com/decklist/modern-challenge-32-2026-06-1412844334) |
| 2026-06-14 | Pauper | Pauper Showcase Challenge | 12844285 | 233 | [decklist](https://www.mtgo.com/decklist/pauper-showcase-challenge-2026-06-1412844285) |
| 2026-06-14 | Pauper | Pauper Challenge 32 | 12844338 | 60 | [decklist](https://www.mtgo.com/decklist/pauper-challenge-32-2026-06-1412844338) |
| 2026-06-14 | Pioneer | Pioneer Challenge 32 | 12844336 | 37 | [decklist](https://www.mtgo.com/decklist/pioneer-challenge-32-2026-06-1412844336) |
| 2026-06-14 | Pioneer | Pioneer Challenge 32 | 12844340 | 51 | [decklist](https://www.mtgo.com/decklist/pioneer-challenge-32-2026-06-1412844340) |
| 2026-06-14 | Standard | Standard Challenge 32 | 12844341 | 38 | [decklist](https://www.mtgo.com/decklist/standard-challenge-32-2026-06-1412844341) |
| 2026-06-14 | Vintage | Vintage Challenge 32 | 12844332 | 34 | [decklist](https://www.mtgo.com/decklist/vintage-challenge-32-2026-06-1412844332) |
| 2026-06-15 | Modern | Modern Challenge 32 | 12844343 | 91 | [decklist](https://www.mtgo.com/decklist/modern-challenge-32-2026-06-1512844343) |
| 2026-06-15 | Modern | Modern Challenge 64 | 12844347 | 117 | [decklist](https://www.mtgo.com/decklist/modern-challenge-64-2026-06-1512844347) |
| 2026-06-15 | Pioneer | Pioneer Challenge 32 | 12844353 | 43 | [decklist](https://www.mtgo.com/decklist/pioneer-challenge-32-2026-06-1512844353) |
| 2026-06-15 | Standard | Standard Challenge 32 | 12844351 | 53 | [decklist](https://www.mtgo.com/decklist/standard-challenge-32-2026-06-1512844351) |
