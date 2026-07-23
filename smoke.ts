/* Headless smoke test — bundled with esbuild, run in Node. Not shipped. */
import { Game } from "./src/game/Game";
import { blocksBuild } from "./src/game/systems/terrain";
import type { Well } from "./src/game/types";

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
check("map is 40x24", g.tiles.length === rows && g.tiles[0].length === cols && cols === 40 && rows === 24);

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
