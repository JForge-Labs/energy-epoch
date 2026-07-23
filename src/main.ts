import "./styles.css";
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
const game = new Game();
let hover: { x: number; y: number } | null = null;
let toastTimer = 0;
let lastMsg = "";

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

canvas.addEventListener("pointermove", (e) => {
  hover = canvasToTile(canvas, game, e.clientX, e.clientY);
});
canvas.addEventListener("pointerleave", () => {
  hover = null;
});
canvas.addEventListener("pointerdown", (e) => {
  const tile = canvasToTile(canvas, game, e.clientX, e.clientY);
  if (!tile) return;
  game.clickTile(tile.x, tile.y);
  flash(game.message);
  syncHud();
  syncMeta();
});

function flash(msg: string) {
  const el = document.querySelector("#toast")!;
  el.textContent = msg;
  el.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove("show"), 2400);
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
    game.weather.kind === "clear"
      ? "clear"
      : `${game.weather.kind}`;
}

function syncMeta() {
  document.querySelector("#tool-meta")!.textContent = game.message;
}

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt);
  renderGame(ctx, game, hover);
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
  "$5M facility: connect pad → battery → refinery with roads, then drill. Get out of debt.",
);
requestAnimationFrame(frame);
