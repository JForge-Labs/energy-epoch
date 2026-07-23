import "./styles.css";
import { clampCamera, createCamera } from "./game/camera";
import { Game } from "./game/Game";
import {
  EXPLORE_COST,
  EXTRA_TRUCK_COST,
  GAS_LINE_COST,
  PERMIT_COST,
  UPGRADE_RIG_COST,
} from "./game/data/economy";
import { canvasToTile, renderGame } from "./game/render";
import type { BuildTool } from "./game/types";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <header class="top-bar">
    <div class="brand">Energy Epoch <span>// facility</span></div>
    <div class="hud-stats">
      <div>Cash <strong id="stat-cash">$0</strong></div>
      <div>Debt <strong id="stat-debt">$0</strong></div>
      <div>Limit <strong id="stat-limit">$0</strong></div>
      <div>Rep <strong id="stat-rep">70</strong></div>
      <div>Oil <strong id="stat-oil">$0</strong></div>
      <div>Day <strong id="stat-day">1</strong></div>
      <div>Ops <strong id="stat-ops">—</strong></div>
      <div>Wx <strong id="stat-wx">clear</strong></div>
    </div>
  </header>
  <div class="stage-wrap">
    <canvas id="game-canvas"></canvas>
    <div class="hover-tip" id="hover-tip"></div>
    <div class="inspect-panel" id="inspect-panel">
      <div class="inspect-title">Inspect</div>
      <div id="inspect-body">Hover tiles · Right-click to pin</div>
      <div class="inspect-legend">Survey: <span class="leg-s">S sweet</span> <span class="leg-g">G good</span> <span class="leg-f">F fair</span> <span class="leg-l">L lean</span> <span class="leg-x">X barren</span></div>
    </div>
    <div class="help-chip">Scroll=zoom · Drag=pan · Right-click=inspect</div>
    <div class="toast" id="toast"></div>
  </div>
  <footer class="bottom-bar">
    <button class="tool-btn active" data-tool="select" type="button">Select</button>
    <button class="tool-btn" data-tool="road" type="button">Road</button>
    <button class="tool-btn" data-tool="move_rig" type="button">Move rig</button>
    <button class="tool-btn" data-tool="drill" type="button">Drill</button>
    <button class="tool-btn" data-tool="explore" type="button">Explore · $${(EXPLORE_COST / 1000).toFixed(0)}k</button>
    <button class="tool-btn" data-tool="gas_line" type="button">Gas line · $${(GAS_LINE_COST / 1000).toFixed(0)}k</button>
    <button class="tool-btn" data-tool="truck" type="button">Truck · $${(EXTRA_TRUCK_COST / 1000).toFixed(0)}k</button>
    <button class="tool-btn" data-tool="upgrade_rig" type="button">Rig+ · $${(UPGRADE_RIG_COST / 1000).toFixed(0)}k</button>
    <button class="tool-btn" data-tool="buy_permit" type="button">Permit · $${(PERMIT_COST / 1000).toFixed(0)}k</button>
    <button class="tool-btn" data-tool="pay_debt" type="button">Pay debt</button>
    <button class="tool-btn" data-tool="draw_credit" type="button">Draw $250k</button>
    <div class="tool-meta" id="tool-meta">Booting…</div>
  </footer>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas")!;
const ctx = canvas.getContext("2d")!;
const hoverTip = document.querySelector<HTMLDivElement>("#hover-tip")!;
const inspectBody = document.querySelector<HTMLDivElement>("#inspect-body")!;
const game = new Game();
const cam = createCamera(game.config.cols, game.config.rows);
let hover: { x: number; y: number } | null = null;
let toastTimer = 0;
let lastMsg = "";
let pinnedInspect = "";

let panning = false;
let panButton = -1;
let lastPanX = 0;
let lastPanY = 0;

function resize() {
  const wrap = canvas.parentElement!;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(wrap.clientWidth * dpr);
  canvas.height = Math.floor(wrap.clientHeight * dpr);
}
window.addEventListener("resize", resize);
resize();

function setActiveTool(tool: BuildTool) {
  game.setTool(tool);
  document.querySelectorAll(".tool-btn").forEach((btn) => {
    btn.classList.toggle("active", (btn as HTMLElement).dataset.tool === tool);
  });
  syncMeta();
}

document.querySelectorAll(".tool-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tool = (btn as HTMLElement).dataset.tool as BuildTool;
    if (tool === "drill") {
      setActiveTool("drill");
      game.startDrill();
      flash(game.message);
      syncHud();
      return;
    }
    if (tool === "upgrade_rig") {
      game.upgradeRig();
      flash(game.message);
      syncHud();
      return;
    }
    if (tool === "truck") {
      game.buyTruck();
      flash(game.message);
      syncHud();
      return;
    }
    if (tool === "pay_debt") {
      game.payDebt();
      flash(game.message);
      syncHud();
      return;
    }
    if (tool === "draw_credit") {
      game.drawCredit();
      flash(game.message);
      syncHud();
      return;
    }
    if (tool === "buy_permit") {
      game.buyPermit();
      flash(game.message);
      syncHud();
      return;
    }
    setActiveTool(tool);
  });
});

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const before = canvasToTile(canvas, game, cam, e.clientX, e.clientY);
  const factor = e.deltaY > 0 ? 0.9 : 1.1;
  cam.zoom *= factor;
  clampCamera(cam, game.config.cols, game.config.rows);
  // Keep cursor-anchored tile stable-ish
  if (before) {
    const after = canvasToTile(canvas, game, cam, e.clientX, e.clientY);
    if (after) {
      cam.x += before.x - after.x;
      cam.y += before.y - after.y;
      clampCamera(cam, game.config.cols, game.config.rows);
    }
  }
}, { passive: false });

canvas.addEventListener("pointerdown", (e) => {
  // Middle mouse or right mouse = pan
  if (e.button === 1 || e.button === 2) {
    panning = true;
    panButton = e.button;
    lastPanX = e.clientX;
    lastPanY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    if (e.button === 2) {
      const tile = canvasToTile(canvas, game, cam, e.clientX, e.clientY);
      if (tile) {
        pinnedInspect = game.inspectAt(tile.x, tile.y);
        inspectBody.textContent = pinnedInspect;
        flash(pinnedInspect);
      }
    }
    return;
  }
  if (e.button !== 0) return;
  const tile = canvasToTile(canvas, game, cam, e.clientX, e.clientY);
  if (!tile) return;
  game.clickTile(tile.x, tile.y);
  pinnedInspect = game.message;
  inspectBody.textContent = pinnedInspect;
  flash(game.message);
  syncHud();
  syncMeta();
});

canvas.addEventListener("pointermove", (e) => {
  if (panning) {
    const rect = canvas.getBoundingClientRect();
    const canvasDx = (e.clientX - lastPanX) * (canvas.width / rect.width);
    const canvasDy = (e.clientY - lastPanY) * (canvas.height / rect.height);
    lastPanX = e.clientX;
    lastPanY = e.clientY;
    const tsize = game.config.tileSize * cam.zoom;
    cam.x -= canvasDx / tsize;
    cam.y -= canvasDy / tsize;
    clampCamera(cam, game.config.cols, game.config.rows);
    return;
  }

  hover = canvasToTile(canvas, game, cam, e.clientX, e.clientY);
  if (hover) {
    const text = game.inspectAt(hover.x, hover.y);
    hoverTip.textContent = text;
    hoverTip.style.display = "block";
    const wrap = canvas.parentElement!.getBoundingClientRect();
    hoverTip.style.left = `${Math.min(e.clientX - wrap.left + 14, wrap.width - 280)}px`;
    hoverTip.style.top = `${Math.min(e.clientY - wrap.top + 14, wrap.height - 60)}px`;
  } else {
    hoverTip.style.display = "none";
  }
});

canvas.addEventListener("pointerup", (e) => {
  if (panning && e.button === panButton) {
    panning = false;
    panButton = -1;
  }
});
canvas.addEventListener("pointerleave", () => {
  hover = null;
  hoverTip.style.display = "none";
});

window.addEventListener("keydown", (e) => {
  const step = 1 / cam.zoom;
  if (e.key === "w" || e.key === "ArrowUp") cam.y -= step;
  if (e.key === "s" || e.key === "ArrowDown") cam.y += step;
  if (e.key === "a" || e.key === "ArrowLeft") cam.x -= step;
  if (e.key === "d" || e.key === "ArrowRight") cam.x += step;
  if (e.key === "=" || e.key === "+") cam.zoom *= 1.1;
  if (e.key === "-" || e.key === "_") cam.zoom *= 0.9;
  clampCamera(cam, game.config.cols, game.config.rows);
});

function flash(msg: string) {
  const el = document.querySelector("#toast")!;
  el.textContent = msg;
  el.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove("show"), 2800);
}

function money(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function syncHud() {
  document.querySelector("#stat-cash")!.textContent = `$${money(game.player.cash)}`;
  document.querySelector("#stat-debt")!.textContent = `$${money(game.player.credit.debt)}`;
  document.querySelector("#stat-limit")!.textContent = `$${money(game.player.credit.limit)}`;
  document.querySelector("#stat-rep")!.textContent = game.player.reputation.toFixed(0);
  document.querySelector("#stat-oil")!.textContent = `$${game.market.oilPrice.toFixed(2)}`;
  document.querySelector("#stat-day")!.textContent = game.market.day.toFixed(1);
  const ops = document.querySelector("#stat-ops")!;
  ops.textContent = game.player.operatingGreen ? "GREEN" : "RED";
  (ops as HTMLElement).style.color = game.player.operatingGreen
    ? "var(--ok)"
    : "var(--danger)";
  document.querySelector("#stat-wx")!.textContent =
    game.weather.kind === "clear" ? "clear" : `${game.weather.kind}`;
}

function syncMeta() {
  document.querySelector("#tool-meta")!.textContent = game.message;
}

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt);
  renderGame(ctx, game, cam, hover);
  syncHud();
  if (game.message !== lastMsg) {
    lastMsg = game.message;
    syncMeta();
  }
  requestAnimationFrame(frame);
}

syncHud();
syncMeta();
flash(
  "Explore = 3×3 survey. Gold/green (S/G) = drill targets. Gray (X) = skip. Zone color is gone — grade is oil odds.",
);
requestAnimationFrame(frame);
