# Energy Epoch

Factorio-style energy ops on a **$5M credit facility**. Build **roads** from wells to **tank batteries** to the **refinery**. Wildcat with simple random outcomes. Pay interest, protect reputation, operate in the green.

## Run

```bash
cd energy-epoch
npm install
npm run dev      # canvas renderer (default)
# open http://localhost:5173/?pixi  for the WebGL (PixiJS) renderer scaffold
npm test         # headless smoke test of the game systems
npm run build    # typecheck + production build
```

## Start package (financed)

- $5,000,000 debt @ ~11% APR
- ~$800k working cash
- 1 well pad, 1 tank battery, 1 truck, refinery throughput slot, drill rig

## Loop

1. **Road**-connect pad → battery → refinery (trucks only drive roads). Drag to lay a line; **bridge** creeks; route around water & rock.
2. **Drill** open ground (survey first with **Explore**). Duster or ripper — random IP + decline.
3. Hit → pumpjack + wellhead tank. Trucks: wellhead → battery → refinery (slot capped). **Choke** a well if you out-run your logistics.
4. Scale transport: drag an **oil pipe** battery → refinery for hands-free sales; place a **gas plant** and drag **gas pipe** from wells to sell gas at a premium (or a cheap **gas line** to just stop the flare).
5. Watch the **Facility** panel's capacity advisory (trucks → treating → refinery slot). **Sell** any asset back at 75%.
6. **Pay debt** / grow borrowing base with assets + rep. Goal: green ops, clear the facility.

## Terrain

40×24 lease with **rock**, **water** (impassable), and **creeks** (bridge to cross). A buildable corridor between the financed sites is always guaranteed.

## Renderers

Canvas 2D is the default. A **PixiJS (WebGL)** renderer scaffold is opt-in via `?pixi` — the simulation is renderer-agnostic (`Game.ts` never touches drawing), so it's a swap, not a rewrite. Roadmap: sprites/animation, then mobile.

## Later

Refinery/treating capacity upgrades, pumps & compression, richer decline models.
