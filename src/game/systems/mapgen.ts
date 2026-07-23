import type { Tile } from "../types";

function hash(x: number, y: number, seed: number): number {
  let n = x * 374761393 + y * 668265263 + seed * 982451653;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** Generate a lease map with a few oil pads clustered mid-field */
export function generateLease(cols: number, rows: number, seed = 42): Tile[][] {
  const tiles: Tile[][] = [];

  for (let y = 0; y < rows; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < cols; x++) {
      const n = hash(x, y, seed);
      const dist =
        Math.hypot(x - cols * 0.42, y - rows * 0.55) /
        Math.hypot(cols, rows);
      const isPad = dist < 0.18 && n > 0.35;
      const isRoad = y === rows - 2 || (x === 2 && y > rows - 6);

      row.push({
        kind: isPad ? "oil_pad" : isRoad ? "access_road" : "empty",
        oilReserve: isPad ? 8_000 + Math.floor(n * 22_000) : 0,
        quality: isPad ? 0.55 + n * 0.35 : 0,
      });
    }
    tiles.push(row);
  }

  return tiles;
}
