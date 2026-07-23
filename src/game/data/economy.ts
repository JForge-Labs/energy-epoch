import type { BuildingKind } from "../types";

export interface BuildCost {
  cash: number;
  label: string;
  blurb: string;
}

/** Placeholder costs — tune with industry realism in iteration */
export const BUILD_COSTS: Record<Exclude<BuildingKind, never>, BuildCost> = {
  pumpjack: {
    cash: 45_000,
    label: "Pumpjack",
    blurb: "Beam pump on an oil pad. Needs pipeline to tank.",
  },
  tank: {
    cash: 28_000,
    label: "Lease tank",
    blurb: "400 bbl working tank. Buffer between well and sales.",
  },
  pipeline: {
    cash: 2_500,
    label: "Flowline",
    blurb: "Connects adjacent production equipment.",
  },
  truck_rack: {
    cash: 18_000,
    label: "Truck rack",
    blurb: "Load out to market. Must touch a tank.",
  },
  generator: {
    cash: 12_000,
    label: "Field gen",
    blurb: "Placeholder power — not wired yet.",
  },
};

/** Rough production rates for the vertical slice (bbl / sim-hour) */
export const PUMPJACK_RATE_BBL_PER_HOUR = 2.4;
export const TANK_CAP_BBL = 400;
export const PIPELINE_TRANSFER_BBL_PER_HOUR = 8;

export const DEFAULT_CONFIG = {
  cols: 24,
  rows: 16,
  tileSize: 40,
  startingCash: 120_000,
  tickSeconds: 0.35,
} as const;
