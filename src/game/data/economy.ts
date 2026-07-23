import type { ZoneTier } from "../types";

export const WELLHEAD_CAP_BBL = 100;
export const BATTERY_CRUDE_CAP_BBL = 1_500;
export const BATTERY_CLEAN_CAP_BBL = 1_500;
export const TRUCK_CAP_BBL = 180;
/** Battery treats crude → clean (bbl / sim-day) */
export const BATTERY_TREAT_BBL_PER_DAY = 1_000;

export const FLARE_REP_PER_MCF = 0.002;
export const GAS_SALE_REP_PER_MCF = 0.0015;
export const SPILL_REP_PER_BBL = 0.05;
export const SPILL_CLEANUP_PER_BBL = 25;

/** Starting credit facility */
export const FACILITY_LIMIT = 5_000_000;
export const FACILITY_APR = 0.11;
/** Package embedded in the draw: pad + battery + truck + refinery slot + rig */
export const FACILITY_PACKAGE_COST = 4_200_000;
export const STARTING_WORKING_CASH = FACILITY_LIMIT - FACILITY_PACKAGE_COST;

/** Refinery slot included in facility (bbl/day intake) */
export const STARTER_REFINERY_SLOT_BPD = 1_200;

export const ROAD_COST = 1_200;
/** Bridging a creek with road/pipe costs a premium over open ground. */
export const BRIDGE_COST = 7_500;
/** Salvage fraction recovered when selling/scrapping a placed asset */
export const SELL_REFUND_RATE = 0.75;

/** Pipelines — capex per tile; auto-flow, no ongoing haul labor. */
export const OIL_PIPE_COST = 6_000;
export const GAS_PIPE_COST = 5_000;
/** Oil pipe intake (bbl/day) — high; refinery slot still caps actual sales. */
export const OIL_PIPE_FLOW_BPD = 4_000;

/** Gas plant — premium piped-gas buyer (vs the cheap flare-stopping gas line). */
export const GAS_PLANT_COST = 300_000;
export const GAS_PLANT_PREMIUM = 1.6;

export const EXPLORE_COST = 40_000;
export const GAS_LINE_COST = 55_000;
export const EXTRA_TRUCK_COST = 85_000;
export const UPGRADE_RIG_COST = 180_000;
export const PERMIT_COST = 125_000;
export const MIN_REP_FOR_SPECIAL_PERMIT = 55;
export const FINE_REP_THRESHOLD = 45;
export const FINE_BASE = 8_000;

export const DRILL_COST: Record<ZoneTier, number> = {
  0: 85_000,
  1: 160_000,
  2: 320_000,
  3: 650_000,
};

export const DRILL_DAYS: Record<ZoneTier, number> = {
  0: 2.2,
  1: 3.5,
  2: 6,
  3: 10,
};

export const DEFAULT_CONFIG = {
  cols: 40,
  rows: 24,
  tileSize: 36,
  startingCash: STARTING_WORKING_CASH,
  tickSeconds: 0.2,
} as const;

/** Simple wildcat vs surveyed outcomes */

export type ProspectGrade = "barren" | "lean" | "fair" | "good" | "sweet";

export function prospectGrade(prospect: number): ProspectGrade {
  if (prospect < 0.22) return "barren";
  if (prospect < 0.4) return "lean";
  if (prospect < 0.55) return "fair";
  if (prospect < 0.72) return "good";
  return "sweet";
}

export function prospectLabel(grade: ProspectGrade): string {
  switch (grade) {
    case "barren":
      return "Barren";
    case "lean":
      return "Lean";
    case "fair":
      return "Fair";
    case "good":
      return "Good";
    case "sweet":
      return "Sweet";
  }
}

/**
 * Survey pays for derisking: explored tiles have honest, tight hit odds.
 * Wildcats stay risky even on good rock.
 */
export function hitChance(prospect: number, surveyed: boolean): number {
  if (!surveyed) {
    return 0.16 + prospect * 0.38; // ~16–54% wildcat
  }
  switch (prospectGrade(prospect)) {
    case "barren":
      return 0.04;
    case "lean":
      return 0.2;
    case "fair":
      return 0.75;
    case "good":
      return 0.9;
    case "sweet":
      return 0.96;
  }
}

export function hitChancePercent(prospect: number, surveyed: boolean): number {
  return Math.round(hitChance(prospect, surveyed) * 100);
}

export function rollWellRates(prospect: number, zone: ZoneTier): {
  oilIp: number;
  gasIp: number;
  declinePerDay: number;
} {
  const zoneMul = 1 + zone * 0.5;
  const oilIp = (12 + Math.random() * 160 * Math.max(0.25, prospect)) * zoneMul;
  const gasIp = oilIp * Math.random() * 2.5;
  const declinePerDay = 0.003 + Math.random() * 0.012;
  return { oilIp, gasIp, declinePerDay };
}

/** Borrowing base grows with rep + tangible assets */
export function computeCreditLimit(
  baseLimit: number,
  reputation: number,
  assetValue: number,
): number {
  const repMul = 0.7 + (reputation / 100) * 0.6;
  const assetMul = 1 + Math.min(1.5, assetValue / FACILITY_LIMIT);
  return Math.floor(baseLimit * repMul * Math.min(assetMul, 1.8));
}

export function estimateAssetValue(opts: {
  wellsProducing: number;
  batteries: number;
  trucks: number;
  roadTiles: number;
  refinerySlotBpd: number;
}): number {
  return (
    opts.wellsProducing * 350_000 +
    opts.batteries * 400_000 +
    opts.trucks * 85_000 +
    opts.roadTiles * 1_200 +
    opts.refinerySlotBpd * 2_500
  );
}
