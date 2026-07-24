/**
 * Atlas / asset pipeline stub — the single "get texture for kind" gateway.
 *
 * Contract: every sprite the Pixi renderer places is looked up here by frame
 * name (see MANIFEST). At boot we try to load a real packed spritesheet from
 * `public/atlas/atlas-v1.json`; when it's absent (today), we fail soft and
 * generate placeholder textures by drawing the current procedural shapes into
 * RenderTextures once. Swapping in final art later = shipping the atlas file —
 * no renderer code changes.
 *
 * Placeholders are drawn at TEX_TILE px per tile so they stay crisp at max
 * zoom; multi-tile buildings get footprint-sized frames (e.g. battery 2×2).
 */
import {
  Assets,
  Graphics,
  Rectangle,
  Text,
  Texture,
  type Renderer,
  type Spritesheet,
} from "pixi.js";

export const ATLAS_URL = "/atlas/atlas-v1.json";
/** Master resolution: pixels per tile in placeholder / source art. */
export const TEX_TILE = 64;

/** Palette shared by the placeholder frames (mirrors render.ts colors). */
const C = {
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
  road: 0x4a5048,
  roadEdge: 0x6a7068,
  pad: 0x3a4538,
  padEdge: 0x6a8058,
  grid: 0x2e3a32,
  rig: 0xd4a017,
  truck: 0x8a9aaa,
  truckCab: 0x5c6672,
  truckGlass: 0xadd4e4,
  wheel: 0x14171b,
  jack: 0xc4a35a,
  tank: 0x8a9aa2,
  tankEdge: 0xc0d0d8,
  battery: 0x5a8a9a,
  flare: 0xe07030,
  gas: 0x5a9e8a,
  gasCore: 0x7fd0bb,
  refinery: 0x9a6a4a,
  stack: 0x3a3028,
  plant: 0x4a8a7a,
  plantStack: 0x2e3a34,
};

type FrameDef = {
  /** Footprint in tiles (frame is w*TEX_TILE × h*TEX_TILE px). */
  w: number;
  h: number;
  draw: (g: Graphics, s: number) => void;
};

/** A full-tile terrain frame: base fill + optional decor + baked grid line. */
function terrainFrame(base: number, decor?: (g: Graphics, s: number) => void): FrameDef {
  return {
    w: 1,
    h: 1,
    draw: (g, s) => {
      g.rect(0, 0, s, s).fill(base);
      decor?.(g, s);
      g.rect(0.5, 0.5, s - 1, s - 1).stroke({ width: 1, color: C.grid });
    },
  };
}

const rockDecor = (g: Graphics, s: number) => {
  g.poly([s * 0.12, s * 0.82, s * 0.5, s * 0.24, s * 0.88, s * 0.82]).fill(C.rockShadow);
  g.poly([s * 0.5, s * 0.24, s * 0.66, s * 0.52, s * 0.42, s * 0.52]).fill(C.rockPeak);
};

const waterDecor = (g: Graphics, s: number) => {
  g.moveTo(s * 0.2, s * 0.42)
    .quadraticCurveTo(s * 0.35, s * 0.34, s * 0.5, s * 0.42)
    .quadraticCurveTo(s * 0.65, s * 0.5, s * 0.8, s * 0.42)
    .moveTo(s * 0.25, s * 0.64)
    .quadraticCurveTo(s * 0.4, s * 0.56, s * 0.55, s * 0.64)
    .stroke({ width: 1.5, color: C.waterRipple, alpha: 0.5 });
};

/** Letter pip for surveyed prospect grade (kept as a texture, not per-tile Text). */
function pipFrame(letter: string, color: number): FrameDef {
  return {
    w: 1,
    h: 1,
    draw: (g, s) => {
      // Placeholder generation swaps this Graphics for a Text node (see below);
      // the def only records intent. Draw nothing here.
      void g;
      void s;
      void letter;
      void color;
    },
  };
}

const PIP_STYLE: Record<string, { letter: string; color: number }> = {
  "pip.barren": { letter: "X", color: 0x9a9088 },
  "pip.lean": { letter: "L", color: 0xb0a060 },
  "pip.fair": { letter: "F", color: 0xd4b030 },
  "pip.good": { letter: "G", color: 0x6dce6a },
  "pip.sweet": { letter: "S", color: 0xf0c040 },
};

/**
 * Every frame the renderer may request. Real atlas files must use these names.
 * pad = 12% tile inset, matching the canvas renderer's building margins.
 */
export const MANIFEST: Record<string, FrameDef> = {
  "terrain.ground": terrainFrame(C.ground),
  "terrain.ground2": terrainFrame(C.groundAlt),
  "terrain.scrub": terrainFrame(C.scrub, (g, s) => {
    g.circle(s * 0.3, s * 0.35, s * 0.04).circle(s * 0.65, s * 0.6, s * 0.04).fill(C.groundAlt);
  }),
  "terrain.water": terrainFrame(C.water, waterDecor),
  "terrain.water2": terrainFrame(C.waterAlt, waterDecor),
  "terrain.creek": terrainFrame(C.creek),
  "terrain.creek2": terrainFrame(C.creekAlt),
  "terrain.rock": terrainFrame(C.rock, rockDecor),
  "terrain.rock2": terrainFrame(C.rockAlt, rockDecor),
  "infra.road": {
    w: 1,
    h: 1,
    draw: (g, s) => {
      g.rect(0, 0, s, s).fill(C.road);
      g.rect(s * 0.08, s * 0.08, s * 0.84, s * 0.84).stroke({ width: 1.5, color: C.roadEdge });
      g.rect(0.5, 0.5, s - 1, s - 1).stroke({ width: 1, color: C.grid });
    },
  },
  "infra.pad": {
    w: 1,
    h: 1,
    draw: (g, s) => {
      g.rect(0, 0, s, s).fill(C.pad);
      g.rect(s * 0.06, s * 0.06, s * 0.88, s * 0.88).stroke({ width: 1.5, color: C.padEdge });
      g.rect(0.5, 0.5, s - 1, s - 1).stroke({ width: 1, color: C.grid });
    },
  },
  "building.pumpjack": {
    w: 1,
    h: 1,
    draw: (g, s) => {
      const p = s * 0.12;
      const w = s - p * 2;
      g.rect(p + w * 0.35, p + w * 0.5, w * 0.3, w * 0.4).fill(C.jack);
      g.moveTo(p + w * 0.15, p + w * 0.55)
        .lineTo(p + w * 0.85, p + w * 0.2)
        .stroke({ width: s * 0.06, color: C.jack });
    },
  },
  "building.wellhead_tank": {
    w: 1,
    h: 1,
    draw: (g, s) => {
      const p = s * 0.12;
      const w = s - p * 2;
      g.rect(p + w * 0.15, p + w * 0.2, w * 0.7, w * 0.65).fill(C.tank);
      g.rect(p + w * 0.15, p + w * 0.2, w * 0.7, w * 0.65).stroke({ width: 2, color: C.tankEdge });
    },
  },
  "building.battery": {
    w: 2,
    h: 2,
    draw: (g, s) => {
      const p = s * 0.12;
      const fw = s * 2 - p * 2;
      const fh = s * 2 - p * 2;
      g.rect(p + fw * 0.05, p + fh * 0.2, fw * 0.4, fh * 0.6).fill(C.battery);
      g.rect(p + fw * 0.55, p + fh * 0.2, fw * 0.4, fh * 0.6).fill(C.battery);
      g.rect(p + fw * 0.05, p + fh * 0.2, fw * 0.4, fh * 0.6).stroke({ width: 2, color: C.tankEdge, alpha: 0.5 });
      g.rect(p + fw * 0.55, p + fh * 0.2, fw * 0.4, fh * 0.6).stroke({ width: 2, color: C.tankEdge, alpha: 0.5 });
    },
  },
  "building.refinery": {
    w: 2,
    h: 2,
    draw: (g, s) => {
      const p = s * 0.12;
      const fw = s * 2 - p * 2;
      const fh = s * 2 - p * 2;
      g.rect(p + fw * 0.1, p + fh * 0.25, fw * 0.8, fh * 0.6).fill(C.refinery);
      g.rect(p + fw * 0.22, p + fh * 0.08, fw * 0.12, fh * 0.2).fill(C.stack);
      g.rect(p + fw * 0.55, p + fh * 0.04, fw * 0.14, fh * 0.24).fill(C.stack);
    },
  },
  "building.gas_plant": {
    w: 2,
    h: 2,
    draw: (g, s) => {
      const p = s * 0.12;
      const fw = s * 2 - p * 2;
      const fh = s * 2 - p * 2;
      g.rect(p + fw * 0.08, p + fh * 0.35, fw * 0.84, fh * 0.5).fill(C.plant);
      g.rect(p + fw * 0.16, p + fh * 0.1, fw * 0.1, fh * 0.28).fill(C.plantStack);
      g.circle(p + fw * 0.5, p + fh * 0.32, fh * 0.16).fill(C.gasCore);
      g.circle(p + fw * 0.74, p + fh * 0.34, fh * 0.13).fill(C.gasCore);
    },
  },
  "building.gas_line": {
    w: 1,
    h: 1,
    draw: (g, s) => {
      const p = s * 0.12;
      const w = s - p * 2;
      g.rect(p + w * 0.15, p + w * 0.35, w * 0.7, w * 0.3).stroke({ width: 3, color: C.gas });
    },
  },
  "unit.drill_rig": {
    w: 1,
    h: 1,
    draw: (g, s) => {
      g.rect(s * 0.25, s * 0.2, s * 0.5, s * 0.55).fill(C.rig);
      g.rect(s * 0.45, s * 0.05, s * 0.1, s * 0.2).fill(C.rig);
    },
  },
  // Truck faces +x; the renderer rotates the sprite to its heading.
  "unit.truck": {
    w: 1,
    h: 1,
    draw: (g, s) => {
      const L = s * 0.82;
      const W = s * 0.42;
      const cx = s / 2;
      const cy = s / 2;
      const wheel = s * 0.07;
      for (const wx of [-L * 0.28, L * 0.04, L * 0.26]) {
        g.circle(cx + wx, cy - W * 0.52, wheel).circle(cx + wx, cy + W * 0.52, wheel).fill(C.wheel);
      }
      g.rect(cx - L * 0.44, cy - W * 0.5, L * 0.56, W)
        .fill(C.truck)
        .stroke({ width: s * 0.03, color: 0x39414b });
      g.rect(cx + L * 0.14, cy - W * 0.42, L * 0.26, W * 0.84)
        .fill(C.truckCab)
        .stroke({ width: s * 0.03, color: 0x39414b });
      g.rect(cx + L * 0.32, cy - W * 0.3, L * 0.06, W * 0.6).fill(C.truckGlass);
    },
  },
  "fx.flare": {
    w: 1,
    h: 1,
    draw: (g, s) => {
      g.poly([s * 0.5, s * 0.05, s * 0.7, s * 0.45, s * 0.3, s * 0.45]).fill(C.flare);
      g.poly([s * 0.5, s * 0.16, s * 0.62, s * 0.42, s * 0.38, s * 0.42]).fill(0xf0c040);
    },
  },
  "pip.barren": pipFrame("X", 0x9a9088),
  "pip.lean": pipFrame("L", 0xb0a060),
  "pip.fair": pipFrame("F", 0xd4b030),
  "pip.good": pipFrame("G", 0x6dce6a),
  "pip.sweet": pipFrame("S", 0xf0c040),
};

const frames = new Map<string, Texture>();
let mode: "unloaded" | "atlas" | "placeholder" = "unloaded";

/** How textures were sourced — for debugging / the README note. */
export function atlasMode(): string {
  return mode;
}

/** Texture for a manifest frame name. Always safe: falls back to WHITE. */
export function texFor(name: string): Texture {
  return frames.get(name) ?? Texture.WHITE;
}

/**
 * Load the real atlas if present, else generate placeholder textures.
 * Must run once after the Pixi renderer exists (needed for generateTexture).
 */
export async function initAtlas(renderer: Renderer): Promise<void> {
  if (mode !== "unloaded") return;

  // 1) Real packed atlas (art pass ships this file; absent today).
  try {
    const head = await fetch(ATLAS_URL);
    if (head.ok && (head.headers.get("content-type") ?? "").includes("json")) {
      const sheet = (await Assets.load(ATLAS_URL)) as Spritesheet;
      let found = 0;
      for (const name of Object.keys(MANIFEST)) {
        const tex = sheet.textures?.[name];
        if (tex) {
          frames.set(name, tex);
          found++;
        }
      }
      if (found > 0) {
        mode = "atlas";
        console.info(`[atlas] loaded ${found}/${Object.keys(MANIFEST).length} frames from ${ATLAS_URL}`);
        if (found === Object.keys(MANIFEST).length) return;
        // Partial atlas: fall through and fill the gaps with placeholders.
      }
    }
  } catch {
    // No atlas yet — expected until the art pass. Fall through.
  }

  // 2) Placeholder generation: draw current procedural shapes into textures.
  for (const [name, def] of Object.entries(MANIFEST)) {
    if (frames.has(name)) continue;
    const pip = PIP_STYLE[name];
    if (pip) {
      const t = new Text({
        text: pip.letter,
        style: { fontFamily: "monospace", fontWeight: "bold", fontSize: TEX_TILE * 0.7, fill: pip.color },
      });
      frames.set(name, renderer.generateTexture({ target: t }));
      t.destroy();
      continue;
    }
    const g = new Graphics();
    def.draw(g, TEX_TILE);
    frames.set(
      name,
      renderer.generateTexture({
        target: g,
        frame: new Rectangle(0, 0, def.w * TEX_TILE, def.h * TEX_TILE),
      }),
    );
    g.destroy();
  }
  if (mode !== "atlas") mode = "placeholder";
}
