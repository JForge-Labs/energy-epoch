import type { Subsurface, Tile, ZoneTier } from "../types";

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

function makeSubsurface(x: number, y: number, cols: number, rows: number, seed: number): Subsurface {
  const n = hash(x, y, seed);
  const n2 = hash(x + 17, y + 91, seed + 3);
  // Soft basins — player cannot see these
  const cx = cols * (0.35 + hash(1, 2, seed) * 0.3);
  const cy = rows * (0.4 + hash(3, 4, seed) * 0.25);
  const dist = Math.hypot(x - cx, y - cy) / Math.hypot(cols, rows);
  const zone = zoneFor(dist + (n - 0.5) * 0.08);
  // Prospect peaks in pockets, not uniform
  const pocket = Math.exp(-dist * dist * 14) * 0.75 + n2 * 0.25;
  const prospect = Math.max(0, Math.min(1, pocket * (0.55 + n * 0.5)));

  return {
    oilIp: 0,
    gasIp: 0,
    declinePerDay: 0.008,
    zone,
    prospect,
  };
}

export function generateWorld(cols: number, rows: number, seed = 7): Tile[][] {
  const tiles: Tile[][] = [];
  for (let y = 0; y < rows; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < cols; x++) {
      const n = hash(x, y, seed + 99);
      const road = y === rows - 1 || (x === cols - 1 && y > rows - 5);
      row.push({
        surface: road ? "road" : n > 0.72 ? "scrub" : "ground",
        subsurface: makeSubsurface(x, y, cols, rows, seed),
        surveyed: false,
        drilled: false,
        wellId: null,
      });
    }
    tiles.push(row);
  }
  return tiles;
}

/** Refinery sits on the SE road corner */
export function refineryAnchor(cols: number, rows: number): { x: number; y: number } {
  return { x: cols - 1, y: rows - 1 };
}
