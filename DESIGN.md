# Energy Epoch — Design

## Locked pitch

**Factorio-style logistics + ops**, no human opponents. Adversaries are the field and the market: weather, lightning, price swings, spills, and decline.

You start as a **wildcatter**. The map shows **no resources**. You punch holes with a single drill rig. Hits land a **pumpjack + lease tank**. Oil fills the tank; a **truck** hauls to a **refinery**. Overflow **spills**. Associated **gas is flared** until you build gas infra — flaring burns **reputation**; capturing/selling gas repairs it and pays.

Exploration purchases reveal **zones**. Harder zones need better tech and cost more to drill.

Tone: Factorio logistics meets Red Alert map presence — industry as the conflict, not villains.

## Core loop (v1 target)

1. Move / deploy the starter **drill rig** onto a tile → spend time + cash to drill.
2. Outcome from hidden subsurface: **duster** or **producer** (oil rate, gas rate, oil/gas ratio).
3. On a hit: **pumpjack lands**, **tank is spotted** beside it.
4. Well **declines** over time (simple hyperbolic / exponential for now).
5. Tank inventory rises; **truck** loads and drives to the **refinery** for cash.
6. Full tank with nowhere to go → **spill** (oil lost, rep hit, cleanup cost).
7. Produced gas with no takeaway → **flare** (rep down). Gas line / plant → sell gas + rep up.
8. Earn → buy **exploration** (zone awareness), **bigger rigs**, gas kit, more trucks/tanks.

## Locked systems

| System | Decision |
|--------|----------|
| Genre | Factorio-style builder / logistics |
| Opponents | None (PvE: weather, lightning, markets, spills, decline) |
| Scout info | Map starts blind; exploration reveals zones |
| Discovery | Wildcat drill → duster or ripper |
| Well model | Oil rate, gas rate (ratio), decline — keep simple |
| First success | Auto pumpjack + tank |
| Oil path | Tank → truck → refinery |
| Tank full | Spill |
| Gas default | Flare → reputation down |
| Gas upgrade | Infra monetizes gas + reputation up |
| Progression | Cash → exploration, bigger rigs, harder zones |

## Player identity

Wildcatter → growing independent operator. Reputation matters (regulators / community / future access — exact mechanical hooks TBD).

## Epoch ladder (draft)

1. Single rig wildcat + truck oil
2. Multi-well pad / more tanks & trucks
3. Gas capture & sales
4. Exploration + tiered zones / deeper tech
5. Midstream / plant (later)

## Explicitly out of v1

Multiplayer, combat factions, cartoon infinite oil pads on the surface, manual “sell load” button as the only marketing path.
