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

/** Several small oil pockets so a 3×3 survey can show clear hits vs misses */
function prospectField(
  x: number,
  y: number,
  cols: number,
  rows: number,
  seed: number,
): number {
  const pockets = [
    { cx: cols * 0.22, cy: rows * 0.45, w: 3.2 },
    { cx: cols * 0.48, cy: rows * 0.38, w: 2.6 },
    { cx: cols * 0.62, cy: rows * 0.62, w: 3.0 },
    { cx: cols * 0.35, cy: rows * 0.72, w: 2.4 },
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

export function generateWorld(cols: number, rows: number, seed = 7): Tile[][] {
  const tiles: Tile[][] = [];
  for (let y = 0; y < rows; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < cols; x++) {
      const n = hash(x, y, seed + 99);
      row.push({
        surface: n > 0.72 ? "scrub" : "ground",
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
  return tiles;
}

export function refineryAnchor(cols: number, rows: number): { x: number; y: number } {
  return { x: cols - 2, y: rows - 2 };
}

export function starterPadAnchor(): { x: number; y: number } {
  return { x: 4, y: 8 };
}

export function starterBatteryAnchor(): { x: number; y: number } {
  return { x: 8, y: 12 };
}
