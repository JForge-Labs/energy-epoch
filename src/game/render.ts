import type { Camera } from "./camera";
import { worldToScreen } from "./camera";
import type { Game } from "./Game";
import type { Building, Tile, Unit, Well } from "./types";

const C = {
  ground: "#243028",
  groundAlt: "#1f2a24",
  scrub: "#2a382c",
  water: "#1e3a4a",
  waterAlt: "#254a5c",
  waterRipple: "rgba(150, 200, 220, 0.18)",
  creek: "#2f6a7a",
  creekAlt: "#356f80",
  rock: "#413d37",
  rockAlt: "#4a453d",
  rockPeak: "#5c5648",
  rockShadow: "#2c2924",
  oilPipe: "#c07a2e",
  oilPipeCore: "#e8a24a",
  gasPipe: "#4aa892",
  gasPipeCore: "#7fd0bb",
  pipeDead: "#565049",
  pipeDeadCore: "#726a5f",
  plant: "#4a8a7a",
  road: "#4a5048",
  roadEdge: "#6a7068",
  pad: "#3a4538",
  grid: "#2e3a32",
  zone0: "rgba(107, 158, 107, 0.18)",
  zone1: "rgba(212, 160, 23, 0.16)",
  zone2: "rgba(196, 92, 38, 0.18)",
  zone3: "rgba(140, 60, 90, 0.2)",
  special: "rgba(200, 80, 120, 0.2)",
  rig: "#d4a017",
  truck: "#8a9aaa",
  jack: "#c4a35a",
  tank: "#6a7a82",
  battery: "#5a8a9a",
  flare: "#e07030",
  gas: "#5a9e8a",
  refinery: "#9a6a4a",
  duster: "#5a5048",
  select: "#f0c040",
  spill: "rgba(40, 20, 8, 0.55)",
  storm: "rgba(40, 50, 70, 0.25)",
  label: "#e8ece6",
};

function surfaceColor(tile: Tile, x: number, y: number): string {
  if (tile.hasRoad) return C.road;
  if (tile.isPad) return C.pad;
  const even = (x + y) % 2 === 0;
  switch (tile.terrain) {
    case "water":
      return even ? C.water : C.waterAlt;
    case "creek":
      return even ? C.creek : C.creekAlt;
    case "rock":
      return even ? C.rock : C.rockAlt;
    case "scrub":
      return C.scrub;
    default:
      return even ? C.ground : C.groundAlt;
  }
}

/** Decorate obstacle terrain — mountain peaks, water ripples — for depth. */
function drawTerrainDecor(
  ctx: CanvasRenderingContext2D,
  tile: Tile,
  px: number,
  py: number,
  size: number,
) {
  if (tile.hasRoad) return;
  if (tile.terrain === "rock") {
    ctx.fillStyle = C.rockShadow;
    ctx.beginPath();
    ctx.moveTo(px + size * 0.12, py + size * 0.82);
    ctx.lineTo(px + size * 0.5, py + size * 0.24);
    ctx.lineTo(px + size * 0.88, py + size * 0.82);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.rockPeak;
    ctx.beginPath();
    ctx.moveTo(px + size * 0.5, py + size * 0.24);
    ctx.lineTo(px + size * 0.66, py + size * 0.52);
    ctx.lineTo(px + size * 0.42, py + size * 0.52);
    ctx.closePath();
    ctx.fill();
  } else if (tile.terrain === "water") {
    ctx.strokeStyle = C.waterRipple;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px + size * 0.2, py + size * 0.42);
    ctx.quadraticCurveTo(
      px + size * 0.35,
      py + size * 0.34,
      px + size * 0.5,
      py + size * 0.42,
    );
    ctx.quadraticCurveTo(
      px + size * 0.65,
      py + size * 0.5,
      px + size * 0.8,
      py + size * 0.42,
    );
    ctx.moveTo(px + size * 0.25, py + size * 0.64);
    ctx.quadraticCurveTo(
      px + size * 0.4,
      py + size * 0.56,
      px + size * 0.55,
      py + size * 0.64,
    );
    ctx.stroke();
  }
}

/** Does a pipe of `kind` connect to whatever asset sits on tile (nx,ny)?
 *  Shared with the Pixi renderer so both draw identical snap runs. */
export function pipeSnapsTo(
  game: Game,
  nx: number,
  ny: number,
  kind: "oilPipe" | "gasPipe",
  snappedWells?: Set<string>,
): boolean {
  const nb = game.tiles[ny]?.[nx];
  if (!nb) return false;
  const b = game.buildingAt(nx, ny);
  if (kind === "oilPipe") {
    return (
      b?.kind === "battery" ||
      b?.kind === "refinery" ||
      b?.kind === "wellhead_tank"
    );
  }
  // Gas pipes tie a wellhead (the gas source) into a plant / gas line.
  if (b?.kind === "gas_plant" || b?.kind === "gas_line") return true;
  if (nb.wellId == null) return false;
  // One gas connection per wellhead — the first adjacent pipe tile claims it,
  // so a wellhead boxed in by pipe doesn't sprout 3 connection stubs.
  if (snappedWells) {
    const key = `${nx},${ny}`;
    if (snappedWells.has(key)) return false;
    snappedWells.add(key);
  }
  return true;
}

/**
 * Draw the pipe on a tile as a connected network. Runs reach into any pipe
 * neighbor AND snap into the assets they serve (no gaps). A line wired to its
 * sink (battery/refinery for oil, gas plant for gas) is "live": bright with an
 * animated flow; an unconnected stub reads dim/grey so dead lines stand out.
 */
function drawPipeTile(
  ctx: CanvasRenderingContext2D,
  game: Game,
  x: number,
  y: number,
  px: number,
  py: number,
  size: number,
  kind: "oilPipe" | "gasPipe",
  time: number,
  snappedWells: Set<string>,
) {
  const tiles = game.tiles;
  const tile = tiles[y][x];
  if (!tile[kind]) return;
  const cx = px + size / 2;
  const cy = py + size / 2;
  const live =
    kind === "oilPipe"
      ? game.oilConnectedTiles.has(`${x},${y}`)
      : game.gasConnectedTiles.has(`${x},${y}`);
  const casing = live ? (kind === "oilPipe" ? C.oilPipe : C.gasPipe) : C.pipeDead;
  const core = live
    ? kind === "oilPipe"
      ? C.oilPipeCore
      : C.gasPipeCore
    : C.pipeDeadCore;
  // Slimmer than before — cleans up the map when lines run everywhere.
  const outer = Math.max(2.5, size * 0.15);
  const inner = Math.max(1.4, size * 0.07);
  const neighbors: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  // Directions that carry a run: a pipe neighbor, or an asset to snap into.
  const dirs: [number, number][] = [];
  for (const [dx, dy] of neighbors) {
    const nb = tiles[y + dy]?.[x + dx];
    if ((nb && nb[kind]) || pipeSnapsTo(game, x + dx, y + dy, kind, snappedWells)) {
      dirs.push([dx, dy]);
    }
  }

  const runs = (w: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    if (dirs.length) {
      for (const [dx, dy] of dirs) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + (dx * size) / 2, cy + (dy * size) / 2);
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, w * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  };

  // Casing: solid, rounded joins.
  ctx.lineCap = "round";
  ctx.setLineDash([]);
  runs(outer, casing);

  // Core: on a live line, marching dashes read as product flowing to the sink.
  if (live && dirs.length) {
    const dash = Math.max(3, size * 0.2);
    ctx.lineCap = "butt";
    ctx.setLineDash([dash, dash]);
    ctx.lineDashOffset = -((time * 0.05) % (dash * 2));
  } else {
    ctx.lineCap = "round";
    ctx.setLineDash([]);
  }
  runs(inner, core);
  ctx.setLineDash([]);
}

function prospectOverlay(tile: Tile): string | null {
  if (!tile.surveyed) return null;
  // Prospect grade — NOT zone. Green/gold = drill; gray = skip.
  const p = tile.subsurface.prospect;
  if (p < 0.22) return "rgba(70, 72, 68, 0.55)"; // barren
  if (p < 0.4) return "rgba(110, 100, 60, 0.4)"; // lean
  if (p < 0.55) return "rgba(180, 150, 50, 0.35)"; // fair
  if (p < 0.72) return "rgba(70, 160, 75, 0.45)"; // good
  return "rgba(230, 190, 40, 0.5)"; // sweet
}

function drawProspectPip(
  ctx: CanvasRenderingContext2D,
  tile: Tile,
  px: number,
  py: number,
  size: number,
) {
  if (!tile.surveyed || tile.drilled) return;
  const p = tile.subsurface.prospect;
  let label = "·";
  let color = "#888";
  if (p < 0.22) {
    label = "X";
    color = "#9a9088";
  } else if (p < 0.4) {
    label = "L";
    color = "#b0a060";
  } else if (p < 0.55) {
    label = "F";
    color = "#d4b030";
  } else if (p < 0.72) {
    label = "G";
    color = "#6dce6a";
  } else {
    label = "S";
    color = "#f0c040";
  }
  ctx.fillStyle = color;
  ctx.font = `bold ${Math.max(10, Math.floor(size * 0.32))}px monospace`;
  ctx.fillText(label, px + size * 0.12, py + size * 0.32);
  // Zone as tiny footnote — not the main signal
  ctx.fillStyle = "rgba(200,210,200,0.55)";
  ctx.font = `${Math.max(8, Math.floor(size * 0.18))}px monospace`;
  ctx.fillText(`z${tile.subsurface.zone}`, px + size * 0.55, py + size * 0.9);
}

function drawWell(
  ctx: CanvasRenderingContext2D,
  well: Well,
  px: number,
  py: number,
  size: number,
) {
  if (well.status === "drilling") {
    ctx.strokeStyle = C.rig;
    ctx.lineWidth = 2;
    const p = well.drillProgress / well.drillDaysNeeded;
    ctx.beginPath();
    ctx.arc(
      px + size / 2,
      py + size / 2,
      size * 0.28,
      -Math.PI / 2,
      -Math.PI / 2 + p * Math.PI * 2,
    );
    ctx.stroke();
    ctx.fillStyle = C.label;
    ctx.font = `${Math.max(10, Math.floor(size * 0.28))}px monospace`;
    ctx.fillText(`${Math.floor(p * 100)}%`, px + size * 0.28, py + size * 0.55);
    return;
  }
  if (well.status === "duster") {
    ctx.strokeStyle = C.duster;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px + size * 0.3, py + size * 0.3);
    ctx.lineTo(px + size * 0.7, py + size * 0.7);
    ctx.moveTo(px + size * 0.7, py + size * 0.3);
    ctx.lineTo(px + size * 0.3, py + size * 0.7);
    ctx.stroke();
    ctx.fillStyle = "#b0a090";
    ctx.font = `${Math.max(9, Math.floor(size * 0.22))}px monospace`;
    ctx.fillText("DUSTER", px + 2, py + size - 4);
  }
  if (well.status === "producing" && well.choked) {
    // Red "shut in" ring + bar so throttled wells read at a glance.
    ctx.strokeStyle = "#c45c26";
    ctx.lineWidth = 2;
    ctx.strokeRect(px + size * 0.15, py + size * 0.15, size * 0.7, size * 0.7);
    ctx.fillStyle = "#c45c26";
    ctx.font = `bold ${Math.max(8, Math.floor(size * 0.2))}px monospace`;
    ctx.fillText("SHUT", px + size * 0.2, py + size * 0.55);
  }
}

function drawBuilding(
  ctx: CanvasRenderingContext2D,
  b: Building,
  px: number,
  py: number,
  size: number,
  well?: Well,
) {
  const pad = size * 0.12;
  const s = size - pad * 2;
  ctx.save();
  ctx.translate(px + pad, py + pad);
  ctx.globalAlpha = b.online ? 1 : 0.35;

  switch (b.kind) {
    case "pumpjack": {
      ctx.fillStyle = C.jack;
      ctx.fillRect(s * 0.35, s * 0.5, s * 0.3, s * 0.4);
      ctx.strokeStyle = C.jack;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s * 0.15, s * 0.55);
      ctx.lineTo(s * 0.85, s * 0.2);
      ctx.stroke();
      if (well && well.status === "producing") {
        ctx.fillStyle = C.select;
        ctx.font = `bold ${Math.max(10, Math.floor(size * 0.26))}px monospace`;
        ctx.fillText(`${well.oilRate.toFixed(0)} bopd`, -pad + 2, -2);
      }
      break;
    }
    case "wellhead_tank": {
      ctx.fillStyle = "#8a9aa2";
      ctx.fillRect(s * 0.15, s * 0.2, s * 0.7, s * 0.65);
      ctx.strokeStyle = "#c0d0d8";
      ctx.lineWidth = 2;
      ctx.strokeRect(s * 0.15, s * 0.2, s * 0.7, s * 0.65);
      const fill = b.oilCap ? Math.min(1, b.oil / b.oilCap) : 0;
      ctx.fillStyle = "#1a1008";
      ctx.fillRect(s * 0.2, s * 0.75 - s * 0.5 * fill, s * 0.6, s * 0.5 * fill);
      ctx.fillStyle = C.select;
      ctx.font = `bold ${Math.max(9, Math.floor(size * 0.22))}px monospace`;
      ctx.fillText("TANK", s * 0.22, s * 0.18);
      ctx.fillStyle = C.label;
      ctx.fillText(`${b.oil.toFixed(0)}`, s * 0.28, s * 0.55);
      break;
    }
    case "battery": {
      // Scale to footprint (2×2 by default): crude tank + clean tank across the width.
      const sw = size * (b.w ?? 1) - pad * 2;
      const sh = size * (b.h ?? 1) - pad * 2;
      ctx.fillStyle = C.battery;
      ctx.fillRect(sw * 0.05, sh * 0.2, sw * 0.4, sh * 0.6);
      ctx.fillRect(sw * 0.55, sh * 0.2, sw * 0.4, sh * 0.6);
      const crudeFill = b.crudeCap ? Math.min(1, b.crude / b.crudeCap) : 0;
      const cleanFill = b.cleanCap ? Math.min(1, b.clean / b.cleanCap) : 0;
      ctx.fillStyle = "#1a1008";
      ctx.fillRect(sw * 0.1, sh * 0.7 - sh * 0.45 * crudeFill, sw * 0.3, sh * 0.45 * crudeFill);
      ctx.fillStyle = "#c8b070";
      ctx.fillRect(sw * 0.6, sh * 0.7 - sh * 0.45 * cleanFill, sw * 0.3, sh * 0.45 * cleanFill);
      ctx.fillStyle = C.select;
      ctx.font = `bold ${Math.max(8, Math.floor(size * 0.16))}px monospace`;
      ctx.fillText("CRUDE", sw * 0.02, sh * 0.14);
      ctx.fillText("CLEAN", sw * 0.55, sh * 0.14);
      break;
    }
    case "gas_flare": {
      if (!b.online) break;
      ctx.fillStyle = C.flare;
      ctx.beginPath();
      ctx.moveTo(s * 0.5, s * 0.05);
      ctx.lineTo(s * 0.7, s * 0.45);
      ctx.lineTo(s * 0.3, s * 0.45);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "gas_line": {
      ctx.strokeStyle = C.gas;
      ctx.lineWidth = 3;
      ctx.strokeRect(s * 0.15, s * 0.35, s * 0.7, s * 0.3);
      break;
    }
    case "refinery": {
      // Scale to footprint (2×2 by default): tank block with two stacks.
      const sw = size * (b.w ?? 1) - pad * 2;
      const sh = size * (b.h ?? 1) - pad * 2;
      ctx.fillStyle = C.refinery;
      ctx.fillRect(sw * 0.1, sh * 0.25, sw * 0.8, sh * 0.6);
      ctx.fillStyle = "#3a3028";
      ctx.fillRect(sw * 0.22, sh * 0.08, sw * 0.12, sh * 0.2);
      ctx.fillRect(sw * 0.55, sh * 0.04, sw * 0.14, sh * 0.24);
      ctx.fillStyle = C.select;
      ctx.font = `bold ${Math.max(9, Math.floor(size * 0.24))}px monospace`;
      ctx.fillText("REFINERY", sw * 0.12, sh * 0.55);
      break;
    }
    case "gas_plant": {
      // 2×2 processing skid: body + spheres + stack.
      const sw = size * (b.w ?? 1) - pad * 2;
      const sh = size * (b.h ?? 1) - pad * 2;
      ctx.fillStyle = C.plant;
      ctx.fillRect(sw * 0.08, sh * 0.35, sw * 0.84, sh * 0.5);
      ctx.fillStyle = "#2e3a34";
      ctx.fillRect(sw * 0.16, sh * 0.1, sw * 0.1, sh * 0.28);
      ctx.fillStyle = C.gasPipeCore;
      ctx.beginPath();
      ctx.arc(sw * 0.5, sh * 0.32, sh * 0.16, 0, Math.PI * 2);
      ctx.arc(sw * 0.74, sh * 0.34, sh * 0.13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.select;
      ctx.font = `bold ${Math.max(8, Math.floor(size * 0.2))}px monospace`;
      ctx.fillText("GAS PLANT", sw * 0.1, sh * 0.7);
      break;
    }
  }
  ctx.restore();
}

function drawUnit(
  ctx: CanvasRenderingContext2D,
  u: Unit,
  px: number,
  py: number,
  size: number,
  selected: boolean,
) {
  ctx.save();
  if (u.kind === "drill_rig") {
    ctx.fillStyle = C.rig;
    ctx.fillRect(px + size * 0.25, py + size * 0.2, size * 0.5, size * 0.55);
    ctx.fillRect(px + size * 0.45, py + size * 0.05, size * 0.1, size * 0.2);
    ctx.fillStyle = "#1a1610";
    ctx.font = `${Math.floor(size * 0.28)}px monospace`;
    ctx.fillText(`T${u.tier}`, px + size * 0.3, py + size * 0.55);
  } else {
    // A top-down tanker: trailer + cab + wheels, pointed along its heading.
    let hx = 1;
    let hy = 0;
    if (u.path && u.path.length) {
      const ddx = u.path[0].x - u.x;
      const ddy = u.path[0].y - u.y;
      if (Math.abs(ddx) > 0.01 || Math.abs(ddy) > 0.01) {
        const m = Math.hypot(ddx, ddy);
        hx = ddx / m;
        hy = ddy / m;
      }
    }
    ctx.save();
    ctx.translate(px + size / 2, py + size / 2);
    ctx.rotate(Math.atan2(hy, hx));
    const L = size * 0.82;
    const W = size * 0.42;
    const wheel = Math.max(1.4, size * 0.07);
    // Wheels (drawn first so the body sits over them).
    ctx.fillStyle = "#14171b";
    for (const wx of [-L * 0.28, L * 0.04, L * 0.26]) {
      ctx.beginPath();
      ctx.arc(wx, -W * 0.52, wheel, 0, Math.PI * 2);
      ctx.arc(wx, W * 0.52, wheel, 0, Math.PI * 2);
      ctx.fill();
    }
    // Trailer (the tank body).
    ctx.fillStyle = C.truck;
    ctx.strokeStyle = "#39414b";
    ctx.lineWidth = Math.max(1, size * 0.03);
    ctx.beginPath();
    ctx.rect(-L * 0.44, -W * 0.5, L * 0.56, W);
    ctx.fill();
    ctx.stroke();
    // Cargo level fills the tank from the rear; tint by product.
    if (u.cargo > 0 && u.cargoCap > 0) {
      const frac = Math.min(1, u.cargo / u.cargoCap);
      ctx.fillStyle = u.cargoKind === "clean" ? "#c8b070" : "#241609";
      ctx.fillRect(-L * 0.42, -W * 0.38, L * 0.52 * frac, W * 0.76);
    }
    // Cab up front.
    ctx.fillStyle = "#5c6672";
    ctx.beginPath();
    ctx.rect(L * 0.14, -W * 0.42, L * 0.26, W * 0.84);
    ctx.fill();
    ctx.stroke();
    // Windshield glint.
    ctx.fillStyle = "#add4e4";
    ctx.fillRect(L * 0.32, -W * 0.3, L * 0.06, W * 0.6);
    ctx.restore();
  }
  if (selected) {
    ctx.strokeStyle = C.select;
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 2, py + 2, size - 4, size - 4);
  }
  ctx.restore();
}

export function renderGame(
  ctx: CanvasRenderingContext2D,
  game: Game,
  cam: Camera,
  hover: { x: number; y: number } | null,
) {
  const { cols, rows, tileSize } = game.config;
  const time = performance.now();
  // One gas snap per wellhead across the whole frame (shared by all pipe tiles).
  const snappedWells = new Set<string>();
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const tile = game.tiles[y][x];
      const { sx: px, sy: py, size } = worldToScreen(
        cam,
        ctx.canvas.width,
        ctx.canvas.height,
        tileSize,
        x,
        y,
      );
      if (px + size < 0 || py + size < 0 || px > ctx.canvas.width || py > ctx.canvas.height) {
        continue;
      }
      ctx.fillStyle = surfaceColor(tile, x, y);
      ctx.fillRect(px, py, size, size);
      drawTerrainDecor(ctx, tile, px, py, size);

      if (tile.hasRoad) {
        ctx.strokeStyle = C.roadEdge;
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 3, py + 3, size - 6, size - 6);
      }
      if (tile.isPad && !tile.hasRoad) {
        ctx.strokeStyle = "#6a8058";
        ctx.strokeRect(px + 2, py + 2, size - 4, size - 4);
      }

      const zo = prospectOverlay(tile);
      if (zo) {
        ctx.fillStyle = zo;
        ctx.fillRect(px, py, size, size);
      }
      if (tile.surveyed && tile.subsurface.special) {
        ctx.strokeStyle = "rgba(200, 80, 120, 0.8)";
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 2, py + 2, size - 4, size - 4);
      }
      drawProspectPip(ctx, tile, px, py, size);

      ctx.strokeStyle = C.grid;
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);

      drawPipeTile(ctx, game, x, y, px, py, size, "oilPipe", time, snappedWells);
      drawPipeTile(ctx, game, x, y, px, py, size, "gasPipe", time, snappedWells);
    }
  }

  for (const s of game.spills) {
    const { sx, sy, size } = worldToScreen(
      cam,
      ctx.canvas.width,
      ctx.canvas.height,
      tileSize,
      s.x,
      s.y,
    );
    ctx.fillStyle = C.spill;
    ctx.beginPath();
    ctx.arc(
      sx + size / 2,
      sy + size / 2,
      size * (0.25 + Math.min(0.4, s.barrels / 80)),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  for (const b of game.buildings) {
    if (b.kind === "gas_flare") continue;
    const { sx, sy, size } = worldToScreen(
      cam,
      ctx.canvas.width,
      ctx.canvas.height,
      tileSize,
      b.x,
      b.y,
    );
    const well = b.wellId ? game.wells.find((w) => w.id === b.wellId) : undefined;
    drawBuilding(ctx, b, sx, sy, size, well);
  }
  for (const well of game.wells) {
    const { sx, sy, size } = worldToScreen(
      cam,
      ctx.canvas.width,
      ctx.canvas.height,
      tileSize,
      well.x,
      well.y,
    );
    drawWell(ctx, well, sx, sy, size);
  }
  for (const b of game.buildings) {
    if (b.kind !== "gas_flare") continue;
    const { sx, sy, size } = worldToScreen(
      cam,
      ctx.canvas.width,
      ctx.canvas.height,
      tileSize,
      b.x,
      b.y,
    );
    drawBuilding(ctx, b, sx, sy, size);
  }

  for (const u of game.units) {
    const { sx, sy, size } = worldToScreen(
      cam,
      ctx.canvas.width,
      ctx.canvas.height,
      tileSize,
      u.x,
      u.y,
    );
    drawUnit(ctx, u, sx, sy, size, u.id === game.selectedUnitId);
  }

  // Drill queue: numbered target markers the rig will work through in order.
  game.drillQueue.forEach((q, i) => {
    const { sx, sy, size } = worldToScreen(
      cam,
      ctx.canvas.width,
      ctx.canvas.height,
      tileSize,
      q.x,
      q.y,
    );
    ctx.strokeStyle = C.rig;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(sx + 2, sy + 2, size - 4, size - 4);
    ctx.setLineDash([]);
    const r = Math.max(6, size * 0.2);
    ctx.fillStyle = "rgba(20,22,16,0.85)";
    ctx.beginPath();
    ctx.arc(sx + size - r - 2, sy + r + 2, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.rig;
    ctx.font = `bold ${Math.max(9, Math.floor(size * 0.28))}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${i + 1}`, sx + size - r - 2, sy + r + 2);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  });

  if (hover) {
    const { sx, sy, size } = worldToScreen(
      cam,
      ctx.canvas.width,
      ctx.canvas.height,
      tileSize,
      hover.x,
      hover.y,
    );
    ctx.strokeStyle = C.select;
    ctx.lineWidth = 2;
    ctx.strokeRect(sx + 1, sy + 1, size - 2, size - 2);
  }

  if (game.weather.kind !== "clear") {
    ctx.fillStyle = C.storm;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }
}

export function canvasToTile(
  canvas: HTMLCanvasElement,
  game: Game,
  cam: Camera,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const mx = (clientX - rect.left) * scaleX;
  const my = (clientY - rect.top) * scaleY;
  const size = game.config.tileSize * cam.zoom;
  const x = Math.floor(cam.x + (mx - canvas.width / 2) / size);
  const y = Math.floor(cam.y + (my - canvas.height / 2) / size);
  if (x < 0 || y < 0 || x >= game.config.cols || y >= game.config.rows) return null;
  return { x, y };
}
