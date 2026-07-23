import type { Camera } from "./camera";
import { worldToScreen } from "./camera";
import type { Game } from "./Game";
import type { Building, Tile, Unit, Well } from "./types";

const C = {
  ground: "#243028",
  groundAlt: "#1f2a24",
  scrub: "#2a382c",
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
  if (tile.surface === "scrub") return C.scrub;
  return (x + y) % 2 === 0 ? C.ground : C.groundAlt;
}

function zoneOverlay(tile: Tile): string | null {
  if (!tile.surveyed) return null;
  if (tile.subsurface.special) return C.special;
  return [C.zone0, C.zone1, C.zone2, C.zone3][tile.subsurface.zone] ?? null;
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
      ctx.fillStyle = C.battery;
      ctx.fillRect(s * 0.05, s * 0.2, s * 0.4, s * 0.6);
      ctx.fillRect(s * 0.55, s * 0.2, s * 0.4, s * 0.6);
      const fill = b.oilCap ? Math.min(1, b.oil / b.oilCap) : 0;
      ctx.fillStyle = "#1a1008";
      ctx.fillRect(s * 0.1, s * 0.7 - s * 0.45 * fill, s * 0.3, s * 0.45 * fill);
      ctx.fillRect(s * 0.6, s * 0.7 - s * 0.45 * fill, s * 0.3, s * 0.45 * fill);
      ctx.fillStyle = C.select;
      ctx.font = `bold ${Math.max(9, Math.floor(size * 0.2))}px monospace`;
      ctx.fillText("BATTERY", 0, s * 0.14);
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
      ctx.fillStyle = C.refinery;
      ctx.fillRect(s * 0.1, s * 0.2, s * 0.8, s * 0.65);
      ctx.fillStyle = "#3a3028";
      ctx.fillRect(s * 0.2, s * 0.05, s * 0.15, s * 0.25);
      ctx.fillRect(s * 0.55, s * 0.0, s * 0.18, s * 0.3);
      ctx.fillStyle = C.select;
      ctx.font = `bold ${Math.max(9, Math.floor(size * 0.2))}px monospace`;
      ctx.fillText("REFINERY", 0, s * 0.95);
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
    ctx.fillStyle = C.truck;
    ctx.fillRect(px + size * 0.15, py + size * 0.3, size * 0.7, size * 0.4);
    ctx.fillStyle = C.select;
    ctx.font = `bold ${Math.max(9, Math.floor(size * 0.2))}px monospace`;
    ctx.fillText("TRUCK", px + size * 0.18, py + size * 0.25);
    if (u.cargo > 0) {
      ctx.fillStyle = "#1a1008";
      ctx.fillRect(
        px + size * 0.2,
        py + size * 0.35,
        size * 0.4 * (u.cargo / u.cargoCap),
        size * 0.3,
      );
    }
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

      if (tile.hasRoad) {
        ctx.strokeStyle = C.roadEdge;
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 3, py + 3, size - 6, size - 6);
      }
      if (tile.isPad && !tile.hasRoad) {
        ctx.strokeStyle = "#6a8058";
        ctx.strokeRect(px + 2, py + 2, size - 4, size - 4);
      }

      const zo = zoneOverlay(tile);
      if (zo) {
        ctx.fillStyle = zo;
        ctx.fillRect(px, py, size, size);
      }

      ctx.strokeStyle = C.grid;
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
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
