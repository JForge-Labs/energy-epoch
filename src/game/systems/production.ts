import type { Building, PlayerState, Well } from "../types";
import {
  FLARE_REP_PER_MCF,
  GAS_SALE_REP_PER_MCF,
  SPILL_CLEANUP_PER_BBL,
  SPILL_REP_PER_BBL,
  TANK_CAP_BBL,
} from "../data/economy";

export interface ProdResult {
  oilProduced: number;
  gasProduced: number;
  gasFlared: number;
  gasSold: number;
  spilled: number;
  spillCleanup: number;
  messages: string[];
}

function tankForWell(well: Well, buildings: Building[]): Building | undefined {
  if (!well.tankId) return undefined;
  return buildings.find((b) => b.id === well.tankId);
}

function hasGasLine(well: Well, buildings: Building[]): boolean {
  return buildings.some(
    (b) =>
      b.kind === "gas_line" &&
      b.online &&
      Math.abs(b.x - well.x) + Math.abs(b.y - well.y) <= 2,
  );
}

/**
 * Advance producing wells by dtDays.
 * Oil → tank (spill if over). Gas → flare or sell.
 */
export function simulateProduction(
  wells: Well[],
  buildings: Building[],
  player: PlayerState,
  gasPrice: number,
  dtDays: number,
): ProdResult {
  const result: ProdResult = {
    oilProduced: 0,
    gasProduced: 0,
    gasFlared: 0,
    gasSold: 0,
    spilled: 0,
    spillCleanup: 0,
    messages: [],
  };

  for (const well of wells) {
    if (well.status !== "producing") continue;

    // Decline toward asymptotic low
    const declineFactor = Math.exp(-well.declinePerDay * dtDays);
    well.oilRate = Math.max(0.5, well.oilRate * declineFactor);
    well.gasRate = Math.max(0, well.gasRate * declineFactor);
    well.ageDays += dtDays;

    if (well.oilRate < 1.2 && well.gasRate < 5) {
      well.status = "shut_in";
      result.messages.push(`Well ${well.id} declined to shut-in.`);
      continue;
    }

    const oil = well.oilRate * dtDays;
    const gas = well.gasRate * dtDays;
    result.oilProduced += oil;
    result.gasProduced += gas;

    const tank = tankForWell(well, buildings);
    if (tank && tank.online) {
      const room = tank.oilCap - tank.oil;
      const into = Math.min(oil, Math.max(0, room));
      tank.oil += into;
      const overflow = oil - into;
      if (overflow > 0.5) {
        result.spilled += overflow;
        const cleanup = overflow * SPILL_CLEANUP_PER_BBL;
        result.spillCleanup += cleanup;
        player.cash -= cleanup;
        player.reputation = Math.max(0, player.reputation - overflow * SPILL_REP_PER_BBL);
        result.messages.push(
          `Spill at tank (${overflow.toFixed(0)} bbl). Cleanup $${cleanup.toFixed(0)}.`,
        );
      }
    }

    if (gas > 0.01) {
      if (hasGasLine(well, buildings)) {
        const revenue = gas * gasPrice;
        player.cash += revenue;
        player.reputation = Math.min(
          100,
          player.reputation + gas * GAS_SALE_REP_PER_MCF,
        );
        result.gasSold += gas;
      } else {
        // Auto flare stack assumed at well
        player.reputation = Math.max(
          0,
          player.reputation - gas * FLARE_REP_PER_MCF,
        );
        result.gasFlared += gas;
      }
    }
  }

  // Ensure tanks keep cap metadata
  for (const b of buildings) {
    if (b.kind === "tank" && b.oilCap <= 0) b.oilCap = TANK_CAP_BBL;
  }

  return result;
}
