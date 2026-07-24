import "./styles.css";
import { clampCamera, createCamera } from "./game/camera";
import { Game } from "./game/Game";
import {
  ADD_TANK_COST,
  BATTERY_COST,
  DRILL_COST,
  EXPLORE_COST,
  EXTRA_TRUCK_COST,
  GAS_LINE_COST,
  GAS_PIPE_COST,
  GAS_PLANT_COST,
  OIL_PIPE_COST,
  PERMIT_COST,
  REFINERY_COST,
  ROAD_COST,
  SMALL_TRUCK_CAP_BBL,
  SMALL_TRUCK_COST,
  UPGRADE_RIG_COST,
  WELLHEAD_TANK_ADD_BBL,
} from "./game/data/economy";
import { canvasToTile, renderGame } from "./game/render";
import type { PixiRenderer } from "./game/renderPixi";
import type { BuildTool } from "./game/types";

const COST: Partial<Record<BuildTool, number>> = {
  explore: EXPLORE_COST,
  upgrade_rig: UPGRADE_RIG_COST,
  truck: EXTRA_TRUCK_COST,
  draw_credit: 250_000,
  buy_permit: PERMIT_COST,
  gas_line: GAS_LINE_COST,
  gas_plant: GAS_PLANT_COST,
  battery: BATTERY_COST,
  refinery: REFINERY_COST,
  add_tank: ADD_TANK_COST,
  small_truck: SMALL_TRUCK_COST,
};

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <header class="top-bar">
    <div class="brand">Energy Epoch <span>// facility</span></div>
    <div class="hud-stats">
      <div>Cash <strong id="stat-cash">$0</strong></div>
      <div>Debt <strong id="stat-debt">$0</strong></div>
      <div id="int-wrap" class="clickable" title="Click to toggle interest on/off">Int/day <strong id="stat-int">$0</strong></div>
      <div id="rep-wrap" class="clickable" title="Click for rep status">Rep <strong id="stat-rep">70</strong></div>
      <div>Oil <strong id="stat-oil">$0</strong></div>
      <div>Day <strong id="stat-day">1</strong></div>
      <div id="ops-wrap" class="clickable" title="Click for ops detail">Ops <strong id="stat-ops">—</strong></div>
      <div id="wx-wrap" title="Weather affects haul speed & drilling">Wx <strong id="stat-wx">clear</strong></div>
      <div class="speed-ctl" title="Time speed">
        <button type="button" class="spd-btn" data-spd="0">❚❚</button>
        <button type="button" class="spd-btn" data-spd="0.5">0.5×</button>
        <button type="button" class="spd-btn active" data-spd="1">1×</button>
        <button type="button" class="spd-btn" data-spd="2">2×</button>
      </div>
    </div>
    <div class="hud-actions">
      <select id="profile-select" class="profile-select" title="Save profile"></select>
      <button type="button" class="tool-btn" id="btn-new-profile" title="New profile">+ New</button>
      <button type="button" class="tool-btn" id="btn-del-profile" title="Delete this profile">Del</button>
      <button type="button" class="tool-btn" id="btn-home">Home</button>
      <button type="button" class="tool-btn" id="btn-reset">Reset lease</button>
    </div>
  </header>
  <div class="stage-wrap">
    <canvas id="game-canvas"></canvas>
    <div class="hover-tip" id="hover-tip"></div>
    <div class="inspect-panel" id="inspect-panel">
      <div class="inspect-title">Inspect</div>
      <div id="inspect-body">Hover tiles · Right-click for actions</div>
      <div class="inspect-legend">Survey: <span class="leg-s">S sweet</span> <span class="leg-g">G good</span> <span class="leg-f">F fair</span> <span class="leg-l">L lean</span> <span class="leg-x">X barren</span> · Roads need N/E/S/W edges</div>
    </div>
    <div class="dash-panel" id="dash-panel">
      <div class="inspect-title">Facility</div>
      <div id="dash-body">—</div>
    </div>
    <div class="ledger-panel" id="ledger-panel">
      <div class="inspect-title">Cash log</div>
      <div id="ledger-body">—</div>
    </div>
    <div class="guide-bar" id="guide-bar"></div>
    <div class="context-menu" id="context-menu" hidden></div>
    <div class="toast" id="toast"></div>
    <div class="confirm-banner" id="confirm-banner" hidden></div>
    <div class="gameover" id="gameover" hidden>
      <div class="gameover-card">
        <h2>Lease shut in</h2>
        <p id="gameover-reason"></p>
        <button type="button" class="tool-btn active" id="btn-reset-go">Reset lease</button>
      </div>
    </div>
  </div>
  <footer class="bottom-bar">
    <div class="help-chip">Scroll zoom · Left-drag pan · Road/Pipe/Sell: drag to lay · Right-click for actions · Click a panel title (or C) to collapse</div>
    <button class="tool-btn active" data-tool="select" type="button">Select</button>
    <button class="tool-btn" data-tool="road" type="button">Road</button>
    <button class="tool-btn" data-tool="oil_pipe" type="button">Oil pipe · $${(OIL_PIPE_COST / 1000).toFixed(0)}k</button>
    <button class="tool-btn" data-tool="gas_pipe" type="button">Gas pipe · $${(GAS_PIPE_COST / 1000).toFixed(0)}k</button>
    <button class="tool-btn" data-tool="gas_plant" type="button">Gas plant · $${(GAS_PLANT_COST / 1000).toFixed(0)}k</button>
    <button class="tool-btn" data-tool="battery" type="button">Battery · $${(BATTERY_COST / 1000).toFixed(0)}k</button>
    <button class="tool-btn" data-tool="refinery" type="button">Refinery · $${(REFINERY_COST / 1000000).toFixed(1)}M</button>
    <button class="tool-btn" data-tool="sell" type="button">Sell 75%</button>
    <button class="tool-btn" data-tool="move_rig" type="button">Move rig</button>
    <button class="tool-btn" data-tool="choke" type="button">Choke well</button>
    <button class="tool-btn" data-tool="add_tank" type="button">+Tank · $${(ADD_TANK_COST / 1000).toFixed(0)}k</button>
    <button class="tool-btn" data-tool="drill" type="button">Drill</button>
    <button class="tool-btn" data-tool="explore" type="button">Explore · $${(EXPLORE_COST / 1000).toFixed(0)}k</button>
    <button class="tool-btn" data-tool="gas_line" type="button">Gas line · $${(GAS_LINE_COST / 1000).toFixed(0)}k</button>
    <button class="tool-btn" data-tool="truck" type="button">Truck 400 · $${(EXTRA_TRUCK_COST / 1000).toFixed(0)}k</button>
    <button class="tool-btn" data-tool="small_truck" type="button">Truck 200 · $${(SMALL_TRUCK_COST / 1000).toFixed(0)}k</button>
    <button class="tool-btn" data-tool="upgrade_rig" type="button">Rig+ · $${(UPGRADE_RIG_COST / 1000).toFixed(0)}k</button>
    <button class="tool-btn" data-tool="buy_permit" type="button">Permit · $${(PERMIT_COST / 1000).toFixed(0)}k</button>
    <button class="tool-btn" data-tool="pay_debt" type="button">Pay debt</button>
    <button class="tool-btn" data-tool="draw_credit" type="button">Draw $250k</button>
    <div class="tool-meta" id="tool-meta">Booting…</div>
  </footer>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas")!;
// Opt into the WebGL/PixiJS renderer with `?pixi`. Canvas 2D stays the default
// so the proven path is never at risk while the Pixi scaffold reaches parity.
const USE_PIXI = new URLSearchParams(location.search).has("pixi");
const ctx = USE_PIXI ? null : canvas.getContext("2d")!;
let pixi: PixiRenderer | null = null;
const hoverTip = document.querySelector<HTMLDivElement>("#hover-tip")!;
const inspectBody = document.querySelector<HTMLDivElement>("#inspect-body")!;
const dashBody = document.querySelector<HTMLDivElement>("#dash-body")!;
const ledgerBody = document.querySelector<HTMLDivElement>("#ledger-body")!;
const guideBar = document.querySelector<HTMLDivElement>("#guide-bar")!;
const confirmBanner = document.querySelector<HTMLDivElement>("#confirm-banner")!;
const gameoverEl = document.querySelector<HTMLDivElement>("#gameover")!;

let game = new Game();
let cam = createCamera(game.config.cols, game.config.rows);
let hover: { x: number; y: number } | null = null;
let toastTimer = 0;
let lastMsg = "";
let pinnedInspect = "";
let pendingConfirm: BuildTool | null = null;

let panning = false;
let panButton = -1;
let lastPanX = 0;
let lastPanY = 0;
let panDist = 0;

function resize() {
  if (USE_PIXI) {
    pixi?.resize();
    return;
  }
  const wrap = canvas.parentElement!;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(wrap.clientWidth * dpr);
  canvas.height = Math.floor(wrap.clientHeight * dpr);
}
window.addEventListener("resize", resize);
resize();

if (USE_PIXI) {
  // Lazy-load Pixi so the default canvas bundle stays lightweight.
  import("./game/renderPixi")
    .then(({ PixiRenderer }) => {
      pixi = new PixiRenderer(canvas);
      return pixi.init();
    })
    .then(() => pixi?.resize())
    .catch((err) => {
      console.error("Pixi renderer failed to init:", err);
      flash("WebGL renderer failed — reload without ?pixi for canvas.");
    });
}

function money(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function clearConfirm() {
  pendingConfirm = null;
  confirmBanner.hidden = true;
}

function askConfirm(tool: BuildTool, detail: string): boolean {
  if (pendingConfirm === tool) {
    clearConfirm();
    return true;
  }
  pendingConfirm = tool;
  const cost = COST[tool];
  confirmBanner.hidden = false;
  confirmBanner.textContent = cost
    ? `Confirm ${tool.replace("_", " ")} — $${money(cost)}. ${detail} Click again to confirm, or Select to cancel.`
    : `Confirm ${tool}. ${detail} Click again to confirm.`;
  return false;
}

function setActiveTool(tool: BuildTool) {
  if (tool === "select") clearConfirm();
  game.setTool(tool);
  document.querySelectorAll(".tool-btn[data-tool]").forEach((btn) => {
    btn.classList.toggle("active", (btn as HTMLElement).dataset.tool === tool);
  });
  syncMeta();
}

function disarmToSelect() {
  setActiveTool("select");
}

const SAVE_PREFIX = "energy-epoch-save";
const PROFILES_KEY = "energy-epoch-profiles";
// Bump on state-schema changes: 2 footprints, 3 terrain+pipes, 4 map 56×36.
const SAVE_VERSION = 4;

let currentSpeed = 1;

// --- Save profiles: multiple named leases, each with its own autosave slot ---
type ProfilesReg = { active: string; names: string[] };
function loadProfiles(): ProfilesReg {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (raw) {
      const r = JSON.parse(raw);
      if (r && typeof r.active === "string" && Array.isArray(r.names) && r.names.length) {
        return r;
      }
    }
  } catch {
    /* fall through to default + migration */
  }
  // Migrate a pre-profiles single save into a "Main" profile.
  try {
    const legacy = localStorage.getItem(SAVE_PREFIX);
    if (legacy) {
      localStorage.setItem(`${SAVE_PREFIX}:Main`, legacy);
      localStorage.removeItem(SAVE_PREFIX);
    }
  } catch {
    /* ignore */
  }
  return { active: "Main", names: ["Main"] };
}
let profiles = loadProfiles();
function saveProfiles() {
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  } catch {
    /* non-fatal */
  }
}
saveProfiles();
const activeSaveKey = () => `${SAVE_PREFIX}:${profiles.active}`;

function saveGame() {
  try {
    localStorage.setItem(
      activeSaveKey(),
      JSON.stringify({
        v: SAVE_VERSION,
        cam,
        spd: currentSpeed,
        intOn: game.interestEnabled,
        game: game.serialize(),
      }),
    );
  } catch {
    // storage full / unavailable — non-fatal, game keeps running in memory
  }
}

function loadGame(): boolean {
  try {
    const raw = localStorage.getItem(activeSaveKey());
    if (!raw) return false;
    const snap = JSON.parse(raw);
    if (snap.v !== SAVE_VERSION || !snap.game) return false;
    // Dimension guard: ignore saves that don't match the current map size.
    const t = snap.game.tiles;
    if (
      !Array.isArray(t) ||
      t.length !== game.config.rows ||
      !Array.isArray(t[0]) ||
      t[0].length !== game.config.cols
    ) {
      return false;
    }
    game.applyState(snap.game);
    if (snap.cam) {
      cam.x = snap.cam.x;
      cam.y = snap.cam.y;
      cam.zoom = snap.cam.zoom;
      clampCamera(cam, game.config.cols, game.config.rows);
    }
    // Restore speed, but never load into a frozen (paused) sim.
    if (typeof snap.spd === "number") setSpeed(snap.spd === 0 ? 1 : snap.spd);
    if (typeof snap.intOn === "boolean") game.interestEnabled = snap.intOn;
    return true;
  } catch {
    return false;
  }
}

function setSpeed(s: number) {
  currentSpeed = s;
  game.timeScale = s;
  document.querySelectorAll(".spd-btn").forEach((b) => {
    b.classList.toggle("active", Number((b as HTMLElement).dataset.spd) === s);
  });
}

// Construct a fresh Game, optionally restoring the active profile's save.
function bootGame(restore: boolean): boolean {
  game = new Game();
  game.timeScale = currentSpeed;
  cam = createCamera(game.config.cols, game.config.rows);
  clearConfirm();
  gameoverEl.classList.remove("is-open");
  gameoverEl.hidden = true;
  pinnedInspect = "";
  inspectBody.textContent = "Hover tiles · Right-click for actions";
  const restored = restore ? loadGame() : false;
  syncAll();
  return restored;
}

function resetLease() {
  localStorage.removeItem(activeSaveKey());
  bootGame(false);
  flash("Lease reset. Build cardinal roads pad→battery→refinery, then drill.");
  saveGame();
}

function refreshProfileUI() {
  const sel = document.querySelector<HTMLSelectElement>("#profile-select");
  if (!sel) return;
  sel.innerHTML = profiles.names
    .map(
      (n) =>
        `<option value="${n}"${n === profiles.active ? " selected" : ""}>${n}</option>`,
    )
    .join("");
}

function switchProfile(name: string) {
  if (name === profiles.active || !profiles.names.includes(name)) return;
  saveGame(); // persist the current profile first
  profiles.active = name;
  saveProfiles();
  bootGame(true);
  flash(`Switched to profile "${name}".`);
  refreshProfileUI();
}

function newProfile() {
  const raw = window.prompt("New profile name:", `Lease ${profiles.names.length + 1}`);
  const name = raw?.trim();
  if (!name) return;
  if (profiles.names.includes(name)) {
    switchProfile(name);
    return;
  }
  saveGame(); // persist current before creating the new one
  profiles.names.push(name);
  profiles.active = name;
  saveProfiles();
  bootGame(false);
  saveGame();
  flash(`Created profile "${name}".`);
  refreshProfileUI();
}

function deleteProfile() {
  if (profiles.names.length <= 1) {
    flash("Keep at least one profile.");
    return;
  }
  const name = profiles.active;
  if (!window.confirm(`Delete profile "${name}"? Its save is erased.`)) return;
  localStorage.removeItem(activeSaveKey());
  profiles.names = profiles.names.filter((n) => n !== name);
  profiles.active = profiles.names[0];
  saveProfiles();
  bootGame(true);
  flash(`Deleted "${name}". Now on "${profiles.active}".`);
  refreshProfileUI();
}

document.querySelector("#btn-home")!.addEventListener("click", () => {
  const p = game.recenterHint();
  cam.x = p.x;
  cam.y = p.y;
  cam.zoom = 1.15;
  clampCamera(cam, game.config.cols, game.config.rows);
});
document.querySelector("#btn-reset")!.addEventListener("click", resetLease);
document.querySelector("#btn-reset-go")!.addEventListener("click", resetLease);

document.querySelector("#profile-select")!.addEventListener("change", (e) => {
  switchProfile((e.target as HTMLSelectElement).value);
});
document.querySelector("#btn-new-profile")!.addEventListener("click", newProfile);
document.querySelector("#btn-del-profile")!.addEventListener("click", deleteProfile);

document.querySelectorAll(".spd-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    setSpeed(Number((btn as HTMLElement).dataset.spd));
    saveGame();
  });
});

// --- Collapsible panels (maximize map view) ---
const UI_KEY = "energy-epoch-ui";
type UiState = { inspect?: boolean; dash?: boolean; ledger?: boolean };
function loadUi(): UiState {
  try {
    return JSON.parse(localStorage.getItem(UI_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveUi() {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify(uiState));
  } catch {
    /* non-fatal */
  }
}
const uiState = loadUi();
const PANELS: { sel: string; key: keyof UiState }[] = [
  { sel: "#inspect-panel", key: "inspect" },
  { sel: "#dash-panel", key: "dash" },
  { sel: "#ledger-panel", key: "ledger" },
];
function applyPanel(sel: string, collapsed: boolean) {
  document.querySelector(sel)?.classList.toggle("panel-collapsed", collapsed);
}
for (const p of PANELS) {
  const panel = document.querySelector(p.sel);
  const title = panel?.querySelector<HTMLElement>(".inspect-title");
  applyPanel(p.sel, !!uiState[p.key]);
  title?.addEventListener("click", () => {
    uiState[p.key] = !(uiState[p.key] ?? false);
    applyPanel(p.sel, !!uiState[p.key]);
    saveUi();
  });
}
function toggleAllPanels() {
  // If any panel is open, collapse all; otherwise expand all.
  const anyOpen = PANELS.some((p) => !uiState[p.key]);
  for (const p of PANELS) {
    uiState[p.key] = anyOpen;
    applyPanel(p.sel, anyOpen);
  }
  saveUi();
}

document.querySelector("#ops-wrap")!.addEventListener("click", () => {
  flash(game.opsReason);
  pinnedInspect = game.opsReason;
  inspectBody.textContent = game.opsReason;
});
document.querySelector("#int-wrap")!.addEventListener("click", () => {
  game.interestEnabled = !game.interestEnabled;
  flash(game.interestEnabled ? "Debt interest ON." : "Debt interest OFF (sandbox).");
  saveGame();
  syncHud();
});
document.querySelector("#rep-wrap")!.addEventListener("click", () => {
  const r = game.player.reputation;
  const msg =
    r <= 0
      ? "Rep 0 — shut in."
      : r < 25
        ? `Rep ${r.toFixed(0)} CRITICAL — shutdown near. Stop flaring, fix spills/stranded tanks.`
        : r < 45
          ? `Rep ${r.toFixed(0)} — fines active. Gas lines + haul crude to cut flare.`
          : `Rep ${r.toFixed(0)} — OK. Flaring and spills still chip it down.`;
  flash(msg);
  inspectBody.textContent = msg;
});

document.querySelectorAll(".tool-btn[data-tool]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tool = (btn as HTMLElement).dataset.tool as BuildTool;

    if (tool === "drill") {
      const rig = game.selectedRig();
      if (!rig) return;
      const x = Math.round(rig.x);
      const y = Math.round(rig.y);
      const zone = game.tiles[y][x].subsurface.zone;
      const cost = DRILL_COST[zone];
      setActiveTool("drill");
      if (!askConfirm("drill", `AFE ~$${money(cost)} zone ${zone} at ${x},${y}.`)) {
        return;
      }
      game.startDrill();
      flash(game.message);
      disarmToSelect();
      syncAll();
      return;
    }

    if (tool === "upgrade_rig") {
      if (!askConfirm("upgrade_rig", "Raises rig tier for deeper zones.")) return;
      game.upgradeRig();
      flash(game.message);
      disarmToSelect();
      syncAll();
      return;
    }
    if (tool === "truck") {
      if (!askConfirm("truck", "Adds a 400 bbl haul truck.")) return;
      game.buyTruck();
      flash(game.message);
      disarmToSelect();
      syncAll();
      return;
    }
    if (tool === "small_truck") {
      if (!askConfirm("small_truck", "Adds a 200 bbl haul truck.")) return;
      game.buyTruck(SMALL_TRUCK_CAP_BBL, SMALL_TRUCK_COST);
      flash(game.message);
      disarmToSelect();
      syncAll();
      return;
    }
    if (tool === "pay_debt") {
      game.payDebt();
      flash(game.message);
      disarmToSelect();
      syncAll();
      return;
    }
    if (tool === "draw_credit") {
      if (!askConfirm("draw_credit", "Increases debt +$250k.")) return;
      game.drawCredit();
      flash(game.message);
      disarmToSelect();
      syncAll();
      return;
    }
    if (tool === "buy_permit") {
      if (!askConfirm("buy_permit", "Needed for special zones.")) return;
      game.buyPermit();
      flash(game.message);
      disarmToSelect();
      syncAll();
      return;
    }

    // Map-targeted tools
    setActiveTool(tool);
  });
});

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const before = canvasToTile(canvas, game, cam, e.clientX, e.clientY);
    cam.zoom *= e.deltaY > 0 ? 0.9 : 1.1;
    clampCamera(cam, game.config.cols, game.config.rows);
    if (before) {
      const after = canvasToTile(canvas, game, cam, e.clientX, e.clientY);
      if (after) {
        cam.x += before.x - after.x;
        cam.y += before.y - after.y;
        clampCamera(cam, game.config.cols, game.config.rows);
      }
    }
  },
  { passive: false },
);

// Left-button click actions, run on pointer-up only when the gesture was a
// click (not a drag). A drag with the left button pans (or lays road).
function handleTileClick(tile: { x: number; y: number }) {
  const tool = game.tool;

  if (tool === "explore") {
    if (!askConfirm("explore", `3×3 survey centered ${tile.x},${tile.y}.`)) {
      return;
    }
    game.buyExploration(tile.x, tile.y);
    flash(game.message);
    disarmToSelect();
    syncAll();
    return;
  }

  if (tool === "gas_line") {
    if (!askConfirm("gas_line", `Ties in the nearest well by ${tile.x},${tile.y}.`)) {
      return;
    }
    game.placeGasLine(tile.x, tile.y);
    flash(game.message);
    disarmToSelect();
    syncAll();
    return;
  }

  if (tool === "gas_plant") {
    if (!askConfirm("gas_plant", `2×2 plant with top-left at ${tile.x},${tile.y}.`)) {
      return;
    }
    game.placeGasPlant(tile.x, tile.y);
    flash(game.message);
    disarmToSelect();
    syncAll();
    return;
  }

  if (tool === "battery") {
    if (!askConfirm("battery", `2×1 battery with top-left at ${tile.x},${tile.y}.`)) {
      return;
    }
    game.placeBattery(tile.x, tile.y);
    flash(game.message);
    disarmToSelect();
    syncAll();
    return;
  }

  if (tool === "refinery") {
    if (!askConfirm("refinery", `2×2 refinery with top-left at ${tile.x},${tile.y}.`)) {
      return;
    }
    game.placeRefinery(tile.x, tile.y);
    flash(game.message);
    disarmToSelect();
    syncAll();
    return;
  }

  if (tool === "add_tank") {
    if (!askConfirm("add_tank", `+${WELLHEAD_TANK_ADD_BBL} bbl storage at ${tile.x},${tile.y}.`)) {
      return;
    }
    game.addTank(tile.x, tile.y);
    flash(game.message);
    disarmToSelect();
    syncAll();
    return;
  }

  if (tool === "drill") {
    // drill is button-confirmed; map click while armed shouldn't re-fire
    disarmToSelect();
    return;
  }

  game.clickTile(tile.x, tile.y);
  pinnedInspect = game.message;
  inspectBody.textContent = pinnedInspect;
  flash(game.message);

  if (
    tool === "road" ||
    tool === "oil_pipe" ||
    tool === "gas_pipe" ||
    tool === "sell" ||
    tool === "choke" ||
    tool === "move_rig"
  ) {
    // keep road/pipe/sell/choke/move armed for multi-place / toggle / pathing
  } else if (tool !== "select") {
    disarmToSelect();
  }
  syncAll();
}

// Tools that "paint" across a left-drag (multi-tile place / remove).
function isPaintTool(tool: BuildTool): boolean {
  return (
    tool === "road" ||
    tool === "oil_pipe" ||
    tool === "gas_pipe" ||
    tool === "sell"
  );
}

// Apply the active paint tool to one tile; return false to abort the stroke.
function applyToolTile(x: number, y: number): boolean {
  if (game.tool === "road") {
    if (game.player.cash < ROAD_COST) {
      flash(`Out of cash for road at ${x},${y}.`);
      return false;
    }
    game.layRoad(x, y);
  } else if (game.tool === "oil_pipe") {
    if (game.player.cash < OIL_PIPE_COST) {
      flash(`Out of cash for oil pipe at ${x},${y}.`);
      return false;
    }
    game.layPipe(x, y, "oil");
  } else if (game.tool === "gas_pipe") {
    if (game.player.cash < GAS_PIPE_COST) {
      flash(`Out of cash for gas pipe at ${x},${y}.`);
      return false;
    }
    game.layPipe(x, y, "gas");
  } else if (game.tool === "sell") {
    game.sellAt(x, y);
  }
  return true;
}

// Walk a cardinal staircase between two tiles so a fast drag never skips
// tiles (roads stay truck-continuous; sell clears the whole line). `from`
// is assumed already handled.
function paintLine(from: { x: number; y: number }, to: { x: number; y: number }) {
  let cx = from.x;
  let cy = from.y;
  let guard = 0;
  while ((cx !== to.x || cy !== to.y) && guard++ < 256) {
    const rx = to.x - cx;
    const ry = to.y - cy;
    if ((Math.abs(rx) >= Math.abs(ry) && rx !== 0) || ry === 0) {
      cx += Math.sign(rx);
    } else {
      cy += Math.sign(ry);
    }
    if (!applyToolTile(cx, cy)) return;
  }
}

const DRAG_THRESHOLD = 6; // canvas px before a left-press becomes a drag
let leftDown = false;
let downClientX = 0;
let downClientY = 0;
let downTile: { x: number; y: number } | null = null;
let dragKind: "pan" | "paint" | null = null;
let lastPaintTile: { x: number; y: number } | null = null;

canvas.addEventListener("pointerdown", (e) => {
  if (e.button === 1 || e.button === 2) {
    panning = true;
    panButton = e.button;
    lastPanX = e.clientX;
    lastPanY = e.clientY;
    panDist = 0;
    canvas.setPointerCapture(e.pointerId);
    return;
  }
  if (e.button !== 0) return;
  leftDown = true;
  dragKind = null;
  lastPaintTile = null;
  downClientX = e.clientX;
  downClientY = e.clientY;
  downTile = canvasToTile(canvas, game, cam, e.clientX, e.clientY);
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener("pointermove", (e) => {
  const rect = canvas.getBoundingClientRect();

  // Middle/right-button pan
  if (panning) {
    const canvasDx = (e.clientX - lastPanX) * (canvas.width / rect.width);
    const canvasDy = (e.clientY - lastPanY) * (canvas.height / rect.height);
    panDist += Math.hypot(canvasDx, canvasDy);
    // Ignore tiny jitter so right-click inspect doesn't fling the camera
    if (panDist > DRAG_THRESHOLD) {
      const tsize = game.config.tileSize * cam.zoom;
      cam.x -= canvasDx / tsize;
      cam.y -= canvasDy / tsize;
      clampCamera(cam, game.config.cols, game.config.rows);
    }
    lastPanX = e.clientX;
    lastPanY = e.clientY;
    return;
  }

  // Left-button drag: pan (any tool but Road) or lay road (Road tool)
  if (leftDown) {
    if (dragKind === null) {
      const dist = Math.hypot(
        (e.clientX - downClientX) * (canvas.width / rect.width),
        (e.clientY - downClientY) * (canvas.height / rect.height),
      );
      if (dist > DRAG_THRESHOLD) {
        if (isPaintTool(game.tool)) {
          dragKind = "paint";
          if (downTile) {
            applyToolTile(downTile.x, downTile.y);
            lastPaintTile = downTile;
            flash(game.message);
            syncAll();
          }
        } else {
          dragKind = "pan";
          lastPanX = e.clientX;
          lastPanY = e.clientY;
        }
      }
    }

    if (dragKind === "pan") {
      const canvasDx = (e.clientX - lastPanX) * (canvas.width / rect.width);
      const canvasDy = (e.clientY - lastPanY) * (canvas.height / rect.height);
      const tsize = game.config.tileSize * cam.zoom;
      cam.x -= canvasDx / tsize;
      cam.y -= canvasDy / tsize;
      clampCamera(cam, game.config.cols, game.config.rows);
      lastPanX = e.clientX;
      lastPanY = e.clientY;
      return;
    }

    if (dragKind === "paint") {
      const t = canvasToTile(canvas, game, cam, e.clientX, e.clientY);
      if (
        t &&
        (!lastPaintTile || t.x !== lastPaintTile.x || t.y !== lastPaintTile.y)
      ) {
        paintLine(lastPaintTile ?? t, t);
        lastPaintTile = t;
        flash(game.message);
        syncAll();
      }
      return;
    }
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
    // Right-click without drag = open the context action menu
    if (panButton === 2 && panDist <= DRAG_THRESHOLD) {
      const tile = canvasToTile(canvas, game, cam, e.clientX, e.clientY);
      if (tile) openContextMenu(e.clientX, e.clientY, tile);
    }
    panning = false;
    panButton = -1;
    panDist = 0;
    return;
  }

  if (e.button === 0 && leftDown) {
    leftDown = false;
    // A clean click (no drag) triggers the tool action
    if (dragKind === null && downTile) {
      handleTileClick(downTile);
    }
    dragKind = null;
    lastPaintTile = null;
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
  if (e.key === "Escape") {
    clearConfirm();
    disarmToSelect();
    closeContextMenu();
  }
  if (e.key === "h") {
    const p = game.recenterHint();
    cam.x = p.x;
    cam.y = p.y;
  }
  if (e.key === "c") toggleAllPanels();
  clampCamera(cam, game.config.cols, game.config.rows);
});

function flash(msg: string) {
  const el = document.querySelector("#toast")!;
  el.textContent = msg;
  el.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove("show"), 3200);
}

const contextMenu = document.querySelector<HTMLDivElement>("#context-menu")!;

function closeContextMenu() {
  contextMenu.hidden = true;
  contextMenu.innerHTML = "";
}

/** Right-click actions relevant to whatever is under the cursor. */
function openContextMenu(
  clientX: number,
  clientY: number,
  tile: { x: number; y: number },
) {
  const items: { label: string; act: () => void }[] = [];
  const well = game.wellAt(tile.x, tile.y);
  const b = game.buildingAt(tile.x, tile.y);
  const rig = game.units.find(
    (u) =>
      u.kind === "drill_rig" &&
      Math.round(u.x) === tile.x &&
      Math.round(u.y) === tile.y,
  );
  const tt = game.tiles[tile.y][tile.x];
  const k = (n: number) => `$${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k`;

  if (rig && !rig.busy) {
    items.push({
      label: `Drill here (AFE ${k(DRILL_COST[tt.subsurface.zone])})`,
      act: () => game.startDrill(),
    });
  }
  if (well && well.status === "producing") {
    items.push({
      label: well.choked ? "Bring well online" : "Choke well",
      act: () => game.toggleChoke(tile.x, tile.y),
    });
    items.push({ label: `Gas line (${k(GAS_LINE_COST)})`, act: () => game.placeGasLine(tile.x, tile.y) });
  }
  if (b?.kind === "wellhead_tank") {
    items.push({ label: `Add tank (${k(ADD_TANK_COST)})`, act: () => game.addTank(tile.x, tile.y) });
  }
  const onStructure = well || (b && b.kind !== "gas_flare");
  if (!onStructure) {
    if (!tt.hasRoad) items.push({ label: `Road (${k(ROAD_COST)})`, act: () => game.layRoad(tile.x, tile.y) });
    if (!tt.oilPipe) items.push({ label: `Oil pipe (${k(OIL_PIPE_COST)})`, act: () => game.layPipe(tile.x, tile.y, "oil") });
    if (!tt.gasPipe) items.push({ label: `Gas pipe (${k(GAS_PIPE_COST)})`, act: () => game.layPipe(tile.x, tile.y, "gas") });
  }
  if (tt.hasRoad || tt.oilPipe || tt.gasPipe || (b && b.kind !== "gas_flare")) {
    items.push({ label: "Sell / remove (75%)", act: () => game.sellAt(tile.x, tile.y) });
  }
  items.push({
    label: "Inspect",
    act: () => {
      pinnedInspect = game.inspectAt(tile.x, tile.y);
      inspectBody.textContent = pinnedInspect;
      game.message = pinnedInspect; // so the shared flash shows inspect text
    },
  });

  contextMenu.innerHTML = "";
  for (const it of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ctx-item";
    btn.textContent = it.label;
    btn.addEventListener("click", () => {
      it.act();
      flash(game.message);
      syncAll();
      saveGame();
      closeContextMenu();
    });
    contextMenu.appendChild(btn);
  }

  const wrap = canvas.parentElement!.getBoundingClientRect();
  const mx = Math.min(clientX - wrap.left, wrap.width - 190);
  const my = Math.min(clientY - wrap.top, wrap.height - items.length * 30 - 12);
  contextMenu.style.left = `${Math.max(4, mx)}px`;
  contextMenu.style.top = `${Math.max(4, my)}px`;
  contextMenu.hidden = false;
}

// Dismiss the context menu on any other interaction.
window.addEventListener("pointerdown", (e) => {
  if (!contextMenu.hidden && !contextMenu.contains(e.target as Node)) {
    closeContextMenu();
  }
});
window.addEventListener("wheel", () => closeContextMenu());

function syncHud() {
  const d = game.dashboard();
  document.querySelector("#stat-cash")!.textContent = `$${money(game.player.cash)}`;
  document.querySelector("#stat-debt")!.textContent = `$${money(game.player.credit.debt)}`;
  document.querySelector("#stat-int")!.textContent = d.interestOn
    ? `$${money(d.interestPerDay)}`
    : "off";
  const repEl = document.querySelector("#stat-rep") as HTMLElement;
  repEl.textContent = game.player.reputation.toFixed(0);
  repEl.style.color =
    game.player.reputation < 25
      ? "var(--danger)"
      : game.player.reputation < 45
        ? "var(--amber-hot)"
        : "var(--amber-hot)";
  document.querySelector("#stat-oil")!.textContent = `$${game.market.oilPrice.toFixed(2)}`;
  document.querySelector("#stat-day")!.textContent = game.market.day.toFixed(1);
  const ops = document.querySelector("#stat-ops")!;
  ops.textContent = game.player.operatingGreen ? "GREEN" : "RED";
  (ops as HTMLElement).style.color = game.player.operatingGreen
    ? "var(--ok)"
    : "var(--danger)";
  const wx = game.weather.kind;
  document.querySelector("#stat-wx")!.textContent =
    wx === "clear"
      ? "clear"
      : wx === "lightning_cell"
        ? "lightning (drill stand-down)"
        : `storm (slow haul)`;
}

function syncDash() {
  const d = game.dashboard();
  const truckLine = d.trucks
    .map((t) => `${t.job}${t.cargo > 0 ? ` ${t.kind}:${t.cargo.toFixed(0)}` : ""}`)
    .join(" · ");
  const prodBopd = d.oilBopd;
  const treatWarn = prodBopd > d.treatCap ? " warn" : "";
  dashBody.innerHTML = `
    ${d.advice ? `<div class="advice">⚠ ${d.advice}</div>` : ""}
    <div>${d.wellCount} wells · <strong>${d.oilBopd.toFixed(0)}</strong> bopd · <strong>${d.gasMcfd.toFixed(0)}</strong> mcf/d</div>
    <div>Battery crude ${d.crude.toFixed(0)}/${d.crudeCap} · clean ${d.clean.toFixed(0)}/${d.cleanCap}</div>
    <div class="cap-line">Capacity: <span class="${treatWarn}">treat ${prodBopd.toFixed(0)}/${d.treatCap} bpd</span> · sales ${d.refSlotUsed.toFixed(0)}/${d.refSlotCap} bpd today${d.oilPiped ? ' · <span class="piped">oil pipe ✓</span>' : ""}${d.gasPlants ? ` · ${d.gasPlants} gas plant${d.gasPlants > 1 ? "s" : ""}` : ""}</div>
    <div>Trucks: ${truckLine || "none"}</div>
    <div>Today rev $${money(d.revenueToday)} · opex $${money(d.opexToday)} · int $${money(d.interestToday)}</div>
    ${d.stranded ? `<div class="warn">${d.stranded} stranded wellhead(s) — check guide</div>` : ""}
  `;
  ledgerBody.innerHTML = d.ledger.length
    ? d.ledger
        .map((e) => {
          const sign = e.amount >= 0 ? "+" : "";
          return `<div class="led ${e.amount >= 0 ? "in" : "out"}"><span>d${e.day.toFixed(0)} ${e.label}</span><span>${sign}$${money(e.amount)}</span></div>`;
        })
        .join("")
    : "<div>No movements yet</div>";
  guideBar.textContent = d.guide;

  if (d.gameOver) {
    gameoverEl.hidden = false;
    gameoverEl.classList.add("is-open");
    document.querySelector("#gameover-reason")!.textContent = d.gameOverReason;
  } else {
    gameoverEl.hidden = true;
    gameoverEl.classList.remove("is-open");
  }
}

function syncMeta() {
  document.querySelector("#tool-meta")!.textContent = game.message;
}

function syncAll() {
  syncHud();
  syncDash();
  syncMeta();
}

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt);
  if (pixi?.ready) pixi.render(game, cam, hover);
  else if (ctx) renderGame(ctx, game, cam, hover);
  syncHud();
  syncDash();
  if (game.message !== lastMsg) {
    lastMsg = game.message;
    syncMeta();
  }
  requestAnimationFrame(frame);
}

const restored = loadGame();
refreshProfileUI();
syncAll();
flash(
  restored
    ? `Profile "${profiles.active}" restored. Autosaves as you play.`
    : "Cardinal roads only (N/E/S/W). Costly tools need a second click to confirm. Ops/Rep are clickable.",
);
requestAnimationFrame(frame);

// Persist periodically and on tab hide / reload so progress survives refreshes.
window.setInterval(saveGame, 4000);
window.addEventListener("pagehide", saveGame);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveGame();
});
