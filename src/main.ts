import "./styles.css";
import { Game } from "./game/Game";
import { BUILD_COSTS } from "./game/data/economy";
import { canvasToTile, renderGame } from "./game/render";
import type { BuildTool } from "./game/types";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <header class="top-bar">
    <div class="brand">Energy Epoch <span>// lease sandbox</span></div>
    <div class="hud-stats">
      <div>Cash <strong id="stat-cash">$0</strong></div>
      <div>Spot <strong id="stat-spot">$0</strong></div>
      <div>Netback <strong id="stat-net">$0</strong></div>
      <div>Day <strong id="stat-day">1</strong></div>
      <div>Produced <strong id="stat-prod">0</strong> bbl</div>
      <div>Sold <strong id="stat-sold">0</strong> bbl</div>
    </div>
  </header>
  <div class="stage-wrap">
    <canvas id="game-canvas"></canvas>
    <div class="toast" id="toast"></div>
  </div>
  <footer class="bottom-bar">
    <button class="tool-btn active" data-tool="select" type="button">Select</button>
    <button class="tool-btn" data-tool="pumpjack" type="button">Pumpjack · $45k</button>
    <button class="tool-btn" data-tool="tank" type="button">Tank · $28k</button>
    <button class="tool-btn" data-tool="pipeline" type="button">Flowline · $2.5k</button>
    <button class="tool-btn" data-tool="truck_rack" type="button">Truck rack · $18k</button>
    <button class="tool-btn" data-tool="sell" type="button" id="btn-sell">Sell load</button>
    <div class="tool-meta" id="tool-meta">Booting lease…</div>
  </footer>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas")!;
const ctx = canvas.getContext("2d")!;
const game = new Game();
let hover: { x: number; y: number } | null = null;
let toastTimer = 0;

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
    if (tool === "sell") {
      game.trySellLoad();
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
  toastTimer = window.setTimeout(() => el.classList.remove("show"), 2200);
}

function money(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function syncHud() {
  document.querySelector("#stat-cash")!.textContent = `$${money(game.player.cash)}`;
  document.querySelector("#stat-spot")!.textContent = `$${game.market.spotPrice.toFixed(2)}`;
  document.querySelector("#stat-net")!.textContent = `$${game.market.netback.toFixed(2)}`;
  document.querySelector("#stat-day")!.textContent = game.market.day.toFixed(1);
  document.querySelector("#stat-prod")!.textContent = money(game.totalProduced);
  document.querySelector("#stat-sold")!.textContent = money(game.totalSold);
}

function syncMeta() {
  const meta = document.querySelector("#tool-meta")!;
  if (game.tool in BUILD_COSTS) {
    const c = BUILD_COSTS[game.tool as keyof typeof BUILD_COSTS];
    meta.textContent = `${c.label}: ${c.blurb}`;
  } else {
    meta.textContent = game.message;
  }
}

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt);
  renderGame(ctx, game, hover);
  syncHud();
  requestAnimationFrame(frame);
}

syncHud();
syncMeta();
flash("Welcome to Energy Epoch. Build well → flowline → tank → rack → sell.");
requestAnimationFrame(frame);
