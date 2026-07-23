import type { Building, Tile } from "../types";
import {
  PIPELINE_TRANSFER_BBL_PER_HOUR,
  PUMPJACK_RATE_BBL_PER_HOUR,
} from "../data/economy";

function neighbors(b: Building, all: Building[]): Building[] {
  return all.filter(
    (o) =>
      o.id !== b.id &&
      Math.abs(o.x - b.x) + Math.abs(o.y - b.y) === 1,
  );
}

function isConnectedToKind(
  start: Building,
  kind: Building["kind"],
  all: Building[],
): boolean {
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur.id)) continue;
    seen.add(cur.id);
    if (cur.kind === kind) return true;
    for (const n of neighbors(cur, all)) {
      if (
        n.kind === "pipeline" ||
        n.kind === kind ||
        n.kind === "tank" ||
        n.kind === "pumpjack" ||
        n.kind === "truck_rack"
      ) {
        stack.push(n);
      }
    }
  }
  return false;
}

/**
 * One simulation step. `dtHours` is simulated hours advanced this tick.
 * Returns barrels produced and sold this step.
 */
export function simulateStep(
  tiles: Tile[][],
  buildings: Building[],
  dtHours: number,
): { produced: number; transferred: number } {
  let produced = 0;
  let transferred = 0;

  // Pumpjacks produce into themselves as a small buffer, then push via pipe
  for (const jack of buildings) {
    if (jack.kind !== "pumpjack" || !jack.online) continue;
    const tile = tiles[jack.y]?.[jack.x];
    if (!tile || tile.kind !== "oil_pad" || tile.oilReserve <= 0) {
      jack.online = tile?.oilReserve === 0 ? false : jack.online;
      continue;
    }

    const connected = isConnectedToKind(jack, "tank", buildings);
    if (!connected) continue;

    const want = PUMPJACK_RATE_BBL_PER_HOUR * dtHours;
    const got = Math.min(want, tile.oilReserve, jack.storageCap - jack.storage);
    tile.oilReserve -= got;
    jack.storage += got;
    jack.runtimeHours += dtHours;
    produced += got;
  }

  // Pipelines / adjacency move oil toward tanks
  for (const jack of buildings) {
    if (jack.kind !== "pumpjack" || jack.storage <= 0) continue;
    const tanks = buildings.filter(
      (b) =>
        b.kind === "tank" &&
        b.storage < b.storageCap &&
        isConnectedToKind(jack, "tank", buildings),
    );
    if (!tanks.length) continue;

    const tank = tanks.sort((a, b) => a.storage - b.storage)[0];
    const move = Math.min(
      jack.storage,
      tank.storageCap - tank.storage,
      PIPELINE_TRANSFER_BBL_PER_HOUR * dtHours,
    );
    jack.storage -= move;
    tank.storage += move;
    transferred += move;
  }

  return { produced, transferred };
}

export function findTruckRackSalesPath(
  buildings: Building[],
): { rack: Building; tank: Building } | null {
  for (const rack of buildings) {
    if (rack.kind !== "truck_rack") continue;
    const tank = buildings.find(
      (b) =>
        b.kind === "tank" &&
        b.storage > 0 &&
        (Math.abs(b.x - rack.x) + Math.abs(b.y - rack.y) === 1 ||
          isConnectedToKind(rack, "tank", buildings)),
    );
    if (tank) return { rack, tank };
  }
  return null;
}
