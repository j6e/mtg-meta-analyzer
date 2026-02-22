# Meta reporter

I want to create a static web app, ideally based on Github Pages that displays matchup matrices of different magic decks in given tournaments

## Data Source

The data source should be melee.gg, for example this is a tournament: https://melee.gg/Tournament/View/339227
From this a JSON data structure should be constructed. The JSON should include:
- Tournament metadata (name, format, date, url, etc...)
- Every round and result
- Every player deck and decklist, including automatic archetype asignation and 

It's important that the parser construct this JSON file so it can be saved in the repo and served in the static website.

Parsing tournaments should be make via github actions or local command run. This part can be done in other languaje if you find it necessary. The script should be given a tournament URL and produce a tournament JSON file inside the project data folder structure.

## Archetype asignation

For archetype asignation we need to design a YAML specification of archetype, similar to this.

```yaml
format: standard
date: 2026-02-22
archetypes:
    - "Izzet lessons":
        - "Artist's Talent": 4
        - "Monument to Endurance": 4
        - "Gran-Gran": 4
    - "MonoG Landfall":
        - "Badgermole Cub": 4
        - "Icetill Explorer": 4
```

This should be assigning archetypes according to usser preference, then a cosine similarity or KNN algorithm runing on the client (maybe based on decklist TF-IDF) should assign the remaining decklist that are close to the archetype centroid or have all neighbors to be of the same archetype (and the cards inside are somewhat similar). This is important because a lot of times the arechetypes are missreported or are too broad or too narrow.

## Metagame Report

The user should select a format and a date range or some events. The analysis should include the events of that format in those dates or the tournaments selected. 

For each archetype the non-mirror match (this should be an option) wirnrate with each other deck should be calculated: Wins / Matches.

The matrix should be ordered as Left to right and top to bottom with the most represented deck top left. Each cell should include the winrate (1 decimal) and the total matches played in this cell.

The "other" category, the not so popular decks should be a user option based on % representation (<5% for example) or the top N archetypes. This made of archetype should include every other deck not present in the analysis. 

It should also provide a scatter plot, where X axis y metagame share. Y axis is Winrate. Each dot is an archetype and dot size is normaliced sample size for total matches of that archetype.

## Frontend

The frontend should be clean and simple, minimalistic but not ugly.

Tournaments, archetypes, decklists and player should be navegable. 

Cards In decklists should include an small image preview on tooltip, preferably the one from scryfall (https://scryfall.com/docs/api/images)

## Archytecture

I'm not a JS developed (I mostly do Python) but I think that Typescript and Bun should be a real option?

All the algorithms and processes have to be run on the client side.

## Caution

Maybe some cards need some normalization between melee and scryfall.