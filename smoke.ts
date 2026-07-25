/* Headless smoke test — bundled with esbuild, run in Node. Not shipped. */
import { Game } from "./src/game/Game";
import {
  CRUDE_PIPE_FLOW_BPD,
  GAS_PLANT_MCFD,
  GAS_PLANT_PREMIUM,
  MAP_PRESETS,
  WELLHEAD_CAP_BBL,
} from "./src/game/data/economy";
import { simulateProduction } from "./src/game/systems/production";
import { blocksBuild, isOpen, rigCanEnter } from "./src/game/systems/terrain";
import { pipeSnapsTo, runIsOutward } from "./src/game/render";
import {
  starterBatteryFrom,
  starterFieldFrom,
  starterOrigin,
} from "./src/game/systems/mapgen";
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
// Anchor sites cleared to ground; buildings present.
const battery = g.buildings.find((b) => b.kind === "battery")!;
const refinery = g.buildings.find((b) => b.kind === "refinery")!;
// A reachable Good+ land tile drillable at the T0 starter rig sits near the
// (now seed-varying) battery.
let starterFieldOk = false;
for (let y = 0; y < rows && !starterFieldOk; y++)
  for (let x = 0; x < cols; x++) {
    const ti = g.tiles[y][x];
    if (
      openTerrain(ti.terrain) &&
      ti.subsurface.zone === 0 &&
      ti.subsurface.prospect >= 0.55 &&
      Math.abs(x - battery.x) + Math.abs(y - battery.y) <= 14
    ) {
      starterFieldOk = true;
      break;
    }
  }
check("reachable zone-0 Good+ land field near the starter", starterFieldOk);

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
  if (g.layPipe(p.x, p.y, "clean")) laid++;
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

  // Link tank → battery with a crude pipe tile between them (below the footprint).
  g.layPipe(bat.x, bat.y + 2, "crude");
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
  g.layPipe(bat.x + 1, bat.y + 2, "crude");
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
  check("mode defaults to easy (no interest)", new Game().mode === "easy");

  // Hard mode accrues interest; Easy does not — Hard must leave you worse off.
  const gHard = new Game();
  const gEasy = new Game();
  gHard.mode = "hard";
  gEasy.mode = "easy";
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
    if (gP.layPipe(p.x, p.y, "clean")) laidP++;
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

console.log("gas plant capacity stacks with plant count");
{
  const freshWell = (): Well => ({
    id: "gw",
    x: 1,
    y: 1,
    status: "producing",
    oilRate: 5,
    gasRate: 2000, // mcf/day — well above one plant's capacity
    oilIp: 5,
    gasIp: 2000,
    declinePerDay: 0,
    ageDays: 0,
    drillProgress: 1,
    drillDaysNeeded: 1,
    wellheadTankId: null,
    pumpjackId: null,
  });
  // One plant caps premium sales at its capacity; the rest flares.
  const r1 = simulateProduction(
    [freshWell()],
    [],
    new Game().player,
    3.0,
    1,
    () => true,
    GAS_PLANT_PREMIUM,
    GAS_PLANT_MCFD,
  );
  // Two plants double the capacity → double the gas sold.
  const r2 = simulateProduction(
    [freshWell()],
    [],
    new Game().player,
    3.0,
    1,
    () => true,
    GAS_PLANT_PREMIUM,
    GAS_PLANT_MCFD * 2,
  );
  check("one plant caps gas ≈ its capacity", Math.abs(r1.gasSold - GAS_PLANT_MCFD) < 2);
  check("two plants ~double gas throughput", r2.gasSold > r1.gasSold * 1.9);
  check("gas over plant capacity flares", r1.gasFlared > 100);
}

console.log("flare flame syncs to gas takeaway");
{
  const gf = new Game();
  const well: Well = {
    id: "fw",
    x: 20,
    y: 20,
    status: "producing",
    oilRate: 5,
    gasRate: 100,
    oilIp: 5,
    gasIp: 100,
    declinePerDay: 0,
    ageDays: 0,
    drillProgress: 1,
    drillDaysNeeded: 1,
    wellheadTankId: null,
    pumpjackId: null,
  };
  gf.wells.push(well);
  const flare: Building = {
    id: "ff",
    kind: "gas_flare",
    x: 20,
    y: 20,
    oil: 0,
    oilCap: 0,
    crude: 0,
    crudeCap: 0,
    clean: 0,
    cleanCap: 0,
    wellId: "fw",
    online: true,
    hp: 50,
  };
  gf.buildings.push(flare);
  gf.update(0.2);
  check("flare lit when the well has no takeaway", flare.online === true);
  // A gas line within 2 tiles must pull the flame down.
  gf.buildings.push({
    id: "gl2",
    kind: "gas_line",
    x: 21,
    y: 20,
    oil: 0,
    oilCap: 0,
    crude: 0,
    crudeCap: 0,
    clean: 0,
    cleanCap: 0,
    wellId: "fw",
    online: true,
    hp: 100,
  });
  gf.update(0.2);
  check("gas takeaway pulls the flare down", flare.online === false);
}

console.log("drill queue (add / toggle-cancel / cap at 6)");
{
  const gq = new Game();
  const rig = gq.units.find((u) => u.kind === "drill_rig")!;
  rig.busy = true; // hold the rig so queueing doesn't auto-execute the first
  const rx = Math.round(rig.x);
  const ry = Math.round(rig.y);
  const spots: { x: number; y: number }[] = [];
  for (let rad = 1; rad < 16 && spots.length < 7; rad++) {
    for (let dy = -rad; dy <= rad && spots.length < 7; dy++)
      for (let dx = -rad; dx <= rad && spots.length < 7; dx++) {
        const x = rx + dx;
        const y = ry + dy;
        if (x < 0 || y < 0 || x >= gq.config.cols || y >= gq.config.rows) continue;
        const t = gq.tiles[y][x];
        if (
          !t.drilled &&
          (t.terrain === "ground" || t.terrain === "scrub") &&
          t.subsurface.zone === 0 &&
          !gq.buildingAt(x, y) &&
          !(x === rx && y === ry) &&
          !spots.some((s) => s.x === x && s.y === y)
        ) {
          spots.push({ x, y });
        }
      }
  }
  check("found enough queue spots", spots.length >= 7);
  for (const s of spots.slice(0, 6)) gq.queueDrill(s.x, s.y);
  check("six drills queued", gq.drillQueue.length === 6);
  check("7th is refused (cap)", !gq.queueDrill(spots[6].x, spots[6].y) && gq.drillQueue.length === 6);
  // Toggling a queued tile cancels it.
  gq.queueDrill(spots[0].x, spots[0].y);
  check("toggle cancels a queued drill", gq.drillQueue.length === 5);
}

console.log("map presets: config threads through + reproducible");
{
  const gp = new Game({ cols: 76, rows: 50, seed: 48, mapParams: { water: 0.8, rock: 0.8, oil: 1.5 } });
  check(
    "preset config sizes the grid",
    gp.config.cols === 76 && gp.config.rows === 50 && gp.tiles.length === 50 && gp.tiles[0].length === 76,
  );
  check("preset seed threads into config", gp.config.seed === 48);
  const a = new Game({ cols: 80, rows: 52, seed: 21, mapParams: { water: 1.9, rock: 0.5, oil: 1.1 } });
  const b = new Game({ cols: 80, rows: 52, seed: 21, mapParams: { water: 1.9, rock: 0.5, oil: 1.1 } });
  const c = new Game({ cols: 80, rows: 52, seed: 999 });
  let same = true;
  let diff = 0;
  for (let y = 0; y < 52; y++)
    for (let x = 0; x < 80; x++) {
      if (a.tiles[y][x].terrain !== b.tiles[y][x].terrain) same = false;
      if (a.tiles[y][x].terrain !== c.tiles[y][x].terrain) diff++;
    }
  check("same config → reproducible terrain", same);
  check("different seed → different terrain", diff > 50);
}

console.log("difficulty modes: easy never shuts in; hard has grace + bankruptcy");
{
  // EASY: reputation at 0 must never end the game.
  const ge = new Game();
  ge.mode = "easy";
  ge.player.reputation = 0;
  for (let i = 0; i < 500; i++) ge.update(0.2);
  check("easy: rep 0 never shuts in", ge.gameOver === false);

  // HARD: a shut-in clock shows a countdown BEFORE the end (early warning).
  const gc = new Game();
  gc.mode = "hard";
  gc.player.reputation = 0;
  gc.update(0.2);
  check(
    "hard: shut-in countdown surfaced before game-over",
    gc.shutInInDays() != null && (gc.shutInInDays() ?? 0) > 0 && gc.gameOver === false,
  );

  // HARD: rep 0 held past the grace → shut-in (reputation reason).
  const gh = new Game();
  gh.mode = "hard";
  gh.player.reputation = 0;
  for (let i = 0; i < 600 && !gh.gameOver; i++) gh.update(0.2);
  check("hard: rep 0 shuts in after grace", gh.gameOver === true && /reputation/i.test(gh.gameOverReason));

  // HARD: recovering reputation before the grace cancels the countdown.
  const gr = new Game();
  gr.mode = "hard";
  gr.player.reputation = 0;
  for (let i = 0; i < 100; i++) gr.update(0.2);
  gr.player.reputation = 60;
  gr.update(0.2);
  check("hard: recovering rep cancels the countdown", gr.shutInInDays() === null && gr.gameOver === false);

  // HARD: insolvency (maxed facility + negative cash) shuts in after the grace.
  const gb = new Game();
  gb.mode = "hard";
  gb.player.credit.debt = 99_999_999;
  gb.player.cash = -100_000;
  for (let i = 0; i < 600 && !gb.gameOver; i++) gb.update(0.2);
  check("hard: insolvency shuts in after grace", gb.gameOver === true && /nsolven|loan|bank/i.test(gb.gameOverReason));
}

console.log("pipe rework: crude/clean separation + flow direction + backfill");
{
  // Build a controlled arena on cleared ground:
  //   T(8,10) —crude 9,10 10,10 11,10— B(12,10 2x2) —clean 14,10 15,10— R(16,10 2x2)
  // plus a crude stub next to the refinery and a clean stub next to the tank.
  const gp = new Game();
  gp.player.cash = 50_000_000;
  const ax0 = 6, ay0 = 8, ax1 = 20, ay1 = 13;
  const hits = (b: Building) => {
    const bw = b.w ?? 1, bh = b.h ?? 1;
    return b.x <= ax1 && b.x + bw - 1 >= ax0 && b.y <= ay1 && b.y + bh - 1 >= ay0;
  };
  gp.buildings = gp.buildings.filter((b) => !hits(b));
  gp.wells = gp.wells.filter((w) => !(w.x >= ax0 && w.x <= ax1 && w.y >= ay0 && w.y <= ay1));
  for (let y = ay0; y <= ay1; y++)
    for (let x = ax0; x <= ax1; x++) {
      const t = gp.tiles[y][x];
      t.terrain = "ground";
      t.hasRoad = false;
      t.oilPipe = false;
      t.oilPhase = undefined;
      t.gasPipe = false;
    }
  const tank: Building = {
    id: "pr_tank", kind: "wellhead_tank", x: 8, y: 10,
    oil: 300, oilCap: 400, crude: 0, crudeCap: 0, clean: 0, cleanCap: 0,
    wellId: null, online: true, hp: 100,
  };
  const bat: Building = {
    id: "pr_bat", kind: "battery", x: 12, y: 10,
    oil: 0, oilCap: 0, crude: 0, crudeCap: 2000, clean: 0, cleanCap: 1000,
    wellId: null, online: true, hp: 100, w: 2, h: 2,
  };
  const ref: Building = {
    id: "pr_ref", kind: "refinery", x: 16, y: 10,
    oil: 0, oilCap: 0, crude: 0, crudeCap: 0, clean: 0, cleanCap: 0,
    wellId: null, online: true, hp: 100, w: 2, h: 2,
    throughputCap: 2400, throughputUsed: 0,
  };
  gp.buildings.push(tank, bat, ref);

  // Real lay path (exercises layPipe cost/terrain/phase).
  check("crude line lays", gp.layPipe(9, 10, "crude") && gp.layPipe(10, 10, "crude") && gp.layPipe(11, 10, "crude"));
  check("clean line lays", gp.layPipe(14, 10, "clean") && gp.layPipe(15, 10, "clean"));
  // Stubs of the WRONG phase touching an endpoint they must not serve.
  check("crude stub by refinery lays", gp.layPipe(15, 11, "crude"));
  check("clean stub by tank lays", gp.layPipe(8, 11, "clean"));
  gp.update(0.2); // recompute

  // 1) Separation — wrong-phase stubs never register / go live.
  check("crude stub next to refinery is dead", !gp.oilConnectedTiles.has("15,11"));
  check("clean stub next to tank is dead", !gp.oilConnectedTiles.has("8,11"));
  check("adjacent crude+clean don't merge", gp.oilConnectedTiles.has("15,10") && !gp.oilConnectedTiles.has("15,11"));

  // 4) Wellhead de-snap — clean never snaps to a tank; crude never to a refinery.
  check("clean does NOT snap to wellhead tank", pipeSnapsTo(gp, 8, 10, "oilPipe", "clean") === false);
  check("crude DOES snap to wellhead tank", pipeSnapsTo(gp, 8, 10, "oilPipe", "crude") === true);
  check("crude does NOT snap to refinery", pipeSnapsTo(gp, 16, 10, "oilPipe", "crude") === false);
  check("clean DOES snap to refinery", pipeSnapsTo(gp, 16, 10, "oilPipe", "clean") === true);

  // 2) Crude path — live, rank decreases toward the battery (sink), flow moves.
  check("crude tiles live", gp.oilConnectedTiles.has("9,10") && gp.oilConnectedTiles.has("11,10"));
  check("crude rank 0 at battery-adjacent tile", gp.oilFlowRank.get("11,10") === 0);
  check("crude rank increases away from battery", gp.oilFlowRank.get("9,10")! > gp.oilFlowRank.get("11,10")!);
  bat.clean = bat.cleanCap; // block treating so piped crude stays as crude
  const tankOil0 = tank.oil, batCrude0 = bat.crude;
  gp.update(0.2);
  check("crude pipe drains tank", tank.oil < tankOil0);
  check("crude pipe fills battery crude", bat.crude > batCrude0);

  // 3) Clean path — connected, rank decreases toward the refinery (sink), sells.
  check("battery↔refinery clean-connected", gp.oilConnected === true);
  check("clean rank 0 at refinery-adjacent tile", gp.oilFlowRank.get("15,10") === 0);
  check("clean rank increases away from refinery", gp.oilFlowRank.get("14,10")! > gp.oilFlowRank.get("15,10")!);
  const sold0 = gp.totalOilSold;
  bat.clean = bat.cleanCap;
  gp.update(0.2);
  check("clean pipe sells to refinery", gp.totalOilSold > sold0);

  // 5) Direction — a straight crude tile flows OUTWARD toward the battery only.
  const rMid = gp.oilFlowRank.get("10,10")!;
  check("run toward battery is outward", runIsOutward(gp, 10, 10, 1, 0, "oilPipe", "crude", gp.oilFlowRank, rMid) === true);
  check("run toward tank is inward", runIsOutward(gp, 10, 10, -1, 0, "oilPipe", "crude", gp.oilFlowRank, rMid) === false);

  // 6a) Save round-trip preserves oilPhase + reproduces identical flow ranks.
  const rt = JSON.parse(JSON.stringify(gp.serialize()));
  const gr = new Game();
  gr.applyState(rt);
  check("round-trip keeps crude phase", gr.tiles[10][10].oilPhase === "crude");
  check("round-trip keeps clean phase", gr.tiles[10][14].oilPhase === "clean");
  gr.update(0.2);
  check("round-trip reproduces crude rank", gr.oilFlowRank.get("9,10") === gp.oilFlowRank.get("9,10"));
  check("round-trip reproduces clean rank", gr.oilFlowRank.get("15,10") === 0);

  // 6b) Legacy backfill — a no-phase save re-tags components correctly.
  const legacy = JSON.parse(JSON.stringify(gp.serialize()));
  for (const row of legacy.tiles) for (const t of row) if (t.oilPipe) delete t.oilPhase;
  const gl = new Game();
  gl.applyState(legacy); // applyState → backfillOilPhases()
  check("backfill tags tank-touching run crude", gl.tiles[10][10].oilPhase === "crude");
  check("backfill tags refinery-only run clean", gl.tiles[10][14].oilPhase === "clean" && gl.tiles[10][15].oilPhase === "clean");
  gl.update(0.2);
  check("backfilled crude path drains a tank", (() => {
    const t = gl.buildings.find((b) => b.id === "pr_tank")!;
    const b = gl.buildings.find((bb) => bb.id === "pr_bat")!;
    b.clean = b.cleanCap;
    const o0 = t.oil;
    for (let i = 0; i < 5; i++) gl.update(0.2);
    return t.oil < o0;
  })());
  check("backfilled clean path is connected", gl.oilConnected === true);
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

console.log("seed-varying starter: valid + reachable + reproducible per preset");
// rig-BFS: open ground OR roaded tiles only (creek blocks unless bridged) — the
// true reachability gate for the starter rig.
function rigReaches(
  gm: Game,
  from: { x: number; y: number },
  to: { x: number; y: number },
): boolean {
  const { cols, rows } = gm.config;
  const seen = new Set([`${from.x},${from.y}`]);
  const q = [from];
  while (q.length) {
    const c = q.shift()!;
    if (c.x === to.x && c.y === to.y) return true;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = c.x + dx;
      const ny = c.y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const k = `${nx},${ny}`;
      if (seen.has(k)) continue;
      if (!rigCanEnter(gm.tiles[ny][nx])) continue;
      seen.add(k);
      q.push({ x: nx, y: ny });
    }
  }
  return false;
}

const seedSweep = [3, 17, 48, 101, 777, 2024];
const startOrigins = new Set<string>();
type StarterCase = { cols: number; rows: number; seed: number; params: { water: number; rock: number; oil: number } };
const starterCases: StarterCase[] = [
  ...MAP_PRESETS.filter((pp) => !pp.random).map((pp) => ({
    cols: pp.cols,
    rows: pp.rows,
    seed: pp.seed,
    params: pp.params,
  })),
  // A deliberately hostile water+rock-heavy smallest map, swept over seeds.
  ...seedSweep.map((s) => ({ cols: 76, rows: 50, seed: s, params: { water: 1.9, rock: 1.9, oil: 0.8 } })),
];
for (const p of starterCases) {
  const gm = new Game({ cols: p.cols, rows: p.rows, seed: p.seed, mapParams: p.params });
  const o = starterOrigin(p.cols, p.rows, p.seed, p.params);
  const b = starterBatteryFrom(o);
  const f = starterFieldFrom(o);
  const tag = `[${p.cols}x${p.rows}#${p.seed}]`;

  check(`${tag} origin in band`, o.x >= 2 && o.x <= p.cols - 19 && o.y >= 2 && o.y <= p.rows - 12);

  const bat = gm.buildings.find((bb) => bb.kind === "battery")!;
  check(`${tag} battery == derived anchor`, !!bat && bat.x === b.x && bat.y === b.y);
  check(`${tag} battery tile open`, isOpen(gm.tiles[b.y][b.x].terrain));
  startOrigins.add(`${o.x},${o.y}`);

  let fieldOk = false;
  for (let dy = -3; dy <= 3 && !fieldOk; dy++)
    for (let dx = -3; dx <= 3; dx++) {
      const t = gm.tiles[f.y + dy]?.[f.x + dx];
      if (t && isOpen(t.terrain) && t.subsurface.zone === 0 && t.subsurface.prospect >= 0.55) {
        fieldOk = true;
        break;
      }
    }
  check(`${tag} zone-0 Good+ field at anchor`, fieldOk);
  check(`${tag} rig reaches field`, rigReaches(gm, { x: o.x, y: o.y + 1 }, f));

  const gm2 = new Game({ cols: p.cols, rows: p.rows, seed: p.seed, mapParams: p.params });
  const bat2 = gm2.buildings.find((bb) => bb.kind === "battery")!;
  check(`${tag} reproducible battery`, !!bat2 && bat2.x === b.x && bat2.y === b.y);
}
check("starter origin varies across seeds", startOrigins.size >= 4);

console.log(failures === 0 ? "\nALL SMOKE CHECKS PASSED" : `\n${failures} SMOKE CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
