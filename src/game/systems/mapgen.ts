import type { Subsurface, Tile, ZoneTier } from "../types";
import { blocksBuild } from "./terrain";

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

/** Several small oil pockets so a 3×3 survey can show clear hits vs misses */
function prospectField(
  x: number,
  y: number,
  cols: number,
  rows: number,
  seed: number,
): number {
  // Scale pocket sizes with the map so bigger leases aren't mostly barren.
  const s = Math.sqrt((cols * rows) / (40 * 24));
  const pockets = [
    { cx: cols * 0.22, cy: rows * 0.45, w: 3.2 * s },
    { cx: cols * 0.48, cy: rows * 0.38, w: 2.6 * s },
    { cx: cols * 0.62, cy: rows * 0.62, w: 3.0 * s },
    { cx: cols * 0.35, cy: rows * 0.72, w: 2.4 * s },
    { cx: cols * 0.78, cy: rows * 0.3, w: 2.8 * s },
    { cx: cols * 0.55, cy: rows * 0.85, w: 2.6 * s },
  ];
  let best = 0;
  for (let i = 0; i < pockets.length; i++) {
    const p = pockets[i];
    const jitter = (hash(i + 3, seed, seed) - 0.5) * 2.5;
    const dx = x - (p.cx + jitter);
    const dy = y - (p.cy + jitter * 0.6);
    const fall = Math.exp(-(dx * dx + dy * dy) / (p.w * p.w));
    best = Math.max(best, fall);
  }
  const noise = hash(x, y, seed) * 0.2;
  const raw = best * 0.9 + noise * 0.15;
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
): Subsurface {
  const n = hash(x, y, seed);
  const n2 = hash(x + 17, y + 91, seed + 3);
  const cx = cols * 0.45;
  const cy = rows * 0.5;
  const dist = Math.hypot(x - cx, y - cy) / Math.hypot(cols, rows);
  const zone = zoneFor(dist + (n - 0.5) * 0.06);
  const prospect = Math.max(0, Math.min(1, prospectField(x, y, cols, rows, seed)));
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

/** Assign obstacle terrain (rock ridges, lakes, a winding creek). */
function assignTerrain(tiles: Tile[][], cols: number, rows: number, seed: number) {
  // Scale obstacle blobs with the map so they stay proportionate.
  const s = Math.sqrt((cols * rows) / (40 * 24));
  const rock = [
    { cx: cols * 0.7, cy: rows * 0.22, w: 3.4 * s },
    { cx: cols * 0.8, cy: rows * 0.32, w: 2.8 * s },
    { cx: cols * 0.3, cy: rows * 0.85, w: 3.0 * s },
    { cx: cols * 0.62, cy: rows * 0.55, w: 2.4 * s },
  ];
  const water = [
    { cx: cols * 0.55, cy: rows * 0.8, w: 3.2 * s },
    { cx: cols * 0.85, cy: rows * 0.68, w: 2.6 * s },
    { cx: cols * 0.2, cy: rows * 0.28, w: 2.4 * s },
  ];

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const t = tiles[y][x];
      const jitter = (hash(x, y, seed + 41) - 0.5) * 0.18;
      const rockF = blobField(x, y, rock) + jitter;
      const waterF = blobField(x, y, water) + jitter;
      if (rockF > 0.62) t.terrain = "rock";
      else if (waterF > 0.6) t.terrain = "water";
    }
  }

  // A creek meanders top→bottom, cutting through whatever it crosses.
  const baseX = cols * 0.44;
  for (let y = 0; y < rows; y++) {
    const wander =
      Math.sin(y * 0.55 + seed) * (cols * 0.12) +
      (hash(y, 7, seed + 5) - 0.5) * 2.2;
    const cx = Math.round(baseX + wander);
    for (let dx = 0; dx <= 1; dx++) {
      const x = cx + dx;
      if (x < 0 || x >= cols) continue;
      // Slight breaks so the creek reads natural, not a solid wall.
      if (hash(x, y, seed + 13) > 0.14) tiles[y][x].terrain = "creek";
    }
  }
}

/** Carve a 1-tile buildable corridor, converting hard obstacles to ground. */
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
    if (t && blocksBuild(t.terrain)) t.terrain = "ground";
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

export function generateWorld(cols: number, rows: number, seed = 7): Tile[][] {
  const tiles: Tile[][] = [];
  for (let y = 0; y < rows; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < cols; x++) {
      const n = hash(x, y, seed + 99);
      row.push({
        surface: n > 0.72 ? "scrub" : "ground",
        terrain: n > 0.72 ? "scrub" : "ground",
        subsurface: makeSubsurface(x, y, cols, rows, seed),
        surveyed: false,
        drilled: false,
        wellId: null,
        isPad: false,
        hasRoad: false,
      });
    }
    tiles.push(row);
  }

  assignTerrain(tiles, cols, rows, seed);

  // Keep the financed sites on clear ground and guarantee a buildable route.
  const pad = starterPadAnchor();
  const batt = starterBatteryAnchor();
  const ref = refineryAnchor(cols, rows);
  clearSite(tiles, pad.x, pad.y, 2);
  clearSite(tiles, batt.x, batt.y, 2);
  clearSite(tiles, ref.x, ref.y, 2);
  carveCorridor(tiles, pad, batt);
  carveCorridor(tiles, batt, ref);

  return tiles;
}

export function refineryAnchor(cols: number, rows: number): { x: number; y: number } {
  // ~70% out (not the far corner) so the starter trunk isn't punishing.
  return {
    x: Math.min(cols - 3, Math.round(cols * 0.7)),
    y: Math.min(rows - 3, Math.round(rows * 0.7)),
  };
}

export function starterPadAnchor(): { x: number; y: number } {
  return { x: 4, y: 8 };
}

export function starterBatteryAnchor(): { x: number; y: number } {
  return { x: 9, y: 13 };
}
