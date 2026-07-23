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
  BATTERY_CLEAN_CAP_BBL,
  BATTERY_CRUDE_CAP_BBL,
  BATTERY_TREAT_BBL_PER_DAY,
  DEFAULT_CONFIG,
  DRILL_COST,
  DRILL_DAYS,
  estimateAssetValue,
  EXPLORE_COST,
  EXTRA_TRUCK_COST,
  FACILITY_APR,
  FACILITY_LIMIT,
  GAS_LINE_COST,
  hitChance,
  hitChancePercent,
  MIN_REP_FOR_SPECIAL_PERMIT,
  PERMIT_COST,
  prospectGrade,
  prospectLabel,
  ROAD_COST,
  rollWellRates,
  STARTER_REFINERY_SLOT_BPD,
  TRUCK_CAP_BBL,
  UPGRADE_RIG_COST,
  WELLHEAD_CAP_BBL,
} from "./data/economy";
import {
  generateWorld,
  refineryAnchor,
  starterBatteryAnchor,
  starterPadAnchor,
} from "./systems/mapgen";
import { findPath } from "./systems/pathfind";
import { simulateProduction } from "./systems/production";
import {
  accrueInterest,
  refreshCreditLimit,
  rollDayCounters,
  tickFines,
  tryDrawCredit,
  tryPayDebt,
} from "./systems/finance";
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
  message =
    "Facility live: build roads pad → battery → refinery, then wildcat the pad.";
  totalOilSold = 0;
  totalGasSold = 0;
  totalSpilled = 0;
  private acc = 0;
  private lightningAcc = 0;
  private fineAcc = { t: 0 };
  private throughputDay = 1;

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
      road: "Lay lease road ($1.2k/tile). Trucks need roads.",
      truck: "Buy another truck.",
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
    const ref = this.buildings.find((b) => b.kind === "refinery");
    let roads = 0;
    for (const row of this.tiles) for (const t of row) if (t.hasRoad) roads++;
    return estimateAssetValue({
      wellsProducing: this.wells.filter((w) => w.status === "producing").length,
      batteries: this.buildings.filter((b) => b.kind === "battery").length,
      trucks: this.units.filter((u) => u.kind === "truck").length,
      roadTiles: roads,
      refinerySlotBpd: ref?.throughputCap ?? 0,
    });
  }

  private truckPassable = (x: number, y: number): boolean => {
    const t = this.tiles[y][x];
    if (t.hasRoad || t.isPad) return true;
    const b = this.buildingAt(x, y);
    return !!b && (b.kind === "battery" || b.kind === "refinery" || b.kind === "wellhead_tank");
  };

  private blockedSet(ignoreUnitId?: string): Set<string> {
    const s = new Set<string>();
    for (const b of this.buildings) {
      if (b.kind === "refinery" || b.kind === "battery" || b.kind === "wellhead_tank") {
        continue;
      }
      if (b.kind === "gas_flare") continue;
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
    return this.buildings.find(
      (b) => b.x === x && b.y === y && b.kind !== "gas_flare",
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

  /** Lay free spur roads from a tile to the nearest existing road (max 12 steps) */
  private linkToRoadNetwork(sx: number, sy: number) {
    this.tiles[sy][sx].hasRoad = true;
    if (this.truckPassable(sx, sy) && this.hasRoadAccess(sx, sy)) return;

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
      if (came.size > 80) break;
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
        if (this.buildingAt(nx, ny)?.kind === "pumpjack") continue;
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

  private hasRoadAccess(x: number, y: number): boolean {
    // Connected via roads to battery or refinery?
    const battery = this.buildings.find((b) => b.kind === "battery");
    if (!battery) return this.tiles[y][x].hasRoad;
    const path = findPath(
      this.tiles,
      new Set(),
      { x, y },
      { x: battery.x, y: battery.y },
      "road",
      this.truckPassable,
    );
    return path.length > 0 || (x === battery.x && y === battery.y);
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
    if (this.player.cash < ROAD_COST) {
      this.message = `Road costs $${ROAD_COST.toLocaleString()}.`;
      return false;
    }
    this.player.cash -= ROAD_COST;
    this.player.opexToday += ROAD_COST;
    tile.hasRoad = true;
    tile.surface = "road";
    this.message = `Road laid at ${x},${y}.`;
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
        if (this.buildingAt(nx, ny)?.kind === "refinery") continue;
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
    this.player.cash -= EXPLORE_COST;
    this.player.opexToday += EXPLORE_COST;
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
    this.message =
      `3×3 survey (${n} tiles): ${counts.sweet} Sweet, ${counts.good} Good, ${counts.fair} Fair, ${counts.lean} Lean, ${counts.barren} Barren. ` +
      (targets > 0
        ? `Drill gold/green — ~90%+ hit with T0 on Good/Sweet.`
        : `No strong targets here — survey elsewhere.`);
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
      this.message = "Within 2 of a producing well.";
      return false;
    }
    this.player.cash -= GAS_LINE_COST;
    this.player.opexToday += GAS_LINE_COST;
    this.buildings.push({
      id: uid("gl"),
      kind: "gas_line",
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
    });
    for (const b of this.buildings) {
      if (
        b.kind === "gas_flare" &&
        Math.abs(b.x - x) + Math.abs(b.y - y) <= 2
      ) {
        b.online = false;
      }
    }
    this.message = "Gas takeaway online.";
    return true;
  }

  buyTruck(): boolean {
    if (this.player.cash < EXTRA_TRUCK_COST) {
      this.message = `Truck costs $${EXTRA_TRUCK_COST.toLocaleString()}.`;
      return false;
    }
    const batt = this.buildings.find((b) => b.kind === "battery")!;
    this.player.cash -= EXTRA_TRUCK_COST;
    this.player.opexToday += EXTRA_TRUCK_COST;
    this.units.push({
      id: uid("trk"),
      kind: "truck",
      x: batt.x,
      y: batt.y,
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
    this.message = "Truck added.";
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
    this.player.permits += 1;
    this.message = `Permit acquired (${this.player.permits} on hand).`;
    return true;
  }

  payDebt(amount = 250_000) {
    this.message = tryPayDebt(this.player, Math.min(amount, this.player.cash));
  }

  drawCredit(amount = 250_000) {
    this.message = tryDrawCredit(this.player, amount);
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
        return `Drill rig tier ${unit.tier}${unit.busy ? " · DRILLING" : " · idle"} — Move rig, then Drill.`;
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
      if (b.kind === "gas_line") return "Gas takeaway — sales on, flare off nearby";
      return b.kind;
    }

    const tile = this.tiles[y][x];
    const bits: string[] = [];
    if (tile.isPad) bits.push("company pad");
    if (tile.hasRoad) bits.push("road");
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
    const battery = this.buildings.find((b) => b.kind === "battery");
    const refinery = this.buildings.find((b) => b.kind === "refinery");
    if (!battery || !refinery) return;

    if (Math.floor(this.market.day) !== this.throughputDay) {
      this.throughputDay = Math.floor(this.market.day);
      refinery.throughputUsed = 0;
    }

    const at = (u: Unit, x: number, y: number) =>
      Math.round(u.x) === x && Math.round(u.y) === y;

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

    const fullestWellhead = () =>
      this.buildings
        .filter((b) => b.kind === "wellhead_tank" && b.online && b.oil >= 2)
        .sort((a, b) => b.oil / Math.max(1, b.oilCap) - a.oil / Math.max(1, a.oilCap))[0];

    for (const truck of this.units.filter((u) => u.kind === "truck")) {
      if (truck.path.length) continue;

      // --- Arrive / act at destination ---

      // Sell clean oil at refinery
      if (truck.cargoKind === "clean" && truck.cargo > 0 && at(truck, refinery.x, refinery.y)) {
        const room = Math.max(
          0,
          (refinery.throughputCap ?? 9999) - (refinery.throughputUsed ?? 0),
        );
        if (room <= 0) {
          this.message = "Refinery slot full today — truck waiting with clean oil.";
          truck.job = "to_refinery";
          continue;
        }
        const sold = Math.min(truck.cargo, room);
        const revenue = sold * this.market.oilPrice;
        this.player.cash += revenue;
        this.player.revenueToday += revenue;
        this.totalOilSold += sold;
        refinery.throughputUsed = (refinery.throughputUsed ?? 0) + sold;
        truck.cargo -= sold;
        if (truck.cargo < 0.5) {
          truck.cargo = 0;
          truck.cargoKind = "none";
          truck.job = "idle";
          truck.busy = false;
          truck.targetBuildingId = null;
        }
        this.message = `Sold ${sold.toFixed(0)} bbl clean @ $${this.market.oilPrice.toFixed(2)} → $${revenue.toFixed(0)}.`;
        // fall through to assign next job same tick
      }

      // Unload crude at battery
      if (truck.cargoKind === "crude" && truck.cargo > 0 && at(truck, battery.x, battery.y)) {
        const room = Math.max(0, battery.crudeCap - battery.crude);
        const into = Math.min(truck.cargo, room);
        battery.crude += into;
        truck.cargo -= into;
        if (truck.cargo < 0.5) {
          truck.cargo = 0;
          truck.cargoKind = "none";
          truck.job = "idle";
          truck.busy = false;
          this.message = `Crude delivered · battery crude ${battery.crude.toFixed(0)} bbl.`;
        } else {
          this.message = "Battery crude full — treating/hauling clean to free space.";
          truck.job = "idle";
        }
      }

      // Load clean at battery for refinery run
      if (
        truck.cargo < 1 &&
        at(truck, battery.x, battery.y) &&
        battery.clean >= 5
      ) {
        // Prefer clearing wellheads if they're near full; else haul clean
        const urgent = fullestWellhead();
        const wellUrgent = urgent && urgent.oil / urgent.oilCap >= 0.7;
        if (!wellUrgent || battery.crude >= battery.crudeCap * 0.9) {
          const load = Math.min(truck.cargoCap, battery.clean);
          battery.clean -= load;
          truck.cargo = load;
          truck.cargoKind = "clean";
          truck.job = "to_refinery";
          truck.targetBuildingId = refinery.id;
          this.message = `Loaded ${load.toFixed(0)} bbl clean → refinery.`;
        }
      }

      // Load crude at wellhead
      if (truck.cargo < 1) {
        const tank = this.buildings.find(
          (b) =>
            b.kind === "wellhead_tank" &&
            at(truck, b.x, b.y) &&
            b.oil >= 2,
        );
        if (tank) {
          const load = Math.min(truck.cargoCap, tank.oil);
          tank.oil -= load;
          truck.cargo = load;
          truck.cargoKind = "crude";
          truck.job = "to_battery";
          truck.targetBuildingId = battery.id;
          this.message = `Loaded ${load.toFixed(0)} bbl crude → battery.`;
        }
      }

      // --- Assign movement while carrying ---
      if (truck.cargo > 0 && truck.cargoKind === "crude") {
        truck.job = "to_battery";
        if (!assignPath(truck, battery.x, battery.y)) {
          this.message = "No road for crude haul to battery.";
        }
        continue;
      }
      if (truck.cargo > 0 && truck.cargoKind === "clean") {
        truck.job = "to_refinery";
        if (!assignPath(truck, refinery.x, refinery.y)) {
          this.message = "No road for clean haul to refinery.";
        }
        continue;
      }

      // --- Empty truck: pick next job (continuous loop) ---
      const tank = fullestWellhead();
      const wellFill = tank ? tank.oil / Math.max(1, tank.oilCap) : 0;
      const canTakeCrude = battery.crude < battery.crudeCap - 1;
      const hasClean = battery.clean >= 5;

      // Keep wellheads from topping out, but keep clean oil moving to refinery
      const preferWellhead =
        !!tank &&
        canTakeCrude &&
        (wellFill >= 0.4 || !hasClean || battery.clean < truck.cargoCap * 0.5);

      if (preferWellhead && tank) {
        truck.job = "to_pickup";
        truck.targetBuildingId = tank.id;
        if (!assignPath(truck, tank.x, tank.y)) {
          this.message = "Truck can't reach wellhead — check roads.";
        } else if (!at(truck, tank.x, tank.y)) {
          this.message = "Truck looping to wellhead for crude.";
        }
        continue;
      }

      if (hasClean) {
        truck.job = "to_battery";
        truck.targetBuildingId = battery.id;
        if (!assignPath(truck, battery.x, battery.y)) {
          this.message = "No road to battery for clean pickup.";
        } else if (!at(truck, battery.x, battery.y)) {
          this.message = "Truck to battery for clean oil.";
        }
        continue;
      }

      if (tank && canTakeCrude) {
        truck.job = "to_pickup";
        truck.targetBuildingId = tank.id;
        assignPath(truck, tank.x, tank.y);
        continue;
      }

      if (!at(truck, battery.x, battery.y)) {
        assignPath(truck, battery.x, battery.y);
      }
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

  update(dtSec: number) {
    this.acc += dtSec;
    const step = this.config.tickSeconds;
    while (this.acc >= step) {
      this.acc -= step;
      const dtHours = 0.35;
      const dtDays = dtHours / 24;

      rollDayCounters(this.player, this.market.day);
      this.weather = tickWeather(this.weather, dtHours);
      this.market = tickMarket(this.market, dtDays);
      accrueInterest(this.player, dtDays);
      refreshCreditLimit(this.player, this.assetValue());

      const fineMsg = tickFines(this.player, dtDays, this.fineAcc);
      if (fineMsg) this.message = fineMsg;

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
      if (prod.messages[0]) this.message = prod.messages[0];

      this.treatBattery(dtDays);
      this.updateTrucks();
      this.tickLightning(dtHours);

      for (const s of this.spills) s.age += dtDays;
      this.spills = this.spills.filter((s) => s.age < 8);
    }
  }
}
