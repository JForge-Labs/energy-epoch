import type { ZoneTier } from "../types";

export const WELLHEAD_CAP_BBL = 100;
export const BATTERY_CAP_BBL = 2_000;
export const TRUCK_CAP_BBL = 180;

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
export const STARTER_REFINERY_SLOT_BPD = 400;

export const ROAD_COST = 1_200;
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
  cols: 28,
  rows: 18,
  tileSize: 36,
  startingCash: STARTING_WORKING_CASH,
  tickSeconds: 0.2,
} as const;

/** Simple random wildcat — evolve later */
export function hitChance(prospect: number): number {
  return 0.15 + prospect * 0.65;
}

export function rollWellRates(prospect: number, zone: ZoneTier): {
  oilIp: number;
  gasIp: number;
  declinePerDay: number;
} {
  const zoneMul = 1 + zone * 0.5;
  const oilIp = (12 + Math.random() * 160 * prospect) * zoneMul;
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
