# Energy Epoch

Factorio-style energy ops. Wildcat drill → pumpjack + tank → truck to refinery. Gas flares hurt reputation until you build takeaway. No human opponents — weather, lightning, markets, spills, and decline are the pressure.

## Run

```bash
cd energy-epoch
npm install
npm run dev
```

## v0 loop

1. **Move rig** onto a tile (map is blind — no resource tells).
2. **Drill** — pay AFE, wait. Duster or ripper (oil + gas rates).
3. Hit lands **pumpjack + tank**. Oil fills; **truck** auto-hauls to the **refinery**.
4. Full tank with slow haul → **spill** (rep + cleanup).
5. Gas **flares** (rep down) until you place a **gas line**.
6. Earn → **Explore** (zone overlays), **upgrade rig** (deeper zones), more trucks.

## Stack

Vite + TypeScript + Canvas 2D.
