# Use Standings

MTGO tournaments only have recorded matches for the playoffs but all the players that are recorded have their reccord and decklists attached. We could use this information for:
- OVerall winrate
- Metagame VS Win rate
- Winrate Splitter, only overall
- Auto Scan
- Card Impact, only all opponents.

This should be a checkbox option on the sidebar next to Paper only, called some TBD name that should have a tooltip for the full explanation that we will use the record (W-L-D) in a tournament despite not knowing the round pairings for callculating overall statistics.

We should be carefull for not doublecounting MTGO rounds. The method should be generic and passed a tournament with incomplete information, like the MTGO ones. Should substract the present rounds (playoffs in the MTGO case) from the record to avoid double counting, then adding that data to the overalls.