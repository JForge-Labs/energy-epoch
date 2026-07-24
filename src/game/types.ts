/** Energy Epoch — core types */

export type ZoneTier = 0 | 1 | 2 | 3;

export interface Subsurface {
  oilIp: number;
  gasIp: number;
  declinePerDay: number;
  zone: ZoneTier;
  /** 0–1 richness; wildcat roll input */
  prospect: number;
  /** Special area — needs permit + enough reputation */
  special: boolean;
}

/** Base land type. Water/rock block build+traverse; creek needs a bridge. */
export type Terrain = "ground" | "scrub" | "water" | "creek" | "rock";

export interface Tile {
  surface: "ground" | "scrub" | "road";
  /** Base terrain — obstacles for roads, pipe, rigs, and drilling. */
  terrain: Terrain;
  subsurface: Subsurface;
  surveyed: boolean;
  drilled: boolean;
  wellId: string | null;
  /** Player-owned starter / purchased pad */
  isPad: boolean;
  /** Player-built road */
  hasRoad: boolean;
  /** Player-built oil pipeline (battery → refinery auto-flow) */
  oilPipe?: boolean;
  /** Player-built gas pipeline (well → gas plant) */
  gasPipe?: boolean;
}

export type WellStatus = "drilling" | "producing" | "duster" | "shut_in";

export interface Well {
  id: string;
  x: number;
  y: number;
  status: WellStatus;
  oilRate: number;
  gasRate: number;
  oilIp: number;
  gasIp: number;
  declinePerDay: number;
  ageDays: number;
  drillProgress: number;
  drillDaysNeeded: number;
  wellheadTankId: string | null;
  pumpjackId: string | null;
  /** Player-throttled: producing but shut in to stop inflow. */
  choked?: boolean;
}

export type BuildingKind =
  | "pumpjack"
  | "wellhead_tank"
  | "battery"
  | "gas_flare"
  | "gas_line"
  | "gas_plant"
  | "refinery";

export interface Building {
  id: string;
  kind: BuildingKind;
  x: number;
  y: number;
  /** Wellhead crude inventory */
  oil: number;
  oilCap: number;
  /** Battery crude (from wells) */
  crude: number;
  crudeCap: number;
  /** Battery clean oil (treated, to refinery) */
  clean: number;
  cleanCap: number;
  wellId: string | null;
  online: boolean;
  hp: number;
  throughputCap?: number;
  throughputUsed?: number;
  /** Footprint in tiles (anchor = top-left x,y). Defaults to 1×1. */
  w?: number;
  h?: number;
}

export type UnitKind = "drill_rig" | "truck";

export type TruckJob =
  | "idle"
  | "to_pickup"
  | "to_battery"
  | "to_refinery";

export type CargoKind = "none" | "crude" | "clean";

export interface Unit {
  id: string;
  kind: UnitKind;
  x: number;
  y: number;
  path: { x: number; y: number }[];
  cargo: number;
  cargoCap: number;
  cargoKind: CargoKind;
  busy: boolean;
  targetWellId: string | null;
  targetBuildingId: string | null;
  job: TruckJob;
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

export interface CreditFacility {
  debt: number;
  limit: number;
  apr: number;
  interestPaidToday: number;
  dayStamp: number;
}

export interface PlayerState {
  cash: number;
  reputation: number;
  name: string;
  explorationLevel: number;
  drillTech: number;
  permits: number;
  credit: CreditFacility;
  operatingGreen: boolean;
  revenueToday: number;
  opexToday: number;
}

export type BuildTool =
  | "select"
  | "move_rig"
  | "drill"
  | "road"
  | "oil_pipe"
  | "gas_pipe"
  | "gas_plant"
  | "battery"
  | "refinery"
  | "add_tank"
  | "sell"
  | "choke"
  | "truck"
  | "small_truck"
  | "gas_line"
  | "explore"
  | "upgrade_rig"
  | "pay_debt"
  | "draw_credit"
  | "buy_permit";

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
