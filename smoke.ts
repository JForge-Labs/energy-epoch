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
check("map is 80x52", g.tiles.length === rows && g.tiles[0].length === cols && cols === 80 && rows === 52);

const counts: Record<string, number> = {};
for (const row of g.tiles) for (const t of row) counts[t.terrain] = (counts[t.terrain] ?? 0) + 1;
check("has water tiles", (counts.water ?? 0) > 0);
check("has rock tiles", (counts.rock ?? 0) > 0);
check("has creek tiles", (counts.creek ?? 0) > 0);
check("majority open ground/scrub", (counts.ground ?? 0) + (counts.scrub ?? 0) > cols * rows * 0.5);

// Oil districts: plenty of drill-worthy rock, spread across the whole lease so
// the player always has a next field to develop instead of running dry.
const openTerrain = (t: string) => t === "ground" || t === "scrub";
let goodProspect = 0;
let goodOffLand = 0;
const oilQuadrants = new Set<string>();
for (let y = 0; y < rows; y++)
  for (let x = 0; x < cols; x++) {
    const ti = g.tiles[y][x];
    if (ti.subsurface.prospect >= 0.55) {
      goodProspect++;
      oilQuadrants.add(`${x < cols / 2 ? "W" : "E"}${y < rows / 2 ? "N" : "S"}`);
      if (!openTerrain(ti.terrain)) goodOffLand++;
    }
  }
check("ample drill targets (>250 good+ tiles)", goodProspect > 250);
check("oil spread across ≥3 quadrants", oilQuadrants.size >= 3);
// Anti-trap: NO Good/Sweet oil on undrillable terrain (water/rock/creek).
check("no drill-grade oil on impassable terrain", goodOffLand === 0);
// A reachable Good+ land tile drillable at the T0 starter rig sits near the pad.
let starterFieldOk = false;
for (let y = 0; y < rows && !starterFieldOk; y++)
  for (let x = 0; x < cols; x++) {
    const ti = g.tiles[y][x];
    if (
      openTerrain(ti.terrain) &&
      ti.subsurface.zone === 0 &&
      ti.subsurface.prospect >= 0.55 &&
      Math.abs(x - 9) + Math.abs(y - 13) <= 14
    ) {
      starterFieldOk = true;
      break;
    }
  }
check("reachable zone-0 Good+ land field near the starter", starterFieldOk);

// Anchor sites cleared to ground; buildings present.
const battery = g.buildings.find((b) => b.kind === "battery")!;
const refinery = g.buildings.find((b) => b.kind === "refinery")!;
check("battery placed", !!battery && battery.w === 2 && battery.h === 2);
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
  // A wellhead tank below the 2×2 battery, linked by one oil-pipe tile.
  const tx = bat.x;
  const ty = bat.y + 3;
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

  // Link tank → battery with an oil pipe tile between them (below the footprint).
  g.layPipe(bat.x, bat.y + 2, "oil");
  // Fill clean so treat cannot consume the piped crude in the same tick.
  bat.clean = bat.cleanCap;
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
    y: bat.y + 3,
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
  g.layPipe(bat.x + 1, bat.y + 2, "oil");
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

console.log("small truck + interest toggle");
{
  g.player.cash = 5_000_000;
  g.buyTruck(200, 50_000);
  const trucks = g.units.filter((u) => u.kind === "truck");
  check("bought a 200 bbl truck", trucks[trucks.length - 1].cargoCap === 200);
  check("interest (hard mode) defaults off", new Game().interestEnabled === false);

  // Hard mode (interest) is OFF by default — ON must leave the player worse off.
  const gHard = new Game();
  const gEasy = new Game();
  gHard.interestEnabled = true;
  gEasy.interestEnabled = false;
  for (let i = 0; i < 40; i++) {
    gHard.update(0.2);
    gEasy.update(0.2);
  }
  const netHard = gHard.player.cash - gHard.player.credit.debt;
  const netEasy = gEasy.player.cash - gEasy.player.credit.debt;
  check("interest toggle off stops the debt drain", netEasy > netHard + 100);
}

console.log("trucks haul clean to the refinery");
{
  // Regression for the clean-haul starvation bug: with clean in the battery and
  // a road to the refinery, a truck must sell it (totalOilSold grows).
  const g4 = new Game();
  const bat = g4.buildings.find((b) => b.kind === "battery")!;
  const ref = g4.buildings.find((b) => b.kind === "refinery")!;
  let cx = bat.x;
  let cy = bat.y;
  g4.tiles[cy][cx].hasRoad = true;
  let guard = 0;
  while ((cx !== ref.x || cy !== ref.y) && guard++ < 250) {
    if (cx !== ref.x) cx += Math.sign(ref.x - cx);
    else cy += Math.sign(ref.y - cy);
    g4.tiles[cy][cx].hasRoad = true;
  }
  bat.clean = 800;
  for (let i = 0; i < 400; i++) g4.update(0.2);
  check("clean oil reaches the refinery (sales happen)", g4.totalOilSold > 0);
}

console.log("oil pipe sells clean without truck camping");
{
  // Live oil pipe should move clean even when trucks are free for crude.
  const gP = new Game();
  gP.player.cash = 50_000_000;
  const bat = gP.buildings.find((b) => b.kind === "battery")!;
  const ref = gP.buildings.find((b) => b.kind === "refinery")!;
  // Same staircase pattern as the oil-connected smoke above.
  let laidP = 0;
  for (const p of staircase({ x: bat.x, y: bat.y }, { x: ref.x, y: ref.y })) {
    if (gP.buildingAt(p.x, p.y)) continue;
    if (gP.layPipe(p.x, p.y, "oil")) laidP++;
  }
  check("oil pipe sell-test laid tiles", laidP > 5);
  gP.update(0.2);
  check("oil pipe sell-test connected", gP.oilConnected === true);
  bat.clean = 900;
  for (const t of gP.units.filter((u) => u.kind === "truck")) {
    t.stopped = true;
    t.cargo = 0;
    t.cargoKind = "none";
  }
  for (let i = 0; i < 80; i++) gP.update(0.2);
  check("oil pipe moves clean to sales", gP.totalOilSold > 50);
  check("oil pipe left clean below starting load", bat.clean < 900);
}

console.log("treating unblocks when clean is hauled (crude bottleneck)");
{
  // Clean nearly full + competing full wellhead: trucks must ship clean so
  // treat can keep converting crude→clean (prod mobile freeze symptom).
  const gT = new Game();
  const bat = gT.buildings.find((b) => b.kind === "battery")!;
  const ref = gT.buildings.find((b) => b.kind === "refinery")!;
  let cx = bat.x;
  let cy = bat.y;
  gT.tiles[cy][cx].hasRoad = true;
  let guard = 0;
  while ((cx !== ref.x || cy !== ref.y) && guard++ < 250) {
    if (cx !== ref.x) cx += Math.sign(ref.x - cx);
    else cy += Math.sign(ref.y - cy);
    gT.tiles[cy][cx].hasRoad = true;
  }
  gT.tiles[bat.y + 1][bat.x].hasRoad = true;
  gT.buildings.push({
    id: "tk_compete",
    kind: "wellhead_tank",
    x: bat.x,
    y: bat.y + 1,
    oil: 400,
    oilCap: 400,
    crude: 0,
    crudeCap: 0,
    clean: 0,
    cleanCap: 0,
    wellId: null,
    online: true,
    hp: 100,
  });
  bat.clean = bat.cleanCap * 0.9;
  bat.crude = 800;
  const crude0 = bat.crude;
  const sold0 = gT.totalOilSold;
  for (let i = 0; i < 500; i++) gT.update(0.2);
  check("clean ships under treat pressure", gT.totalOilSold > sold0);
  check("crude was treated (or shipped via room made)", bat.crude < crude0 - 50 || bat.clean < bat.cleanCap * 0.85);

  // All trucks stopped → triage screams.
  for (const t of gT.units.filter((u) => u.kind === "truck")) t.stopped = true;
  const tri = gT.triage();
  check("triage flags all trucks stopped", tri.level === "crit" && /STOP/i.test(tri.msg));
}

console.log("biggest-need + triage");
{
  // Full clean must ship even when a ready (full) wellhead competes.
  const g5 = new Game();
  const bat = g5.buildings.find((b) => b.kind === "battery")!;
  const ref = g5.buildings.find((b) => b.kind === "refinery")!;
  let cx = bat.x;
  let cy = bat.y;
  g5.tiles[cy][cx].hasRoad = true;
  let guard = 0;
  while ((cx !== ref.x || cy !== ref.y) && guard++ < 250) {
    if (cx !== ref.x) cx += Math.sign(ref.x - cx);
    else cy += Math.sign(ref.y - cy);
    g5.tiles[cy][cx].hasRoad = true;
  }
  g5.tiles[bat.y + 1][bat.x].hasRoad = true;
  g5.buildings.push({
    id: "tkfull",
    kind: "wellhead_tank",
    x: bat.x,
    y: bat.y + 1,
    oil: 400,
    oilCap: 400,
    crude: 0,
    crudeCap: 0,
    clean: 0,
    cleanCap: 0,
    wellId: null,
    online: true,
    hp: 100,
  });
  bat.clean = bat.cleanCap;
  for (let i = 0; i < 400; i++) g5.update(0.2);
  check("full clean ships even with a ready wellhead competing", g5.totalOilSold > 0);

  // Triage flags clean-full with no road to a refinery.
  const g6 = new Game();
  const bat6 = g6.buildings.find((b) => b.kind === "battery")!;
  bat6.clean = bat6.cleanCap;
  const t = g6.triage();
  check("triage flags clean-full + no road as critical", t.level === "crit" && /road/i.test(t.msg));
}

console.log("move-and-drill + truck stop");
{
  // moveAndDrill: rig rolls to an adjacent open tile and spuds on arrival.
  const g7 = new Game();
  const rig = g7.selectedRig()!;
  const tx = Math.round(rig.x) + 1;
  const ty = Math.round(rig.y);
  const tile = g7.tiles[ty][tx];
  tile.terrain = "ground";
  tile.drilled = false;
  tile.subsurface.zone = 0;
  g7.player.cash = 1_000_000;
  const wellsBefore = g7.wells.length;
  g7.moveAndDrill(tx, ty);
  for (let i = 0; i < 120; i++) g7.update(0.2);
  check("move-and-drill spuds a well on arrival", g7.wells.length > wellsBefore);

  // A stopped truck hauls nothing even with clean ready + a road to sales.
  const g8 = new Game();
  const truck = g8.units.find((u) => u.kind === "truck")!;
  g8.setTruckStopped(truck.id, true);
  const bat = g8.buildings.find((b) => b.kind === "battery")!;
  const ref = g8.buildings.find((b) => b.kind === "refinery")!;
  let cx = bat.x;
  let cy = bat.y;
  g8.tiles[cy][cx].hasRoad = true;
  let guard = 0;
  while ((cx !== ref.x || cy !== ref.y) && guard++ < 250) {
    if (cx !== ref.x) cx += Math.sign(ref.x - cx);
    else cy += Math.sign(ref.y - cy);
    g8.tiles[cy][cx].hasRoad = true;
  }
  bat.clean = bat.cleanCap;
  for (let i = 0; i < 200; i++) g8.update(0.2);
  check("stopped truck hauls nothing", g8.totalOilSold === 0);
}

console.log("storm-damaged battery auto-repairs (no permanent treat deadlock)");
{
  const g10 = new Game();
  const b10 = g10.buildings.find((b) => b.kind === "battery")!;
  // Simulate a lightning kill that leaves crude backed up and clean at 0 —
  // the exact deadlock signature (treat frozen, crude 100%, clean empty).
  b10.online = false;
  b10.hp = 0;
  b10.crude = b10.crudeCap;
  b10.clean = 0;
  const tri = g10.triage();
  check("offline battery raises a crit triage", tri.level === "crit" && /offline/i.test(tri.msg));
  check("dashboard counts the offline battery", g10.dashboard().batteriesOffline === 1);
  let recovered = false;
  let crudeAtRepair = 0;
  for (let i = 0; i < 200; i++) {
    g10.update(0.2);
    if (b10.online) {
      recovered = true;
      crudeAtRepair = b10.crude;
      break;
    }
  }
  check("battery auto-repairs back online", recovered);
  for (let i = 0; i < 20; i++) g10.update(0.2);
  check("treating resumes after repair (crude drains, clean produced)", b10.crude < crudeAtRepair && b10.clean > 0);
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

// Cross-size migration: a save from a SMALLER (old 56×36-style) lease must load
// into the current build, sync config to its own grid, and tick without any
// out-of-bounds. Guards the "don't wipe the user's old save" requirement.
console.log("old-lease save migration");
const oldLease = new Game({ cols: 40, rows: 26 });
const oldSnap = JSON.parse(JSON.stringify(oldLease.serialize()));
const g9 = new Game(); // default 80×52
g9.applyState(oldSnap);
check("config synced to loaded grid cols", g9.config.cols === 40);
check("config synced to loaded grid rows", g9.config.rows === 26);
check("loaded grid dimensions intact", g9.tiles.length === 26 && g9.tiles[0].length === 40);
let ok9 = true;
try {
  for (let i = 0; i < 30; i++) g9.update(0.2);
} catch {
  ok9 = false;
}
check("migrated old-lease save ticks without crashing", ok9);

console.log(failures === 0 ? "\nALL SMOKE CHECKS PASSED" : `\n${failures} SMOKE CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
