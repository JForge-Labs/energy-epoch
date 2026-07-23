import type { ZoneTier } from "../types";

export const TANK_CAP_BBL = 400;
export const TRUCK_CAP_BBL = 180;
export const FLARE_REP_PER_MCF = 0.002;
export const GAS_SALE_REP_PER_MCF = 0.001;
export const SPILL_REP_PER_BBL = 0.05;
export const SPILL_CLEANUP_PER_BBL = 25;

/** Drill cost by zone tier (cash) */
export const DRILL_COST: Record<ZoneTier, number> = {
  0: 35_000,
  1: 75_000,
  2: 160_000,
  3: 320_000,
};

export const DRILL_DAYS: Record<ZoneTier, number> = {
  0: 2.5,
  1: 4,
  2: 7,
  3: 12,
};

export const EXPLORE_COST = 40_000;
export const GAS_LINE_COST = 22_000;
export const EXTRA_TRUCK_COST = 55_000;
export const UPGRADE_RIG_COST = 95_000;

export const DEFAULT_CONFIG = {
  cols: 28,
  rows: 18,
  tileSize: 36,
  startingCash: 150_000,
  tickSeconds: 0.2,
} as const;

/** Chance a prospect becomes a producer when drilled */
export function hitChance(prospect: number): number {
  return 0.12 + prospect * 0.72;
}

export function rollWellRates(prospect: number, zone: ZoneTier): {
  oilIp: number;
  gasIp: number;
  declinePerDay: number;
} {
  const zoneMul = 1 + zone * 0.55;
  const oilIp = (18 + prospect * 140) * zoneMul * (0.7 + Math.random() * 0.6);
  // GOR-ish: some oil wells with associated gas
  const gor = Math.random() * 2.2; // mcf/bbl-ish toy scale
  const gasIp = oilIp * gor * (0.4 + Math.random() * 0.8);
  const declinePerDay = 0.004 + Math.random() * 0.01 + zone * 0.001;
  return { oilIp, gasIp, declinePerDay };
}
