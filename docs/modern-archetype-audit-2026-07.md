# Modern archetype audit — July 2026

Reference: [MTGGoldfish full Modern metagame](https://www.mtggoldfish.com/metagame/modern/full#paper) (fetched 2026-07-08, 60 archetypes listed, 24 at ≥1%).
Validation data: 124 local tournaments since 2026-05-04 (5,045 decklists) in `data/modern/`.

## Method

1. Baseline: classified local data with the old `modern.yaml` (25 defs) → **18.6% Unknown**, five archetypes relying heavily on the KNN/centroid fallback (stale signatures): Boros Energy (36% sig), Gruul Eldrazi Ramp (46%), Esper Blink (54%), Jeskai Blink (60%), Dimir Midrange (68%).
2. Pulled the representative decklist embedded in each goldfish archetype page for every missing or stale archetype (19 lists).
3. Clustered local Unknown decks by top-4 nonbasic cards and inspected full local builds to derive signatures (local builds first, goldfish rep second).
4. Iterated signature definitions, re-running classification after each change.

## Result

- **Unknown: 18.6% → 7.2%** (remaining unknowns are a fringe-brew long tail; largest cluster is 9 decks = 0.18%).
- **All 19 goldfish representative decklists classify to their expected archetype** (signature match, no centroid needed).
- Local shares track goldfish paper shares proportionally (Boros Energy 11.9% vs 11.7%, Affinity 8.2% vs 8.7%, Boros Ponza 3.6% vs 3.4%, Eldrazi Ramp 3.3% vs 1.5% — local data is MTGO-heavy).
- Every ≥1% archetype now has a ≥79% signature rate. 38 definitions total (was 25). Full test suite passes (573 tests).

## What we had (kept, definition unchanged)

Izzet Affinity (goldfish "Affinity"), Izzet Prowess, Amulet Titan, Domain Zoo,
Mono-Blue Belcher (goldfish "Belcher"), Simic Ritual, Esper Reanimator (goldfish
"Goryo's Vengeance"), Golgari Yawgmoth (goldfish "Yawgmoth"), Eldrazi Tron,
Gruul Eldrazi Aggro, Ruby Storm, Living End, Dimir Mill (goldfish "Mill"),
Simic Neoform (goldfish "Neobrand"), Grixis Reanimator, Burn, Mono-Blue Merfolk,
Jund Sagavan.

## What was missing (added)

| Archetype | Goldfish share | Signature |
|---|---|---|
| Boros Ponza | 3.4% | Erode 3+, Wrath of the Skies 3+, Price of Freedom 3+ |
| Azorius Blink (goldfish "Azorius GenericBlink") | 2.1% | Ephemerate 3+, Quantum Riddler 3+, Overlord of the Balemurk = 0, Ajani Nacatl Pariah = 0, Galvanic Discharge = 0, Goryo's Vengeance = 0 |
| Jeskai Control | 1.5% | Orim's Chant 2+, Wrath of the Skies 2+, Galvanic Discharge 2+ |
| Mardu Energy | 1.1% | Ajani Nacatl Pariah 3+, Guide of Souls 3+, Ocelot Pride 3+, Orcish Bowmasters 2+ |
| Mono-Green Broodscale Combo | 1.0% | Basking Broodscale 3+, Devourer of Destiny 3+, Blade of the Bloodchief 2+ |
| Jeskai Energy | 1.0% | Ajani Nacatl Pariah 3+, Guide of Souls 3+, Quantum Riddler 3+ |
| Izzet Steel-Cutter | 0.6% (1.2% locally) | Emry Lurker of the Loch 3+, Cori-Steel Cutter 3+, Mishra's Bauble 3+ |
| Mono-Black Midrange | 0.9% | Necrodominance 3+, Boggart Trawler 3+ |
| Sam Combo | 0.2% (0.8% locally) | Samwise Gamgee 3+, Cauldron Familiar 3+ |
| Boros Belcher | — (0.7% locally) | Goblin Charbelcher 3+, Legion Leadership 3+ |
| Arclight Phoenix | — (0.7% locally) | Arclight Phoenix 3+, Creeping Chill 3+ |
| Golgari Persist | — (0.5% locally) | Eyetwitch 3+, Persist 3+ |
| Mono-Black Eldrazi (goldfish "Eldrazi") | 2.4% | Thought-Knot Seer 3+, Urza's Saga 3+, Kozilek's Command 3+ |

Notes:
- Goldfish's "Eldrazi" (2.4%) is a heterogeneous bucket — its representative list
  is actually a mono-green Broodscale build. The local Unknown cluster it maps to
  is the Ifnir Deadlands / Nethergoyf / Emperor of Bones mono-black Eldrazi deck,
  hence the clearer local name.
- The energy family partitions on: Orcish Bowmasters ≥2 → Mardu; Quantum Riddler ≥3
  → Jeskai; Boros requires exactly 0 of both. Boros Energy's old signature (Ragavan +
  Phlage 3+ each) rotted — current builds are Ajani/Guide/Ocelot/Galvanic Discharge.
- The blink family partitions on: Overlord of the Balemurk ≥3 → Esper; Galvanic
  Discharge (with Consign to Memory) → Jeskai; Azorius requires exactly 0 of
  Overlord/Ajani/Galvanic and excludes Goryo's Vengeance (Esper Reanimator also
  plays Ephemerate + Quantum Riddler).
- Boros Belcher (Legion Leadership rituals) and Arclight Phoenix are not on
  goldfish's list but exceed the 0.3% local threshold.

## What was updated (stale signatures)

| Archetype | Problem | New signature |
|---|---|---|
| Boros Energy | 227/635 sig — def required Ragavan 3+ AND Phlage 3+, both now flexible slots | Ajani Nacatl Pariah 3+, Guide of Souls 3+, Ocelot Pride 3+, Quantum Riddler = 0, Orcish Bowmasters = 0 |
| Esper Blink | 108/201 — Emperor of Bones 2+ / Ephemerate 1+ no longer core | Phelia 3+, Overlord of the Balemurk 3+, Quantum Riddler 3+ |
| Jeskai Blink | 57/95 — Fable of the Mirror-Breaker gone from builds | Phelia 3+, Consign to Memory 3+ |
| Dimir Midrange | 95/140 — Kaito 1+ requirement rotted | Psychic Frog 3+, Fatal Push 3+ |
| Gruul Eldrazi Ramp → **Eldrazi Ramp** | 47/102 — Icetill Explorer/Stomping Ground builds gone; renamed to match goldfish. Covers both the Utopia Sprawl and the Fight Rigging / Disciple of Freyalise variants | Sowing Mycospawn 3+, Ugin's Labyrinth 3+, Eldrazi Temple 3+ |
| Broodscale Combo → **Gruul Broodscale Combo** + **Mono-Green Broodscale Combo** | Goldfish splits the siblings; partition on Devourer of Destiny | Gruul: Basking Broodscale 3+, Blade of the Bloodchief 3+, Devourer of Destiny = 0 / Mono-Green: Devourer of Destiny 3+ instead |
| Azorius Control | 164/191, but the def (Teferi + Isochron + Orim's Chant) was also matching Jeskai Control decks | added Galvanic Discharge = 0 (Jeskai Control entry takes the red builds) |

**Renames that change historical labels in the UI**: Gruul Eldrazi Ramp → Eldrazi Ramp;
Broodscale Combo → Gruul Broodscale Combo / Mono-Green Broodscale Combo (split).

## Known gaps (deliberately not added — all <1% on goldfish and <0.3% locally)

Hammer Time (0.6% goldfish, ~7 local decks), Hollow One / Marauding Mako brews (~10),
Bloodghast/Flare of Malice reanimator variant (8), Lantern (0.1%, 8),
Rakdos Cosmogoyf Neoform (6), Heartfire Hero mono-red aggro (5),
4c Omnath Birthing Ritual piles (absorbed partially by Simic Ritual centroid),
Wan Shi Tong Azorius control builds (absorbed by Azorius Control centroid),
Death's Shadow, Crashing Footfalls, Through the Breach, Indomitable Creativity (all ≤0.4% goldfish, ≤4 local decks).

Local WU control decks that splash red only via fetchable duals but play no
Galvanic Discharge classify as Azorius Control rather than Jeskai Control —
the partition is on maindeck red spells.

Revisit if any of these crosses ~1% locally.
