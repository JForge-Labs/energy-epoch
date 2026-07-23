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

## Explicit later

Pipelines, pumps, compression, gas plants as commodity purchasers. Richer decline models.
