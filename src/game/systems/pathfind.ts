import type { Tile } from "../types";

export type PathMode = "any" | "road";

/**
 * 4-connected BFS.
 * road mode: roadPassable tiles, goal always allowed.
 */
export function findPath(
  tiles: Tile[][],
  blocked: Set<string>,
  from: { x: number; y: number },
  to: { x: number; y: number },
  mode: PathMode = "any",
  roadPassable?: (x: number, y: number) => boolean,
): { x: number; y: number }[] {
  const rows = tiles.length;
  const cols = tiles[0]?.length ?? 0;
  const key = (x: number, y: number) => `${x},${y}`;
  if (from.x === to.x && from.y === to.y) return [];

  const canStep = (x: number, y: number, isGoal: boolean): boolean => {
    if (blocked.has(key(x, y)) && !isGoal) return false;
    if (mode === "any") return true;
    if (isGoal) return true;
    if (roadPassable) return roadPassable(x, y);
    const t = tiles[y][x];
    return t.hasRoad || t.isPad;
  };

  // If start tile isn't passable in road mode, still allow leaving it
  const q: { x: number; y: number }[] = [{ ...from }];
  const came = new Map<string, string | null>();
  came.set(key(from.x, from.y), null);

  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  while (q.length) {
    const cur = q.shift()!;
    if (cur.x === to.x && cur.y === to.y) break;
    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const k = key(nx, ny);
      if (came.has(k)) continue;
      const isGoal = nx === to.x && ny === to.y;
      if (!canStep(nx, ny, isGoal)) continue;
      came.set(k, key(cur.x, cur.y));
      q.push({ x: nx, y: ny });
    }
  }

  const goalK = key(to.x, to.y);
  if (!came.has(goalK)) return [];

  const path: { x: number; y: number }[] = [];
  let walk: string | null = goalK;
  while (walk) {
    const [xs, ys] = walk.split(",");
    path.push({ x: Number(xs), y: Number(ys) });
    walk = came.get(walk) ?? null;
  }
  path.reverse();
  path.shift();
  return path;
}

/** Cardinal (4-way) road neighbors — diagonals do NOT count for trucks */
export function cardinalRoadNeighbors(
  tiles: Tile[][],
  x: number,
  y: number,
  passable: (x: number, y: number) => boolean,
): { x: number; y: number }[] {
  const rows = tiles.length;
  const cols = tiles[0]?.length ?? 0;
  const out: { x: number; y: number }[] = [];
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
    if (passable(nx, ny)) out.push({ x: nx, y: ny });
  }
  return out;
}

export function hasDiagonalRoadOnly(
  tiles: Tile[][],
  x: number,
  y: number,
): boolean {
  const rows = tiles.length;
  const cols = tiles[0]?.length ?? 0;
  let diag = false;
  let card = false;
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
    if (tiles[ny][nx].hasRoad) card = true;
  }
  for (const [dx, dy] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
    if (tiles[ny][nx].hasRoad) diag = true;
  }
  return diag && !card;
}
