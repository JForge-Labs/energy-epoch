# Energy Epoch

Factorio-style energy ops on a **$5M credit facility**. Build **roads** from wells to **tank batteries** to the **refinery**. Wildcat with simple random outcomes. Pay interest, protect reputation, operate in the green.

## Play (hosted)

**https://playenergyepoch.com**

Cloudflare Worker (static assets from `dist/`). Staging may also use the project’s `*.workers.dev` URL when `workers_dev = true` in `wrangler.toml`.

## Run

```bash
cd energy-epoch
npm install
npm run dev      # PixiJS (WebGL) renderer by default
# open http://localhost:5173/?canvas  for the Canvas 2D fallback
npm test         # headless smoke test of the game systems
npm run build    # typecheck + production build
```

## Deploy (Cloudflare)

```bash
npm run build
npx wrangler deploy
# or: npm run deploy
```

Requires Cloudflare auth (`wrangler login` or CI secrets). Domain and asset config live in `wrangler.toml`.

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

Lease map with **rock**, **water** (impassable), and **creeks** (bridge to cross). A buildable corridor between the financed sites is always guaranteed.

## Renderers

**PixiJS (WebGL)** is the default renderer — layered containers + a sprite-atlas pipeline (`src/game/gfx/atlas.ts`; placeholder textures auto-generate until real art lands in `public/atlas/`). Canvas 2D remains as the `?canvas` fallback. The simulation is renderer-agnostic (`Game.ts` never touches drawing).

## Later

Refinery/treating capacity upgrades, pumps & compression, richer decline models. Optional magic-link auth on Cloudflare (D1/KV/R2) — see `wrangler.toml` comments.

## Ship / engine plan

**Path W (active):** Cloudflare Worker static host → PWA → Capacitor stores. No game servers.  
**Path U (roadmap only):** Unity 6.5 if rewrite criteria are met.

Full planning pack (point Claude here):

```text
docs/planning/
```

See `docs/planning/README.md`, `DECISION_LOCK.md`, and `AGENT_LANES.md`.
