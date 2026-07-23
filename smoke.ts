/* Headless smoke test — bundled with esbuild, run in Node. Not shipped. */
import { Game } from "./src/game/Game";
import { CRUDE_PIPE_FLOW_BPD, WELLHEAD_CAP_BBL } from "./src/game/data/economy";
import { blocksBuild } from "./src/game/systems/terrain";
import type { Building, Well } from "./src/game/types";

let failures = 0;
function check(name: string, cond: boolean) {
  if (!cond) {
    failures++;
    console.error(`  ✗ ${name}`);
  } else {
    console.log(`  ✓ ${name}`);
  }
}

const g = new Game();
const { cols, rows } = g.config;

console.log("map + terrain");
check("map is 56x36", g.tiles.length === rows && g.tiles[0].length === cols && cols === 56 && rows === 36);

const counts: Record<string, number> = {};
for (const row of g.tiles) for (const t of row) counts[t.terrain] = (counts[t.terrain] ?? 0) + 1;
check("has water tiles", (counts.water ?? 0) > 0);
check("has rock tiles", (counts.rock ?? 0) > 0);
check("has creek tiles", (counts.creek ?? 0) > 0);
check("majority open ground/scrub", (counts.ground ?? 0) + (counts.scrub ?? 0) > cols * rows * 0.5);

// Anchor sites cleared to ground; buildings present.
const battery = g.buildings.find((b) => b.kind === "battery")!;
const refinery = g.buildings.find((b) => b.kind === "refinery")!;
check("battery placed", !!battery && battery.w === 2 && battery.h === 1);
check("refinery placed 2x2", !!refinery && refinery.w === 2 && refinery.h === 2);
check("battery tile is buildable", !blocksBuild(g.tiles[battery.y][battery.x].terrain));
check("refinery tile is buildable", !blocksBuild(g.tiles[refinery.y][refinery.x].terrain));

// Connectivity: a buildable route (water/rock = walls) exists battery→refinery.
function reachable(from: { x: number; y: number }, to: { x: number; y: number }): boolean {
  const seen = new Set<string>();
  const q = [from];
  seen.add(`${from.x},${from.y}`);
  while (q.length) {
    const c = q.shift()!;
    if (c.x === to.x && c.y === to.y) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = c.x + dx;
      const ny = c.y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const k = `${nx},${ny}`;
      if (seen.has(k)) continue;
      if (blocksBuild(g.tiles[ny][nx].terrain)) continue;
      seen.add(k);
      q.push({ x: nx, y: ny });
    }
  }
  return false;
}
check("battery→refinery buildable route exists", reachable({ x: battery.x, y: battery.y }, { x: refinery.x, y: refinery.y }));

console.log("simulation stability");
let crashed = false;
try {
  for (let i = 0; i < 300; i++) g.update(0.2);
} catch (e) {
  crashed = true;
  console.error(e);
}
check("300 ticks without crashing", !crashed);
check("cash is finite", Number.isFinite(g.player.cash));
check("reputation in [0,100]", g.player.reputation >= 0 && g.player.reputation <= 100);

console.log("oil pipeline auto-flow");
// Lay an oil pipe along the same staircase the corridor was carved on.
function staircase(from: { x: number; y: number }, to: { x: number; y: number }) {
  const path: { x: number; y: number }[] = [];
  let cx = from.x;
  let cy = from.y;
  let guard = 0;
  while ((cx !== to.x || cy !== to.y) && guard++ < 500) {
    const rx = to.x - cx;
    const ry = to.y - cy;
    if ((Math.abs(rx) >= Math.abs(ry) && rx !== 0) || ry === 0) cx += Math.sign(rx);
    else cy += Math.sign(ry);
    path.push({ x: cx, y: cy });
  }
  return path;
}
g.player.cash = 5_000_000;
let laid = 0;
for (const p of staircase({ x: battery.x, y: battery.y }, { x: refinery.x, y: refinery.y })) {
  if (g.buildingAt(p.x, p.y)) continue;
  if (g.layPipe(p.x, p.y, "oil")) laid++;
}
check("oil pipe tiles laid", laid > 5);
g.update(0.2); // triggers recomputePipes
check("battery↔refinery oil-connected", g.oilConnected === true);

console.log("gas plant + gas pipe");
// Inject a producing well on known open ground next to a clear 2x2 for a plant.
let plantSpot: { x: number; y: number } | null = null;
for (let y = 2; y < rows - 3 && !plantSpot; y++) {
  for (let x = 2; x < cols - 3; x++) {
    const clear = [[0, 0], [1, 0], [0, 1], [1, 1]].every(
      ([dx, dy]) => !blocksBuild(g.tiles[y + dy][x + dx].terrain) && !g.buildingAt(x + dx, y + dy),
    );
    const wellClear =
      x >= 3 && !blocksBuild(g.tiles[y][x - 2].terrain) && !g.buildingAt(x - 2, y);
    if (clear && wellClear) {
      plantSpot = { x, y };
      break;
    }
  }
}
check("found a plant spot", !!plantSpot);
if (plantSpot) {
  const well: Well = {
    id: "wtest",
    x: plantSpot.x - 2,
    y: plantSpot.y,
    status: "producing",
    oilRate: 100,
    gasRate: 200,
    oilIp: 100,
    gasIp: 200,
    declinePerDay: 0.005,
    ageDays: 0,
    drillProgress: 1,
    drillDaysNeeded: 1,
    wellheadTankId: null,
    pumpjackId: null,
  };
  g.wells.push(well);
  g.player.cash = 5_000_000;
  check("gas plant placed", g.placeGasPlant(plantSpot.x, plantSpot.y));
  // Pipe from the well tile to the plant edge (well at x-2, plant at x..x+1).
  check("gas pipe seg 1", g.layPipe(plantSpot.x - 2, plantSpot.y, "gas"));
  check("gas pipe seg 2", g.layPipe(plantSpot.x - 1, plantSpot.y, "gas"));
  g.update(0.2);
  check("well is gas-plant connected", g.gasSinkForWell(well));
}

console.log("add-tank + crude pipe");
{
  g.player.cash = 5_000_000;
  const bat = g.buildings.find((b) => b.kind === "battery")!;
  // A wellhead tank two tiles below the battery, linked by one oil-pipe tile.
  const tx = bat.x;
  const ty = bat.y + 2;
  const tank: Building = {
    id: "tanktest",
    kind: "wellhead_tank",
    x: tx,
    y: ty,
    oil: 300,
    oilCap: 400,
    crude: 0,
    crudeCap: 0,
    clean: 0,
    cleanCap: 0,
    wellId: null,
    online: true,
    hp: 100,
  };
  g.buildings.push(tank);
  check("base wellhead tank cap is 400", WELLHEAD_CAP_BBL === 400);

  g.addTank(tx, ty);
  check("add tank → 800", tank.oilCap === 800);
  g.addTank(tx, ty);
  g.addTank(tx, ty);
  check("add tank caps at 1600", tank.oilCap === 1600);
  check("add tank refuses past max", !g.addTank(tx, ty));

  // Link tank → battery with an oil pipe tile between them.
  g.layPipe(bat.x, bat.y + 1, "oil");
  const oilBefore = tank.oil;
  const crudeBefore = bat.crude;
  g.update(0.2);
  check("crude pipe drains tank", tank.oil < oilBefore);
  check("crude pipe fills battery crude", bat.crude > crudeBefore);

  // Per-network budget: a 2nd tank on the SAME battery must share, not double,
  // the crude-pipe intake (regression for CRUDE_PIPE_FLOW_BPD being per-tank).
  const tank2: Building = {
    id: "tanktest2",
    kind: "wellhead_tank",
    x: bat.x + 1,
    y: bat.y + 2,
    oil: 500,
    oilCap: 800,
    crude: 0,
    crudeCap: 0,
    clean: 0,
    cleanCap: 0,
    wellId: null,
    online: true,
    hp: 100,
  };
  g.buildings.push(tank2);
  g.layPipe(bat.x + 1, bat.y + 1, "oil");
  tank.oil = 500;
  const drainBefore = tank.oil + tank2.oil;
  g.update(0.2);
  const drained = drainBefore - (tank.oil + tank2.oil);
  check(
    "crude pipe intake is per-network, not per-tank",
    drained <= CRUDE_PIPE_FLOW_BPD * (0.35 / 24) * 1.3,
  );
}

console.log("stranded residual crude (shut-in well)");
{
  // A shut-in well's tank with residual < 360 must still be haulable.
  const g3 = new Game();
  g3.player.cash = 5_000_000;
  const bat = g3.buildings.find((b) => b.kind === "battery")!;
  const well: Well = {
    id: "wsi",
    x: bat.x,
    y: bat.y + 3,
    status: "shut_in",
    oilRate: 0,
    gasRate: 0,
    oilIp: 0,
    gasIp: 0,
    declinePerDay: 0.005,
    ageDays: 99,
    drillProgress: 1,
    drillDaysNeeded: 1,
    wellheadTankId: "tsi",
    pumpjackId: null,
  };
  const tank: Building = {
    id: "tsi",
    kind: "wellhead_tank",
    x: bat.x,
    y: bat.y + 2,
    oil: 130,
    oilCap: 400,
    crude: 0,
    crudeCap: 0,
    clean: 0,
    cleanCap: 0,
    wellId: "wsi",
    online: true,
    hp: 100,
  };
  g3.wells.push(well);
  g3.buildings.push(tank);
  g3.tiles[tank.y][tank.x].hasRoad = true; // truck-reachable next to the battery
  const before = tank.oil;
  for (let i = 0; i < 200; i++) g3.update(0.2);
  check("shut-in well residual crude gets hauled (not stranded)", tank.oil < before - 1);
}

console.log("multi battery + refinery");
{
  g.player.cash = 10_000_000;
  // Find two separate 2x2 clear spots away from existing buildings.
  const spots: { x: number; y: number }[] = [];
  for (let y = 2; y < rows - 3 && spots.length < 2; y++) {
    for (let x = 2; x < cols - 3 && spots.length < 2; x++) {
      const clear = [[0, 0], [1, 0], [0, 1], [1, 1]].every(
        ([dx, dy]) => !blocksBuild(g.tiles[y + dy][x + dx].terrain) && !g.buildingAt(x + dx, y + dy),
      );
      const far = spots.every((s) => Math.abs(s.x - x) + Math.abs(s.y - y) > 4);
      if (clear && far) spots.push({ x, y });
    }
  }
  check("found two build spots", spots.length === 2);
  if (spots.length === 2) {
    check("place 2nd battery", g.placeBattery(spots[0].x, spots[0].y));
    check("place 2nd refinery", g.placeRefinery(spots[1].x, spots[1].y));
    check("now 2 batteries", g.buildings.filter((b) => b.kind === "battery").length === 2);
    check("now 2 refineries", g.buildings.filter((b) => b.kind === "refinery").length === 2);
    const d = g.dashboard();
    check("dashboard treatCap aggregates 2 batteries", d.treatCap === 2000);
    check("dashboard slot aggregates 2 refineries", d.refSlotCap === 2400);
    let ok3 = true;
    try {
      for (let i = 0; i < 60; i++) g.update(0.2);
    } catch {
      ok3 = false;
    }
    check("multi-facility ticks without crashing", ok3);
  }
}

console.log("save round-trip");
const snap = JSON.parse(JSON.stringify(g.serialize()));
const g2 = new Game();
g2.applyState(snap);
check("restored cash matches", Math.abs(g2.player.cash - g.player.cash) < 1);
check("restored building count matches", g2.buildings.length === g.buildings.length);
check("restored oil pipe count matches", countPipe(g2) === countPipe(g));
function countPipe(gg: Game) {
  let n = 0;
  for (const row of gg.tiles) for (const t of row) if (t.oilPipe) n++;
  return n;
}
let ok2 = true;
try {
  for (let i = 0; i < 50; i++) g2.update(0.2);
} catch {
  ok2 = false;
}
check("restored game ticks without crashing", ok2);

console.log(failures === 0 ? "\nALL SMOKE CHECKS PASSED" : `\n${failures} SMOKE CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
