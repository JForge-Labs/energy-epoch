import type { MapParams, Subsurface, Tile, ZoneTier } from "../types";
import { isOpen } from "./terrain";
import { DEFAULT_MAP_PARAMS } from "../data/economy";

function hash(x: number, y: number, seed: number): number {
  let n = x * 374761393 + y * 668265263 + seed * 982451653;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function zoneFor(dist: number): ZoneTier {
  if (dist < 0.22) return 0;
  if (dist < 0.38) return 1;
  if (dist < 0.55) return 2;
  return 3;
}

// --- Starter package geometry (a rigid body translated by the seeded origin) --
// The whole logistics package (pad, rig, battery, truck, apron, near-starter oil
// field) hangs off the pad ORIGIN `O` at fixed offsets; deriving O from the seed
// varies the start position per map. Footprint extent relative to O (pad
// clearSite at -2 .. field clearSite at +18/+11):
const PKG_MAX_DX = 18;
const PKG_MAX_DY = 11;
const BATT_DX = 5;
const BATT_DY = 5; // pad → battery
const FIELD_DX = 15;
const FIELD_DY = 8; // pad → starter field (== battery + (10,3))

const clampi = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Smooth blob field: max falloff over a set of gaussian centers. */
function blobField(
  x: number,
  y: number,
  centers: { cx: number; cy: number; w: number }[],
): number {
  let best = 0;
  for (const c of centers) {
    const dx = x - c.cx;
    const dy = y - c.cy;
    best = Math.max(best, Math.exp(-(dx * dx + dy * dy) / (c.w * c.w)));
  }
  return best;
}

/** Obstacle blob centers — the SINGLE SOURCE OF TRUTH shared by assignTerrain and
 *  the starter-anchor scorer, so terrain and avoidance never drift. Pure in
 *  (cols,rows,params). */
function obstacleModel(cols: number, rows: number, params: MapParams) {
  const s = Math.sqrt((cols * rows) / (40 * 24));
  const rk = s * Math.max(0.4, Math.min(2, params.rock));
  const wt = s * Math.max(0.4, Math.min(2, params.water));
  return {
    rock: [
      { cx: cols * 0.7, cy: rows * 0.22, w: 3.4 * rk },
      { cx: cols * 0.8, cy: rows * 0.32, w: 2.8 * rk },
      { cx: cols * 0.3, cy: rows * 0.85, w: 3.0 * rk },
      { cx: cols * 0.62, cy: rows * 0.55, w: 2.4 * rk },
    ],
    water: [
      { cx: cols * 0.55, cy: rows * 0.8, w: 3.2 * wt },
      { cx: cols * 0.85, cy: rows * 0.68, w: 2.6 * wt },
      { cx: cols * 0.2, cy: rows * 0.28, w: 2.4 * wt },
    ],
    creekX: cols * 0.44,
    creekHalf: cols * 0.14,
  };
}
type ObstacleModel = ReturnType<typeof obstacleModel>;

/** How obstacle-prone a single tile is (pure). Mirrors assignTerrain thresholds. */
function tileObstacle(x: number, y: number, m: ObstacleModel): number {
  let s = blobField(x, y, m.rock) + blobField(x, y, m.water);
  const cdx = Math.abs(x - m.creekX);
  if (cdx < m.creekHalf) s += (1 - cdx / m.creekHalf) * 0.6; // creek-band penalty
  return s;
}

/** Sum obstacle exposure over the package's key tiles + corridor midpoints. */
function footprintScore(
  ox: number,
  oy: number,
  m: ObstacleModel,
  ref: { x: number; y: number },
): number {
  const pts = [
    [ox, oy], // pad
    [ox + BATT_DX, oy + BATT_DY], // battery
    [ox + FIELD_DX, oy + FIELD_DY], // starter field
    [(ox + BATT_DX + ox + FIELD_DX) >> 1, (oy + BATT_DY + oy + FIELD_DY) >> 1], // batt→field mid
    [(ox + BATT_DX + ref.x) >> 1, (oy + BATT_DY + ref.y) >> 1], // batt→ref mid
  ];
  let s = 0;
  for (const [x, y] of pts) s += tileObstacle(x, y, m);
  return s;
}

/**
 * Deterministic per-seed pad origin. Pure in (cols,rows,seed,params): hashes the
 * seed into the in-bounds band, then searches a fixed spiral of nearby origins and
 * keeps the one whose footprint overlaps obstacles least. clearSite/carveCorridor
 * still GUARANTEE validity — this only makes the cleared pocket usually land on
 * already-open land instead of dead-center in a lake.
 */
export function starterOrigin(
  cols: number,
  rows: number,
  seed: number,
  params: MapParams = DEFAULT_MAP_PARAMS,
): { x: number; y: number } {
  const minX = 2;
  const maxX = cols - 1 - PKG_MAX_DX; // cols-19
  const minY = 2;
  const maxY = rows - 1 - PKG_MAX_DY; // rows-12
  // Two decorrelated hash lanes → a base candidate inside the band.
  const bx = minX + Math.floor(hash(1013, 9176, seed) * (maxX - minX + 1));
  const by = minY + Math.floor(hash(7411, 3121, seed) * (maxY - minY + 1));

  const m = obstacleModel(cols, rows, params);
  const ref = refineryAnchor(cols, rows);

  let best = { x: clampi(bx, minX, maxX), y: clampi(by, minY, maxY) };
  let bestScore = footprintScore(best.x, best.y, m, ref);
  const R = 4; // Chebyshev spiral, fixed order → deterministic tie-break (earliest wins)
  for (let r = 1; r <= R; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = clampi(bx + dx, minX, maxX);
        const y = clampi(by + dy, minY, maxY);
        const sc = footprintScore(x, y, m, ref);
        if (sc < bestScore) {
          bestScore = sc;
          best = { x, y };
        }
      }
  return best;
}

export function starterBatteryFrom(o: { x: number; y: number }): { x: number; y: number } {
  return { x: o.x + BATT_DX, y: o.y + BATT_DY };
}
export function starterFieldFrom(o: { x: number; y: number }): { x: number; y: number } {
  return { x: o.x + FIELD_DX, y: o.y + FIELD_DY };
}

/**
 * A handful of distinct oil DISTRICTS — 4 separated fields, each a tight
 * cluster of two overlapping pockets so a 3×3 survey reads as a field with a
 * rich core and leaner edges. district[0] is pinned to the (seed-varying)
 * starter field so the guaranteed zone-0 patch always has rich oil under it.
 */
function prospectField(
  x: number,
  y: number,
  cols: number,
  rows: number,
  seed: number,
  oil: number,
  field: { x: number; y: number },
): number {
  const s = Math.sqrt((cols * rows) / (40 * 24)) * Math.max(0.7, Math.min(1.5, oil));
  const districts: { ax?: number; ay?: number; cx?: number; cy?: number }[] = [
    { ax: field.x, ay: field.y }, // pinned to the starter field (zone 0)
    { cx: 0.7, cy: 0.24 }, //  NE
    { cx: 0.24, cy: 0.82 }, // SW
    { cx: 0.86, cy: 0.84 }, // SE far — richer late-game field
  ];
  let best = 0;
  for (let d = 0; d < districts.length; d++) {
    const dd = districts[d];
    // Per-district jitter so no two maps place a field identically. district[0]
    // gets ZERO jitter so its rich core stays centered on the guaranteed patch.
    const jx = d === 0 ? 0 : (hash(d + 11, seed, seed) - 0.5) * 3.0;
    const jy = d === 0 ? 0 : (hash(d + 29, seed, seed) - 0.5) * 3.0;
    const bx = (dd.ax ?? dd.cx! * cols) + jx;
    const by = (dd.ay ?? dd.cy! * rows) + jy;
    // Two overlapping pockets give each field an organic, non-circular shape.
    const cores = [
      { cx: bx, cy: by, w: 3.8 * s },
      { cx: bx + 2.6 * s, cy: by + 1.8 * s, w: 3.0 * s },
    ];
    for (const p of cores) {
      const dx = x - p.cx;
      const dy = y - p.cy;
      best = Math.max(best, Math.exp(-(dx * dx + dy * dy) / (p.w * p.w)));
    }
  }
  const noise = hash(x, y, seed) * 0.2;
  const raw = best * 0.92 + noise * 0.12;
  if (raw < 0.28) return raw * 0.5;
  if (raw > 0.55) return Math.min(1, 0.55 + (raw - 0.55) * 1.4);
  return raw;
}

function makeSubsurface(
  x: number,
  y: number,
  cols: number,
  rows: number,
  seed: number,
  oil: number,
  field: { x: number; y: number },
): Subsurface {
  const n = hash(x, y, seed);
  const n2 = hash(x + 17, y + 91, seed + 3);
  const cx = cols * 0.45;
  const cy = rows * 0.5;
  const dist = Math.hypot(x - cx, y - cy) / Math.hypot(cols, rows);
  const zone = zoneFor(dist + (n - 0.5) * 0.06);
  const prospect = Math.max(0, Math.min(1, prospectField(x, y, cols, rows, seed, oil, field)));
  const special = zone >= 2 && n2 > 0.55;

  return {
    oilIp: 0,
    gasIp: 0,
    declinePerDay: 0.008,
    zone,
    prospect,
    special,
  };
}

/** Assign obstacle terrain (rock ridges, lakes, a winding creek). `rockMul`/
 *  `waterMul` widen or shrink the blobs so presets range from open prairie to
 *  water-choked bayou or rocky badlands. Uses the shared obstacleModel so the
 *  starter-anchor scorer sees the same centers. */
function assignTerrain(
  tiles: Tile[][],
  cols: number,
  rows: number,
  seed: number,
  rockMul: number,
  waterMul: number,
) {
  const m = obstacleModel(cols, rows, { rock: rockMul, water: waterMul, oil: 1 });

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const t = tiles[y][x];
      const jitter = (hash(x, y, seed + 41) - 0.5) * 0.18;
      const rockF = blobField(x, y, m.rock) + jitter;
      const waterF = blobField(x, y, m.water) + jitter;
      if (rockF > 0.62) t.terrain = "rock";
      else if (waterF > 0.6) t.terrain = "water";
    }
  }

  // A creek meanders top→bottom, cutting through whatever it crosses.
  const baseX = cols * 0.44;
  for (let y = 0; y < rows; y++) {
    const wander =
      Math.sin(y * 0.55 + seed) * (cols * 0.12) + (hash(y, 7, seed + 5) - 0.5) * 2.2;
    const cx = Math.round(baseX + wander);
    for (let dx = 0; dx <= 1; dx++) {
      const x = cx + dx;
      if (x < 0 || x >= cols) continue;
      // Slight breaks so the creek reads natural, not a solid wall.
      if (hash(x, y, seed + 13) > 0.14) tiles[y][x].terrain = "creek";
    }
  }
}

/** Carve a 1-tile buildable + rig-passable corridor. Converts ANY non-open
 *  terrain (water/rock AND creek) to ground, so a route is always crossable
 *  regardless of where the seeded anchor lands (creek is not blocksBuild but a
 *  rig can't cross an unbridged creek — hence !isOpen, not blocksBuild). */
function carveCorridor(
  tiles: Tile[][],
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  let cx = from.x;
  let cy = from.y;
  let guard = 0;
  while ((cx !== to.x || cy !== to.y) && guard++ < 500) {
    const rx = to.x - cx;
    const ry = to.y - cy;
    if ((Math.abs(rx) >= Math.abs(ry) && rx !== 0) || ry === 0) cx += Math.sign(rx);
    else cy += Math.sign(ry);
    const t = tiles[cy]?.[cx];
    if (t && !isOpen(t.terrain)) t.terrain = "ground";
  }
}

/** Force a small clear pad of open ground around a site. */
function clearSite(tiles: Tile[][], cx: number, cy: number, r: number) {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      const t = tiles[y]?.[x];
      if (t) t.terrain = "ground";
    }
  }
}

export function generateWorld(
  cols: number,
  rows: number,
  seed = 7,
  params: MapParams = DEFAULT_MAP_PARAMS,
): Tile[][] {
  // Derive the (seed-varying) starter package origin FIRST so the prospect hump
  // can be pinned to the moved field.
  const pad = starterOrigin(cols, rows, seed, params);
  const batt = starterBatteryFrom(pad);
  const field = starterFieldFrom(pad);
  const ref = refineryAnchor(cols, rows);

  const tiles: Tile[][] = [];
  for (let y = 0; y < rows; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < cols; x++) {
      const n = hash(x, y, seed + 99);
      row.push({
        surface: n > 0.72 ? "scrub" : "ground",
        terrain: n > 0.72 ? "scrub" : "ground",
        subsurface: makeSubsurface(x, y, cols, rows, seed, params.oil, field),
        surveyed: false,
        drilled: false,
        wellId: null,
        isPad: false,
        hasRoad: false,
      });
    }
    tiles.push(row);
  }

  assignTerrain(tiles, cols, rows, seed, params.rock, params.water);

  // Keep the financed sites on clear ground and guarantee a buildable route.
  clearSite(tiles, pad.x, pad.y, 2);
  clearSite(tiles, batt.x, batt.y, 2);
  clearSite(tiles, ref.x, ref.y, 2);
  carveCorridor(tiles, pad, batt);
  carveCorridor(tiles, batt, ref);

  // Guarantee the tutorial can succeed on EVERY map: the near-starter oil field
  // sits a short haul from the battery, on cleared land, and is FORCED to zone 0
  // so the T0 starter rig can always drill it (distance-based zones would
  // otherwise push it to zone 1+ on big maps).
  clearSite(tiles, field.x, field.y, 3);
  carveCorridor(tiles, batt, field);
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const t = tiles[field.y + dy]?.[field.x + dx];
      if (t) t.subsurface.zone = 0;
    }
  }

  // No drillable oil grade on undrillable terrain (water/rock/creek — only open
  // ground and scrub can be spudded, per canDrill). A Sweet tile you can't reach
  // is a trap, so surveys there now read barren.
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!isOpen(tiles[y][x].terrain)) tiles[y][x].subsurface.prospect = 0;
    }
  }

  return tiles;
}

export function refineryAnchor(cols: number, rows: number): { x: number; y: number } {
  // ~70% out (not the far corner) so the starter trunk isn't punishing.
  return {
    x: Math.min(cols - 3, Math.round(cols * 0.7)),
    y: Math.min(rows - 3, Math.round(rows * 0.7)),
  };
}
