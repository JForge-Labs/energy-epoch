import type { Building, PlayerState, Well } from "../types";
import {
  FLARE_GRACE_WELLS,
  FLARE_MIN_SCALE,
  FLARE_REP_PER_MCF,
  GAS_SALE_REP_PER_MCF,
  SPILL_CLEANUP_PER_BBL,
  SPILL_REP_PER_BBL,
  WELLHEAD_CAP_BBL,
} from "../data/economy";

export interface ProdResult {
  oilProduced: number;
  gasProduced: number;
  gasFlared: number;
  gasSold: number;
  spilled: number;
  spillCleanup: number;
  messages: string[];
  cleanups: { label: string; amount: number }[];
}

function hasGasLine(well: Well, buildings: Building[]): boolean {
  return buildings.some(
    (b) =>
      b.kind === "gas_line" &&
      b.online &&
      Math.abs(b.x - well.x) + Math.abs(b.y - well.y) <= 2,
  );
}

export function simulateProduction(
  wells: Well[],
  buildings: Building[],
  player: PlayerState,
  gasPrice: number,
  dtDays: number,
  gasPlantConnected: (well: Well) => boolean = () => false,
  gasPlantPremium = 1,
  gasPlantCapMcfd = 0,
): ProdResult {
  const result: ProdResult = {
    oilProduced: 0,
    gasProduced: 0,
    gasFlared: 0,
    gasSold: 0,
    spilled: 0,
    spillCleanup: 0,
    messages: [],
    cleanups: [],
  };

  // Flaring is expected while you're small — you can't justify gas takeaway on
  // one or two wells. Discount the rep hit heavily for a low well count and
  // ramp it to full once the operation is big enough to be held to standard.
  const producingWells = wells.filter(
    (w) => w.status === "producing" && !w.choked,
  ).length;
  const flareRepScale = Math.min(
    1,
    Math.max(FLARE_MIN_SCALE, producingWells / FLARE_GRACE_WELLS),
  );

  // Shared gas-plant capacity for this tick (total mcf/day × dt). Consumed as
  // wells sell into it; when it runs out, further gas overflows to gas line/flare.
  let gasPlantBudget = gasPlantCapMcfd * dtDays;

  for (const well of wells) {
    if (well.status !== "producing") continue;
    // Choked wells are shut in by the player: no flow, no decline, no flare.
    if (well.choked) continue;

    const declineFactor = Math.exp(-well.declinePerDay * dtDays);
    well.oilRate = Math.max(0.4, well.oilRate * declineFactor);
    well.gasRate = Math.max(0, well.gasRate * declineFactor);
    well.ageDays += dtDays;

    if (well.oilRate < 1 && well.gasRate < 4) {
      well.status = "shut_in";
      result.messages.push(`Well ${well.id} declined to shut-in.`);
      continue;
    }

    const oil = well.oilRate * dtDays;
    const gas = well.gasRate * dtDays;
    result.oilProduced += oil;
    result.gasProduced += gas;

    const tank = well.wellheadTankId
      ? buildings.find((b) => b.id === well.wellheadTankId)
      : undefined;

    if (tank && tank.online) {
      if (tank.oilCap <= 0) tank.oilCap = WELLHEAD_CAP_BBL;
      const room = tank.oilCap - tank.oil;
      const into = Math.min(oil, Math.max(0, room));
      tank.oil += into;
      const overflow = oil - into;
      if (overflow > 0.5) {
        result.spilled += overflow;
        const cleanup = overflow * SPILL_CLEANUP_PER_BBL;
        result.spillCleanup += cleanup;
        player.cash -= cleanup;
        player.opexToday += cleanup;
        player.reputation = Math.max(
          0,
          player.reputation - overflow * SPILL_REP_PER_BBL,
        );
        result.cleanups.push({
          label: `Wellhead spill cleanup (${well.x},${well.y})`,
          amount: cleanup,
        });
        result.messages.push(
          `TANK FULL @ (${tank.x},${tank.y}) — crude spilled ${overflow.toFixed(0)} bbl. Get a truck on a CARDINAL road to this tank.`,
        );
      }
    }

    // Associated gas: plant (premium, CAPACITY-CAPPED) > gas line (base) > flare.
    // The plant budget is shared across wells this tick (numPlants × capacity),
    // so a second plant genuinely doubles what sells at the premium.
    if (gas > 0.01) {
      let remaining = gas;
      if (remaining > 0.01 && gasPlantBudget > 0.01 && gasPlantConnected(well)) {
        const toPlant = Math.min(remaining, gasPlantBudget);
        const revenue = toPlant * gasPrice * gasPlantPremium;
        player.cash += revenue;
        player.revenueToday += revenue;
        player.reputation = Math.min(
          100,
          player.reputation + toPlant * GAS_SALE_REP_PER_MCF,
        );
        result.gasSold += toPlant;
        gasPlantBudget -= toPlant;
        remaining -= toPlant;
      }
      // Gas line — cheap flare-stopper at base price; takes the overflow.
      if (remaining > 0.01 && hasGasLine(well, buildings)) {
        const revenue = remaining * gasPrice;
        player.cash += revenue;
        player.revenueToday += revenue;
        player.reputation = Math.min(
          100,
          player.reputation + remaining * GAS_SALE_REP_PER_MCF,
        );
        result.gasSold += remaining;
        remaining = 0;
      }
      if (remaining > 0.01) {
        const tankFull = tank && tank.oil >= tank.oilCap - 0.01;
        const flareMul = tankFull ? 2.2 : 1;
        const repHit = remaining * FLARE_REP_PER_MCF * flareMul * flareRepScale;
        player.reputation = Math.max(0, player.reputation - repHit);
        result.gasFlared += remaining;
        if (tankFull && Math.random() < 0.08) {
          result.messages.push(
            `FLARING @ well (${well.x},${well.y}) — tank full, no takeaway. Rep −${repHit.toFixed(2)}. Build gas line or haul crude.`,
          );
        } else if (!tankFull && Math.random() < 0.03) {
          result.messages.push(
            `Flaring gas @ (${well.x},${well.y}) — over gas-plant capacity or no takeaway. Add a plant/line.`,
          );
        }
      }
    }
  }

  for (const b of buildings) {
    if (b.kind !== "battery" || !b.online) continue;
    if (b.crude > b.crudeCap) {
      const overflow = b.crude - b.crudeCap;
      b.crude = b.crudeCap;
      result.spilled += overflow;
      const cleanup = overflow * SPILL_CLEANUP_PER_BBL;
      player.cash -= cleanup;
      player.opexToday += cleanup;
      player.reputation = Math.max(
        0,
        player.reputation - overflow * SPILL_REP_PER_BBL,
      );
      result.cleanups.push({ label: "Battery crude spill cleanup", amount: cleanup });
      result.messages.push(
        `Battery crude spill ${overflow.toFixed(0)} bbl — haul clean to refinery.`,
      );
    }
  }

  return result;
}
