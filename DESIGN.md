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
Well / pad  --roads-->  Tank battery  --roads-->  Refinery (slot)
```

- Player **builds roads**. Trucks travel on roads (and pads / batteries / refinery).
- Batteries are the lease storage hubs (not electrical).
- Later epoch: **pipelines, pumps, compression, gas plants** that purchase commodities.

## Core loop (v1)

1. Start financed: pad + battery + truck + refinery slot + drill rig + working cash, **$5M debt**.
2. Road-connect pad ↔ battery ↔ refinery.
3. Wildcat on the pad (and later elsewhere). Hit → pumpjack + wellhead tank.
4. Truck hauls wellhead → battery → refinery (roads required). Refinery slot caps sales.
5. Gas flares until gas takeaway; rep matters.
6. Earn → pay interest → pay down principal → unlock exploration / better rigs / more capacity.
7. Stay green: revenue > LOE + interest + fines.

## Exploration (locked)

- **Explore** buys a **3×3 (9 tile)** survey centered on the click.
- Survey reveals **prospect grade** (Barren → Sweet), not just zone tier.
- **Good/Sweet** ≈ 90%+ hit with a tier-0-capable hole — that is why you pay to explore.
- **Wildcat** (unsurveyed) stays risky.
- Zone tier still gates rig tech; special areas still need permits.

## Explicit later

Pipelines, pumps, compression, gas plants as commodity purchasers. Richer decline models.
