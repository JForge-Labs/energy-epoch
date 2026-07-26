/**
 * Build a photogenic mid-game lease and write a v4 save fixture for ASC shots.
 * Run via: npm run store:seed
 * Output: store-assets/ios/fixture-save.json
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Game } from "../src/game/Game";
import {
  DEFAULT_MAP_PARAMS,
  MAP_PRESETS,
} from "../src/game/data/economy";
import { blocksBuild } from "../src/game/systems/terrain";
import type { Building, Well } from "../src/game/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "store-assets", "ios", "fixture-save.json");
const SAVE_VERSION = 4;

const prairie = MAP_PRESETS.find((p) => p.id === "prairie")!;

function staircase(
  from: { x: number; y: number },
  to: { x: number; y: number },
): { x: number; y: number }[] {
  const path: { x: number; y: number }[] = [];
  let cx = from.x;
  let cy = from.y;
  let guard = 0;
  while ((cx !== to.x || cy !== to.y) && guard++ < 800) {
    const rx = to.x - cx;
    const ry = to.y - cy;
    if ((Math.abs(rx) >= Math.abs(ry) && rx !== 0) || ry === 0) cx += Math.sign(rx);
    else cy += Math.sign(ry);
    path.push({ x: cx, y: cy });
  }
  return path;
}

function injectWell(
  g: Game,
  x: number,
  y: number,
  oil: number,
  gas: number,
  tankOil = 280,
): Well | null {
  if (blocksBuild(g.tiles[y][x].terrain)) return null;
  if (g.wellAt(x, y) || g.buildingAt(x, y)) return null;
  const id = `wshot${x}_${y}`;
  const well: Well = {
    id,
    x,
    y,
    status: "producing",
    oilRate: oil,
    gasRate: gas,
    oilIp: oil,
    gasIp: gas,
    declinePerDay: 0.004,
    ageDays: 12,
    drillProgress: 1,
    drillDaysNeeded: 1,
    wellheadTankId: null,
    pumpjackId: null,
  };
  g.wells.push(well);
  g.tiles[y][x].drilled = true;
  g.tiles[y][x].surveyed = true;
  g.tiles[y][x].wellId = id;
  g.tiles[y][x].subsurface.prospect = 0.82;

  const jack: Building = {
    id: `jack_${id}`,
    kind: "pumpjack",
    x,
    y,
    oil: 0,
    oilCap: 0,
    crude: 0,
    crudeCap: 0,
    clean: 0,
    cleanCap: 0,
    wellId: id,
    online: true,
    hp: 100,
  };
  const tank: Building = {
    id: `tank_${id}`,
    kind: "wellhead_tank",
    x: x + 1,
    y,
    oil: tankOil,
    oilCap: 400,
    crude: 0,
    crudeCap: 0,
    clean: 0,
    cleanCap: 0,
    wellId: id,
    online: true,
    hp: 100,
  };
  // If tank cell blocked, put tank south.
  if (blocksBuild(g.tiles[tank.y][tank.x].terrain) || g.buildingAt(tank.x, tank.y)) {
    tank.x = x;
    tank.y = y + 1;
    if (blocksBuild(g.tiles[tank.y][tank.x].terrain) || g.buildingAt(tank.x, tank.y)) {
      tank.x = x - 1;
      tank.y = y;
    }
  }
  g.buildings.push(jack, tank);
  well.pumpjackId = jack.id;
  well.wellheadTankId = tank.id;
  return well;
}

function main() {
  const g = new Game({
    cols: prairie.cols,
    rows: prairie.rows,
    seed: prairie.seed,
    mapName: prairie.name,
    mapParams: prairie.params ?? DEFAULT_MAP_PARAMS,
  });
  g.player.cash = 2_400_000;
  g.player.reputation = 78;
  g.player.credit.debt = 4_650_000;
  g.mode = "easy";
  g.market.day = 18.4;
  g.market.oilPrice = 76.2;
  g.market.gasPrice = 3.05;
  g.totalOilSold = 4200;
  g.totalGasSold = 1800;

  const battery = g.buildings.find((b) => b.kind === "battery")!;
  const refinery = g.buildings.find((b) => b.kind === "refinery")!;
  const pad = g.tiles.flatMap((row, y) =>
    row.map((t, x) => (t.isPad ? { x, y } : null)).filter(Boolean),
  )[0] as { x: number; y: number };

  // Roads: pad → battery → refinery
  for (const leg of [
    staircase(pad, { x: battery.x, y: battery.y }),
    staircase({ x: battery.x, y: battery.y + 1 }, { x: refinery.x, y: refinery.y }),
  ]) {
    for (const p of leg) g.layRoad(p.x, p.y);
  }

  // Clean oil pipe battery → refinery (hands-free sales spine)
  for (const p of staircase(
    { x: battery.x, y: battery.y },
    { x: refinery.x, y: refinery.y },
  )) {
    if (!g.buildingAt(p.x, p.y)) g.layPipe(p.x, p.y, "clean");
  }

  // Survey a few 3×3 clusters so grade pips show
  const surveyCenters = [
    { x: pad.x + 3, y: pad.y + 1 },
    { x: battery.x - 2, y: battery.y + 3 },
    { x: battery.x + 4, y: battery.y - 1 },
  ];
  for (const c of surveyCenters) {
    g.player.cash += 50_000;
    g.buyExploration(c.x, c.y);
  }

  // Producing wells near battery / pad
  const wellCandidates: { x: number; y: number; oil: number; gas: number }[] = [];
  for (let y = Math.max(2, battery.y - 6); y < Math.min(g.config.rows - 2, battery.y + 8); y++) {
    for (let x = Math.max(2, battery.x - 8); x < Math.min(g.config.cols - 2, battery.x + 10); x++) {
      const t = g.tiles[y][x];
      if (!blocksBuild(t.terrain) && t.subsurface.prospect >= 0.5) {
        wellCandidates.push({
          x,
          y,
          oil: 90 + Math.floor(t.subsurface.prospect * 80),
          gas: 60 + Math.floor(t.subsurface.prospect * 40),
        });
      }
    }
  }
  // Prefer near battery
  wellCandidates.sort(
    (a, b) =>
      Math.abs(a.x - battery.x) +
      Math.abs(a.y - battery.y) -
      (Math.abs(b.x - battery.x) + Math.abs(b.y - battery.y)),
  );

  const wells: Well[] = [];
  for (const c of wellCandidates) {
    if (wells.length >= 5) break;
    if (wells.some((w) => Math.abs(w.x - c.x) + Math.abs(w.y - c.y) < 3)) continue;
    const w = injectWell(g, c.x, c.y, c.oil, c.gas, 220 + wells.length * 40);
    if (w) {
      wells.push(w);
      // Road-link wellhead tank toward battery
      const tank = g.buildings.find((b) => b.id === w.wellheadTankId)!;
      for (const p of staircase({ x: tank.x, y: tank.y }, { x: battery.x, y: battery.y + 2 })) {
        g.layRoad(p.x, p.y);
      }
      // Crude pipe from first two tanks
      if (wells.length <= 2) {
        for (const p of staircase({ x: tank.x, y: tank.y }, { x: battery.x, y: battery.y })) {
          if (!g.buildingAt(p.x, p.y)) g.layPipe(p.x, p.y, "crude");
        }
      }
    }
  }

  // Gas plant + pipe from first well if room
  if (wells[0]) {
    let plantSpot: { x: number; y: number } | null = null;
    const w0 = wells[0];
    for (let y = w0.y - 3; y <= w0.y + 3 && !plantSpot; y++) {
      for (let x = w0.x + 2; x <= w0.x + 8; x++) {
        if (x < 0 || y < 0 || x + 1 >= g.config.cols || y + 1 >= g.config.rows) continue;
        const clear = [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ].every(
          ([dx, dy]) =>
            !blocksBuild(g.tiles[y + dy][x + dx].terrain) && !g.buildingAt(x + dx, y + dy),
        );
        if (clear) {
          plantSpot = { x, y };
          break;
        }
      }
    }
    if (plantSpot) {
      g.player.cash += 400_000;
      g.placeGasPlant(plantSpot.x, plantSpot.y);
      for (const p of staircase({ x: w0.x, y: w0.y }, plantSpot)) {
        if (!g.buildingAt(p.x, p.y)) g.layPipe(p.x, p.y, "gas");
      }
    }
  }

  // Stock battery inventories for SCADA readability
  battery.crude = 920;
  battery.clean = 640;
  if (battery.throughputCap) battery.throughputUsed = Math.floor(battery.throughputCap * 0.55);

  // Extra truck
  g.player.cash += 100_000;
  g.buyTruck();

  // Settle pipes / trucks
  for (let i = 0; i < 80; i++) g.update(0.2);
  g.timeScale = 0;

  // Camera: center on battery cluster
  const cam = {
    x: battery.x + 1,
    y: battery.y + 1,
    zoom: 1.25,
  };

  const payload = {
    v: SAVE_VERSION,
    updatedAt: Date.now(),
    cam,
    spd: 0.5,
    mode: "easy" as const,
    map: {
      name: prairie.name,
      seed: prairie.seed,
      cols: prairie.cols,
      rows: prairie.rows,
      params: prairie.params ?? DEFAULT_MAP_PARAMS,
    },
    game: g.serialize(),
    _meta: {
      purpose: "ASC screenshot fixture",
      wells: g.wells.length,
      buildings: g.buildings.length,
      roads: g.tiles.flat().filter((t) => t.hasRoad).length,
      oilPipes: g.tiles.flat().filter((t) => t.oilPipe).length,
      gasPipes: g.tiles.flat().filter((t) => t.gasPipe).length,
    },
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(payload));
  console.log(`Wrote ${OUT}`);
  console.log(
    `  wells=${payload._meta.wells} buildings=${payload._meta.buildings} roads=${payload._meta.roads} oilPipe=${payload._meta.oilPipes} gasPipe=${payload._meta.gasPipes}`,
  );
  console.log(`  cash=$${Math.round(g.player.cash).toLocaleString()} day=${g.market.day.toFixed(1)}`);
}

main();
