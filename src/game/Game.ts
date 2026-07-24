import type {
  Building,
  BuildingKind,
  BuildTool,
  GameConfig,
  MarketState,
  PlayerState,
  SpillEvent,
  Tile,
  Unit,
  WeatherState,
  Well,
  ZoneTier,
} from "./types";
import {
  ADD_TANK_COST,
  BATTERY_CLEAN_CAP_BBL,
  BATTERY_COST,
  BATTERY_CRUDE_CAP_BBL,
  BATTERY_TREAT_BBL_PER_DAY,
  BRIDGE_COST,
  CLEAN_DRAIN_MIN_BBL,
  CRUDE_LOAD_READY_FRAC,
  CRUDE_PIPE_FLOW_BPD,
  DEFAULT_CONFIG,
  DRILL_COST,
  DRILL_DAYS,
  estimateAssetValue,
  EXPLORE_COST,
  EXTRA_TRUCK_COST,
  FACILITY_APR,
  FACILITY_LIMIT,
  GAS_LINE_COST,
  GAS_PIPE_COST,
  GAS_PLANT_COST,
  GAS_PLANT_PREMIUM,
  hitChance,
  hitChancePercent,
  MIN_REP_FOR_SPECIAL_PERMIT,
  OIL_PIPE_COST,
  OIL_PIPE_FLOW_BPD,
  PERMIT_COST,
  prospectGrade,
  prospectLabel,
  REFINERY_COST,
  REFINERY_SLOT_BPD,
  ROAD_COST,
  SELL_REFUND_RATE,
  rollWellRates,
  STARTER_REFINERY_SLOT_BPD,
  TRUCK_CAP_BBL,
  UPGRADE_RIG_COST,
  WELLHEAD_CAP_BBL,
  WELLHEAD_TANK_ADD_BBL,
  WELLHEAD_TANK_MAX_CAP_BBL,
} from "./data/economy";
import {
  blocksBuild,
  isBridgeTerrain,
  isOpen,
  terrainLabel,
} from "./systems/terrain";
import {
  generateWorld,
  refineryAnchor,
  starterBatteryAnchor,
  starterPadAnchor,
} from "./systems/mapgen";
import { findPath, hasDiagonalRoadOnly } from "./systems/pathfind";
import { simulateProduction } from "./systems/production";
import {
  accrueInterest,
  refreshCreditLimit,
  rollDayCounters,
  tickFines,
  tryDrawCredit,
  tryPayDebt,
} from "./systems/finance";
import { Ledger } from "./systems/ledger";
import type { LedgerEntry } from "./systems/ledger";
import {
  tickMarket,
  tickWeather,
  weatherDrillMul,
  weatherMoveMul,
} from "./systems/world";

let nextId = 1;
const uid = (p: string) => `${p}${nextId++}`;

const DIRS4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** Flat, JSON-safe snapshot of a game for save/restore. */
export interface GameSnapshot {
  tiles: Tile[][];
  wells: Well[];
  buildings: Building[];
  units: Unit[];
  player: PlayerState;
  market: MarketState;
  weather: WeatherState;
  spills: SpillEvent[];
  tool: BuildTool;
  selectedUnitId: string | null;
  message: string;
  totalOilSold: number;
  totalGasSold: number;
  totalSpilled: number;
  guide: string;
  gameOver: boolean;
  gameOverReason: string;
  opsReason: string;
  ledger: LedgerEntry[];
  idCounter: number;
  priv: {
    acc: number;
    lightningAcc: number;
    fineAccT: number;
    throughputDay: number;
    strandedDays: [string, number][];
    repStage: number;
    interestBucket: number;
  };
}

export class Game {
  readonly config: GameConfig;
  tiles: Tile[][];
  wells: Well[] = [];
  buildings: Building[] = [];
  units: Unit[] = [];
  player: PlayerState;
  market: MarketState;
  weather: WeatherState;
  spills: SpillEvent[] = [];
  tool: BuildTool = "select";
  selectedUnitId: string | null = null;
  message =
    "Facility live: build roads pad → battery → refinery, then wildcat the pad.";
  totalOilSold = 0;
  totalGasSold = 0;
  totalSpilled = 0;
  ledger = new Ledger();
  /** Sticky objective — not overwritten by transient toasts */
  guide =
    "1) Road pad→battery→refinery (CARDINAL edges, not corners)  2) Drill pad / surveyed Sweet·Good  3) Trucks loop crude→battery→clean→refinery";
  gameOver = false;
  gameOverReason = "";
  opsReason = "Waiting on first full operating day (revenue vs interest/opex).";
  private acc = 0;
  private lightningAcc = 0;
  private fineAcc = { t: 0 };
  private throughputDay = 1;
  private strandedDays = new Map<string, number>();
  private repStage = 72; // last warned threshold band
  private interestBucket = 0;
  /** Any oil pipe links a battery ↔ a refinery (recomputed each tick). */
  oilConnected = false;
  /** battery.id → [refinery.id,…] reachable over that battery's oil pipe. */
  private oilBatteryLinks = new Map<string, string[]>();
  /** Wellhead-tank id → battery ids it's crude-pipe-connected to (recomputed). */
  private crudeTankLinks = new Map<string, string[]>();
  /** Gas-pipe tiles reachable from a gas plant (keys "x,y"). */
  private gasConnectedTiles = new Set<string>();
  private pipeOilBucket = 0;
  /** Recompute pipe networks only when connectivity actually changed. */
  private pipesDirty = true;
  /** Player time-of-day speed multiplier (0 = paused). */
  timeScale = 1;
  /** Debt interest ("Hard mode"). Off by default; on = ~11% APR drain. */
  interestEnabled = false;

  constructor(config: Partial<GameConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.tiles = generateWorld(this.config.cols, this.config.rows);
    this.player = {
      cash: this.config.startingCash,
      reputation: 72,
      name: "Wildcat Co.",
      explorationLevel: 0,
      drillTech: 0,
      permits: 0,
      credit: {
        debt: FACILITY_LIMIT,
        limit: FACILITY_LIMIT,
        apr: FACILITY_APR,
        interestPaidToday: 0,
        dayStamp: 1,
      },
      operatingGreen: false,
      revenueToday: 0,
      opexToday: 0,
    };
    this.market = {
      oilPrice: 74,
      gasPrice: 2.8,
      oilVol: 4.5,
      gasVol: 0.35,
      day: 1,
    };
    this.weather = { kind: "clear", intensity: 0, hoursLeft: 24 };

    this.seedFacilityPackage();
  }

  private seedFacilityPackage() {
    const pad = starterPadAnchor();
    const batt = starterBatteryAnchor();
    const ref = refineryAnchor(this.config.cols, this.config.rows);

    this.tiles[pad.y][pad.x].isPad = true;
    this.tiles[pad.y][pad.x].hasRoad = true;
    this.tiles[batt.y][batt.x].hasRoad = true;
    this.tiles[ref.y][ref.x].hasRoad = true;

    this.buildings.push({
      id: uid("bat"),
      kind: "battery",
      x: batt.x,
      y: batt.y,
      oil: 0,
      oilCap: 0,
      crude: 0,
      crudeCap: BATTERY_CRUDE_CAP_BBL,
      clean: 0,
      cleanCap: BATTERY_CLEAN_CAP_BBL,
      wellId: null,
      online: true,
      hp: 100,
      w: 2,
      h: 1,
    });

    this.buildings.push({
      id: uid("ref"),
      kind: "refinery",
      x: ref.x,
      y: ref.y,
      oil: 0,
      oilCap: 0,
      crude: 0,
      crudeCap: 0,
      clean: 0,
      cleanCap: 0,
      wellId: null,
      online: true,
      hp: 100,
      throughputCap: STARTER_REFINERY_SLOT_BPD,
      throughputUsed: 0,
      w: 2,
      h: 2,
    });

    this.units.push({
      id: uid("rig"),
      kind: "drill_rig",
      x: pad.x,
      y: pad.y + 1,
      path: [],
      cargo: 0,
      cargoCap: 0,
      cargoKind: "none",
      busy: false,
      targetWellId: null,
      targetBuildingId: null,
      job: "idle",
      tier: 0,
    });

    this.units.push({
      id: uid("trk"),
      kind: "truck",
      x: batt.x,
      y: batt.y + 1,
      path: [],
      cargo: 0,
      cargoCap: TRUCK_CAP_BBL,
      cargoKind: "none",
      busy: false,
      targetWellId: null,
      targetBuildingId: null,
      job: "idle",
      tier: 0,
    });

    this.tiles[batt.y + 1][batt.x].hasRoad = true;
    this.selectedUnitId = this.units[0].id;
  }

  setTool(tool: BuildTool) {
    this.tool = tool;
    const hints: Record<BuildTool, string> = {
      select: "Inspect wells, battery, trucks, roads.",
      move_rig: "Send drill rig (rigs can cross open ground).",
      drill: "Wildcat under the rig — simple random IP.",
      road: "Lay lease road ($1.2k/tile). Trucks need roads. Bridges cross creeks.",
      oil_pipe: "Oil pipe: drag battery → refinery for hands-free clean-oil sales.",
      gas_pipe: "Gas pipe: drag wells → gas plant to sell gas at a premium.",
      gas_plant: "Place a 2×2 gas plant — premium buyer for piped gas.",
      battery: "Place a 2×1 tank battery — more crude treating (crude→clean).",
      refinery: "Place a 2×2 refinery — another daily sales slot.",
      add_tank: "Click a wellhead tank to add crude storage — fewer overflows between hauls.",
      sell: "Scrap a road, pipe, gas line, plant, battery, refinery, or truck — 75%.",
      choke: "Click a well to shut it in / bring it back — throttle inflow.",
      truck: "Buy a 400 bbl haul truck.",
      small_truck: "Buy a cheaper 200 bbl haul truck.",
      gas_line: "Gas takeaway near a well — stop flare, sell gas.",
      explore: "Survey a 3×3 (9 tiles). Colors show strike odds — drill Good/Sweet.",
      upgrade_rig: "Higher tier → deeper zones.",
      pay_debt: "Pay principal from cash.",
      draw_credit: "Draw against facility (if room under limit).",
      buy_permit: "Permit for special areas (needs rep).",
    };
    this.message = hints[tool];
  }

  private assetValue(): number {
    let roads = 0;
    let pipes = 0;
    for (const row of this.tiles) {
      for (const t of row) {
        if (t.hasRoad) roads++;
        if (t.oilPipe) pipes++;
        if (t.gasPipe) pipes++;
      }
    }
    const refinerySlotBpd = this.buildings
      .filter((b) => b.kind === "refinery")
      .reduce((s, b) => s + (b.throughputCap ?? 0), 0);
    const plants = this.buildings.filter((b) => b.kind === "gas_plant").length;
    return (
      estimateAssetValue({
        wellsProducing: this.wells.filter((w) => w.status === "producing").length,
        batteries: this.buildings.filter((b) => b.kind === "battery").length,
        trucks: this.units.filter((u) => u.kind === "truck").length,
        roadTiles: roads,
        refinerySlotBpd,
      }) +
      plants * 250_000 +
      pipes * 4_000
    );
  }

  private truckPassable = (x: number, y: number): boolean => {
    const t = this.tiles[y]?.[x];
    if (!t) return false;
    // Lease roads + pads. Buildings never block a road tile — trucks drive past jacks.
    if (t.hasRoad || t.isPad) return true;
    const b = this.buildingAt(x, y);
    return !!b && (b.kind === "battery" || b.kind === "refinery" || b.kind === "wellhead_tank");
  };

  /** Trucks path through equipment; only soft-avoid other trucks' tiles */
  private blockedSet(ignoreUnitId?: string): Set<string> {
    const s = new Set<string>();
    for (const u of this.units) {
      if (u.kind !== "truck") continue;
      if (ignoreUnitId && u.id === ignoreUnitId) continue;
      // Don't hard-block — empty set was too permissive for stacking;
      // skip blocking entirely so one stranded truck can't cork the network.
    }
    void s;
    return new Set();
  }

  selectedRig(): Unit | undefined {
    const u = this.units.find((x) => x.id === this.selectedUnitId);
    if (u?.kind === "drill_rig") return u;
    return this.units.find((x) => x.kind === "drill_rig");
  }

  /** Nearest online building of a kind to (x,y), optionally filtered. */
  private nearestOf(
    kind: BuildingKind,
    x: number,
    y: number,
    pred?: (b: Building) => boolean,
  ): Building | undefined {
    let best: Building | undefined;
    let bestD = Infinity;
    for (const b of this.buildings) {
      if (b.kind !== kind || !b.online) continue;
      if (pred && !pred(b)) continue;
      const d = Math.abs(b.x - x) + Math.abs(b.y - y);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  /** Does building b's footprint cover tile (x,y)? */
  occupies(b: Building, x: number, y: number): boolean {
    const w = b.w ?? 1;
    const h = b.h ?? 1;
    return x >= b.x && x < b.x + w && y >= b.y && y < b.y + h;
  }

  buildingAt(x: number, y: number): Building | undefined {
    return this.buildings.find(
      (b) => b.kind !== "gas_flare" && this.occupies(b, x, y),
    );
  }

  wellAt(x: number, y: number): Well | undefined {
    return this.wells.find((w) => w.x === x && w.y === y);
  }

  private freeNeighbor(x: number, y: number): { x: number; y: number } | null {
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ];
    // Prefer tiles already on the road network so trucks can reach the tank
    const candidates: { x: number; y: number; score: number }[] = [];
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= this.config.cols || ny >= this.config.rows) {
        continue;
      }
      if (this.buildingAt(nx, ny)) continue;
      if (this.tiles[ny][nx].drilled) continue;
      let score = 0;
      if (this.tiles[ny][nx].hasRoad) score += 10;
      if (this.tiles[ny][nx].isPad) score += 5;
      // Cardinal neighbors first
      if (Math.abs(dx) + Math.abs(dy) === 1) score += 2;
      candidates.push({ x: nx, y: ny, score });
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] ? { x: candidates[0].x, y: candidates[0].y } : null;
  }

  /** Lay free spur roads from a tile to the nearest existing road */
  private linkToRoadNetwork(sx: number, sy: number) {
    this.tiles[sy][sx].hasRoad = true;
    // If only diagonal roads touch this tile, pave a cardinal bridge
    if (hasDiagonalRoadOnly(this.tiles, sx, sy)) {
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = sx + dx;
        const ny = sy + dy;
        if (nx < 0 || ny < 0 || nx >= this.config.cols || ny >= this.config.rows) {
          continue;
        }
        // Bridge toward any diagonal road neighbor's shared edge
        for (const [dx2, dy2] of [
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ]) {
          const dxn = sx + dx2;
          const dyn = sy + dy2;
          if (
            dxn >= 0 &&
            dyn >= 0 &&
            dxn < this.config.cols &&
            dyn < this.config.rows &&
            this.tiles[dyn][dxn].hasRoad
          ) {
            // pave the cardinal step that shares an axis with the diagonal
            if (dx === dx2 || dy === dy2) {
              this.tiles[ny][nx].hasRoad = true;
            }
          }
        }
      }
      // Always pave at least one cardinal toward battery if possible
      const batt = this.nearestOf("battery", sx, sy);
      if (batt) {
        const stepX = Math.sign(batt.x - sx);
        const stepY = Math.sign(batt.y - sy);
        if (stepX !== 0) {
          const nx = sx + stepX;
          if (nx >= 0 && nx < this.config.cols) this.tiles[sy][nx].hasRoad = true;
        } else if (stepY !== 0) {
          const ny = sy + stepY;
          if (ny >= 0 && ny < this.config.rows) this.tiles[ny][sx].hasRoad = true;
        }
      }
    }

    if (this.hasRoadAccess(sx, sy)) return;

    const key = (x: number, y: number) => `${x},${y}`;
    const q: { x: number; y: number }[] = [{ x: sx, y: sy }];
    const came = new Map<string, string | null>();
    came.set(key(sx, sy), null);
    let found: { x: number; y: number } | null = null;

    while (q.length && !found) {
      const cur = q.shift()!;
      if (!(cur.x === sx && cur.y === sy) && this.tiles[cur.y][cur.x].hasRoad) {
        found = cur;
        break;
      }
      if (came.size > 120) break;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        if (nx < 0 || ny < 0 || nx >= this.config.cols || ny >= this.config.rows) {
          continue;
        }
        const k = key(nx, ny);
        if (came.has(k)) continue;
        came.set(k, key(cur.x, cur.y));
        q.push({ x: nx, y: ny });
      }
    }

    if (!found) return;
    let walk: string | null = key(found.x, found.y);
    while (walk) {
      const [xs, ys] = walk.split(",");
      const x = Number(xs);
      const y = Number(ys);
      this.tiles[y][x].hasRoad = true;
      walk = came.get(walk) ?? null;
    }
  }

  /** Diagnose why a truck can't reach a wellhead — specific, not generic */
  diagnoseHaulBlock(truck: Unit, tankX: number, tankY: number): string {
    const tile = this.tiles[tankY][tankX];
    if (!tile.hasRoad && !this.buildingAt(tankX, tankY)) {
      return `No road on wellhead tank tile (${tankX},${tankY}). Lay a CARDINAL road onto that tile.`;
    }
    if (hasDiagonalRoadOnly(this.tiles, tankX, tankY)) {
      return `Road only touches tank on a CORNER at (${tankX},${tankY}). Trucks need a N/E/S/W edge — not diagonal.`;
    }
    const path = this.roadPath(truck, { x: tankX, y: tankY });
    if (path.length) return "";
    const batt = this.nearestOf("battery", tankX, tankY);
    if (batt) {
      const toBatt = findPath(
        this.tiles,
        new Set(),
        { x: tankX, y: tankY },
        { x: batt.x, y: batt.y },
        "road",
        this.truckPassable,
      );
      if (!toBatt.length && !(tankX === batt.x && tankY === batt.y)) {
        return `Wellhead (${tankX},${tankY}) is not on a battery road network. Connect with cardinal roads.`;
      }
    }
    return `No truck route to wellhead (${tankX},${tankY}) from (${Math.round(truck.x)},${Math.round(truck.y)}). Check cardinal road continuity.`;
  }

  private hasRoadAccess(x: number, y: number): boolean {
    // Connected via roads to ANY battery?
    const batteries = this.buildings.filter((b) => b.kind === "battery");
    if (!batteries.length) return this.tiles[y][x].hasRoad;
    for (const battery of batteries) {
      if (this.occupies(battery, x, y)) return true;
      const path = findPath(
        this.tiles,
        new Set(),
        { x, y },
        { x: battery.x, y: battery.y },
        "road",
        this.truckPassable,
      );
      if (path.length > 0) return true;
    }
    return false;
  }

  private nudgeRigOffHole(rig: Unit, x: number, y: number) {
    const spot = this.freeNeighbor(x, y);
    if (!spot) return;
    rig.x = spot.x;
    rig.y = spot.y;
    rig.path = [];
  }

  layRoad(x: number, y: number): boolean {
    const tile = this.tiles[y][x];
    if (tile.hasRoad) {
      this.message = "Road already down.";
      return false;
    }
    if (blocksBuild(tile.terrain)) {
      this.message = `Can't build road over ${terrainLabel(tile.terrain)}.`;
      return false;
    }
    const bridge = isBridgeTerrain(tile.terrain);
    const cost = bridge ? BRIDGE_COST : ROAD_COST;
    if (this.player.cash < cost) {
      this.message = `${bridge ? "Bridge" : "Road"} costs $${cost.toLocaleString()}.`;
      return false;
    }
    this.player.cash -= cost;
    this.player.opexToday += cost;
    this.ledger.push(
      this.market.day,
      "capex",
      bridge ? `Bridge ${x},${y}` : `Road ${x},${y}`,
      -cost,
    );
    tile.hasRoad = true;
    tile.surface = "road";

    // Warn if this only diagonally kisses a wellhead tank
    const tanks = this.buildings.filter((b) => b.kind === "wellhead_tank");
    for (const t of tanks) {
      const manhattan = Math.abs(t.x - x) + Math.abs(t.y - y);
      const chebyshev = Math.max(Math.abs(t.x - x), Math.abs(t.y - y));
      if (chebyshev === 1 && manhattan === 2) {
        this.message = `Road at ${x},${y} only touches tank (${t.x},${t.y}) on a CORNER — add a N/E/S/W edge tile.`;
        return true;
      }
      if (manhattan === 1) {
        this.linkToRoadNetwork(t.x, t.y);
      }
    }
    this.message = bridge ? `Bridge built at ${x},${y}.` : `Road laid at ${x},${y}.`;
    return true;
  }

  /** Lay an oil or gas pipeline tile (auto-flow transport). */
  layPipe(x: number, y: number, kind: "oil" | "gas"): boolean {
    const tile = this.tiles[y][x];
    const flag = kind === "oil" ? "oilPipe" : "gasPipe";
    if (tile[flag]) {
      this.message = `${kind === "oil" ? "Oil" : "Gas"} pipe already here.`;
      return false;
    }
    if (blocksBuild(tile.terrain)) {
      this.message = `Can't run pipe over ${terrainLabel(tile.terrain)}.`;
      return false;
    }
    if (this.buildingAt(x, y)) {
      this.message = "Can't run pipe through a structure — route beside it.";
      return false;
    }
    const bridge = isBridgeTerrain(tile.terrain);
    const base = kind === "oil" ? OIL_PIPE_COST : GAS_PIPE_COST;
    const cost = bridge ? base + BRIDGE_COST : base;
    if (this.player.cash < cost) {
      this.message = `${kind === "oil" ? "Oil" : "Gas"} pipe costs $${cost.toLocaleString()} here.`;
      return false;
    }
    this.player.cash -= cost;
    this.player.opexToday += cost;
    this.ledger.push(
      this.market.day,
      "capex",
      `${kind === "oil" ? "Oil" : "Gas"} pipe ${x},${y}`,
      -cost,
    );
    tile[flag] = true;
    this.pipesDirty = true;
    this.message = `${kind === "oil" ? "Oil" : "Gas"} pipe laid at ${x},${y}.`;
    return true;
  }

  /** Place a 2×2 gas plant (premium piped-gas buyer). */
  placeGasPlant(x: number, y: number): boolean {
    if (this.player.cash < GAS_PLANT_COST) {
      this.message = `Gas plant costs $${GAS_PLANT_COST.toLocaleString()}.`;
      return false;
    }
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const tx = x + dx;
        const ty = y + dy;
        if (tx >= this.config.cols || ty >= this.config.rows) {
          this.message = "Gas plant needs a 2×2 clear area in bounds.";
          return false;
        }
        if (blocksBuild(this.tiles[ty][tx].terrain)) {
          this.message = `Can't site the plant on ${terrainLabel(this.tiles[ty][tx].terrain)}.`;
          return false;
        }
        if (this.buildingAt(tx, ty)) {
          this.message = "Something's already on that 2×2 footprint.";
          return false;
        }
      }
    }
    this.player.cash -= GAS_PLANT_COST;
    this.player.opexToday += GAS_PLANT_COST;
    this.ledger.push(this.market.day, "capex", `Gas plant ${x},${y}`, -GAS_PLANT_COST);
    this.buildings.push({
      id: uid("gp"),
      kind: "gas_plant",
      x,
      y,
      oil: 0,
      oilCap: 0,
      crude: 0,
      crudeCap: 0,
      clean: 0,
      cleanCap: 0,
      wellId: null,
      online: true,
      hp: 100,
      w: 2,
      h: 2,
    });
    this.pipesDirty = true;
    this.message = `Gas plant online at ${x},${y}. Run gas pipe from wells to sell at a premium.`;
    return true;
  }

  /** Shared footprint validation for placed multi-tile buildings. */
  private footprintClear(x: number, y: number, w: number, h: number): boolean {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const tx = x + dx;
        const ty = y + dy;
        if (tx >= this.config.cols || ty >= this.config.rows) {
          this.message = `Needs a ${w}×${h} clear area in bounds.`;
          return false;
        }
        if (blocksBuild(this.tiles[ty][tx].terrain)) {
          this.message = `Can't build on ${terrainLabel(this.tiles[ty][tx].terrain)}.`;
          return false;
        }
        if (this.buildingAt(tx, ty)) {
          this.message = "Something's already on that footprint.";
          return false;
        }
      }
    }
    return true;
  }

  /** Build an additional tank battery (2×1). */
  placeBattery(x: number, y: number): boolean {
    if (this.player.cash < BATTERY_COST) {
      this.message = `Battery costs $${BATTERY_COST.toLocaleString()}.`;
      return false;
    }
    if (!this.footprintClear(x, y, 2, 1)) return false;
    this.player.cash -= BATTERY_COST;
    this.player.opexToday += BATTERY_COST;
    this.ledger.push(this.market.day, "capex", `Battery ${x},${y}`, -BATTERY_COST);
    this.buildings.push({
      id: uid("bat"),
      kind: "battery",
      x,
      y,
      oil: 0,
      oilCap: 0,
      crude: 0,
      crudeCap: BATTERY_CRUDE_CAP_BBL,
      clean: 0,
      cleanCap: BATTERY_CLEAN_CAP_BBL,
      wellId: null,
      online: true,
      hp: 100,
      w: 2,
      h: 1,
    });
    this.linkToRoadNetwork(x, y);
    this.pipesDirty = true;
    this.message = `New battery online at ${x},${y}. +${BATTERY_TREAT_BBL_PER_DAY} bbl/day treating.`;
    return true;
  }

  /** Build an additional refinery (2×2) with its own sales slot. */
  placeRefinery(x: number, y: number): boolean {
    if (this.player.cash < REFINERY_COST) {
      this.message = `Refinery costs $${REFINERY_COST.toLocaleString()}.`;
      return false;
    }
    if (!this.footprintClear(x, y, 2, 2)) return false;
    this.player.cash -= REFINERY_COST;
    this.player.opexToday += REFINERY_COST;
    this.ledger.push(this.market.day, "capex", `Refinery ${x},${y}`, -REFINERY_COST);
    this.buildings.push({
      id: uid("ref"),
      kind: "refinery",
      x,
      y,
      oil: 0,
      oilCap: 0,
      crude: 0,
      crudeCap: 0,
      clean: 0,
      cleanCap: 0,
      wellId: null,
      online: true,
      hp: 100,
      throughputCap: REFINERY_SLOT_BPD,
      throughputUsed: 0,
      w: 2,
      h: 2,
    });
    this.linkToRoadNetwork(x, y);
    this.pipesDirty = true;
    this.message = `New refinery online at ${x},${y}. +${REFINERY_SLOT_BPD} bbl/day sales slot.`;
    return true;
  }

  /**
   * Scrap a player-placed asset at a tile and recover SELL_REFUND_RATE of cost.
   * Handles extra trucks, gas lines, and roads. Core financed infra (battery,
   * refinery) and auto-built wellhead gear are protected.
   */
  sellAt(x: number, y: number): boolean {
    const refundOf = (cost: number) => Math.round(cost * SELL_REFUND_RATE);
    // Any successful removal below can change pipe connectivity; recompute next tick.
    this.pipesDirty = true;

    // Extra truck sitting on this tile — keep at least one on the lease.
    const truck = this.units.find(
      (u) => u.kind === "truck" && Math.round(u.x) === x && Math.round(u.y) === y,
    );
    if (truck) {
      const truckCount = this.units.filter((u) => u.kind === "truck").length;
      if (truckCount <= 1) {
        this.message = "Keep at least one truck to haul.";
        return false;
      }
      const refund = refundOf(EXTRA_TRUCK_COST);
      this.units = this.units.filter((u) => u.id !== truck.id);
      this.player.cash += refund;
      this.ledger.push(this.market.day, "other", "Truck salvage", refund);
      this.message = `Sold truck for $${refund.toLocaleString()} (75%).`;
      return true;
    }

    const b = this.buildingAt(x, y);
    if (b) {
      if (b.kind === "gas_line") {
        const refund = refundOf(GAS_LINE_COST);
        this.buildings = this.buildings.filter((o) => o.id !== b.id);
        this.player.cash += refund;
        this.ledger.push(this.market.day, "other", "Gas line salvage", refund);
        // Flare comes back on for the well this line served.
        for (const f of this.buildings) {
          if (
            f.kind === "gas_flare" &&
            (f.wellId === b.wellId ||
              Math.abs(f.x - x) + Math.abs(f.y - y) <= 2)
          ) {
            f.online = true;
          }
        }
        this.message = `Scrapped gas line, +$${refund.toLocaleString()}. Flare back on.`;
        return true;
      }
      if (b.kind === "gas_plant") {
        const refund = refundOf(GAS_PLANT_COST);
        this.buildings = this.buildings.filter((o) => o.id !== b.id);
        this.player.cash += refund;
        this.ledger.push(this.market.day, "other", "Gas plant salvage", refund);
        this.message = `Scrapped gas plant, +$${refund.toLocaleString()}.`;
        return true;
      }
      if (b.kind === "battery" || b.kind === "refinery") {
        const firstOfKind = this.buildings.find((o) => o.kind === b.kind);
        if (b === firstOfKind) {
          this.message = `Won't scrap the financed starter ${b.kind}.`;
          return false;
        }
        if (b.kind === "battery" && b.crude + b.clean > 1) {
          this.message = "Empty the battery before scrapping it.";
          return false;
        }
        const refund = refundOf(b.kind === "battery" ? BATTERY_COST : REFINERY_COST);
        this.buildings = this.buildings.filter((o) => o.id !== b.id);
        this.player.cash += refund;
        this.ledger.push(this.market.day, "other", `${b.kind} salvage`, refund);
        this.message = `Scrapped ${b.kind}, +$${refund.toLocaleString()}.`;
        return true;
      }
      if (b.kind === "pumpjack" || b.kind === "wellhead_tank") {
        this.message = "Can't scrap wellhead gear here.";
        return false;
      }
    }

    const tile = this.tiles[y][x];
    if (tile.oilPipe) {
      const refund = refundOf(OIL_PIPE_COST);
      tile.oilPipe = false;
      this.player.cash += refund;
      this.ledger.push(this.market.day, "other", `Oil pipe salvage ${x},${y}`, refund);
      this.message = `Pulled oil pipe at ${x},${y}, +$${refund.toLocaleString()}.`;
      return true;
    }
    if (tile.gasPipe) {
      const refund = refundOf(GAS_PIPE_COST);
      tile.gasPipe = false;
      this.player.cash += refund;
      this.ledger.push(this.market.day, "other", `Gas pipe salvage ${x},${y}`, refund);
      this.message = `Pulled gas pipe at ${x},${y}, +$${refund.toLocaleString()}.`;
      return true;
    }
    if (tile.hasRoad && !tile.isPad) {
      const refund = refundOf(ROAD_COST);
      tile.hasRoad = false;
      tile.surface = "ground";
      this.player.cash += refund;
      this.ledger.push(this.market.day, "other", `Road salvage ${x},${y}`, refund);
      this.message = `Pulled road at ${x},${y}, +$${refund.toLocaleString()}.`;
      return true;
    }

    this.message = "Nothing sellable here — roads, pipe, gas line, plant, or extra trucks.";
    return false;
  }

  /** Shut a producing well in (stop inflow) or bring it back online. */
  toggleChoke(x: number, y: number): boolean {
    const well = this.wells.find(
      (w) => w.x === x && w.y === y && w.status === "producing",
    );
    if (!well) {
      this.message = "Choke needs a producing well.";
      return false;
    }
    well.choked = !well.choked;
    this.message = well.choked
      ? `Well ${x},${y} shut in — inflow stopped. Click again to resume.`
      : `Well ${x},${y} back online — flowing ${well.oilRate.toFixed(0)} bopd.`;
    return true;
  }

  /** Add a standard tank to a wellhead, raising its crude storage. */
  addTank(x: number, y: number): boolean {
    const tank = this.buildings.find(
      (b) => b.kind === "wellhead_tank" && b.x === x && b.y === y,
    );
    if (!tank) {
      this.message = "Add tank needs a wellhead tank — click the tank tile.";
      return false;
    }
    if (tank.oilCap <= 0) tank.oilCap = WELLHEAD_CAP_BBL;
    if (tank.oilCap >= WELLHEAD_TANK_MAX_CAP_BBL) {
      this.message = `Tank battery maxed at ${WELLHEAD_TANK_MAX_CAP_BBL} bbl.`;
      return false;
    }
    if (this.player.cash < ADD_TANK_COST) {
      this.message = `Add tank costs $${ADD_TANK_COST.toLocaleString()}.`;
      return false;
    }
    this.player.cash -= ADD_TANK_COST;
    this.player.opexToday += ADD_TANK_COST;
    this.ledger.push(this.market.day, "capex", `Wellhead tank ${x},${y}`, -ADD_TANK_COST);
    tank.oilCap = Math.min(
      WELLHEAD_TANK_MAX_CAP_BBL,
      tank.oilCap + WELLHEAD_TANK_ADD_BBL,
    );
    this.message = `Tank added at ${x},${y} — storage now ${tank.oilCap} bbl.`;
    return true;
  }

  sendRigTo(x: number, y: number): boolean {
    const rig = this.selectedRig();
    if (!rig || rig.busy) {
      this.message = "Rig is busy drilling.";
      return false;
    }
    if (this.buildingAt(x, y)?.kind === "pumpjack") {
      this.message = "Can't park on a pumpjack.";
      return false;
    }
    const from = { x: Math.round(rig.x), y: Math.round(rig.y) };
    const path = findPath(this.tiles, this.blockedSet(rig.id), from, { x, y }, "any");
    if (!path.length && (from.x !== x || from.y !== y)) {
      this.message = "No path for the rig.";
      return false;
    }
    rig.path = path;
    this.message = `Rig rolling to ${x},${y}.`;
    return true;
  }

  startDrill(): boolean {
    const rig = this.selectedRig();
    if (!rig) return false;
    if (rig.busy || rig.path.length) {
      this.message = "Wait for the rig to sit still.";
      return false;
    }
    const x = Math.round(rig.x);
    const y = Math.round(rig.y);
    const tile = this.tiles[y][x];
    if (tile.drilled) {
      this.message = "Already drilled here.";
      return false;
    }
    if (!isOpen(tile.terrain)) {
      this.message = `Can't drill on ${terrainLabel(tile.terrain)} — move the rig to open ground.`;
      return false;
    }
    const zone = tile.subsurface.zone;
    if (zone > rig.tier || zone > this.player.drillTech) {
      this.message = `Zone ${zone} needs rig/tech tier ${zone}.`;
      return false;
    }
    if (tile.subsurface.special) {
      if (this.player.reputation < MIN_REP_FOR_SPECIAL_PERMIT) {
        this.message = `Rep too low for special-area permit (need ${MIN_REP_FOR_SPECIAL_PERMIT}).`;
        return false;
      }
      if (this.player.permits < 1) {
        this.message = "Special area — buy a permit first.";
        return false;
      }
    }
    const cost = DRILL_COST[zone];
    if (this.player.cash < cost) {
      this.message = `Need $${cost.toLocaleString()} AFE (zone ${zone}).`;
      return false;
    }

    this.player.cash -= cost;
    this.player.opexToday += cost;
    this.ledger.push(this.market.day, "drill", `AFE zone ${zone} @ ${x},${y}`, -cost);
    if (tile.subsurface.special) this.player.permits -= 1;
    tile.drilled = true;
    const well: Well = {
      id: uid("w"),
      x,
      y,
      status: "drilling",
      oilRate: 0,
      gasRate: 0,
      oilIp: 0,
      gasIp: 0,
      declinePerDay: 0.008,
      ageDays: 0,
      drillProgress: 0,
      drillDaysNeeded: DRILL_DAYS[zone],
      wellheadTankId: null,
      pumpjackId: null,
    };
    tile.wellId = well.id;
    this.wells.push(well);
    rig.busy = true;
    rig.targetWellId = well.id;
    this.message = `Spudding… zone ${zone}${tile.subsurface.special ? " (special)" : ""}.`;
    return true;
  }

  private completeWell(well: Well, rig: Unit) {
    const tile = this.tiles[well.y][well.x];
    const prospect = tile.subsurface.prospect;
    const zone = tile.subsurface.zone as ZoneTier;
    const hit = Math.random() < hitChance(prospect, tile.surveyed);

    rig.busy = false;
    rig.targetWellId = null;
    this.nudgeRigOffHole(rig, well.x, well.y);

    if (!hit) {
      well.status = "duster";
      const why = tile.surveyed
        ? `Survey said ${prospectLabel(prospectGrade(prospect))} — dry anyway.`
        : "Wildcat duster (unsurveyed).";
      this.message = `Duster at ${well.x},${well.y}. ${why}`;
      return;
    }

    const rates = rollWellRates(prospect, zone);
    well.status = "producing";
    well.oilIp = rates.oilIp;
    well.gasIp = rates.gasIp;
    well.oilRate = rates.oilIp;
    well.gasRate = rates.gasIp;
    well.declinePerDay = rates.declinePerDay;

    const jack: Building = {
      id: uid("pj"),
      kind: "pumpjack",
      x: well.x,
      y: well.y,
      oil: 0,
      oilCap: 0,
      crude: 0,
      crudeCap: 0,
      clean: 0,
      cleanCap: 0,
      wellId: well.id,
      online: true,
      hp: 100,
    };
    this.buildings.push(jack);
    well.pumpjackId = jack.id;

    // Guarantee a wellhead tank beside the jack
    let spot = this.freeNeighbor(well.x, well.y);
    if (!spot) {
      // Force: pick first in-bounds cardinal neighbor and clear soft blockers
      const forced = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];
      for (const [dx, dy] of forced) {
        const nx = well.x + dx;
        const ny = well.y + dy;
        if (nx < 0 || ny < 0 || nx >= this.config.cols || ny >= this.config.rows) {
          continue;
        }
        const occ = this.buildingAt(nx, ny)?.kind;
        if (occ === "refinery" || occ === "battery" || occ === "gas_plant") continue;
        spot = { x: nx, y: ny };
        break;
      }
    }
    if (spot) {
      // Remove non-critical occupancy on the spot
      this.buildings = this.buildings.filter(
        (b) =>
          !(
            b.x === spot!.x &&
            b.y === spot!.y &&
            b.kind !== "battery" &&
            b.kind !== "refinery"
          ),
      );
      const tank: Building = {
        id: uid("wt"),
        kind: "wellhead_tank",
        x: spot.x,
        y: spot.y,
        oil: 0,
        oilCap: WELLHEAD_CAP_BBL,
        crude: 0,
        crudeCap: 0,
        clean: 0,
        cleanCap: 0,
        wellId: well.id,
        online: true,
        hp: 100,
      };
      this.buildings.push(tank);
      well.wellheadTankId = tank.id;
      this.tiles[well.y][well.x].hasRoad = true;
      this.linkToRoadNetwork(spot.x, spot.y);
      this.pipesDirty = true;
    }

    this.buildings.push({
      id: uid("fl"),
      kind: "gas_flare",
      x: well.x,
      y: well.y,
      oil: 0,
      oilCap: 0,
      crude: 0,
      crudeCap: 0,
      clean: 0,
      cleanCap: 0,
      wellId: well.id,
      online: true,
      hp: 50,
    });

    this.message = `Ripper! ${well.oilRate.toFixed(0)} bopd · ${well.gasRate.toFixed(0)} mcf/d. Tank filling — truck will haul to battery.`;
  }

  buyExploration(cx: number, cy: number): boolean {
    if (this.player.cash < EXPLORE_COST) {
      this.message = `Survey costs $${EXPLORE_COST.toLocaleString()}.`;
      return false;
    }
    const zone = this.tiles[cy][cx].subsurface.zone;
    const rig = this.selectedRig();
    const tier = Math.max(this.player.drillTech, rig?.tier ?? 0);
    if (zone > tier) {
      this.message = `Heads-up: this 3×3 is zone ${zone} — your rig is T${tier}. Survey will reveal rock, but you can't drill it until Rig+.`;
      // still allow — information has value — but toast warns first; caller may confirm
    }
    this.player.cash -= EXPLORE_COST;
    this.player.opexToday += EXPLORE_COST;
    this.ledger.push(this.market.day, "explore", `3×3 survey @ ${cx},${cy}`, -EXPLORE_COST);
    this.player.explorationLevel += 1;

    // Fixed 3×3 (up to 9 tiles) centered on click
    const counts: Record<string, number> = {
      barren: 0,
      lean: 0,
      fair: 0,
      good: 0,
      sweet: 0,
    };
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= this.config.cols || y >= this.config.rows) {
          continue;
        }
        this.tiles[y][x].surveyed = true;
        counts[prospectGrade(this.tiles[y][x].subsurface.prospect)] += 1;
        n++;
      }
    }

    const targets = counts.good + counts.sweet;
    const zoneNote =
      zone > tier
        ? ` Zone ${zone} needs Rig T${zone}+ before you can punch here.`
        : "";
    this.message =
      `3×3 survey (${n} tiles): ${counts.sweet} Sweet, ${counts.good} Good, ${counts.fair} Fair, ${counts.lean} Lean, ${counts.barren} Barren. ` +
      (targets > 0
        ? `Drill gold/green — ~90%+ hit on Good/Sweet.`
        : `No strong targets here — survey elsewhere.`) +
      zoneNote;
    return true;
  }

  placeGasLine(clickX: number, clickY: number): boolean {
    if (this.player.cash < GAS_LINE_COST) {
      this.message = `Gas line costs $${GAS_LINE_COST.toLocaleString()}.`;
      return false;
    }

    // Tie into the producing well nearest the click. The player doesn't have to
    // land on a specific empty tile — we snap the takeaway to the best open
    // spot beside that well (the wellhead itself is full of jack/tank/flare).
    let well: Well | null = null;
    let bestWellDist = Infinity;
    for (const w of this.wells) {
      if (w.status !== "producing") continue;
      const d = Math.abs(w.x - clickX) + Math.abs(w.y - clickY);
      if (d < bestWellDist) {
        bestWellDist = d;
        well = w;
      }
    }
    if (!well) {
      this.message = "No producing well to tie into yet — hit a well first.";
      return false;
    }
    if (bestWellDist > 4) {
      this.message = "Click closer to a producing well to run its gas line.";
      return false;
    }

    // Pick the open tile within 2 of the well that's nearest the click. A
    // truck passing through doesn't count — only real structures block.
    let target: { x: number; y: number } | null = null;
    let bestScore = Infinity;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > 2) continue;
        const tx = well.x + dx;
        const ty = well.y + dy;
        if (tx < 0 || ty < 0 || tx >= this.config.cols || ty >= this.config.rows) {
          continue;
        }
        if (this.buildingAt(tx, ty)) continue;
        const score = Math.abs(tx - clickX) + Math.abs(ty - clickY);
        if (score < bestScore) {
          bestScore = score;
          target = { x: tx, y: ty };
        }
      }
    }
    if (!target) {
      this.message = `No open tile next to the well at ${well.x},${well.y} — clear space nearby.`;
      return false;
    }

    this.player.cash -= GAS_LINE_COST;
    this.player.opexToday += GAS_LINE_COST;
    this.ledger.push(
      this.market.day,
      "capex",
      `Gas line ${target.x},${target.y}`,
      -GAS_LINE_COST,
    );
    this.buildings.push({
      id: uid("gl"),
      kind: "gas_line",
      x: target.x,
      y: target.y,
      oil: 0,
      oilCap: 0,
      crude: 0,
      crudeCap: 0,
      clean: 0,
      cleanCap: 0,
      wellId: well.id,
      online: true,
      hp: 100,
    });
    // Cap the flare on this well and any others within reach of the takeaway.
    for (const b of this.buildings) {
      if (b.kind !== "gas_flare") continue;
      if (
        b.wellId === well.id ||
        Math.abs(b.x - target.x) + Math.abs(b.y - target.y) <= 2
      ) {
        b.online = false;
      }
    }
    this.message = `Gas takeaway online at ${target.x},${target.y} — flare off, gas selling.`;
    return true;
  }

  buyTruck(cap: number = TRUCK_CAP_BBL, cost: number = EXTRA_TRUCK_COST): boolean {
    if (this.player.cash < cost) {
      this.message = `Truck costs $${cost.toLocaleString()}.`;
      return false;
    }
    const batt = this.buildings.find((b) => b.kind === "battery")!;
    this.player.cash -= cost;
    this.player.opexToday += cost;
    this.ledger.push(this.market.day, "capex", `Truck (${cap} bbl)`, -cost);
    this.units.push({
      id: uid("trk"),
      kind: "truck",
      x: batt.x,
      y: batt.y,
      path: [],
      cargo: 0,
      cargoCap: cap,
      cargoKind: "none",
      busy: false,
      targetWellId: null,
      targetBuildingId: null,
      job: "idle",
      tier: 0,
    });
    this.message = `${cap} bbl truck added.`;
    return true;
  }

  upgradeRig(): boolean {
    const rig = this.selectedRig();
    if (!rig) return false;
    if (this.player.cash < UPGRADE_RIG_COST) {
      this.message = `Upgrade costs $${UPGRADE_RIG_COST.toLocaleString()}.`;
      return false;
    }
    if (rig.tier >= 3) {
      this.message = "Max rig tier.";
      return false;
    }
    this.player.cash -= UPGRADE_RIG_COST;
    this.player.opexToday += UPGRADE_RIG_COST;
    this.ledger.push(this.market.day, "capex", `Rig upgrade → T${rig.tier + 1}`, -UPGRADE_RIG_COST);
    rig.tier += 1;
    this.player.drillTech = Math.max(this.player.drillTech, rig.tier);
    this.message = `Rig tier ${rig.tier}.`;
    return true;
  }

  buyPermit(): boolean {
    if (this.player.reputation < MIN_REP_FOR_SPECIAL_PERMIT) {
      this.message = `Need rep ≥ ${MIN_REP_FOR_SPECIAL_PERMIT} for permits.`;
      return false;
    }
    if (this.player.cash < PERMIT_COST) {
      this.message = `Permit costs $${PERMIT_COST.toLocaleString()}.`;
      return false;
    }
    this.player.cash -= PERMIT_COST;
    this.player.opexToday += PERMIT_COST;
    this.ledger.push(this.market.day, "opex", "Special-area permit", -PERMIT_COST);
    this.player.permits += 1;
    this.message = `Permit acquired (${this.player.permits} on hand).`;
    return true;
  }

  payDebt(amount = 250_000) {
    const before = this.player.credit.debt;
    this.message = tryPayDebt(this.player, Math.min(amount, this.player.cash));
    const paid = before - this.player.credit.debt;
    if (paid > 0) this.ledger.push(this.market.day, "debt_pay", "Principal payment", -paid);
  }

  drawCredit(amount = 250_000) {
    const before = this.player.cash;
    this.message = tryDrawCredit(this.player, amount);
    const drew = this.player.cash - before;
    if (drew > 0) this.ledger.push(this.market.day, "draw", "Facility draw", drew);
  }

  clickTile(x: number, y: number) {
    if (this.tool === "move_rig") {
      this.sendRigTo(x, y);
      return;
    }
    if (this.tool === "drill") {
      this.startDrill();
      return;
    }
    if (this.tool === "road") {
      this.layRoad(x, y);
      return;
    }
    if (this.tool === "oil_pipe") {
      this.layPipe(x, y, "oil");
      return;
    }
    if (this.tool === "gas_pipe") {
      this.layPipe(x, y, "gas");
      return;
    }
    if (this.tool === "gas_plant") {
      this.placeGasPlant(x, y);
      return;
    }
    if (this.tool === "battery") {
      this.placeBattery(x, y);
      return;
    }
    if (this.tool === "refinery") {
      this.placeRefinery(x, y);
      return;
    }
    if (this.tool === "add_tank") {
      this.addTank(x, y);
      return;
    }
    if (this.tool === "sell") {
      this.sellAt(x, y);
      return;
    }
    if (this.tool === "choke") {
      this.toggleChoke(x, y);
      return;
    }
    if (this.tool === "explore") {
      this.buyExploration(x, y);
      return;
    }
    if (this.tool === "gas_line") {
      this.placeGasLine(x, y);
      return;
    }
    if (this.tool === "upgrade_rig") {
      this.upgradeRig();
      return;
    }
    if (this.tool === "truck") {
      this.buyTruck();
      return;
    }
    if (this.tool === "pay_debt") {
      this.payDebt();
      return;
    }
    if (this.tool === "draw_credit") {
      this.drawCredit();
      return;
    }
    if (this.tool === "buy_permit") {
      this.buyPermit();
      return;
    }

    this.message = this.inspectAt(x, y);
  }

  /** Hover / right-click / select inspect text */
  inspectAt(x: number, y: number): string {
    if (x < 0 || y < 0 || x >= this.config.cols || y >= this.config.rows) {
      return "";
    }

    const unit = this.units.find(
      (u) => Math.round(u.x) === x && Math.round(u.y) === y,
    );
    if (unit) {
      this.selectedUnitId = unit.id;
      if (unit.kind === "drill_rig") {
        const drilling = this.wells.find(
          (w) => w.status === "drilling" && unit.targetWellId === w.id,
        );
        if (drilling || unit.busy) {
          const w = drilling ?? this.wells.find((x) => x.id === unit.targetWellId);
          const pct = w
            ? Math.min(100, (w.drillProgress / w.drillDaysNeeded) * 100)
            : 0;
          return `Drill rig T${unit.tier} · SPUDDING ${pct.toFixed(0)}%`;
        }
        return `Drill rig T${unit.tier} · idle — Move rig, then Drill.`;
      }
      return `Truck · ${unit.cargoKind} ${unit.cargo.toFixed(0)}/${unit.cargoCap} · ${unit.job}`;
    }

    const well = this.wellAt(x, y);
    if (well) {
      if (well.status === "drilling") {
        const pct = Math.min(100, (well.drillProgress / well.drillDaysNeeded) * 100);
        return `Drilling… ${pct.toFixed(0)}% complete`;
      }
      if (well.status === "duster") return "Dry hole (duster). No production.";
      if (well.status === "shut_in") return "Well shut-in — declined out.";
      if (well.choked) {
        return `Well CHOKED (shut in) · ${well.oilRate.toFixed(1)} bopd held back · Choke tool to resume`;
      }
      const tank = well.wellheadTankId
        ? this.buildings.find((b) => b.id === well.wellheadTankId)
        : undefined;
      const tankLine = tank
        ? `Wellhead tank ${tank.oil.toFixed(1)}/${tank.oilCap} bbl`
        : "No tank (bug)";
      return `Producing well · ${well.oilRate.toFixed(1)} bopd · ${well.gasRate.toFixed(1)} mcf/d · ${tankLine}`;
    }

    const b = this.buildingAt(x, y);
    if (b) {
      if (b.kind === "wellhead_tank") {
        const fill = b.oilCap ? ((b.oil / b.oilCap) * 100).toFixed(0) : "0";
        return `Wellhead crude · ${b.oil.toFixed(1)}/${b.oilCap} bbl (${fill}%) → truck → battery`;
      }
      if (b.kind === "battery") {
        return `Battery · crude ${b.crude.toFixed(0)}/${b.crudeCap} · clean ${b.clean.toFixed(0)}/${b.cleanCap} (treat→refinery)`;
      }
      if (b.kind === "refinery") {
        return `Refinery · clean sales ${b.throughputUsed?.toFixed(0) ?? 0}/${b.throughputCap} bbl today @ $${this.market.oilPrice.toFixed(2)}`;
      }
      if (b.kind === "pumpjack") {
        const w = this.wells.find((w) => w.id === b.wellId);
        if (w && w.status === "producing") {
          return `Pumpjack online · ${w.oilRate.toFixed(1)} bopd flowing to wellhead tank`;
        }
        return "Pumpjack";
      }
      if (b.kind === "gas_line") return "Gas takeaway — sells raw gas, flare off nearby";
      if (b.kind === "gas_plant") {
        return "Gas plant · premium buyer — run gas pipe from wells to sell here";
      }
      return b.kind;
    }

    const tile = this.tiles[y][x];
    const bits: string[] = [];
    if (tile.isPad) bits.push("company pad");
    if (tile.hasRoad) bits.push(isBridgeTerrain(tile.terrain) ? "bridge" : "road");
    if (tile.oilPipe) bits.push("oil pipe");
    if (tile.gasPipe) bits.push("gas pipe");
    if (!isOpen(tile.terrain) && !tile.hasRoad) bits.push(terrainLabel(tile.terrain));
    if (tile.surveyed) {
      const g = prospectGrade(tile.subsurface.prospect);
      const pct = hitChancePercent(tile.subsurface.prospect, true);
      bits.push(`${prospectLabel(g)} · ~${pct}% hit`);
      bits.push(`zone ${tile.subsurface.zone}`);
      const rig = this.selectedRig();
      const tier = rig?.tier ?? 0;
      if (tile.subsurface.zone > tier) {
        bits.push(`needs rig T${tile.subsurface.zone}+`);
      } else if (g === "good" || g === "sweet") {
        bits.push("T0 drill target");
      } else if (g === "barren" || g === "lean") {
        bits.push("skip — likely duster");
      }
      if (tile.subsurface.special) bits.push("SPECIAL (permit)");
    } else {
      bits.push("unexplored wildcat — pay Explore for 3×3 odds");
    }
    return bits.join(" · ") + ` · ${x},${y}`;
  }

  private moveUnits(dtHours: number) {
    const mul = weatherMoveMul(this.weather);
    const speed = 3.2 * mul;

    for (const u of this.units) {
      if (!u.path.length) {
        u.x = Math.round(u.x);
        u.y = Math.round(u.y);
        continue;
      }
      const next = u.path[0];
      const dx = next.x - u.x;
      const dy = next.y - u.y;
      const dist = Math.hypot(dx, dy) || 1;
      const step = speed * dtHours;
      if (step >= dist) {
        u.x = next.x;
        u.y = next.y;
        u.path.shift();
      } else {
        u.x += (dx / dist) * step;
        u.y += (dy / dist) * step;
      }
    }
  }

  private updateDrilling(dtDays: number) {
    const dmul = weatherDrillMul(this.weather);
    for (const well of this.wells) {
      if (well.status !== "drilling") continue;
      well.drillProgress += dtDays * dmul;
      if (well.drillProgress >= well.drillDaysNeeded) {
        const rig = this.units.find((u) => u.targetWellId === well.id);
        if (rig) this.completeWell(well, rig);
        else well.status = "duster";
      }
    }
  }

  private roadPath(
    unit: Unit,
    to: { x: number; y: number },
  ): { x: number; y: number }[] {
    return findPath(
      this.tiles,
      this.blockedSet(unit.id),
      { x: Math.round(unit.x), y: Math.round(unit.y) },
      to,
      "road",
      this.truckPassable,
    );
  }

  private updateTrucks() {
    const batteries = this.buildings.filter((b) => b.kind === "battery");
    const refineries = this.buildings.filter((b) => b.kind === "refinery");
    if (!batteries.length || !refineries.length) return;

    if (Math.floor(this.market.day) !== this.throughputDay) {
      this.throughputDay = Math.floor(this.market.day);
      for (const r of refineries) r.throughputUsed = 0;
    }

    const at = (u: Unit, x: number, y: number) =>
      Math.round(u.x) === x && Math.round(u.y) === y;
    // Multi-tile buildings: a truck "arrives" on any footprint tile.
    const atBldg = (u: Unit, b: Building) =>
      this.occupies(b, Math.round(u.x), Math.round(u.y));
    const refineryAt = (u: Unit) => refineries.find((r) => atBldg(u, r));
    const batteryAt = (u: Unit) => batteries.find((b) => atBldg(u, b));

    const assignPath = (truck: Unit, x: number, y: number): boolean => {
      if (at(truck, x, y)) return true;
      const path = this.roadPath(truck, { x, y });
      if (!path.length) {
        this.linkToRoadNetwork(x, y);
        const retry = this.roadPath(truck, { x, y });
        if (!retry.length) return false;
        truck.path = retry;
      } else {
        truck.path = path;
      }
      truck.busy = true;
      return true;
    };

    // Route to the nearest reachable target; try the next if one is unreachable.
    const gotoBuilding = (truck: Unit, targets: Building[]): Building | undefined => {
      const sorted = targets
        .slice()
        .sort(
          (a, b) =>
            Math.abs(a.x - truck.x) + Math.abs(a.y - truck.y) -
            (Math.abs(b.x - truck.x) + Math.abs(b.y - truck.y)),
        );
      for (const t of sorted) {
        if (atBldg(truck, t)) return t;
        if (assignPath(truck, t.x, t.y)) return t;
      }
      return undefined;
    };

    // Full-load discipline: a truck only picks a wellhead once it can nearly
    // fill. BUT a tank whose well has stopped filling (shut-in / choked / gone)
    // is hauled on any residual, so end-of-life crude is never stranded.
    // Crude-piped tanks are left to the pipe unless they climb past 0.7.
    const crudeReady = (t: Building, cap: number) =>
      t.oil >= Math.min(cap, Math.max(1, t.oilCap)) * CRUDE_LOAD_READY_FRAC;
    const tankStillFilling = (t: Building) => {
      const w = t.wellId ? this.wells.find((x) => x.id === t.wellId) : undefined;
      return !!w && w.status === "producing" && !w.choked;
    };
    const haulReady = (t: Building, cap: number) =>
      t.oil >= 2 && (crudeReady(t, cap) || !tankStillFilling(t));
    const readyWellheads = (cap: number) =>
      this.buildings
        .filter(
          (b) =>
            b.kind === "wellhead_tank" &&
            b.online &&
            haulReady(b, cap) &&
            (!this.crudeTankLinks.has(b.id) || b.oil / Math.max(1, b.oilCap) >= 0.7),
        )
        .sort((a, b) => b.oil / Math.max(1, b.oilCap) - a.oil / Math.max(1, a.oilCap));

    const battWithCrudeRoom = () => batteries.filter((b) => b.crude < b.crudeCap - 1);
    const refWithRoom = () =>
      refineries.filter((r) => (r.throughputCap ?? 0) - (r.throughputUsed ?? 0) > 0.5);
    // A battery worth a clean run: a half-truckload, ~40% full, or draining the
    // last clean once crude is gone. Loose enough that clean never gets stuck.
    const cleanLoadable = (b: Building, cap: number) =>
      b.clean >= Math.min(cap * 0.5, b.cleanCap * 0.4) ||
      (b.clean >= 5 && b.crude < CLEAN_DRAIN_MIN_BBL);
    const byCleanFrac = (a: Building, b: Building) =>
      b.clean / Math.max(1, b.cleanCap) - a.clean / Math.max(1, a.cleanCap);

    for (const truck of this.units.filter((u) => u.kind === "truck")) {
      if (truck.path.length) continue;

      // --- Sell clean at the refinery we're standing on ---
      const refHere =
        truck.cargoKind === "clean" && truck.cargo > 0 ? refineryAt(truck) : undefined;
      if (refHere) {
        const room = Math.max(
          0,
          (refHere.throughputCap ?? 9999) - (refHere.throughputUsed ?? 0),
        );
        if (room <= 0) {
          const others = refWithRoom();
          if (others.length) {
            truck.job = "to_refinery";
            gotoBuilding(truck, others);
            continue;
          }
          this.message = "Refinery slots full today — truck waiting with clean oil.";
          truck.job = "to_refinery";
          continue;
        }
        const sold = Math.min(truck.cargo, room);
        const revenue = sold * this.market.oilPrice;
        this.player.cash += revenue;
        this.player.revenueToday += revenue;
        this.totalOilSold += sold;
        refHere.throughputUsed = (refHere.throughputUsed ?? 0) + sold;
        truck.cargo -= sold;
        if (truck.cargo < 0.5) {
          truck.cargo = 0;
          truck.cargoKind = "none";
          truck.job = "idle";
          truck.busy = false;
          truck.targetBuildingId = null;
        }
        this.message = `Sold ${sold.toFixed(0)} bbl clean @ $${this.market.oilPrice.toFixed(2)} → $${revenue.toFixed(0)}.`;
        this.ledger.push(
          this.market.day,
          "revenue",
          `Clean oil ticket ${sold.toFixed(0)} bbl`,
          revenue,
        );
        // fall through to assign next job same tick
      }

      // --- Unload crude at the battery we're standing on ---
      const batHere =
        truck.cargoKind === "crude" && truck.cargo > 0 ? batteryAt(truck) : undefined;
      if (batHere) {
        const room = Math.max(0, batHere.crudeCap - batHere.crude);
        const into = Math.min(truck.cargo, room);
        batHere.crude += into;
        truck.cargo -= into;
        if (truck.cargo < 0.5) {
          truck.cargo = 0;
          truck.cargoKind = "none";
          truck.job = "idle";
          truck.busy = false;
          this.message = `Crude delivered · battery crude ${batHere.crude.toFixed(0)} bbl.`;
        } else {
          const others = battWithCrudeRoom();
          if (others.length) {
            truck.job = "to_battery";
            gotoBuilding(truck, others);
            continue;
          }
          this.message = "Batteries crude full — treat/haul clean to free space.";
          truck.job = "idle";
        }
      }

      // --- Load clean at the battery we're standing on (unless crude-only) ---
      const batLoad =
        truck.cargo < 1 && truck.cargoMode !== "crude" ? batteryAt(truck) : undefined;
      if (batLoad && cleanLoadable(batLoad, truck.cargoCap)) {
        const load = Math.min(truck.cargoCap, batLoad.clean);
        batLoad.clean -= load;
        truck.cargo = load;
        truck.cargoKind = "clean";
        truck.job = "to_refinery";
        truck.targetBuildingId =
          (this.nearestOf(
            "refinery",
            batLoad.x,
            batLoad.y,
            (r) => (r.throughputCap ?? 0) - (r.throughputUsed ?? 0) > 0.5,
          ) ?? this.nearestOf("refinery", batLoad.x, batLoad.y))?.id ?? null;
        this.message = `Loaded ${load.toFixed(0)} bbl clean → refinery.`;
      }

      // --- Load crude at the wellhead we're standing on (unless clean-only,
      //     and only if a battery can take it — never get stuck holding crude) ---
      if (
        truck.cargo < 1 &&
        truck.cargoMode !== "clean" &&
        battWithCrudeRoom().length > 0
      ) {
        const tank = this.buildings.find(
          (b) =>
            b.kind === "wellhead_tank" && at(truck, b.x, b.y) && haulReady(b, truck.cargoCap),
        );
        if (tank) {
          const load = Math.min(truck.cargoCap, tank.oil);
          tank.oil -= load;
          truck.cargo = load;
          truck.cargoKind = "crude";
          truck.job = "to_battery";
          truck.targetBuildingId =
            (this.nearestOf(
              "battery",
              tank.x,
              tank.y,
              (b) => b.crude < b.crudeCap - 1,
            ) ?? this.nearestOf("battery", tank.x, tank.y))?.id ?? null;
          this.message = `Loaded ${load.toFixed(0)} bbl crude → battery.`;
        }
      }

      // --- Move while carrying ---
      if (truck.cargo > 0 && truck.cargoKind === "crude") {
        truck.job = "to_battery";
        const targets = battWithCrudeRoom();
        if (!gotoBuilding(truck, targets.length ? targets : batteries)) {
          this.message = "No road for crude haul to a battery.";
        }
        continue;
      }
      if (truck.cargo > 0 && truck.cargoKind === "clean") {
        truck.job = "to_refinery";
        const targets = refWithRoom();
        if (!gotoBuilding(truck, targets.length ? targets : refineries)) {
          this.message = "No road for clean haul to a refinery.";
        }
        continue;
      }

      // --- Empty truck: serve the BIGGEST NEED (crude vs clean), honoring the
      //     truck's duty assignment. Clean ties win so treating never stalls. ---
      const wantCrude = truck.cargoMode !== "clean";
      const wantClean = truck.cargoMode !== "crude";
      const readyTanks = wantCrude ? readyWellheads(truck.cargoCap) : [];
      const crudeFeasible = readyTanks.length > 0 && battWithCrudeRoom().length > 0;
      const cleanCandidates = (
        wantClean ? batteries.filter((b) => cleanLoadable(b, truck.cargoCap)) : []
      )
        .slice()
        .sort(byCleanFrac);
      const cleanFeasible = cleanCandidates.length > 0 && refWithRoom().length > 0;

      const tank = readyTanks[0];
      const tankFrac = tank ? tank.oil / Math.max(1, tank.oilCap) : 0;
      const cleanFrac = cleanCandidates[0]
        ? cleanCandidates[0].clean / Math.max(1, cleanCandidates[0].cleanCap)
        : 0;
      const goClean = cleanFeasible && (!crudeFeasible || cleanFrac >= tankFrac);

      if (!goClean && crudeFeasible && tank) {
        // Fullest reachable ready wellhead so an unreachable tank can't stall us.
        let chosen: Building | undefined;
        for (const t of readyTanks) {
          if (at(truck, t.x, t.y)) {
            chosen = t;
            break;
          }
          if (assignPath(truck, t.x, t.y)) {
            chosen = t;
            break;
          }
        }
        if (chosen) {
          truck.job = "to_pickup";
          truck.targetBuildingId = chosen.id;
          this.strandedDays.delete(chosen.id);
          if (!at(truck, chosen.x, chosen.y)) this.message = "Truck to wellhead for crude.";
          continue;
        }
        this.linkToRoadNetwork(tank.x, tank.y);
        if (!assignPath(truck, tank.x, tank.y)) {
          const days = (this.strandedDays.get(tank.id) ?? 0) + 0.02;
          this.strandedDays.set(tank.id, days);
          if (days >= 0.5) {
            this.message = this.diagnoseHaulBlock(truck, tank.x, tank.y);
            this.guide = `STRANDED WELLHEAD (${tank.x},${tank.y}): ${this.message}`;
          }
        } else {
          truck.job = "to_pickup";
          truck.targetBuildingId = tank.id;
          this.strandedDays.delete(tank.id);
          continue;
        }
        // fall through to clean if crude is unreachable
      }

      if (cleanFeasible) {
        truck.job = "to_battery";
        let chosen: Building | undefined;
        for (const b of cleanCandidates) {
          if (atBldg(truck, b)) {
            chosen = b;
            break;
          }
          if (assignPath(truck, b.x, b.y)) {
            chosen = b;
            break;
          }
        }
        if (!chosen) this.message = "No road to a battery for clean pickup.";
        continue;
      }

      const park = this.nearestOf("battery", Math.round(truck.x), Math.round(truck.y));
      if (park && !atBldg(truck, park)) assignPath(truck, park.x, park.y);
      truck.job = "idle";
      truck.busy = false;
    }
  }

  /** Treat crude → clean at the battery */
  private treatBattery(dtDays: number) {
    for (const b of this.buildings) {
      if (b.kind !== "battery" || !b.online) continue;
      const room = Math.max(0, b.cleanCap - b.clean);
      const turn = Math.min(b.crude, room, BATTERY_TREAT_BBL_PER_DAY * dtDays);
      b.crude -= turn;
      b.clean += turn;
    }
  }

  /** Tile (x,y) is on or cardinally adjacent to building b's footprint. */
  private touchesFootprint(x: number, y: number, b: Building): boolean {
    if (this.occupies(b, x, y)) return true;
    return (
      this.occupies(b, x + 1, y) ||
      this.occupies(b, x - 1, y) ||
      this.occupies(b, x, y + 1) ||
      this.occupies(b, x, y - 1)
    );
  }

  /**
   * Flood the pipe networks once per tick:
   *  - oil: for each battery, which refineries + wellhead tanks share its
   *    oilPipe network (clean flows battery→ref, crude flows tank→battery).
   *  - gas: which gasPipe tiles are reachable from a gas plant.
   */
  private recomputePipes() {
    const key = (x: number, y: number) => `${x},${y}`;
    const cols = this.config.cols;
    const rows = this.config.rows;

    this.oilConnected = false;
    this.oilBatteryLinks.clear();
    this.crudeTankLinks.clear();
    const batteries = this.buildings.filter((b) => b.kind === "battery");
    const refineries = this.buildings.filter((b) => b.kind === "refinery");
    const tanks = this.buildings.filter(
      (b) => b.kind === "wellhead_tank" && b.online,
    );

    // Collect pipe tiles once (not per battery); early-out when there are none.
    const oilPipeTiles: { x: number; y: number }[] = [];
    const gasPipeTiles: { x: number; y: number }[] = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const t = this.tiles[y][x];
        if (t.oilPipe) oilPipeTiles.push({ x, y });
        if (t.gasPipe) gasPipeTiles.push({ x, y });
      }
    }

    if (oilPipeTiles.length && batteries.length) {
      for (const battery of batteries) {
        const seen = new Set<string>();
        const q: { x: number; y: number }[] = [];
        for (const p of oilPipeTiles) {
          if (this.touchesFootprint(p.x, p.y, battery)) {
            const k = key(p.x, p.y);
            if (!seen.has(k)) {
              seen.add(k);
              q.push(p);
            }
          }
        }
        const reachedRefs = new Set<string>();
        for (let head = 0; head < q.length; head++) {
          const c = q[head];
          for (const r of refineries) {
            if (this.touchesFootprint(c.x, c.y, r)) reachedRefs.add(r.id);
          }
          for (const t of tanks) {
            if (this.touchesFootprint(c.x, c.y, t)) {
              const links = this.crudeTankLinks.get(t.id) ?? [];
              if (!links.includes(battery.id)) links.push(battery.id);
              this.crudeTankLinks.set(t.id, links);
            }
          }
          for (const [dx, dy] of DIRS4) {
            const nx = c.x + dx;
            const ny = c.y + dy;
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
            const k = key(nx, ny);
            if (seen.has(k) || !this.tiles[ny][nx].oilPipe) continue;
            seen.add(k);
            q.push({ x: nx, y: ny });
          }
        }
        if (reachedRefs.size) {
          this.oilBatteryLinks.set(battery.id, [...reachedRefs]);
          this.oilConnected = true;
        }
      }
    }

    this.gasConnectedTiles.clear();
    const plants = this.buildings.filter((b) => b.kind === "gas_plant");
    if (gasPipeTiles.length && plants.length) {
      const q: { x: number; y: number }[] = [];
      for (const p of gasPipeTiles) {
        if (plants.some((pl) => this.touchesFootprint(p.x, p.y, pl))) {
          const k = key(p.x, p.y);
          if (!this.gasConnectedTiles.has(k)) {
            this.gasConnectedTiles.add(k);
            q.push(p);
          }
        }
      }
      for (let head = 0; head < q.length; head++) {
        const c = q[head];
        for (const [dx, dy] of DIRS4) {
          const nx = c.x + dx;
          const ny = c.y + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const k = key(nx, ny);
          if (this.gasConnectedTiles.has(k) || !this.tiles[ny][nx].gasPipe) continue;
          this.gasConnectedTiles.add(k);
          q.push({ x: nx, y: ny });
        }
      }
    }
  }

  /** A well sells to a gas plant if a plant-connected gas-pipe tile touches it. */
  gasSinkForWell(well: Well): boolean {
    if (!this.gasConnectedTiles.size) return false;
    const key = (x: number, y: number) => `${x},${y}`;
    if (this.gasConnectedTiles.has(key(well.x, well.y))) return true;
    for (const [dx, dy] of DIRS4) {
      if (this.gasConnectedTiles.has(key(well.x + dx, well.y + dy))) return true;
    }
    return false;
  }

  /** Auto-flow clean oil battery → refinery over pipe (slot-capped, no trucks). */
  private flowOilPipe(dtDays: number) {
    if (!this.oilBatteryLinks.size) return;
    for (const [batId, refIds] of this.oilBatteryLinks) {
      const battery = this.buildings.find((b) => b.id === batId);
      if (!battery) continue;
      let budget = OIL_PIPE_FLOW_BPD * dtDays;
      for (const refId of refIds) {
        if (budget <= 0.01 || battery.clean <= 0.01) break;
        const refinery = this.buildings.find((b) => b.id === refId);
        if (!refinery) continue;
        const room = Math.max(
          0,
          (refinery.throughputCap ?? 0) - (refinery.throughputUsed ?? 0),
        );
        const flow = Math.min(battery.clean, room, budget);
        if (flow <= 0.01) continue;
        const revenue = flow * this.market.oilPrice;
        battery.clean -= flow;
        refinery.throughputUsed = (refinery.throughputUsed ?? 0) + flow;
        budget -= flow;
        this.player.cash += revenue;
        this.player.revenueToday += revenue;
        this.totalOilSold += flow;
        this.pipeOilBucket += revenue;
      }
    }
    if (this.pipeOilBucket >= 1500) {
      this.ledger.push(
        this.market.day,
        "revenue",
        "Pipeline oil sales",
        this.pipeOilBucket,
      );
      this.pipeOilBucket = 0;
    }
  }

  /**
   * Auto-flow crude wellhead tank → nearest connected battery with room.
   * Each battery has one shared pipe-intake budget (CRUDE_PIPE_FLOW_BPD) so
   * total intake does not scale with the number of tanks on its network.
   */
  private flowCrudePipe(dtDays: number) {
    if (!this.crudeTankLinks.size) return;
    const perBattery = CRUDE_PIPE_FLOW_BPD * dtDays;
    const budget = new Map<string, number>(); // batteryId → remaining intake
    // Fullest tanks first so a nearly-overflowing wellhead drains soonest.
    const tanks = [...this.crudeTankLinks.entries()]
      .map(([id]) => this.buildings.find((b) => b.id === id))
      .filter((b): b is Building => !!b && b.kind === "wellhead_tank" && b.online && b.oil > 0.01)
      .sort((a, b) => b.oil / Math.max(1, b.oilCap) - a.oil / Math.max(1, a.oilCap));
    for (const tank of tanks) {
      const batIds = this.crudeTankLinks.get(tank.id) ?? [];
      const battery = batIds
        .map((id) => this.buildings.find((b) => b.id === id))
        .filter(
          (b): b is Building =>
            !!b && b.crude < b.crudeCap - 0.5 && (budget.get(b.id) ?? perBattery) > 0.01,
        )
        .sort(
          (a, b) =>
            Math.abs(a.x - tank.x) + Math.abs(a.y - tank.y) -
            (Math.abs(b.x - tank.x) + Math.abs(b.y - tank.y)),
        )[0];
      if (!battery) continue;
      const rem = budget.get(battery.id) ?? perBattery;
      const room = Math.max(0, battery.crudeCap - battery.crude);
      const flow = Math.min(tank.oil, room, rem);
      if (flow <= 0.01) continue;
      tank.oil -= flow;
      battery.crude += flow;
      budget.set(battery.id, rem - flow);
    }
  }

  private tickLightning(dtHours: number) {
    if (this.weather.kind !== "lightning_cell") return;
    this.lightningAcc += dtHours * this.weather.intensity;
    if (this.lightningAcc < 2.5) return;
    this.lightningAcc = 0;

    const targets = this.buildings.filter(
      (b) =>
        b.kind === "battery" ||
        b.kind === "wellhead_tank" ||
        b.kind === "pumpjack",
    );
    if (!targets.length) return;
    const t = targets[Math.floor(Math.random() * targets.length)];
    t.hp -= 25 + Math.random() * 40;
    if (t.hp <= 0) {
      t.online = false;
      t.hp = 0;
      this.pipesDirty = true;
      this.message = `Lightning knocked out ${t.kind} at ${t.x},${t.y}.`;
    } else if (
      (t.kind === "battery" || t.kind === "wellhead_tank") &&
      Math.random() < 0.35
    ) {
      let loss = 0;
      if (t.kind === "wellhead_tank") {
        loss = Math.min(t.oil, 20 + Math.random() * 40);
        t.oil -= loss;
      } else {
        loss = Math.min(t.crude + t.clean, 20 + Math.random() * 40);
        const fromCrude = Math.min(t.crude, loss);
        t.crude -= fromCrude;
        t.clean -= loss - fromCrude;
      }
      this.totalSpilled += loss;
      this.spills.push({ x: t.x, y: t.y, barrels: loss, age: 0 });
      this.player.reputation = Math.max(0, this.player.reputation - loss * 0.04);
      this.message = `Lightning spill ${loss.toFixed(0)} bbl at ${t.kind}.`;
    } else {
      this.message = `Lightning damaged ${t.kind} (hp ${t.hp.toFixed(0)}).`;
    }
  }

  /**
   * Detect the binding throughput bottleneck and give a specific remedy.
   * The ops chain is serial: trucks → battery treating (480/day) → refinery
   * slot (1200/day). Whichever is smallest vs production backs the chain up.
   * Returns "" when the operation is healthy.
   */
  bottleneckAdvice(): string {
    const batteries = this.buildings.filter((b) => b.kind === "battery");
    if (!batteries.length) return "";
    const producing = this.wells.filter(
      (w) => w.status === "producing" && !w.choked,
    );
    if (!producing.length) return "";
    const prodBopd = producing.reduce((s, w) => s + w.oilRate, 0);
    const trucks = this.units.filter((u) => u.kind === "truck").length;
    const refineries = this.buildings.filter((b) => b.kind === "refinery");
    const slotCap = refineries.reduce((s, b) => s + (b.throughputCap ?? 0), 0);
    const slotUsed = refineries.reduce((s, b) => s + (b.throughputUsed ?? 0), 0);
    const crude = batteries.reduce((s, b) => s + b.crude, 0);
    const crudeCap = batteries.reduce((s, b) => s + b.crudeCap, 0);
    const clean = batteries.reduce((s, b) => s + b.clean, 0);
    const cleanCap = batteries.reduce((s, b) => s + b.cleanCap, 0);
    const treatCeiling = batteries.length * BATTERY_TREAT_BBL_PER_DAY;
    const crudePct = crudeCap ? Math.floor((crude / crudeCap) * 100) : 0;
    const cleanPct = cleanCap ? Math.floor((clean / cleanCap) * 100) : 0;
    const wellheadsHot = this.buildings.filter(
      (b) =>
        b.kind === "wellhead_tank" &&
        b.online &&
        b.oilCap > 0 &&
        b.oil / b.oilCap >= 0.85,
    ).length;

    // Clean backing up stalls treating and locks the whole chain.
    if (cleanPct >= 85) {
      const slotMaxed = slotUsed >= slotCap - 1;
      return slotMaxed
        ? `Clean ${cleanPct}% & refinery slots maxed (${slotCap} bbl/day). Sales are capped — build another refinery, run oil pipe, or slow drilling.`
        : `Clean ${cleanPct}% but refineries still have room — not enough trucks/pipe moving clean to sales. Buy a truck or run oil pipe.`;
    }
    // Crude backing up: treating can't keep pace with production.
    if (crudePct >= 85) {
      return prodBopd > treatCeiling
        ? `Crude ${crudePct}%: treating maxed at ${treatCeiling} bbl/day vs ~${Math.round(prodBopd)} bopd produced. Choke a well or build another battery.`
        : `Crude ${crudePct}% — clean isn't clearing to sales fast enough. Buy a truck or run oil pipe.`;
    }
    // Wellheads overflowing: haul-limited.
    if (wellheadsHot > 0 && trucks < producing.length) {
      return `${wellheadsHot} wellhead tank(s) near full — ${producing.length} wells vs ${trucks} truck(s). Buy a truck, add tanks, or run crude pipe.`;
    }
    // Early warning before anything spills.
    if (prodBopd > treatCeiling * 0.9) {
      return `Near capacity: ~${Math.round(prodBopd)} bopd produced vs ${treatCeiling}/day treating. Add a battery/truck/pipe before drilling more.`;
    }
    return "";
  }

  /** Set a truck's haul duty (auto / crude-only / clean-only). */
  setTruckMode(id: string, mode: "auto" | "crude" | "clean") {
    const t = this.units.find((u) => u.id === id && u.kind === "truck");
    if (!t) return;
    t.cargoMode = mode;
    this.message = `Truck set to ${mode === "auto" ? "auto (crude + clean)" : mode + " only"}.`;
  }

  /** Can any battery reach any refinery over the truck road network? */
  private refineryReachable(): boolean {
    const batteries = this.buildings.filter((b) => b.kind === "battery");
    const refineries = this.buildings.filter((b) => b.kind === "refinery");
    for (const bat of batteries) {
      for (const ref of refineries) {
        const path = findPath(
          this.tiles,
          new Set(),
          { x: bat.x, y: bat.y },
          { x: ref.x, y: ref.y },
          "road",
          this.truckPassable,
        );
        if (path.length || this.occupies(ref, bat.x, bat.y)) return true;
      }
    }
    return false;
  }

  /**
   * Triage the single most urgent bottleneck and give a concrete directive —
   * drives the player to the biggest problem to solve. Returns level + message.
   */
  triage(): { level: "ok" | "warn" | "crit"; msg: string } {
    const batteries = this.buildings.filter((b) => b.kind === "battery");
    if (!batteries.length) {
      return { level: "crit", msg: "No battery on the lease — build one to treat crude." };
    }
    const refineries = this.buildings.filter((b) => b.kind === "refinery");
    const producing = this.wells.filter((w) => w.status === "producing" && !w.choked);
    const trucks = this.units.filter((u) => u.kind === "truck");
    const cleanTrucks = trucks.filter((u) => u.cargoMode !== "crude").length;
    const crude = batteries.reduce((s, b) => s + b.crude, 0);
    const crudeCap = batteries.reduce((s, b) => s + b.crudeCap, 0) || 1;
    const clean = batteries.reduce((s, b) => s + b.clean, 0);
    const cleanCap = batteries.reduce((s, b) => s + b.cleanCap, 0) || 1;
    const crudePct = crude / crudeCap;
    const cleanPct = clean / cleanCap;
    const slotCap = refineries.reduce((s, b) => s + (b.throughputCap ?? 0), 0);
    const slotUsed = refineries.reduce((s, b) => s + (b.throughputUsed ?? 0), 0);
    const treatCeiling = batteries.length * BATTERY_TREAT_BBL_PER_DAY;
    const prodBopd = producing.reduce((s, w) => s + w.oilRate, 0);
    const hotWellheads = this.buildings.filter(
      (b) =>
        b.kind === "wellhead_tank" && b.online && b.oilCap > 0 && b.oil / b.oilCap >= 0.85,
    ).length;

    // Clean backing up stalls the whole chain — highest priority.
    if (cleanPct >= 0.8) {
      if (!refineries.length) {
        return { level: "crit", msg: "Clean tanks full & no refinery — build one, then a road/pipe to it." };
      }
      if (!this.refineryReachable()) {
        return { level: "crit", msg: "Clean full but NO ROAD to a refinery — lay a road (or oil pipe) battery → refinery." };
      }
      if (slotUsed >= slotCap - 1) {
        return { level: "crit", msg: `Clean full & refinery slots maxed (${slotCap}/day) — build another refinery, run oil pipe, or choke wells.` };
      }
      if (cleanTrucks === 0) {
        return { level: "crit", msg: "Clean full but no truck hauls it — right-click a truck → Clean, or buy one." };
      }
      return { level: "crit", msg: "Clean backing up — add a truck (or set one to Clean), or run an oil pipe to sales." };
    }
    if (crudePct >= 0.8) {
      if (prodBopd > treatCeiling) {
        return { level: "crit", msg: `Crude full — treating maxed at ${treatCeiling}/day. Build another battery or choke a well.` };
      }
      return { level: "warn", msg: "Crude backing up — add a truck (or set one to Crude), or run a crude pipe." };
    }
    if (hotWellheads > 0 && trucks.length < producing.length) {
      return { level: "warn", msg: `${hotWellheads} wellhead(s) near full — add a truck, add tanks, or run a crude pipe.` };
    }
    if (!producing.length) {
      return { level: "warn", msg: "No production — Explore a 3×3, then Drill a Good/Sweet tile." };
    }
    if (prodBopd > treatCeiling * 0.9) {
      return { level: "warn", msg: `Near treating capacity (${treatCeiling}/day) — add a battery/truck/pipe before drilling more.` };
    }
    if (this.player.reputation < 45) {
      return { level: "warn", msg: `Reputation ${this.player.reputation.toFixed(0)} — cut flaring (gas line/plant) and spills.` };
    }
    return { level: "ok", msg: "Operations nominal." };
  }

  /** Snapshot for facility dashboard */
  dashboard() {
    const wells = this.wells.filter((w) => w.status === "producing");
    const flowing = wells.filter((w) => !w.choked);
    const oilBopd = flowing.reduce((s, w) => s + w.oilRate, 0);
    const gasMcfd = flowing.reduce((s, w) => s + w.gasRate, 0);
    const batteries = this.buildings.filter((b) => b.kind === "battery");
    const refineries = this.buildings.filter((b) => b.kind === "refinery");
    const trucks = this.units.filter((u) => u.kind === "truck");
    const stranded = [...this.strandedDays.entries()].filter(([, d]) => d >= 0.5);
    const interestDay =
      this.player.credit.debt * (this.player.credit.apr / 365);
    return {
      oilBopd,
      gasMcfd,
      wellCount: wells.length,
      crude: batteries.reduce((s, b) => s + b.crude, 0),
      crudeCap: batteries.reduce((s, b) => s + b.crudeCap, 0),
      clean: batteries.reduce((s, b) => s + b.clean, 0),
      cleanCap: batteries.reduce((s, b) => s + b.cleanCap, 0),
      trucks: trucks.map((t) => ({
        id: t.id,
        job: t.job,
        cargo: t.cargo,
        kind: t.cargoKind,
      })),
      stranded: stranded.length,
      interestPerDay: this.interestEnabled ? interestDay : 0,
      interestOn: this.interestEnabled,
      interestToday: this.player.credit.interestPaidToday,
      revenueToday: this.player.revenueToday,
      opexToday: this.player.opexToday,
      rep: this.player.reputation,
      opsReason: this.opsReason,
      gameOver: this.gameOver,
      gameOverReason: this.gameOverReason,
      ledger: this.ledger.recent(10),
      guide: this.guide,
      advice: this.bottleneckAdvice(),
      triage: this.triage(),
      treatCap: batteries.length * BATTERY_TREAT_BBL_PER_DAY,
      refSlotCap: refineries.reduce((s, b) => s + (b.throughputCap ?? 0), 0),
      refSlotUsed: refineries.reduce((s, b) => s + (b.throughputUsed ?? 0), 0),
      batteries: batteries.length,
      refineries: refineries.length,
      oilPiped: this.oilConnected,
      gasPlants: this.buildings.filter((b) => b.kind === "gas_plant").length,
    };
  }

  recenterHint(): { x: number; y: number } {
    const pad = this.tiles.flatMap((row, y) =>
      row.map((t, x) => (t.isPad ? { x, y } : null)),
    ).find(Boolean);
    return pad ?? { x: this.config.cols / 2, y: this.config.rows / 2 };
  }

  /** Capture all mutable state for localStorage persistence. */
  serialize(): GameSnapshot {
    return {
      tiles: this.tiles,
      wells: this.wells,
      buildings: this.buildings,
      units: this.units,
      player: this.player,
      market: this.market,
      weather: this.weather,
      spills: this.spills,
      tool: this.tool,
      selectedUnitId: this.selectedUnitId,
      message: this.message,
      totalOilSold: this.totalOilSold,
      totalGasSold: this.totalGasSold,
      totalSpilled: this.totalSpilled,
      guide: this.guide,
      gameOver: this.gameOver,
      gameOverReason: this.gameOverReason,
      opsReason: this.opsReason,
      ledger: this.ledger.entries,
      idCounter: nextId,
      priv: {
        acc: this.acc,
        lightningAcc: this.lightningAcc,
        fineAccT: this.fineAcc.t,
        throughputDay: this.throughputDay,
        strandedDays: [...this.strandedDays.entries()],
        repStage: this.repStage,
        interestBucket: this.interestBucket,
      },
    };
  }

  /** Restore state produced by serialize() into this instance. */
  applyState(s: GameSnapshot) {
    this.tiles = s.tiles;
    this.wells = s.wells;
    this.buildings = s.buildings;
    this.units = s.units;
    this.player = s.player;
    this.market = s.market;
    this.weather = s.weather;
    this.spills = s.spills ?? [];
    this.tool = s.tool;
    this.selectedUnitId = s.selectedUnitId;
    this.message = s.message;
    this.totalOilSold = s.totalOilSold;
    this.totalGasSold = s.totalGasSold;
    this.totalSpilled = s.totalSpilled;
    this.guide = s.guide;
    this.gameOver = s.gameOver;
    this.gameOverReason = s.gameOverReason;
    this.opsReason = s.opsReason;
    this.ledger.entries = s.ledger ?? [];
    this.acc = s.priv.acc;
    this.lightningAcc = s.priv.lightningAcc;
    this.fineAcc = { t: s.priv.fineAccT };
    this.throughputDay = s.priv.throughputDay;
    this.strandedDays = new Map(s.priv.strandedDays ?? []);
    this.repStage = s.priv.repStage;
    this.interestBucket = s.priv.interestBucket;
    // Keep the module id counter ahead of any restored ids.
    nextId = Math.max(nextId, s.idCounter ?? 1);
  }

  private tickRepConsequences() {
    const r = this.player.reputation;
    if (r <= 0 && !this.gameOver) {
      this.gameOver = true;
      this.gameOverReason =
        "Reputation hit 0 — regulators shut in the lease. Flaring, spills, and unpaid fines closed you down.";
      this.message = this.gameOverReason;
      this.guide = "GAME OVER — hit Reset Lease to try again.";
      for (const w of this.wells) {
        if (w.status === "producing") w.status = "shut_in";
      }
      return;
    }
    if (r < 25 && this.repStage > 25) {
      this.repStage = 25;
      this.message =
        "CRITICAL REP — shut-in order imminent. Stop flaring (gas lines) and clear stranded tanks.";
      this.guide =
        "REP CRITICAL (<25): build gas lines, fix haul routes, avoid spills — or face shutdown at 0.";
    } else if (r < 45 && this.repStage > 45) {
      this.repStage = 45;
      this.message = "Rep warning — fines active below 45. Flaring and spills are eating you.";
    } else if (r >= 45 && this.repStage < 45) {
      this.repStage = Math.min(72, Math.floor(r));
    }
  }

  update(dtSec: number) {
    if (this.gameOver) return;
    this.acc += dtSec * this.timeScale;
    const step = this.config.tickSeconds;
    while (this.acc >= step) {
      this.acc -= step;
      const stormMul =
        this.weather.kind === "storm" || this.weather.kind === "lightning_cell"
          ? 1 - this.weather.intensity * 0.5
          : 1;
      const dtHours = 0.35 * (this.weather.kind === "clear" ? 1 : 1);
      const dtDays = dtHours / 24;

      rollDayCounters(this.player, this.market.day);
      const interestPerDay =
        (this.player.credit.debt * this.player.credit.apr) / 365;
      this.opsReason = this.player.operatingGreen
        ? `GREEN: yesterday's tickets beat opex+interest.`
        : `RED: daily burn (interest ~$${interestPerDay.toFixed(0)}/day on $${(this.player.credit.debt / 1e6).toFixed(2)}M debt) outruns sales. Haul clean oil.`;

      this.weather = tickWeather(this.weather, dtHours);
      this.market = tickMarket(this.market, dtDays);

      const interest = this.interestEnabled
        ? accrueInterest(this.player, dtDays)
        : 0;
      this.interestBucket += interest;
      if (this.interestBucket >= 500) {
        this.ledger.push(
          this.market.day,
          "interest",
          "Debt interest",
          -this.interestBucket,
        );
        this.interestBucket = 0;
      }
      refreshCreditLimit(this.player, this.assetValue());

      const fineMsg = tickFines(this.player, dtDays, this.fineAcc);
      if (fineMsg) {
        this.message = fineMsg;
        const m = /\$([0-9,]+)/.exec(fineMsg);
        if (m) {
          this.ledger.push(
            this.market.day,
            "fine",
            "Regulatory fine",
            -Number(m[1].replace(/,/g, "")),
          );
        }
      }

      this.tickRepConsequences();
      if (this.gameOver) return;

      // Weather: storms slow trucks; lightning pauses drilling
      this.moveUnits(dtHours * (0.55 + 0.45 * stormMul));
      if (this.weather.kind === "lightning_cell") {
        // Drilling stands down in lightning — authentic field rule
        for (const w of this.wells) {
          if (w.status === "drilling") {
            // no progress this tick
          }
        }
      } else {
        this.updateDrilling(dtDays);
      }

      if (this.pipesDirty) {
        this.recomputePipes();
        this.pipesDirty = false;
      }

      const wxFactor =
        this.weather.kind === "storm" ? 1 - this.weather.intensity * 0.35 : 1;
      const prod = simulateProduction(
        this.wells,
        this.buildings,
        this.player,
        this.market.gasPrice,
        dtDays * wxFactor,
        (well) => this.gasSinkForWell(well),
        GAS_PLANT_PREMIUM,
      );
      this.totalGasSold += prod.gasSold;
      this.totalSpilled += prod.spilled;
      for (const c of prod.cleanups ?? []) {
        this.ledger.push(this.market.day, "cleanup", c.label, -c.amount);
      }
      if (prod.messages[0]) this.message = prod.messages[0];

      this.flowCrudePipe(dtDays);
      this.treatBattery(dtDays);
      this.flowOilPipe(dtDays);
      this.updateTrucks();
      this.tickLightning(dtHours);

      for (const s of this.spills) s.age += dtDays;
      this.spills = this.spills.filter((s) => s.age < 8);
    }
  }
}
