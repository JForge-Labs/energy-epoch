import type {
  Building,
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
  DEFAULT_CONFIG,
  DRILL_COST,
  DRILL_DAYS,
  EXPLORE_COST,
  EXTRA_TRUCK_COST,
  GAS_LINE_COST,
  hitChance,
  rollWellRates,
  TANK_CAP_BBL,
  TRUCK_CAP_BBL,
  UPGRADE_RIG_COST,
} from "./data/economy";
import { generateWorld, refineryAnchor } from "./systems/mapgen";
import { findPath } from "./systems/pathfind";
import { simulateProduction } from "./systems/production";
import {
  tickMarket,
  tickWeather,
  weatherDrillMul,
  weatherMoveMul,
} from "./systems/world";

let nextId = 1;
const uid = (p: string) => `${p}${nextId++}`;

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
  message = "Move the drill rig onto a tile, then Drill. Map is blind — wildcat.";
  totalOilSold = 0;
  totalGasSold = 0;
  totalSpilled = 0;
  private acc = 0;
  private lightningAcc = 0;

  constructor(config: Partial<GameConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.tiles = generateWorld(this.config.cols, this.config.rows);
    this.player = {
      cash: this.config.startingCash,
      reputation: 70,
      name: "Wildcat Co.",
      explorationLevel: 0,
      drillTech: 0,
    };
    this.market = {
      oilPrice: 74,
      gasPrice: 2.8,
      oilVol: 4.5,
      gasVol: 0.35,
      day: 1,
    };
    this.weather = { kind: "clear", intensity: 0, hoursLeft: 24 };

    const ref = refineryAnchor(this.config.cols, this.config.rows);
    this.buildings.push({
      id: uid("ref"),
      kind: "refinery",
      x: ref.x,
      y: ref.y,
      oil: 0,
      oilCap: 0,
      wellId: null,
      online: true,
      hp: 100,
    });

    // Starter drill rig near SW
    this.units.push({
      id: uid("rig"),
      kind: "drill_rig",
      x: 1,
      y: this.config.rows - 3,
      tx: 1,
      ty: this.config.rows - 3,
      path: [],
      cargo: 0,
      cargoCap: 0,
      busy: false,
      targetWellId: null,
      targetTankId: null,
      tier: 0,
    });

    // Starter truck
    this.units.push({
      id: uid("trk"),
      kind: "truck",
      x: 3,
      y: this.config.rows - 2,
      tx: 3,
      ty: this.config.rows - 2,
      path: [],
      cargo: 0,
      cargoCap: TRUCK_CAP_BBL,
      busy: false,
      targetWellId: null,
      targetTankId: null,
      tier: 0,
    });

    this.selectedUnitId = this.units[0].id;
  }

  setTool(tool: BuildTool) {
    this.tool = tool;
    const hints: Record<BuildTool, string> = {
      select: "Inspect wells, tanks, units.",
      move_rig: "Click a ground tile to send the selected drill rig.",
      drill: "Drill under the rig. Costs cash. Can duster or hit.",
      truck: "Idle — trucks auto-haul from full-ish tanks to the refinery.",
      gas_line: "Place gas takeaway near a well (stops flare, sells gas).",
      explore: "Buy a survey pulse — reveals zones in a radius.",
      upgrade_rig: "Upgrade selected rig tier to access deeper zones.",
    };
    this.message = hints[tool];
  }

  private blockedSet(ignoreUnitId?: string): Set<string> {
    const s = new Set<string>();
    for (const b of this.buildings) {
      if (b.kind === "refinery") continue;
      s.add(`${b.x},${b.y}`);
    }
    for (const u of this.units) {
      if (ignoreUnitId && u.id === ignoreUnitId) continue;
      s.add(`${Math.round(u.x)},${Math.round(u.y)}`);
    }
    return s;
  }

  selectedRig(): Unit | undefined {
    const u = this.units.find((x) => x.id === this.selectedUnitId);
    if (u?.kind === "drill_rig") return u;
    return this.units.find((x) => x.kind === "drill_rig");
  }

  buildingAt(x: number, y: number): Building | undefined {
    return this.buildings.find((b) => b.x === x && b.y === y);
  }

  wellAt(x: number, y: number): Well | undefined {
    return this.wells.find((w) => w.x === x && w.y === y);
  }

  /** Slide rig off the hole so the pumpjack / dry marker can own the tile */
  private nudgeRigOffHole(rig: Unit, x: number, y: number) {
    const spot = this.freeNeighbor(x, y);
    if (!spot) return;
    rig.x = spot.x;
    rig.y = spot.y;
    rig.path = [];
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
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= this.config.cols || ny >= this.config.rows) {
        continue;
      }
      if (this.buildingAt(nx, ny)) continue;
      if (this.tiles[ny][nx].drilled) continue;
      return { x: nx, y: ny };
    }
    return null;
  }

  sendRigTo(x: number, y: number): boolean {
    const rig = this.selectedRig();
    if (!rig || rig.busy) {
      this.message = "Rig is busy drilling.";
      return false;
    }
    if (this.buildingAt(x, y) || this.tiles[y][x].drilled) {
      this.message = "Can't park the rig there.";
      return false;
    }
    const from = { x: Math.round(rig.x), y: Math.round(rig.y) };
    const path = findPath(this.tiles, this.blockedSet(rig.id), from, { x, y });
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
    const zone = tile.subsurface.zone;
    if (zone > rig.tier || zone > this.player.drillTech) {
      this.message = `Zone ${zone} needs rig/tech tier ${zone}. Upgrade first.`;
      return false;
    }
    const cost = DRILL_COST[zone];
    if (this.player.cash < cost) {
      this.message = `Need $${cost.toLocaleString()} to drill zone ${zone}.`;
      return false;
    }

    this.player.cash -= cost;
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
      tankId: null,
      pumpjackId: null,
    };
    tile.wellId = well.id;
    this.wells.push(well);
    rig.busy = true;
    rig.targetWellId = well.id;
    this.message = `Spudding well… zone ${zone}, AFE $${cost.toLocaleString()}.`;
    return true;
  }

  private completeWell(well: Well, rig: Unit) {
    const tile = this.tiles[well.y][well.x];
    const prospect = tile.subsurface.prospect;
    const zone = tile.subsurface.zone as ZoneTier;
    const hit = Math.random() < hitChance(prospect);

    rig.busy = false;
    rig.targetWellId = null;
    this.nudgeRigOffHole(rig, well.x, well.y);

    if (!hit) {
      well.status = "duster";
      this.message = `Duster at ${well.x},${well.y}. Dry hole.`;
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
      wellId: well.id,
      online: true,
      hp: 100,
    };
    this.buildings.push(jack);
    well.pumpjackId = jack.id;

    const spot = this.freeNeighbor(well.x, well.y);
    if (spot) {
      const tank: Building = {
        id: uid("tk"),
        kind: "tank",
        x: spot.x,
        y: spot.y,
        oil: 0,
        oilCap: TANK_CAP_BBL,
        wellId: well.id,
        online: true,
        hp: 100,
      };
      this.buildings.push(tank);
      well.tankId = tank.id;
    }

    // Visual flare marker until gas line
    this.buildings.push({
      id: uid("fl"),
      kind: "gas_flare",
      x: well.x,
      y: well.y,
      oil: 0,
      oilCap: 0,
      wellId: well.id,
      online: true,
      hp: 50,
    });

    this.message = `Ripper! ${well.oilRate.toFixed(0)} bopd · ${well.gasRate.toFixed(0)} mcf/d. Pumpjack + tank spotted.`;
  }

  buyExploration(cx: number, cy: number): boolean {
    if (this.player.cash < EXPLORE_COST) {
      this.message = `Exploration survey costs $${EXPLORE_COST.toLocaleString()}.`;
      return false;
    }
    this.player.cash -= EXPLORE_COST;
    this.player.explorationLevel += 1;
    const radius = 3 + Math.min(3, this.player.explorationLevel);
    let n = 0;
    for (let y = 0; y < this.config.rows; y++) {
      for (let x = 0; x < this.config.cols; x++) {
        if (Math.hypot(x - cx, y - cy) <= radius) {
          this.tiles[y][x].surveyed = true;
          n++;
        }
      }
    }
    this.message = `Survey complete — ${n} tiles zoned (still no IP until you drill).`;
    return true;
  }

  placeGasLine(x: number, y: number): boolean {
    if (this.player.cash < GAS_LINE_COST) {
      this.message = `Gas line costs $${GAS_LINE_COST.toLocaleString()}.`;
      return false;
    }
    if (this.buildingAt(x, y)) {
      this.message = "Occupied.";
      return false;
    }
    const nearWell = this.wells.some(
      (w) =>
        w.status === "producing" &&
        Math.abs(w.x - x) + Math.abs(w.y - y) <= 2,
    );
    if (!nearWell) {
      this.message = "Place gas line within 2 tiles of a producing well.";
      return false;
    }
    this.player.cash -= GAS_LINE_COST;
    this.buildings.push({
      id: uid("gl"),
      kind: "gas_line",
      x,
      y,
      oil: 0,
      oilCap: 0,
      wellId: null,
      online: true,
      hp: 100,
    });
    // Disable nearby flare markers
    for (const b of this.buildings) {
      if (
        b.kind === "gas_flare" &&
        Math.abs(b.x - x) + Math.abs(b.y - y) <= 2
      ) {
        b.online = false;
      }
    }
    this.message = "Gas takeaway online — stop flaring, start selling.";
    return true;
  }

  buyTruck(): boolean {
    if (this.player.cash < EXTRA_TRUCK_COST) {
      this.message = `Truck costs $${EXTRA_TRUCK_COST.toLocaleString()}.`;
      return false;
    }
    this.player.cash -= EXTRA_TRUCK_COST;
    this.units.push({
      id: uid("trk"),
      kind: "truck",
      x: 2,
      y: this.config.rows - 2,
      tx: 2,
      ty: this.config.rows - 2,
      path: [],
      cargo: 0,
      cargoCap: TRUCK_CAP_BBL,
      busy: false,
      targetWellId: null,
      targetTankId: null,
      tier: 0,
    });
    this.message = "New truck on the lease road.";
    return true;
  }

  upgradeRig(): boolean {
    const rig = this.selectedRig();
    if (!rig) return false;
    if (this.player.cash < UPGRADE_RIG_COST) {
      this.message = `Rig upgrade costs $${UPGRADE_RIG_COST.toLocaleString()}.`;
      return false;
    }
    if (rig.tier >= 3) {
      this.message = "Rig already at max tier.";
      return false;
    }
    this.player.cash -= UPGRADE_RIG_COST;
    rig.tier += 1;
    this.player.drillTech = Math.max(this.player.drillTech, rig.tier);
    this.message = `Rig upgraded to tier ${rig.tier}. Can punch zone ${rig.tier}.`;
    return true;
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

    // select
    const unit = this.units.find(
      (u) => Math.round(u.x) === x && Math.round(u.y) === y,
    );
    if (unit) {
      this.selectedUnitId = unit.id;
      this.message =
        unit.kind === "drill_rig"
          ? `Drill rig T${unit.tier}${unit.busy ? " (drilling)" : ""}`
          : `Truck · ${unit.cargo.toFixed(0)}/${unit.cargoCap} bbl`;
      return;
    }
    const well = this.wellAt(x, y);
    if (well) {
      this.message = `Well ${well.status} · ${well.oilRate.toFixed(1)} bopd · ${well.gasRate.toFixed(1)} mcf/d · day ${well.ageDays.toFixed(1)}`;
      return;
    }
    const b = this.buildingAt(x, y);
    if (b) {
      this.message =
        b.kind === "tank"
          ? `Tank ${b.oil.toFixed(0)}/${b.oilCap} bbl`
          : `${b.kind}${b.online ? "" : " (offline)"}`;
      return;
    }
    const tile = this.tiles[y][x];
    if (tile.surveyed) {
      this.message = `Survey: zone ${tile.subsurface.zone} (drill to learn rates).`;
    } else {
      this.message = `Unexplored ground ${x},${y}.`;
    }
  }

  private moveUnits(dtHours: number) {
    const mul = weatherMoveMul(this.weather);
    const speed = 2.8 * mul; // tiles per hour

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
        else {
          well.status = "duster";
        }
      }
    }
  }

  private updateTrucks() {
    const ref = this.buildings.find((b) => b.kind === "refinery")!;
    for (const truck of this.units.filter((u) => u.kind === "truck")) {
      if (truck.path.length) continue;

      // Deliver
      if (
        truck.cargo > 0 &&
        Math.round(truck.x) === ref.x &&
        Math.round(truck.y) === ref.y
      ) {
        const revenue = truck.cargo * this.market.oilPrice;
        this.player.cash += revenue;
        this.totalOilSold += truck.cargo;
        this.message = `Ticket: ${truck.cargo.toFixed(0)} bbl @ $${this.market.oilPrice.toFixed(2)} → $${revenue.toFixed(0)}.`;
        truck.cargo = 0;
        truck.busy = false;
        truck.targetTankId = null;
        continue;
      }

      // Haul to refinery
      if (truck.cargo > 0) {
        const path = findPath(
          this.tiles,
          this.blockedSet(truck.id),
          { x: Math.round(truck.x), y: Math.round(truck.y) },
          { x: ref.x, y: ref.y },
        );
        truck.path = path;
        truck.busy = true;
        continue;
      }

      // Find tank needing haul (>= 40% or nearly full)
      const tanks = this.buildings
        .filter((b) => b.kind === "tank" && b.oil >= Math.min(40, b.oilCap * 0.35))
        .sort((a, b) => b.oil / b.oilCap - a.oil / a.oilCap);
      const tank = tanks[0];
      if (!tank) continue;

      if (
        Math.round(truck.x) === tank.x &&
        Math.round(truck.y) === tank.y
      ) {
        const load = Math.min(truck.cargoCap, tank.oil);
        tank.oil -= load;
        truck.cargo = load;
        truck.targetTankId = tank.id;
        continue;
      }

      const path = findPath(
        this.tiles,
        this.blockedSet(truck.id),
        { x: Math.round(truck.x), y: Math.round(truck.y) },
        { x: tank.x, y: tank.y },
      );
      if (path.length) {
        truck.path = path;
        truck.busy = true;
        truck.targetTankId = tank.id;
      }
    }
  }

  private tickLightning(dtHours: number) {
    if (this.weather.kind !== "lightning_cell") return;
    this.lightningAcc += dtHours * this.weather.intensity;
    if (this.lightningAcc < 2.5) return;
    this.lightningAcc = 0;

    const targets = this.buildings.filter(
      (b) => b.kind === "tank" || b.kind === "pumpjack" || b.kind === "gas_flare",
    );
    if (!targets.length) return;
    const t = targets[Math.floor(Math.random() * targets.length)];
    t.hp -= 25 + Math.random() * 40;
    if (t.hp <= 0) {
      t.online = false;
      t.hp = 0;
      this.message = `Lightning knocked out ${t.kind} at ${t.x},${t.y}.`;
    } else if (t.kind === "tank" && Math.random() < 0.35) {
      const loss = Math.min(t.oil, 20 + Math.random() * 40);
      t.oil -= loss;
      this.totalSpilled += loss;
      this.spills.push({ x: t.x, y: t.y, barrels: loss, age: 0 });
      this.player.reputation = Math.max(0, this.player.reputation - loss * 0.04);
      this.message = `Lightning strike → tank fire / spill ${loss.toFixed(0)} bbl.`;
    } else {
      this.message = `Lightning damaged ${t.kind} (hp ${t.hp.toFixed(0)}).`;
    }
  }

  update(dtSec: number) {
    this.acc += dtSec;
    const step = this.config.tickSeconds;
    while (this.acc >= step) {
      this.acc -= step;
      const dtHours = 0.35; // ~21 sim min per tick — snappy prototype
      const dtDays = dtHours / 24;

      this.weather = tickWeather(this.weather, dtHours);
      this.market = tickMarket(this.market, dtDays);
      this.moveUnits(dtHours);
      this.updateDrilling(dtDays);

      const prod = simulateProduction(
        this.wells,
        this.buildings,
        this.player,
        this.market.gasPrice,
        dtDays,
      );
      this.totalGasSold += prod.gasSold;
      this.totalSpilled += prod.spilled;
      if (prod.spilled > 0) {
        for (const w of this.wells) {
          if (!w.tankId) continue;
          const tank = this.buildings.find((b) => b.id === w.tankId);
          if (tank && tank.oil >= tank.oilCap - 0.01) {
            this.spills.push({
              x: tank.x,
              y: tank.y,
              barrels: prod.spilled,
              age: 0,
            });
          }
        }
      }
      if (prod.messages[0]) this.message = prod.messages[0];

      this.updateTrucks();
      this.tickLightning(dtHours);

      for (const s of this.spills) s.age += dtDays;
      this.spills = this.spills.filter((s) => s.age < 8);
    }
  }
}
