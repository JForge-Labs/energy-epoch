/**
 * WebGL renderer (PixiJS v8) — scaffold toward richer graphics.
 *
 * This is an ADDITIVE, opt-in renderer (enable with `?pixi` in the URL). It
 * mirrors the canvas renderer's coordinate model exactly so the existing input
 * hit-testing (canvasToTile) keeps working unchanged:
 *   - the backing store is device-pixels (resolution 1, sized to clientW*dpr),
 *   - 1 tile == config.tileSize world units,
 *   - a `world` container carries the camera pan/zoom transform.
 *
 * Layers are split into Containers so we can later swap Graphics for textured
 * sprites / animated pumpjacks / particle flares without touching the sim.
 * Scaffold limitations (tracked for the enrichment pass): shapes only, no text
 * labels yet, no sprite atlas, redraws immediate-mode each frame.
 */
import { Application, Container, Graphics } from "pixi.js";
import type { Camera } from "./camera";
import type { Game } from "./Game";

const P = {
  ground: 0x243028,
  groundAlt: 0x1f2a24,
  scrub: 0x2a382c,
  water: 0x1e3a4a,
  waterAlt: 0x254a5c,
  waterRipple: 0x96c8dc,
  creek: 0x2f6a7a,
  creekAlt: 0x356f80,
  rock: 0x413d37,
  rockAlt: 0x4a453d,
  rockPeak: 0x5c5648,
  rockShadow: 0x2c2924,
  oilPipe: 0xc07a2e,
  oilPipeCore: 0xe8a24a,
  gasPipe: 0x4aa892,
  gasPipeCore: 0x7fd0bb,
  plant: 0x4a8a7a,
  road: 0x4a5048,
  roadEdge: 0x6a7068,
  pad: 0x3a4538,
  padEdge: 0x6a8058,
  grid: 0x2e3a32,
  rig: 0xd4a017,
  truck: 0x8a9aaa,
  jack: 0xc4a35a,
  tank: 0x8a9aa2,
  battery: 0x5a8a9a,
  flare: 0xe07030,
  gas: 0x5a9e8a,
  refinery: 0x9a6a4a,
  duster: 0x5a5048,
  select: 0xf0c040,
  danger: 0xc45c26,
  crude: 0x1a1008,
  clean: 0xc8b070,
  special: 0xc85078,
  spill: 0x281408,
  storm: 0x283246,
  bg: 0x11150f,
};

/** Prospect fill overlay for a surveyed tile (matches canvas renderer). */
function prospectOverlay(p: number): { c: number; a: number } | null {
  if (p < 0.22) return { c: 0x464844, a: 0.55 };
  if (p < 0.4) return { c: 0x6e643c, a: 0.4 };
  if (p < 0.55) return { c: 0xb49632, a: 0.35 };
  if (p < 0.72) return { c: 0x46a04b, a: 0.45 };
  return { c: 0xe6be28, a: 0.5 };
}

function prospectPip(p: number): number {
  if (p < 0.22) return 0x9a9088;
  if (p < 0.4) return 0xb0a060;
  if (p < 0.55) return 0xd4b030;
  if (p < 0.72) return 0x6dce6a;
  return 0xf0c040;
}

export class PixiRenderer {
  private canvas: HTMLCanvasElement;
  private app: Application | null = null;
  private world = new Container();
  private gTiles = new Graphics();
  private gSpills = new Graphics();
  private gBuildings = new Graphics();
  private gWells = new Graphics();
  private gFlares = new Graphics();
  private gUnits = new Graphics();
  private gHover = new Graphics();
  private gWeather = new Graphics();
  private w = 0;
  private h = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  get ready(): boolean {
    return !!this.app;
  }

  async init(): Promise<void> {
    const parent = this.canvas.parentElement!;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.w = Math.floor(parent.clientWidth * dpr);
    this.h = Math.floor(parent.clientHeight * dpr);

    const app = new Application();
    await app.init({
      canvas: this.canvas,
      width: this.w,
      height: this.h,
      resolution: 1,
      antialias: true,
      background: P.bg,
      autoStart: false,
    });
    this.canvas.style.width = `${parent.clientWidth}px`;
    this.canvas.style.height = `${parent.clientHeight}px`;

    this.world.addChild(
      this.gTiles,
      this.gSpills,
      this.gBuildings,
      this.gWells,
      this.gFlares,
      this.gUnits,
      this.gHover,
    );
    app.stage.addChild(this.world, this.gWeather);
    this.app = app;
  }

  resize(): void {
    if (!this.app) return;
    const parent = this.canvas.parentElement!;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cssW = parent.clientWidth;
    const cssH = parent.clientHeight;
    this.w = Math.floor(cssW * dpr);
    this.h = Math.floor(cssH * dpr);
    this.app.renderer.resize(this.w, this.h);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
  }

  render(game: Game, cam: Camera, hover: { x: number; y: number } | null): void {
    if (!this.app) return;
    const ts = game.config.tileSize;
    const zoom = cam.zoom;
    this.world.scale.set(zoom);
    this.world.position.set(
      this.w / 2 - cam.x * ts * zoom,
      this.h / 2 - cam.y * ts * zoom,
    );

    // Viewport cull — only iterate tiles near the camera (big-map perf).
    const halfX = this.w / 2 / (ts * zoom) + 2;
    const halfY = this.h / 2 / (ts * zoom) + 2;
    const bounds = {
      minX: Math.max(0, Math.floor(cam.x - halfX)),
      maxX: Math.min(game.config.cols - 1, Math.ceil(cam.x + halfX)),
      minY: Math.max(0, Math.floor(cam.y - halfY)),
      maxY: Math.min(game.config.rows - 1, Math.ceil(cam.y + halfY)),
    };

    this.drawTiles(game, ts, bounds);
    this.drawSpills(game, ts);
    this.drawBuildings(game, ts);
    this.drawWells(game, ts);
    this.drawFlares(game, ts);
    this.drawUnits(game, ts);
    this.drawHover(hover, ts);
    this.drawWeather(game);

    this.app.render();
  }

  private tileColor(
    tile: { terrain: string; hasRoad: boolean; isPad: boolean },
    even: boolean,
  ): number {
    if (tile.hasRoad) return P.road;
    if (tile.isPad) return P.pad;
    switch (tile.terrain) {
      case "water":
        return even ? P.water : P.waterAlt;
      case "creek":
        return even ? P.creek : P.creekAlt;
      case "rock":
        return even ? P.rock : P.rockAlt;
      case "scrub":
        return P.scrub;
      default:
        return even ? P.ground : P.groundAlt;
    }
  }

  private drawTiles(
    game: Game,
    ts: number,
    bounds: { minX: number; maxX: number; minY: number; maxY: number },
  ): void {
    const g = this.gTiles;
    g.clear();
    for (let y = bounds.minY; y <= bounds.maxY; y++) {
      for (let x = bounds.minX; x <= bounds.maxX; x++) {
        const tile = game.tiles[y][x];
        const px = x * ts;
        const py = y * ts;
        const even = (x + y) % 2 === 0;
        g.rect(px, py, ts, ts).fill(this.tileColor(tile, even));

        if (!tile.hasRoad && tile.terrain === "rock") {
          g.poly([
            px + ts * 0.12,
            py + ts * 0.82,
            px + ts * 0.5,
            py + ts * 0.24,
            px + ts * 0.88,
            py + ts * 0.82,
          ]).fill(P.rockShadow);
          g.poly([
            px + ts * 0.5,
            py + ts * 0.24,
            px + ts * 0.66,
            py + ts * 0.52,
            px + ts * 0.42,
            py + ts * 0.52,
          ]).fill(P.rockPeak);
        } else if (!tile.hasRoad && tile.terrain === "water") {
          g.moveTo(px + ts * 0.2, py + ts * 0.44)
            .lineTo(px + ts * 0.5, py + ts * 0.42)
            .lineTo(px + ts * 0.8, py + ts * 0.44)
            .stroke({ width: 1.5, color: P.waterRipple, alpha: 0.5 });
        }

        if (tile.hasRoad) {
          g.rect(px + 3, py + 3, ts - 6, ts - 6).stroke({
            width: 1,
            color: P.roadEdge,
          });
        } else if (tile.isPad) {
          g.rect(px + 2, py + 2, ts - 4, ts - 4).stroke({
            width: 1,
            color: P.padEdge,
          });
        }

        if (tile.surveyed) {
          const ov = prospectOverlay(tile.subsurface.prospect);
          if (ov) g.rect(px, py, ts, ts).fill({ color: ov.c, alpha: ov.a });
          if (tile.subsurface.special) {
            g.rect(px + 2, py + 2, ts - 4, ts - 4).stroke({
              width: 2,
              color: P.special,
              alpha: 0.8,
            });
          }
          if (!tile.drilled) {
            g.rect(px + ts * 0.12, py + ts * 0.12, ts * 0.2, ts * 0.2).fill(
              prospectPip(tile.subsurface.prospect),
            );
          }
        }

        g.rect(px + 0.5, py + 0.5, ts - 1, ts - 1).stroke({
          width: 1,
          color: P.grid,
        });

        this.drawPipeTile(game, x, y, px, py, ts, "oilPipe");
        this.drawPipeTile(game, x, y, px, py, ts, "gasPipe");
      }
    }
  }

  private drawPipeTile(
    game: Game,
    x: number,
    y: number,
    px: number,
    py: number,
    ts: number,
    kind: "oilPipe" | "gasPipe",
  ): void {
    const tile = game.tiles[y][x];
    if (!tile[kind]) return;
    const g = this.gTiles;
    const cx = px + ts / 2;
    const cy = py + ts / 2;
    const casing = kind === "oilPipe" ? P.oilPipe : P.gasPipe;
    const core = kind === "oilPipe" ? P.oilPipeCore : P.gasPipeCore;
    const dirs: [number, number][] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    for (const [w, color] of [
      [Math.max(4, ts * 0.26), casing],
      [Math.max(2, ts * 0.13), core],
    ] as [number, number][]) {
      let connected = false;
      for (const [dx, dy] of dirs) {
        const nb = game.tiles[y + dy]?.[x + dx];
        if (nb && nb[kind]) {
          connected = true;
          g.moveTo(cx, cy)
            .lineTo(cx + (dx * ts) / 2, cy + (dy * ts) / 2)
            .stroke({ width: w, color, cap: "round" });
        }
      }
      if (!connected) g.circle(cx, cy, w * 0.5).fill(color);
    }
  }

  private drawSpills(game: Game, ts: number): void {
    const g = this.gSpills;
    g.clear();
    for (const s of game.spills) {
      const r = ts * (0.25 + Math.min(0.4, s.barrels / 80));
      g.circle(s.x * ts + ts / 2, s.y * ts + ts / 2, r).fill({
        color: P.spill,
        alpha: 0.55,
      });
    }
  }

  private drawBuildings(game: Game, ts: number): void {
    const g = this.gBuildings;
    g.clear();
    const pad = ts * 0.12;
    for (const b of game.buildings) {
      if (b.kind === "gas_flare") continue;
      const ox = b.x * ts + pad;
      const oy = b.y * ts + pad;
      const fw = (b.w ?? 1) * ts - pad * 2;
      const fh = (b.h ?? 1) * ts - pad * 2;
      const a = b.online ? 1 : 0.4;

      switch (b.kind) {
        case "pumpjack": {
          g.rect(ox + fw * 0.35, oy + fh * 0.5, fw * 0.3, fh * 0.4).fill({
            color: P.jack,
            alpha: a,
          });
          g.moveTo(ox + fw * 0.15, oy + fh * 0.55)
            .lineTo(ox + fw * 0.85, oy + fh * 0.2)
            .stroke({ width: 2, color: P.jack, alpha: a });
          break;
        }
        case "wellhead_tank": {
          g.rect(ox + fw * 0.15, oy + fh * 0.2, fw * 0.7, fh * 0.65).fill({
            color: P.tank,
            alpha: a,
          });
          const fill = b.oilCap ? Math.min(1, b.oil / b.oilCap) : 0;
          g.rect(
            ox + fw * 0.2,
            oy + fh * 0.75 - fh * 0.5 * fill,
            fw * 0.6,
            fh * 0.5 * fill,
          ).fill({ color: P.crude, alpha: a });
          break;
        }
        case "battery": {
          g.rect(ox + fw * 0.05, oy + fh * 0.2, fw * 0.4, fh * 0.6).fill({
            color: P.battery,
            alpha: a,
          });
          g.rect(ox + fw * 0.55, oy + fh * 0.2, fw * 0.4, fh * 0.6).fill({
            color: P.battery,
            alpha: a,
          });
          const crudeFill = b.crudeCap ? Math.min(1, b.crude / b.crudeCap) : 0;
          const cleanFill = b.cleanCap ? Math.min(1, b.clean / b.cleanCap) : 0;
          g.rect(
            ox + fw * 0.1,
            oy + fh * 0.7 - fh * 0.45 * crudeFill,
            fw * 0.3,
            fh * 0.45 * crudeFill,
          ).fill({ color: P.crude, alpha: a });
          g.rect(
            ox + fw * 0.6,
            oy + fh * 0.7 - fh * 0.45 * cleanFill,
            fw * 0.3,
            fh * 0.45 * cleanFill,
          ).fill({ color: P.clean, alpha: a });
          break;
        }
        case "gas_line": {
          g.rect(ox + fw * 0.15, oy + fh * 0.35, fw * 0.7, fh * 0.3).stroke({
            width: 3,
            color: P.gas,
            alpha: a,
          });
          break;
        }
        case "refinery": {
          g.rect(ox + fw * 0.1, oy + fh * 0.25, fw * 0.8, fh * 0.6).fill({
            color: P.refinery,
            alpha: a,
          });
          g.rect(ox + fw * 0.22, oy + fh * 0.08, fw * 0.12, fh * 0.2).fill({
            color: 0x3a3028,
            alpha: a,
          });
          g.rect(ox + fw * 0.55, oy + fh * 0.04, fw * 0.14, fh * 0.24).fill({
            color: 0x3a3028,
            alpha: a,
          });
          break;
        }
        case "gas_plant": {
          g.rect(ox + fw * 0.08, oy + fh * 0.35, fw * 0.84, fh * 0.5).fill({
            color: P.plant,
            alpha: a,
          });
          g.rect(ox + fw * 0.16, oy + fh * 0.1, fw * 0.1, fh * 0.28).fill({
            color: 0x2e3a34,
            alpha: a,
          });
          g.circle(ox + fw * 0.5, oy + fh * 0.32, fh * 0.16).fill({
            color: P.gasPipeCore,
            alpha: a,
          });
          g.circle(ox + fw * 0.74, oy + fh * 0.34, fh * 0.13).fill({
            color: P.gasPipeCore,
            alpha: a,
          });
          break;
        }
      }
    }
  }

  private drawWells(game: Game, ts: number): void {
    const g = this.gWells;
    g.clear();
    for (const well of game.wells) {
      const px = well.x * ts;
      const py = well.y * ts;
      if (well.status === "drilling") {
        const p = well.drillProgress / well.drillDaysNeeded;
        g.arc(
          px + ts / 2,
          py + ts / 2,
          ts * 0.28,
          -Math.PI / 2,
          -Math.PI / 2 + p * Math.PI * 2,
        ).stroke({ width: 2, color: P.rig });
      } else if (well.status === "duster") {
        g.moveTo(px + ts * 0.3, py + ts * 0.3)
          .lineTo(px + ts * 0.7, py + ts * 0.7)
          .moveTo(px + ts * 0.7, py + ts * 0.3)
          .lineTo(px + ts * 0.3, py + ts * 0.7)
          .stroke({ width: 2, color: P.duster });
      } else if (well.status === "producing" && well.choked) {
        g.rect(px + ts * 0.15, py + ts * 0.15, ts * 0.7, ts * 0.7).stroke({
          width: 2,
          color: P.danger,
        });
      }
    }
  }

  private drawFlares(game: Game, ts: number): void {
    const g = this.gFlares;
    g.clear();
    for (const b of game.buildings) {
      if (b.kind !== "gas_flare" || !b.online) continue;
      const px = b.x * ts;
      const py = b.y * ts;
      g.poly([
        px + ts * 0.5,
        py + ts * 0.05,
        px + ts * 0.7,
        py + ts * 0.45,
        px + ts * 0.3,
        py + ts * 0.45,
      ]).fill(P.flare);
    }
  }

  private drawUnits(game: Game, ts: number): void {
    const g = this.gUnits;
    g.clear();
    for (const u of game.units) {
      const px = u.x * ts;
      const py = u.y * ts;
      if (u.kind === "drill_rig") {
        g.rect(px + ts * 0.25, py + ts * 0.2, ts * 0.5, ts * 0.55).fill(P.rig);
        g.rect(px + ts * 0.45, py + ts * 0.05, ts * 0.1, ts * 0.2).fill(P.rig);
      } else {
        g.rect(px + ts * 0.15, py + ts * 0.3, ts * 0.7, ts * 0.4).fill(P.truck);
        if (u.cargo > 0) {
          const c = u.cargoKind === "clean" ? P.clean : P.crude;
          g.rect(
            px + ts * 0.2,
            py + ts * 0.35,
            ts * 0.4 * (u.cargo / u.cargoCap),
            ts * 0.3,
          ).fill(c);
        }
      }
      if (u.id === game.selectedUnitId) {
        g.rect(px + 2, py + 2, ts - 4, ts - 4).stroke({
          width: 2,
          color: P.select,
        });
      }
    }
  }

  private drawHover(hover: { x: number; y: number } | null, ts: number): void {
    const g = this.gHover;
    g.clear();
    if (!hover) return;
    g.rect(hover.x * ts + 1, hover.y * ts + 1, ts - 2, ts - 2).stroke({
      width: 2,
      color: P.select,
    });
  }

  private drawWeather(game: Game): void {
    const g = this.gWeather;
    g.clear();
    if (game.weather.kind === "clear") return;
    g.rect(0, 0, this.w, this.h).fill({ color: P.storm, alpha: 0.25 });
  }
}
