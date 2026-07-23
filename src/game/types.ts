/** Energy Epoch — core types (wildcat / Factorio loop) */

export type ZoneTier = 0 | 1 | 2 | 3;

/** Hidden until drilled or (partially) via exploration */
export interface Subsurface {
  /** Peak oil rate bbl/day if productive */
  oilIp: number;
  /** Peak gas rate mcf/day if productive */
  gasIp: number;
  /** Exponential decline fraction per sim-day */
  declinePerDay: number;
  zone: ZoneTier;
  /** 0–1 richness used when rolling a well */
  prospect: number;
}

export interface Tile {
  /** Surface — always look empty-ish; no resource tells */
  surface: "ground" | "scrub" | "road";
  subsurface: Subsurface;
  /** Exploration survey revealed this tile's zone */
  surveyed: boolean;
  /** A wellbore exists here (dry or wet) */
  drilled: boolean;
  wellId: string | null;
}

export type WellStatus = "drilling" | "producing" | "duster" | "shut_in";

export interface Well {
  id: string;
  x: number;
  y: number;
  status: WellStatus;
  /** Current oil bbl/day */
  oilRate: number;
  /** Current gas mcf/day */
  gasRate: number;
  oilIp: number;
  gasIp: number;
  declinePerDay: number;
  ageDays: number;
  drillProgress: number;
  drillDaysNeeded: number;
  tankId: string | null;
  pumpjackId: string | null;
}

export type BuildingKind =
  | "pumpjack"
  | "tank"
  | "gas_flare"
  | "gas_line"
  | "refinery";

export interface Building {
  id: string;
  kind: BuildingKind;
  x: number;
  y: number;
  /** Oil bbl (tanks) or N/A */
  oil: number;
  oilCap: number;
  /** Linked well for pumpjack / flare */
  wellId: string | null;
  online: boolean;
  hp: number;
}

export type UnitKind = "drill_rig" | "truck";

export interface Unit {
  id: string;
  kind: UnitKind;
  x: number;
  y: number;
  /** Pixel/tile lerp target */
  tx: number;
  ty: number;
  /** Moving along path */
  path: { x: number; y: number }[];
  /** Truck cargo bbl */
  cargo: number;
  cargoCap: number;
  /** Busy drilling / hauling */
  busy: boolean;
  /** Well being drilled */
  targetWellId: string | null;
  /** Tank being served */
  targetTankId: string | null;
  /** Rig tier: 0 starter, higher = deeper zones */
  tier: number;
}

export interface MarketState {
  oilPrice: number;
  gasPrice: number;
  oilVol: number;
  gasVol: number;
  day: number;
}

export type WeatherKind = "clear" | "storm" | "lightning_cell";

export interface WeatherState {
  kind: WeatherKind;
  intensity: number;
  hoursLeft: number;
}

export interface PlayerState {
  cash: number;
  reputation: number;
  name: string;
  explorationLevel: number;
  /** Max zone tier the player can legally/tech drill */
  drillTech: number;
}

export type BuildTool =
  | "select"
  | "move_rig"
  | "drill"
  | "truck"
  | "gas_line"
  | "explore"
  | "upgrade_rig";

export interface GameConfig {
  cols: number;
  rows: number;
  tileSize: number;
  startingCash: number;
  tickSeconds: number;
}

export interface SpillEvent {
  x: number;
  y: number;
  barrels: number;
  age: number;
}
