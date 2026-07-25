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
 *     ├─ terrain   CHUNKED static stamps (see below) incl. survey tint + pips
 *     ├─ infra     oil/gas pipes (live vs dead + flow pulse) & spill decals
 *     ├─ buildings Sprite pool by building id (jack anim) + code fill bars
 *     ├─ wells     drill progress / duster / choked markers
 *     ├─ units     Sprite pool by unit id (trucks rotate to heading)
 *     ├─ fx        flare sprites (alpha pulse)
 *     ├─ labels    BitmapText pool (bopd, SHUT, facility names) — hidden at
 *     │            far zoom so the overview stays clean
 *     └─ overlays  hover ring only (everything static moved into terrain)
 *   stage: weather tint (screen space)
 *
 * TERRAIN PERF (session 2+): the map is split into 16×16-tile chunks. Each
 * chunk has a root Container with three Graphics: opaque base stamps, survey
 * tint fills, and fill-free pip stamps. Per frame we only (a) toggle
 * visibility and (b) restamp when the tile signature changes. On restamp we
 * destroy/recreate all three so mid-session explore never inherits stale
 * fill alpha. Root cause (confirmed in Pixi source): fill({alpha}) mutates
 * the Graphics' persistent fillStyle, clear() does NOT reset it, and
 * texture() bakes fillStyle.alpha into every stamp — so translucent fills
 * and texture stamps must never share a Graphics across passes.
 *
 * Every texture comes from src/game/gfx/atlas.ts (`texFor(name)`): a real
 * packed atlas when present, generated placeholders until the art pass.
 */
import {
  Application,
  BitmapFont,
  BitmapText,
  Container,
  Graphics,
  Sprite,
} from "pixi.js";
import type { Camera } from "./camera";
import type { Game } from "./Game";
import type { Tile, Well } from "./types";
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
  rigText: 0x1a1610,
  duster: 0x5a5048,
  dusterText: 0xb0a090,
  select: 0xf0c040,
  danger: 0xc45c26,
  crude: 0x1a1008,
  clean: 0xc8b070,
  special: 0xc85078,
  spill: 0x281408,
  storm: 0x283246,
  label: 0xe8ece6,
  bg: 0x11150f,
};

const N4: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Tiles per terrain chunk (16×16 → 5×4 chunks on the 80×52 lease). */
const CHUNK = 16;
/** Labels get hidden below this zoom — unreadable + floods the overview. */
const LABEL_MIN_ZOOM = 0.5;
const FONT = "ops-label";
/** Font is baked at this px size; world sizes scale off it. */
const FONT_PX = 48;
/** Pumpjack stroke cycle: 0→3→0 ping-pong. */
const JACK_SEQ = [0, 1, 2, 3, 2, 1];

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

function terrainIdx(terrain: string): number {
  switch (terrain) {
    case "water":
      return 1;
    case "creek":
      return 2;
    case "rock":
      return 3;
    case "scrub":
      return 4;
    default:
      return 0;
  }
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

/** Visual state of one tile, as far as terrain-chunk stamping cares. */
function tileCode(t: Tile): number {
  return (
    terrainIdx(t.terrain) |
    (t.hasRoad ? 8 : 0) |
    (t.isPad ? 16 : 0) |
    (t.surveyed ? 32 : 0) |
    (t.drilled ? 64 : 0)
  );
}

interface TerrainChunk {
  /** Holds base + survey + pips so we can show/hide the whole chunk. */
  root: Container;
  /** Opaque terrain/road/pad textures only — never semi-transparent fills. */
  base: Graphics;
  /** Survey tints + special outlines only — the alpha fills live here. */
  survey: Graphics;
  /**
   * Prospect letter pips — texture stamps only, NO fills ever. Pixi's
   * GraphicsContext.texture() bakes in the *current persistent* fillStyle
   * alpha, and fill({alpha}) mutates that style (clear() doesn't reset it) —
   * so any Graphics that mixes translucent fills with texture stamps renders
   * later stamps washed out. Keeping pips fill-free keeps them crisp.
   */
  pips: Graphics;
  sig: number;
  x0: number;
  y0: number;
}

export class PixiRenderer {
  private canvas: HTMLCanvasElement;
  private app: Application | null = null;
  private world = new Container();

  // Layer containers (see header). Graphics children are the code-overlay
  // parts (state bars, markers); Sprites/BitmapTexts land beside them.
  private terrain = new Container();
  private infra = new Container();
  private buildings = new Container();
  private wells = new Container();
  private units = new Container();
  private fx = new Container();
  private labels = new Container();
  private overlays = new Container();

  private gInfra = new Graphics();
  private gSpills = new Graphics();
  private gBuildState = new Graphics();
  private gWells = new Graphics();
  private gUnitState = new Graphics();
  private gOverlays = new Graphics();
  private gWeather = new Graphics();

  // Static terrain chunks — rebuilt per chunk only when its signature changes.
  private chunks: TerrainChunk[] = [];
  private chunkCols = 0;
  private chunkRows = 0;
  private chunkTilesRef: Tile[][] | null = null;

  // Sprite/label pools keyed by entity id — created on first sight, destroyed
  // when the entity goes away (sell, flare capped, truck sold).
  private bPool = new Map<string, Sprite>();
  private uPool = new Map<string, Sprite>();
  private fxPool = new Map<string, Sprite>();
  private lPool = new Map<string, BitmapText>();
  private lSeen = new Set<string>();

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

    // One shared bitmap font: glyphs bake once, labels tint per use.
    BitmapFont.install({
      name: FONT,
      style: {
        fontFamily: "IBM Plex Mono, monospace",
        fontWeight: "600",
        fontSize: FONT_PX,
        fill: 0xffffff,
      },
      chars: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789%.,- ",
    });

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
      this.labels,
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

    // Labels are pooled; hide (and skip syncing) at far zoom.
    const showLabels = zoom >= LABEL_MIN_ZOOM;
    this.labels.visible = showLabels;
    this.lSeen.clear();

    this.syncTerrain(game, ts, bounds);
    this.drawInfra(game, ts, bounds, now);
    this.syncBuildings(game, ts, now, showLabels);
    this.drawWells(game, ts, showLabels);
    this.syncUnits(game, ts, showLabels);
    this.syncFx(game, ts, now);
    this.drawHover(game, hover, ts, showLabels);
    this.drawWeather(game);
    if (showLabels) this.sweepLabels();

    this.app.render();
  }

  // ---------------------------------------------------------------- terrain

  private makeChunkGraphics(x0: number, y0: number): TerrainChunk {
    const root = new Container();
    const base = new Graphics();
    const survey = new Graphics();
    const pips = new Graphics();
    root.addChild(base, survey, pips);
    this.terrain.addChild(root);
    return { root, base, survey, pips, sig: Number.NaN, x0, y0 };
  }

  /** (Re)allocate the chunk grid when the map itself is swapped (reset/load). */
  private ensureChunks(game: Game): void {
    if (this.chunkTilesRef === game.tiles && this.chunks.length) return;
    this.chunkTilesRef = game.tiles;
    for (const c of this.chunks) {
      c.root.destroy({ children: true });
    }
    this.chunks = [];
    this.terrain.removeChildren();
    this.chunkCols = Math.ceil(game.config.cols / CHUNK);
    this.chunkRows = Math.ceil(game.config.rows / CHUNK);
    for (let cy = 0; cy < this.chunkRows; cy++) {
      for (let cx = 0; cx < this.chunkCols; cx++) {
        this.chunks.push(this.makeChunkGraphics(cx * CHUNK, cy * CHUNK));
      }
    }
  }

  /**
   * Per frame: visibility-cull chunks and restamp only those whose tile
   * signature changed. The signature mixes each tile's visual code with a
   * position hash so swaps/moves can't cancel out.
   */
  private syncTerrain(
    game: Game,
    ts: number,
    bounds: { minX: number; maxX: number; minY: number; maxY: number },
  ): void {
    this.ensureChunks(game);
    const c0 = Math.floor(bounds.minX / CHUNK);
    const c1 = Math.floor(bounds.maxX / CHUNK);
    const r0 = Math.floor(bounds.minY / CHUNK);
    const r1 = Math.floor(bounds.maxY / CHUNK);

    for (let cy = 0; cy < this.chunkRows; cy++) {
      for (let cx = 0; cx < this.chunkCols; cx++) {
        const chunk = this.chunks[cy * this.chunkCols + cx];
        const visible = cx >= c0 && cx <= c1 && cy >= r0 && cy <= r1;
        chunk.root.visible = visible;
        if (!visible) continue;

        const xEnd = Math.min(chunk.x0 + CHUNK, game.config.cols);
        const yEnd = Math.min(chunk.y0 + CHUNK, game.config.rows);
        let sig = 0;
        for (let y = chunk.y0; y < yEnd; y++) {
          for (let x = chunk.x0; x < xEnd; x++) {
            const h = (x * 374761393 + y * 668265263) | 0;
            sig = (sig + tileCode(game.tiles[y][x]) * (h | 1)) | 0;
          }
        }
        if (sig !== chunk.sig) {
          chunk.sig = sig;
          this.stampChunk(game, chunk, ts, xEnd, yEnd);
        }
      }
    }
  }

  /**
   * Stamp one chunk. Base and survey use *separate* Graphics objects, and we
   * destroy/recreate them on every restamp so live explore never inherits
   * stale fill/alpha from the previous stamp (hard-refresh looked fine because
   * it rebuilt Graphics from scratch; mid-session clear() did not).
   */
  private stampChunk(
    game: Game,
    chunk: TerrainChunk,
    ts: number,
    xEnd: number,
    yEnd: number,
  ): void {
    // Fresh Graphics — avoid Pixi clear()+texture residual tint after explore.
    chunk.root.removeChildren();
    chunk.base.destroy();
    chunk.survey.destroy();
    chunk.pips.destroy();
    chunk.base = new Graphics();
    chunk.survey = new Graphics();
    chunk.pips = new Graphics();
    chunk.root.addChild(chunk.base, chunk.survey, chunk.pips);

    const base = chunk.base;
    const survey = chunk.survey;
    const pips = chunk.pips;

    for (let y = chunk.y0; y < yEnd; y++) {
      for (let x = chunk.x0; x < xEnd; x++) {
        const tile = game.tiles[y][x];
        const even = (x + y) % 2 === 0;
        const frame = tile.hasRoad
          ? "infra.road"
          : tile.isPad
            ? "infra.pad"
            : terrainFrame(tile.terrain, even);
        base.texture(texFor(frame), 0xffffff, x * ts, y * ts, ts, ts);
      }
    }

    for (let y = chunk.y0; y < yEnd; y++) {
      for (let x = chunk.x0; x < xEnd; x++) {
        const tile = game.tiles[y][x];
        if (!tile.surveyed) continue;
        const px = x * ts;
        const py = y * ts;
        const ov = prospectOverlay(tile.subsurface.prospect);
        if (ov) survey.rect(px, py, ts, ts).fill({ color: ov.c, alpha: ov.a });
        if (tile.subsurface.special) {
          survey.rect(px + 2, py + 2, ts - 4, ts - 4).stroke({
            width: 2,
            color: P.special,
            alpha: 0.8,
          });
        }
        if (!tile.drilled) {
          // Stamped on the fill-free `pips` Graphics — see TerrainChunk note:
          // texture() inherits fillStyle alpha, so pips must never share a
          // Graphics with the translucent survey tints or they render faded.
          pips.texture(
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
  }

  // ------------------------------------------------------------------ infra

  /**
   * Pipes: thinner runs that reach into pipe neighbors AND snap into the
   * assets they serve. Live networks (wired to a battery / gas plant) are
   * bright with a moving flow pulse; dead stubs render grey. Redrawn per
   * frame — the pulse animates and pipe counts stay small vs terrain.
   */
  private drawPipeTile(
    game: Game,
    x: number,
    y: number,
    ts: number,
    kind: "oilPipe" | "gasPipe",
    now: number,
    snappedWells: Set<string>,
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
      if ((nb && nb[kind]) || pipeSnapsTo(game, x + dx, y + dy, kind, snappedWells)) {
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
    // One gas snap per wellhead across the frame (shared by all pipe tiles).
    const snappedWells = new Set<string>();
    for (let y = bounds.minY; y <= bounds.maxY; y++) {
      for (let x = bounds.minX; x <= bounds.maxX; x++) {
        this.drawPipeTile(game, x, y, ts, "oilPipe", now, snappedWells);
        this.drawPipeTile(game, x, y, ts, "gasPipe", now, snappedWells);
      }
    }
    const s = this.gSpills;
    s.clear();
    for (const sp of game.spills) {
      const r = ts * (0.25 + Math.min(0.4, sp.barrels / 80));
      s.circle(sp.x * ts + ts / 2, sp.y * ts + ts / 2, r).fill({ color: P.spill, alpha: 0.55 });
    }
  }

  // ----------------------------------------------------------------- labels

  /** Upsert a pooled BitmapText. `size` = glyph height in world units. */
  private setLabel(
    key: string,
    text: string,
    x: number,
    y: number,
    size: number,
    tint: number,
  ): void {
    let t = this.lPool.get(key);
    if (!t) {
      t = new BitmapText({ text, style: { fontFamily: FONT, fontSize: FONT_PX } });
      this.labels.addChild(t);
      this.lPool.set(key, t);
    }
    if (t.text !== text) t.text = text;
    t.tint = tint;
    t.position.set(x, y);
    t.scale.set(size / FONT_PX);
    this.lSeen.add(key);
  }

  /** Drop labels whose entity vanished (sold building, healed well, …). */
  private sweepLabels(): void {
    for (const [key, t] of this.lPool) {
      if (!this.lSeen.has(key)) {
        t.destroy();
        this.lPool.delete(key);
      }
    }
  }

  // -------------------------------------------------------------- buildings

  /** Buildings: one Sprite per building (jack animates) + code fill bars. */
  private syncBuildings(game: Game, ts: number, now: number, showLabels: boolean): void {
    const wellById = new Map<string, Well>();
    for (const w of game.wells) wellById.set(w.id, w);

    const seen = new Set<string>();
    for (const b of game.buildings) {
      if (b.kind === "gas_flare") continue; // fx layer
      seen.add(b.id);
      let s = this.bPool.get(b.id);
      if (!s) {
        s = new Sprite(
          b.kind === "pumpjack"
            ? texFor("building.pumpjack.1")
            : texFor(`building.${b.kind}`),
        );
        this.buildings.addChildAt(s, 0); // under the state-bar Graphics
        this.bPool.set(b.id, s);
      }
      s.position.set(b.x * ts, b.y * ts);
      s.width = (b.w ?? 1) * ts;
      s.height = (b.h ?? 1) * ts;
      s.alpha = b.online ? 1 : 0.4;

      const well = b.wellId ? wellById.get(b.wellId) : undefined;
      if (b.kind === "pumpjack") {
        // Stroke cycle runs while the well flows; freezes when shut/offline.
        let frame = 1;
        if (b.online && well?.status === "producing" && !well.choked) {
          frame = JACK_SEQ[Math.floor(now * 0.005 + (b.x * 3 + b.y * 5) * 0.37) % JACK_SEQ.length];
        }
        const tex = texFor(`building.pumpjack.${frame}`);
        if (s.texture !== tex) s.texture = tex;
        if (showLabels && well?.status === "producing") {
          this.setLabel(
            `bopd:${b.id}`,
            `${well.oilRate.toFixed(0)} bopd`,
            b.x * ts + 2,
            b.y * ts - ts * 0.26,
            ts * 0.24,
            P.select,
          );
        }
      } else if (showLabels) {
        const fw = (b.w ?? 1) * ts;
        const fh = (b.h ?? 1) * ts;
        switch (b.kind) {
          case "wellhead_tank":
            this.setLabel(`n:${b.id}`, "TANK", b.x * ts + ts * 0.16, b.y * ts + ts * 0.02, ts * 0.18, P.select);
            this.setLabel(
              `v:${b.id}`,
              `${b.oil.toFixed(0)}`,
              b.x * ts + ts * 0.26,
              b.y * ts + ts * 0.4,
              ts * 0.2,
              P.label,
            );
            break;
          case "battery":
            this.setLabel(`n:${b.id}`, "CRUDE", b.x * ts + fw * 0.06, b.y * ts + fh * 0.03, ts * 0.16, P.select);
            this.setLabel(`n2:${b.id}`, "CLEAN", b.x * ts + fw * 0.56, b.y * ts + fh * 0.03, ts * 0.16, P.select);
            break;
          case "refinery":
            this.setLabel(`n:${b.id}`, "REFINERY", b.x * ts + fw * 0.14, b.y * ts + fh * 0.42, ts * 0.22, P.select);
            break;
          case "gas_plant":
            this.setLabel(`n:${b.id}`, "GAS PLANT", b.x * ts + fw * 0.1, b.y * ts + fh * 0.62, ts * 0.2, P.select);
            break;
        }
      }
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

  // ------------------------------------------------------------------ wells

  private drawWells(game: Game, ts: number, showLabels: boolean): void {
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
        if (showLabels) {
          this.setLabel(
            `w:${well.id}`,
            `${Math.floor(p * 100)}%`,
            px + ts * 0.3,
            py + ts * 0.32,
            ts * 0.26,
            P.label,
          );
        }
      } else if (well.status === "duster") {
        g.moveTo(px + ts * 0.3, py + ts * 0.3)
          .lineTo(px + ts * 0.7, py + ts * 0.7)
          .moveTo(px + ts * 0.7, py + ts * 0.3)
          .lineTo(px + ts * 0.3, py + ts * 0.7)
          .stroke({ width: 2, color: P.duster });
        if (showLabels) {
          this.setLabel(`w:${well.id}`, "DUSTER", px + 2, py + ts * 0.72, ts * 0.2, P.dusterText);
        }
      } else if (well.status === "producing" && well.choked) {
        g.rect(px + ts * 0.15, py + ts * 0.15, ts * 0.7, ts * 0.7).stroke({
          width: 2,
          color: P.danger,
        });
        if (showLabels) {
          this.setLabel(`w:${well.id}`, "SHUT", px + ts * 0.22, py + ts * 0.36, ts * 0.2, P.danger);
        }
      }
    }
  }

  // ------------------------------------------------------------------ units

  /** Units: Sprite pool; trucks rotate to heading, cargo bar drawn in code. */
  private syncUnits(game: Game, ts: number, showLabels: boolean): void {
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
      if (u.kind === "drill_rig" && showLabels) {
        this.setLabel(`u:${u.id}`, `T${u.tier}`, u.x * ts + ts * 0.32, u.y * ts + ts * 0.34, ts * 0.26, P.rigText);
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

  // -------------------------------------------------------------------- fx

  /** FX: flare sprites with a slow alpha/scale pulse. */
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

  // --------------------------------------------------------------- overlays

  private drawHover(
    game: Game,
    hover: { x: number; y: number } | null,
    ts: number,
    showLabels: boolean,
  ): void {
    const g = this.gOverlays;
    g.clear();
    // Drill queue: numbered target markers, worked through in order.
    game.drillQueue.forEach((q, i) => {
      g.rect(q.x * ts + 2, q.y * ts + 2, ts - 4, ts - 4).stroke({ width: 2, color: P.rig });
      if (showLabels) {
        this.setLabel(
          `dq:${i}`,
          `${i + 1}`,
          q.x * ts + ts * 0.6,
          q.y * ts + ts * 0.08,
          ts * 0.3,
          P.rig,
        );
      }
    });
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
