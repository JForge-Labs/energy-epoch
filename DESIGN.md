# Energy Epoch — Design

## Locked pitch

**Factorio-style logistics + ops.** No human opponents. Pressure from weather, lightning, markets, spills, decline, **debt service**, and **reputation**.

Wildcat with **simple random** well outcomes (oil/gas rates + decline) — evolve reservoir math later.

## Capital (locked)

- Start on a **$5,000,000 operating credit facility** (drawn).
- Facility package buys: **one well pad**, **one tank battery**, **one truck**, and **refinery throughput space**.
- Player works to **get out of debt**. Operating **in the green** is the goal.
- Debt capacity can **grow with reputation + assets**; **interest always costs**.
- Low reputation → **fines** that burn operating capital; blocks **permits** for special (higher-tier) areas.

## Logistics spine (locked)

```
Wellhead (crude) --truck/roads--> Battery (treat crude→clean) --truck/roads--> Refinery (sell clean)
```

- Player **builds roads**. Trucks travel on roads (and pads / batteries / refinery).
- Batteries store **crude**, treat to **clean**, then trucks haul clean to the refinery.
- Trucks loop continuously: keep wellheads from filling, keep clean moving to sales.
- Later epoch: **pipelines, pumps, compression, gas plants** that purchase commodities.

## Core loop (v1)

1. Start financed: pad + battery + truck + refinery slot + drill rig + working cash, **$5M debt**.
2. Road-connect pad ↔ battery ↔ refinery.
3. Wildcat on the pad (and later elsewhere). Hit → pumpjack + wellhead tank.
4. Truck hauls wellhead → battery → refinery (roads required). Refinery slot caps sales.
5. Gas flares until gas takeaway; rep matters.
6. Earn → pay interest → pay down principal → unlock exploration / better rigs / more capacity.
7. Stay green: revenue > LOE + interest + fines.

## Playtest patches (locked intent)

- Trucks need **cardinal** road adjacency (not corners); stranded wells get specific diagnostics.
- **Rep 0 = lease shut-in** (game over). Warnings at 45 and 25.
- **Ops RED/GREEN** explains interest vs tickets; clickable.
- Costly tools use **click-again confirm** and mostly **disarm after use**.
- **Cash log** + facility dashboard + sticky guide bar.
- Full tank → explicit spill/flare → rep hit. Weather slows haul / stands down drill.

- **Explore** buys a **3×3 (9 tile)** survey centered on the click.
- Survey reveals **prospect grade** (Barren → Sweet), not just zone tier.
- **Good/Sweet** ≈ 90%+ hit with a tier-0-capable hole — that is why you pay to explore.
- **Wildcat** (unsurveyed) stays risky.
- Zone tier still gates rig tech; special areas still need permits.

## Terrain & obstacles (v2)

- Map is a larger 40×24 lease with procedural obstacles: **rock ridges** and **water** (hard — nothing builds or crosses) and **creeks** (crossable by a **bridge** — road/pipe at a premium; rigs need the bridge).
- Drilling only on **open ground**. Generation guarantees a buildable corridor between the financed sites so a lease is always playable.

## Transport tiers (v2)

- **Trucks** (early): haul crude → battery, clean → refinery on roads. Cheap, labor-limited.
- **Oil pipeline** (mid): drag a pipe **battery → refinery** for hands-free clean-oil sales. Auto-flows, no trucks — but **still capped by the refinery slot** (upgrading throughput is the next lever).
- **Gas pipeline + gas plant**: place a 2×2 **gas plant** (premium buyer) and drag **gas pipe** from wells to it. Sells associated gas at a premium and stops the flare. The cheap **gas line** remains as a flare-stopper that sells raw gas at spot.
- Pipelines are capex per tile (auto-flow, low ongoing cost); everything is salvageable at 75% via the **Sell** tool.

## Player levers (v2)

- **Choke** a well to shut it in and throttle inflow when logistics can't keep up.
- The Facility panel surfaces a **bottleneck advisory** naming the binding constraint (trucks → treating → refinery slot) and the fix.

## Explicit later

Refinery/treating capacity upgrades, pumps & compression, richer decline models, animated/sprite graphics (PixiJS renderer scaffold in place, opt-in via `?pixi`), and a mobile build.
