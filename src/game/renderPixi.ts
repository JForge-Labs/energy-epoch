/**
 * WebGL renderer (PixiJS v8) — DEFAULT renderer as of the graphics pass.
 * (`?canvas` in the URL falls back to the Canvas 2D path.)
 *
 * It mirrors the canvas renderer's coordinate model exactly so the existing
 * input hit-testing (canvasToTile) keeps working unchanged:
 *   - the backing store is device-pixels (resolution 1, sized to clientW*dpr),
 *   - 1 tile == config.tileSize world units,
 *   - a `world` container carries the camera pan/zoom transform.
 *
 * Layer stack (per docs/planning/GRAPHICS_PASS.md):
 *   world
 *     ├─ terrain   texture stamps per tile (ground/scrub/rock/water/road/pad)
 *     ├─ infra     oil/gas pipes (live vs dead + flow pulse) & spill decals
 *     ├─ buildings Sprite pool by building id + code-drawn fill bars
 *     ├─ wells     drill progress / duster / choked markers
 *     ├─ units     Sprite pool by unit id (trucks rotate to heading)
 *     ├─ fx        flare sprites (alpha pulse) — particles land here later
 *     └─ overlays  survey grades, prospect pips, selection, hover
 *   stage: weather tint (screen space)
 *
 * Every texture comes from src/game/gfx/atlas.ts (`texFor(name)`): a real
 * packed atlas when present, generated placeholders until the art pass.
 * Known scaffold gaps (next session): terrain stamps still re-issue per frame
 * (static tile cache pending), no facility text labels, no pumpjack anim.
 */
import { Application, Container, Graphics, Sprite } from "pixi.js";
import type { Camera } from "./camera";
import type { Game } from "./Game";
import { initAtlas, texFor } from "./gfx/atlas";
import { pipeSnapsTo } from "./render";

const P = {
  oilPipe: 0xc07a2e,
  oilPipeCore: 0xe8a24a,
  gasPipe: 0x4aa892,
  gasPipeCore: 0x7fd0bb,
  pipeDead: 0x565049,
  pipeDeadCore: 0x726a5f,
  rig: 0xd4a017,
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

const N4: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Prospect fill overlay for a surveyed tile (matches canvas renderer). */
function prospectOverlay(p: number): { c: number; a: number } | null {
  if (p < 0.22) return { c: 0x464844, a: 0.55 };
  if (p < 0.4) return { c: 0x6e643c, a: 0.4 };
  if (p < 0.55) return { c: 0xb49632, a: 0.35 };
  if (p < 0.72) return { c: 0x46a04b, a: 0.45 };
  return { c: 0xe6be28, a: 0.5 };
}

function prospectPipFrame(p: number): string {
  if (p < 0.22) return "pip.barren";
  if (p < 0.4) return "pip.lean";
  if (p < 0.55) return "pip.fair";
  if (p < 0.72) return "pip.good";
  return "pip.sweet";
}

function terrainFrame(terrain: string, even: boolean): string {
  switch (terrain) {
    case "water":
      return even ? "terrain.water" : "terrain.water2";
    case "creek":
      return even ? "terrain.creek" : "terrain.creek2";
    case "rock":
      return even ? "terrain.rock" : "terrain.rock2";
    case "scrub":
      return "terrain.scrub";
    default:
      return even ? "terrain.ground" : "terrain.ground2";
  }
}

export class PixiRenderer {
  private canvas: HTMLCanvasElement;
  private app: Application | null = null;
  private world = new Container();

  // Layer containers (see header). Graphics children are the code-overlay
  // parts (state bars, markers); Sprites land beside them.
  private terrain = new Container();
  private infra = new Container();
  private buildings = new Container();
  private wells = new Container();
  private units = new Container();
  private fx = new Container();
  private overlays = new Container();

  private gTerrain = new Graphics();
  private gInfra = new Graphics();
  private gSpills = new Graphics();
  private gBuildState = new Graphics();
  private gWells = new Graphics();
  private gUnitState = new Graphics();
  private gOverlays = new Graphics();
  private gWeather = new Graphics();

  // Sprite pools keyed by entity id — created on first sight, destroyed when
  // the entity goes away (sell, flare capped, truck sold).
  private bPool = new Map<string, Sprite>();
  private uPool = new Map<string, Sprite>();
  private fxPool = new Map<string, Sprite>();

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

    await initAtlas(app.renderer);

    this.terrain.addChild(this.gTerrain);
    this.infra.addChild(this.gInfra, this.gSpills);
    this.buildings.addChild(this.gBuildState); // sprites insert below (addChildAt 0)
    this.wells.addChild(this.gWells);
    this.units.addChild(this.gUnitState); // sprites insert below
    this.overlays.addChild(this.gOverlays);

    this.world.addChild(
      this.terrain,
      this.infra,
      this.buildings,
      this.wells,
      this.units,
      this.fx,
      this.overlays,
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
    const now = performance.now();
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

    this.drawTerrain(game, ts, bounds);
    this.drawInfra(game, ts, bounds, now);
    this.syncBuildings(game, ts);
    this.drawWells(game, ts);
    this.syncUnits(game, ts);
    this.syncFx(game, ts, now);
    this.drawOverlays(game, ts, bounds, hover);
    this.drawWeather(game);

    this.app.render();
  }

  /** Terrain + roads/pads as texture stamps — grid + decor baked into frames. */
  private drawTerrain(
    game: Game,
    ts: number,
    bounds: { minX: number; maxX: number; minY: number; maxY: number },
  ): void {
    const g = this.gTerrain;
    g.clear();
    for (let y = bounds.minY; y <= bounds.maxY; y++) {
      for (let x = bounds.minX; x <= bounds.maxX; x++) {
        const tile = game.tiles[y][x];
        const even = (x + y) % 2 === 0;
        const frame = tile.hasRoad
          ? "infra.road"
          : tile.isPad
            ? "infra.pad"
            : terrainFrame(tile.terrain, even);
        g.texture(texFor(frame), 0xffffff, x * ts, y * ts, ts, ts);
      }
    }
  }

  /**
   * Pipes: thinner runs that reach into pipe neighbors AND snap into the
   * assets they serve. Live networks (wired to a battery / gas plant) are
   * bright with a moving flow pulse; dead stubs render grey.
   */
  private drawPipeTile(
    game: Game,
    x: number,
    y: number,
    ts: number,
    kind: "oilPipe" | "gasPipe",
    now: number,
  ): void {
    const tile = game.tiles[y][x];
    if (!tile[kind]) return;
    const g = this.gInfra;
    const cx = x * ts + ts / 2;
    const cy = y * ts + ts / 2;
    const live =
      kind === "oilPipe"
        ? game.oilConnectedTiles.has(`${x},${y}`)
        : game.gasConnectedTiles.has(`${x},${y}`);
    const casing = live ? (kind === "oilPipe" ? P.oilPipe : P.gasPipe) : P.pipeDead;
    const core = live
      ? kind === "oilPipe"
        ? P.oilPipeCore
        : P.gasPipeCore
      : P.pipeDeadCore;
    const outer = Math.max(2.5, ts * 0.15);
    const inner = Math.max(1.4, ts * 0.07);

    const dirs: [number, number][] = [];
    for (const [dx, dy] of N4) {
      const nb = game.tiles[y + dy]?.[x + dx];
      if ((nb && nb[kind]) || pipeSnapsTo(game, x + dx, y + dy, kind)) {
        dirs.push([dx, dy]);
      }
    }
    if (!dirs.length) {
      g.circle(cx, cy, outer * 0.6).fill(casing);
      g.circle(cx, cy, inner * 0.7).fill(core);
      return;
    }
    for (const [dx, dy] of dirs) {
      const ex = cx + (dx * ts) / 2;
      const ey = cy + (dy * ts) / 2;
      g.moveTo(cx, cy).lineTo(ex, ey).stroke({ width: outer, color: casing, cap: "round" });
      g.moveTo(cx, cy).lineTo(ex, ey).stroke({ width: inner, color: core, cap: "round" });
      if (live) {
        // Flow pulse: a bright slug sliding center→edge, phase-shifted per run.
        const phase = (x * 3 + y * 5 + (dx + 1) + (dy + 1) * 2) * 0.13;
        const f = (now * 0.0006 + phase) % 1;
        g.circle(cx + dx * (ts / 2) * f, cy + dy * (ts / 2) * f, inner * 0.9).fill({
          color: 0xffffff,
          alpha: 0.45,
        });
      }
    }
  }

  private drawInfra(
    game: Game,
    ts: number,
    bounds: { minX: number; maxX: number; minY: number; maxY: number },
    now: number,
  ): void {
    const g = this.gInfra;
    g.clear();
    for (let y = bounds.minY; y <= bounds.maxY; y++) {
      for (let x = bounds.minX; x <= bounds.maxX; x++) {
        this.drawPipeTile(game, x, y, ts, "oilPipe", now);
        this.drawPipeTile(game, x, y, ts, "gasPipe", now);
      }
    }
    const s = this.gSpills;
    s.clear();
    for (const sp of game.spills) {
      const r = ts * (0.25 + Math.min(0.4, sp.barrels / 80));
      s.circle(sp.x * ts + ts / 2, sp.y * ts + ts / 2, r).fill({ color: P.spill, alpha: 0.55 });
    }
  }

  /** Buildings: one Sprite per building + code-drawn fill bars on top. */
  private syncBuildings(game: Game, ts: number): void {
    const seen = new Set<string>();
    for (const b of game.buildings) {
      if (b.kind === "gas_flare") continue; // fx layer
      seen.add(b.id);
      let s = this.bPool.get(b.id);
      if (!s) {
        s = new Sprite(texFor(`building.${b.kind}`));
        this.buildings.addChildAt(s, 0); // under the state-bar Graphics
        this.bPool.set(b.id, s);
      }
      s.position.set(b.x * ts, b.y * ts);
      s.width = (b.w ?? 1) * ts;
      s.height = (b.h ?? 1) * ts;
      s.alpha = b.online ? 1 : 0.4;
    }
    for (const [id, s] of this.bPool) {
      if (!seen.has(id)) {
        s.destroy();
        this.bPool.delete(id);
      }
    }

    // Inventory state stays code-drawn (never baked into art — readability).
    const g = this.gBuildState;
    g.clear();
    for (const b of game.buildings) {
      const a = b.online ? 1 : 0.4;
      if (b.kind === "wellhead_tank") {
        const fw = ts - ts * 0.24;
        const ox = b.x * ts + ts * 0.12;
        const oy = b.y * ts + ts * 0.12;
        const fill = b.oilCap ? Math.min(1, b.oil / b.oilCap) : 0;
        g.rect(ox + fw * 0.2, oy + fw * 0.75 - fw * 0.5 * fill, fw * 0.6, fw * 0.5 * fill).fill({
          color: P.crude,
          alpha: a,
        });
      } else if (b.kind === "battery") {
        const pad = ts * 0.12;
        const fw = (b.w ?? 1) * ts - pad * 2;
        const fh = (b.h ?? 1) * ts - pad * 2;
        const ox = b.x * ts + pad;
        const oy = b.y * ts + pad;
        const crudeFill = b.crudeCap ? Math.min(1, b.crude / b.crudeCap) : 0;
        const cleanFill = b.cleanCap ? Math.min(1, b.clean / b.cleanCap) : 0;
        g.rect(ox + fw * 0.1, oy + fh * 0.7 - fh * 0.45 * crudeFill, fw * 0.3, fh * 0.45 * crudeFill).fill({
          color: P.crude,
          alpha: a,
        });
        g.rect(ox + fw * 0.6, oy + fh * 0.7 - fh * 0.45 * cleanFill, fw * 0.3, fh * 0.45 * cleanFill).fill({
          color: P.clean,
          alpha: a,
        });
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

  /** Units: Sprite pool; trucks rotate to heading, cargo bar drawn in code. */
  private syncUnits(game: Game, ts: number): void {
    const seen = new Set<string>();
    const g = this.gUnitState;
    g.clear();
    for (const u of game.units) {
      seen.add(u.id);
      let s = this.uPool.get(u.id);
      if (!s) {
        s = new Sprite(texFor(u.kind === "drill_rig" ? "unit.drill_rig" : "unit.truck"));
        s.anchor.set(0.5);
        this.units.addChildAt(s, 0); // under the state Graphics
        this.uPool.set(u.id, s);
      }
      s.position.set((u.x + 0.5) * ts, (u.y + 0.5) * ts);
      s.width = ts;
      s.height = ts;
      if (u.kind === "truck" && u.path.length) {
        const ddx = u.path[0].x - u.x;
        const ddy = u.path[0].y - u.y;
        if (Math.abs(ddx) > 0.01 || Math.abs(ddy) > 0.01) {
          s.rotation = Math.atan2(ddy, ddx);
        }
      }

      // Cargo bar (screen-aligned, above the truck — stays readable rotated).
      if (u.kind === "truck" && u.cargo > 0 && u.cargoCap > 0) {
        const frac = Math.min(1, u.cargo / u.cargoCap);
        g.rect(u.x * ts + ts * 0.2, u.y * ts + ts * 0.08, ts * 0.6 * frac, ts * 0.1).fill(
          u.cargoKind === "clean" ? P.clean : P.crude,
        );
        g.rect(u.x * ts + ts * 0.2, u.y * ts + ts * 0.08, ts * 0.6, ts * 0.1).stroke({
          width: 1,
          color: 0x39414b,
        });
      }
      if (u.id === game.selectedUnitId) {
        g.rect(u.x * ts + 2, u.y * ts + 2, ts - 4, ts - 4).stroke({ width: 2, color: P.select });
      }
    }
    for (const [id, s] of this.uPool) {
      if (!seen.has(id)) {
        s.destroy();
        this.uPool.delete(id);
      }
    }
  }

  /** FX: flare sprites with a slow alpha/scale pulse (first "alive" motion). */
  private syncFx(game: Game, ts: number, now: number): void {
    const seen = new Set<string>();
    for (const b of game.buildings) {
      if (b.kind !== "gas_flare" || !b.online) continue;
      seen.add(b.id);
      let s = this.fxPool.get(b.id);
      if (!s) {
        s = new Sprite(texFor("fx.flare"));
        s.anchor.set(0.5, 1);
        this.fx.addChild(s);
        this.fxPool.set(b.id, s);
      }
      const pulse = 0.75 + 0.25 * Math.sin(now * 0.006 + b.x * 7 + b.y * 13);
      s.position.set((b.x + 0.5) * ts, (b.y + 0.5) * ts);
      s.width = ts * (0.55 + 0.1 * pulse);
      s.height = ts * (0.5 + 0.14 * pulse);
      s.alpha = 0.7 + 0.3 * pulse;
    }
    for (const [id, s] of this.fxPool) {
      if (!seen.has(id)) {
        s.destroy();
        this.fxPool.delete(id);
      }
    }
  }

  private drawOverlays(
    game: Game,
    ts: number,
    bounds: { minX: number; maxX: number; minY: number; maxY: number },
    hover: { x: number; y: number } | null,
  ): void {
    const g = this.gOverlays;
    g.clear();
    for (let y = bounds.minY; y <= bounds.maxY; y++) {
      for (let x = bounds.minX; x <= bounds.maxX; x++) {
        const tile = game.tiles[y][x];
        if (!tile.surveyed) continue;
        const px = x * ts;
        const py = y * ts;
        const ov = prospectOverlay(tile.subsurface.prospect);
        if (ov) g.rect(px, py, ts, ts).fill({ color: ov.c, alpha: ov.a });
        if (tile.subsurface.special) {
          g.rect(px + 2, py + 2, ts - 4, ts - 4).stroke({ width: 2, color: P.special, alpha: 0.8 });
        }
        if (!tile.drilled) {
          g.texture(
            texFor(prospectPipFrame(tile.subsurface.prospect)),
            0xffffff,
            px + ts * 0.08,
            py + ts * 0.06,
            ts * 0.3,
            ts * 0.34,
          );
        }
      }
    }
    if (hover) {
      g.rect(hover.x * ts + 1, hover.y * ts + 1, ts - 2, ts - 2).stroke({
        width: 2,
        color: P.select,
      });
    }
  }

  private drawWeather(game: Game): void {
    const g = this.gWeather;
    g.clear();
    if (game.weather.kind === "clear") return;
    g.rect(0, 0, this.w, this.h).fill({ color: P.storm, alpha: 0.25 });
  }
}
