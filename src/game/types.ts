/** Core simulation types for Energy Epoch */

export type TileKind = "empty" | "oil_pad" | "access_road";

export type BuildingKind =
  | "pumpjack"
  | "tank"
  | "pipeline"
  | "truck_rack"
  | "generator";

export interface Tile {
  kind: TileKind;
  /** Remaining recoverable oil in barrels (bbl) for oil pads */
  oilReserve: number;
  /** Peak quality / API-ish score affecting price realization (0–1) */
  quality: number;
}

export interface Building {
  id: string;
  kind: BuildingKind;
  x: number;
  y: number;
  /** Inventory in barrels for tanks / racks */
  storage: number;
  storageCap: number;
  /** Operating status */
  online: boolean;
  /** Hours of runtime / wear accumulator */
  runtimeHours: number;
}

export interface MarketState {
  /** WTI-like marker $/bbl */
  spotPrice: number;
  /** Local netback after trucking / quality / fees */
  netback: number;
  volatility: number;
  day: number;
}

export interface PlayerState {
  cash: number;
  name: string;
  epoch: string;
}

export type BuildTool =
  | "select"
  | "pumpjack"
  | "tank"
  | "pipeline"
  | "truck_rack"
  | "sell";

export interface GameConfig {
  cols: number;
  rows: number;
  tileSize: number;
  startingCash: number;
  tickSeconds: number;
}
