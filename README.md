# Energy Epoch

Factorio-style energy ops on a **$5M credit facility**. Build **roads** from wells to **tank batteries** to the **refinery**.

## Play

**Live (mobile-friendly URL):** https://jfodchuk.github.io/energy-epoch/

```bash
npm install
npm run dev
```

Mobile: **tap** to build/select, **drag** to pan, **+/−** to zoom.

## Loop

1. Road-connect pad → battery → refinery (cardinal edges, not corners).
2. Drill pad / surveyed Sweet·Good tiles.
3. Trucks: crude → battery → clean → refinery.
4. Gas lines stop flare/rep bleed. Rep 0 shuts the lease.
5. Pay down the facility; operate green.

## Deploy

```bash
npm run deploy
```
