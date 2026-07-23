# Energy Epoch

Builder / energy operations sim. Vertical slice: lease oil — pumpjack → flowline → tank → truck rack → market.

## Run

```bash
cd energy-epoch
npm install
npm run dev
```

## Loop (v0)

1. Amber tiles are oil pads.
2. Place a **pumpjack** on a pad.
3. Place a **tank** nearby, connect with **flowline**.
4. Place a **truck rack** adjacent to the tank.
5. Hit **Sell load** when the tank has oil.

Starting cash: $120k. Spot/netback tick in the HUD.

## Stack

Vite + TypeScript + Canvas 2D. No engine lock-in yet — easy to swap Phaser/Three later.
