import type {
  Building,
  BuildingKind,
  BuildTool,
  GameConfig,
  MarketState,
  PlayerState,
  Tile,
} from "./types";
import { DEFAULT_CONFIG, BUILD_COSTS, TANK_CAP_BBL } from "./data/economy";
import { generateLease } from "./systems/mapgen";
import { findTruckRackSalesPath, simulateStep } from "./systems/production";
import { sellOil, tickMarket } from "./systems/market";

let nextId = 1;
const uid = () => `b${nextId++}`;

export class Game {
  readonly config: GameConfig;
  tiles: Tile[][];
  buildings: Building[] = [];
  player: PlayerState;
  market: MarketState;
  tool: BuildTool = "select";
  selectedId: string | null = null;
  message = "Place a pumpjack on an oil pad (amber tiles).";
  totalProduced = 0;
  totalSold = 0;
  private acc = 0;

  constructor(config: Partial<GameConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.tiles = generateLease(this.config.cols, this.config.rows);
    this.player = {
      cash: this.config.startingCash,
      name: "Independent",
      epoch: "Upstream — Lease One",
    };
    this.market = {
      spotPrice: 74.2,
      netback: 68.5,
      volatility: 3.2,
      day: 1,
    };
  }

  setTool(tool: BuildTool) {
    this.tool = tool;
    const hints: Record<BuildTool, string> = {
      select: "Inspect tiles and equipment.",
      pumpjack: "Click an oil pad to install a pumpjack.",
      tank: "Place a lease tank on empty ground.",
      pipeline: "Lay flowline on empty tiles between kit.",
      truck_rack: "Place adjacent to a tank for loadout.",
      sell: "Click Sell Load when rack + tank have oil.",
    };
    this.message = hints[tool];
  }

  buildingAt(x: number, y: number): Building | undefined {
    return this.buildings.find((b) => b.x === x && b.y === y);
  }

  canAfford(kind: BuildingKind): boolean {
    return this.player.cash >= BUILD_COSTS[kind].cash;
  }

  tryBuild(x: number, y: number): boolean {
    const { cols, rows } = this.config;
    if (x < 0 || y < 0 || x >= cols || y >= rows) return false;
    if (this.buildingAt(x, y)) {
      this.message = "That spot is occupied.";
      return false;
    }

    const kind = this.tool as BuildingKind;
    if (!(kind in BUILD_COSTS)) return false;
    if (!this.canAfford(kind)) {
      this.message = `Need $${BUILD_COSTS[kind].cash.toLocaleString()} for ${BUILD_COSTS[kind].label}.`;
      return false;
    }

    const tile = this.tiles[y][x];

    if (kind === "pumpjack" && tile.kind !== "oil_pad") {
      this.message = "Pumpjacks only go on oil pads.";
      return false;
    }
    if (kind !== "pumpjack" && tile.kind === "oil_pad") {
      this.message = "Keep the pad clear for the wellhead.";
      return false;
    }
    if (kind === "truck_rack") {
      const nearTank = this.buildings.some(
        (b) => b.kind === "tank" && Math.abs(b.x - x) + Math.abs(b.y - y) === 1,
      );
      if (!nearTank) {
        this.message = "Truck rack must sit next to a tank.";
        return false;
      }
    }

    const storageCap =
      kind === "tank" ? TANK_CAP_BBL : kind === "pumpjack" ? 20 : 0;

    this.player.cash -= BUILD_COSTS[kind].cash;
    this.buildings.push({
      id: uid(),
      kind,
      x,
      y,
      storage: 0,
      storageCap,
      online: true,
      runtimeHours: 0,
    });
    this.message = `Installed ${BUILD_COSTS[kind].label}.`;
    return true;
  }

  trySellLoad(): boolean {
    const path = findTruckRackSalesPath(this.buildings);
    if (!path) {
      this.message = "Need a truck rack touching a tank with oil.";
      return false;
    }
    const load = Math.min(path.tank.storage, 180); // ~truck load
    if (load < 1) {
      this.message = "Tank is empty.";
      return false;
    }
    const { revenue, sold } = sellOil(load, this.market.netback);
    path.tank.storage -= sold;
    this.player.cash += revenue;
    this.totalSold += sold;
    this.message = `Sold ${sold.toFixed(0)} bbl @ $${this.market.netback.toFixed(2)} netback → $${revenue.toFixed(0)}.`;
    return true;
  }

  clickTile(x: number, y: number) {
    if (this.tool === "sell") {
      this.trySellLoad();
      return;
    }
    if (this.tool === "select") {
      const b = this.buildingAt(x, y);
      this.selectedId = b?.id ?? null;
      const tile = this.tiles[y]?.[x];
      if (b) {
        this.message = `${b.kind} · ${b.storage.toFixed(1)} / ${b.storageCap} bbl · ${b.online ? "online" : "offline"}`;
      } else if (tile?.kind === "oil_pad") {
        this.message = `Oil pad · ${tile.oilReserve.toFixed(0)} bbl remaining · quality ${(tile.quality * 100).toFixed(0)}%`;
      } else {
        this.message = `Tile ${x},${y} · ${tile?.kind ?? "void"}`;
      }
      return;
    }
    this.tryBuild(x, y);
  }

  update(dtSec: number) {
    this.acc += dtSec;
    const step = this.config.tickSeconds;
    while (this.acc >= step) {
      this.acc -= step;
      const dtHours = 0.25; // each tick = 15 sim minutes
      const { produced } = simulateStep(this.tiles, this.buildings, dtHours);
      this.totalProduced += produced;
      this.market = tickMarket(this.market, dtHours / 24);
    }
  }
}
