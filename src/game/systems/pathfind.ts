import type { Tile } from "../types";

/** 4-connected BFS. Buildings block except we allow stepping onto target. */
export function findPath(
  tiles: Tile[][],
  blocked: Set<string>,
  from: { x: number; y: number },
  to: { x: number; y: number },
): { x: number; y: number }[] {
  const rows = tiles.length;
  const cols = tiles[0]?.length ?? 0;
  const key = (x: number, y: number) => `${x},${y}`;
  if (from.x === to.x && from.y === to.y) return [];

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
      if (blocked.has(k) && !isGoal) continue;
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
  path.shift(); // drop current tile
  return path;
}
