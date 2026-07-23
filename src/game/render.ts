import type { Game } from "./Game";
import type { Building, Tile, Unit, Well } from "./types";

const C = {
  ground: "#243028",
  groundAlt: "#1f2a24",
  scrub: "#2a382c",
  road: "#3a403c",
  grid: "#2e3a32",
  zone0: "rgba(107, 158, 107, 0.18)",
  zone1: "rgba(212, 160, 23, 0.16)",
  zone2: "rgba(196, 92, 38, 0.18)",
  zone3: "rgba(140, 60, 90, 0.2)",
  rig: "#d4a017",
  truck: "#8a9aaa",
  jack: "#c4a35a",
  tank: "#6a7a82",
  flare: "#e07030",
  gas: "#5a9e8a",
  refinery: "#9a6a4a",
  duster: "#5a5048",
  select: "#f0c040",
  spill: "rgba(40, 20, 8, 0.55)",
  storm: "rgba(40, 50, 70, 0.25)",
};

function surfaceColor(tile: Tile, x: number, y: number): string {
  if (tile.surface === "road") return C.road;
  if (tile.surface === "scrub") return C.scrub;
  return (x + y) % 2 === 0 ? C.ground : C.groundAlt;
}

function zoneOverlay(tile: Tile): string | null {
  if (!tile.surveyed) return null;
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
    ctx.arc(px + size / 2, py + size / 2, size * 0.28, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
    ctx.stroke();
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
  }
}

function drawBuilding(
  ctx: CanvasRenderingContext2D,
  b: Building,
  px: number,
  py: number,
  size: number,
) {
  const pad = size * 0.15;
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
      break;
    }
    case "tank": {
      ctx.fillStyle = C.tank;
      ctx.beginPath();
      ctx.ellipse(s * 0.5, s * 0.55, s * 0.4, s * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
      const fill = b.oilCap ? Math.min(1, b.oil / b.oilCap) : 0;
      ctx.fillStyle = "#1a1008";
      ctx.beginPath();
      ctx.ellipse(s * 0.5, s * 0.55, s * 0.4 * fill, s * 0.34 * fill, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "gas_flare": {
      if (!b.online) break;
      ctx.fillStyle = C.flare;
      ctx.beginPath();
      ctx.moveTo(s * 0.5, s * 0.1);
      ctx.lineTo(s * 0.65, s * 0.45);
      ctx.lineTo(s * 0.35, s * 0.45);
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
      break;
    }
  }
  ctx.restore();
}

function drawUnit(
  ctx: CanvasRenderingContext2D,
  u: Unit,
  ox: number,
  oy: number,
  size: number,
  selected: boolean,
) {
  const px = ox + u.x * size;
  const py = oy + u.y * size;
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
  hover: { x: number; y: number } | null,
) {
  const { cols, rows, tileSize } = game.config;
  const w = cols * tileSize;
  const h = rows * tileSize;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const ox = Math.floor((ctx.canvas.width - w) / 2);
  const oy = Math.floor((ctx.canvas.height - h) / 2);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const tile = game.tiles[y][x];
      const px = ox + x * tileSize;
      const py = oy + y * tileSize;
      ctx.fillStyle = surfaceColor(tile, x, y);
      ctx.fillRect(px, py, tileSize, tileSize);

      const zo = zoneOverlay(tile);
      if (zo) {
        ctx.fillStyle = zo;
        ctx.fillRect(px, py, tileSize, tileSize);
      }

      ctx.strokeStyle = C.grid;
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, tileSize - 1, tileSize - 1);
    }
  }

  for (const s of game.spills) {
    ctx.fillStyle = C.spill;
    ctx.beginPath();
    ctx.arc(
      ox + (s.x + 0.5) * tileSize,
      oy + (s.y + 0.5) * tileSize,
      tileSize * (0.25 + Math.min(0.4, s.barrels / 80)),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  for (const b of game.buildings) {
    if (b.kind === "gas_flare") continue; // draw after jack
    drawBuilding(ctx, b, ox + b.x * tileSize, oy + b.y * tileSize, tileSize);
  }
  for (const well of game.wells) {
    drawWell(ctx, well, ox + well.x * tileSize, oy + well.y * tileSize, tileSize);
  }
  for (const b of game.buildings) {
    if (b.kind === "gas_flare") {
      drawBuilding(ctx, b, ox + b.x * tileSize, oy + b.y * tileSize, tileSize);
    }
  }

  for (const u of game.units) {
    drawUnit(ctx, u, ox, oy, tileSize, u.id === game.selectedUnitId);
  }

  if (hover) {
    ctx.strokeStyle = C.select;
    ctx.lineWidth = 2;
    ctx.strokeRect(
      ox + hover.x * tileSize + 1,
      oy + hover.y * tileSize + 1,
      tileSize - 2,
      tileSize - 2,
    );
  }

  if (game.weather.kind !== "clear") {
    ctx.fillStyle = C.storm;
    ctx.fillRect(ox, oy, w, h);
    if (game.weather.kind === "lightning_cell" && Math.random() < 0.04) {
      ctx.strokeStyle = "rgba(220, 230, 255, 0.7)";
      ctx.lineWidth = 2;
      const lx = ox + Math.random() * w;
      ctx.beginPath();
      ctx.moveTo(lx, oy);
      ctx.lineTo(lx + (Math.random() - 0.5) * 40, oy + h * 0.4);
      ctx.lineTo(lx + (Math.random() - 0.5) * 60, oy + h);
      ctx.stroke();
    }
  }

  return { ox, oy };
}

export function canvasToTile(
  canvas: HTMLCanvasElement,
  game: Game,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const mx = (clientX - rect.left) * scaleX;
  const my = (clientY - rect.top) * scaleY;
  const { cols, rows, tileSize } = game.config;
  const w = cols * tileSize;
  const h = rows * tileSize;
  const ox = Math.floor((canvas.width - w) / 2);
  const oy = Math.floor((canvas.height - h) / 2);
  const x = Math.floor((mx - ox) / tileSize);
  const y = Math.floor((my - oy) / tileSize);
  if (x < 0 || y < 0 || x >= cols || y >= rows) return null;
  return { x, y };
}
