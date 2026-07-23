import type { Game } from "./Game";
import type { Building, Tile } from "./types";

const COLORS = {
  empty: "#1c221c",
  emptyAlt: "#1a201a",
  oilPad: "#3a2a12",
  oilPadHot: "#5a3e18",
  road: "#2a2e2c",
  grid: "#2e3830",
  pumpjack: "#c4a35a",
  tank: "#6a7a82",
  pipe: "#8a7040",
  rack: "#c45c26",
  gen: "#5a8a6a",
  select: "#f0c040",
  text: "#e8ece6",
};

function tileFill(tile: Tile, x: number, y: number): string {
  if (tile.kind === "oil_pad") {
    return tile.oilReserve > 0 ? COLORS.oilPadHot : COLORS.oilPad;
  }
  if (tile.kind === "access_road") return COLORS.road;
  return (x + y) % 2 === 0 ? COLORS.empty : COLORS.emptyAlt;
}

function drawBuilding(
  ctx: CanvasRenderingContext2D,
  b: Building,
  px: number,
  py: number,
  size: number,
) {
  const pad = size * 0.12;
  const s = size - pad * 2;
  ctx.save();
  ctx.translate(px + pad, py + pad);

  switch (b.kind) {
    case "pumpjack": {
      ctx.fillStyle = COLORS.pumpjack;
      ctx.fillRect(s * 0.35, s * 0.45, s * 0.3, s * 0.45);
      ctx.strokeStyle = COLORS.pumpjack;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s * 0.2, s * 0.55);
      ctx.lineTo(s * 0.8, s * 0.25);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(s * 0.5, s * 0.7, s * 0.12, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "tank": {
      ctx.fillStyle = COLORS.tank;
      ctx.beginPath();
      ctx.ellipse(s * 0.5, s * 0.55, s * 0.38, s * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      const fill = b.storageCap ? b.storage / b.storageCap : 0;
      ctx.fillStyle = "#1a1208";
      ctx.beginPath();
      ctx.ellipse(
        s * 0.5,
        s * 0.55,
        s * 0.38 * fill,
        s * 0.32 * fill,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      break;
    }
    case "pipeline": {
      ctx.strokeStyle = COLORS.pipe;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, s * 0.5);
      ctx.lineTo(s, s * 0.5);
      ctx.moveTo(s * 0.5, 0);
      ctx.lineTo(s * 0.5, s);
      ctx.stroke();
      break;
    }
    case "truck_rack": {
      ctx.fillStyle = COLORS.rack;
      ctx.fillRect(s * 0.15, s * 0.25, s * 0.7, s * 0.5);
      ctx.fillStyle = "#1a1612";
      ctx.fillRect(s * 0.25, s * 0.35, s * 0.2, s * 0.3);
      break;
    }
    case "generator": {
      ctx.fillStyle = COLORS.gen;
      ctx.fillRect(s * 0.2, s * 0.3, s * 0.6, s * 0.45);
      break;
    }
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
      ctx.fillStyle = tileFill(tile, x, y);
      ctx.fillRect(px, py, tileSize, tileSize);
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, tileSize - 1, tileSize - 1);

      if (tile.kind === "oil_pad" && tile.oilReserve > 0) {
        ctx.fillStyle = "rgba(212, 160, 23, 0.15)";
        ctx.beginPath();
        ctx.arc(px + tileSize / 2, py + tileSize / 2, tileSize * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  for (const b of game.buildings) {
    drawBuilding(
      ctx,
      b,
      ox + b.x * tileSize,
      oy + b.y * tileSize,
      tileSize,
    );
  }

  if (hover) {
    const px = ox + hover.x * tileSize;
    const py = oy + hover.y * tileSize;
    ctx.strokeStyle = COLORS.select;
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, py + 1, tileSize - 2, tileSize - 2);
  }

  if (game.selectedId) {
    const b = game.buildings.find((o) => o.id === game.selectedId);
    if (b) {
      const px = ox + b.x * tileSize;
      const py = oy + b.y * tileSize;
      ctx.strokeStyle = "#6b9e6b";
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 2, py + 2, tileSize - 4, tileSize - 4);
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
