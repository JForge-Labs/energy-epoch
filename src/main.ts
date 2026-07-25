import "./styles.css";
import { clampCamera, createCamera, screenToWorld } from "./game/camera";
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
      <div title="Debt interest charged per day. Only accrues in Hard mode — pay down debt to shrink it.">Int/day <strong id="stat-int">$0</strong></div>
      <div id="rep-wrap" class="clickable" title="Reputation (0–100). Low rep brings fines, then a shut-in order at 0. Falls from flaring and spills. Click for status.">Rep <strong id="stat-rep">70</strong></div>
      <div title="Cumulative oil revenue sold this lease.">Oil <strong id="stat-oil">$0</strong></div>
      <div title="Days elapsed on the lease.">Day <strong id="stat-day">1</strong></div>
      <div id="ops-wrap" class="clickable" title="Operating status. GREEN = revenue beats interest + opex. RED = losing money. Click for the exact reason.">Ops <strong id="stat-ops">—</strong></div>
      <div id="wx-wrap" title="Weather affects haul speed & drilling">Wx <strong id="stat-wx">clear</strong></div>
      <div class="speed-ctl" title="Time speed">
        <button type="button" class="spd-btn" data-spd="0">❚❚</button>
        <button type="button" class="spd-btn" data-spd="0.5">0.5×</button>
        <button type="button" class="spd-btn active" data-spd="1">1×</button>
        <button type="button" class="spd-btn" data-spd="2">2×</button>
      </div>
    </div>
    <div class="hud-actions">
      <button type="button" class="tool-btn" id="btn-hard" title="Difficulty. Easy: no interest, lease can't be shut in. Hard: ~11% APR debt interest AND shut-in on reputation 0 or insolvency.">Mode: Easy</button>
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
    <div class="triage-panel" id="triage-panel" data-level="ok">
      <div class="triage-title"><span class="triage-dot"></span><span class="triage-label">Next bottleneck</span></div>
      <div class="triage-msg" id="triage-msg">—</div>
    </div>
    <div class="fleet-panel" id="fleet-panel">
      <div class="inspect-title">Fleet</div>
      <div id="fleet-body">—</div>
    </div>
    <div class="dash-panel scada" id="dash-panel">
      <div class="inspect-title">Process</div>
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
    <div class="ledger-modal" id="ledger-modal" hidden>
      <div class="ledger-modal-card">
        <div class="ledger-modal-head"><span>Cash log — full history</span><button type="button" class="ctx-close" id="ledger-close">✕</button></div>
        <div class="ledger-modal-body" id="ledger-modal-body"></div>
      </div>
    </div>
    <div class="gameover" id="gameover" hidden>
      <div class="gameover-card">
        <h2>Lease shut in</h2>
        <p id="gameover-reason"></p>
        <button type="button" class="tool-btn active" id="btn-reset-go">Reset lease</button>
      </div>
    </div>
  </div>
  <footer class="bottom-bar">
    <div class="tool-group" data-group="mode">
      <button class="tool-btn active" data-tool="select" type="button">Select</button>
    </div>
    <div class="tool-group" data-group="actions">
      <span class="tool-group-label">Actions</span>
      <button class="tool-btn action" data-tool="drill" type="button">Drill</button>
      <button class="tool-btn action" data-tool="choke" type="button">Choke</button>
      <button class="tool-btn action" data-tool="move_rig" type="button">Move rig</button>
      <button class="tool-btn action" data-tool="add_tank" type="button">+Tank · $${(ADD_TANK_COST / 1000).toFixed(0)}k</button>
      <button class="tool-btn action" data-tool="gas_line" type="button">Gas line · $${(GAS_LINE_COST / 1000).toFixed(0)}k</button>
      <button class="tool-btn action" data-tool="explore" type="button">Explore · $${(EXPLORE_COST / 1000).toFixed(0)}k</button>
    </div>
    <div class="tool-group" data-group="facilities">
      <span class="tool-group-label">Facilities</span>
      <button class="tool-btn" data-tool="road" type="button">Road</button>
      <button class="tool-btn" data-tool="oil_pipe" type="button">Oil pipe · $${(OIL_PIPE_COST / 1000).toFixed(0)}k</button>
      <button class="tool-btn" data-tool="gas_pipe" type="button">Gas pipe · $${(GAS_PIPE_COST / 1000).toFixed(0)}k</button>
      <button class="tool-btn" data-tool="battery" type="button">Battery · $${(BATTERY_COST / 1000).toFixed(0)}k</button>
      <button class="tool-btn" data-tool="gas_plant" type="button">Gas plant · $${(GAS_PLANT_COST / 1000).toFixed(0)}k</button>
      <button class="tool-btn" data-tool="refinery" type="button">Refinery · $${(REFINERY_COST / 1000000).toFixed(1)}M</button>
    </div>
    <div class="tool-group" data-group="machinery">
      <span class="tool-group-label">Machinery</span>
      <button class="tool-btn" data-tool="truck" type="button">Truck 400 · $${(EXTRA_TRUCK_COST / 1000).toFixed(0)}k</button>
      <button class="tool-btn" data-tool="small_truck" type="button">Truck 200 · $${(SMALL_TRUCK_COST / 1000).toFixed(0)}k</button>
      <button class="tool-btn" data-tool="upgrade_rig" type="button">Rig+ · $${(UPGRADE_RIG_COST / 1000).toFixed(0)}k</button>
    </div>
    <div class="tool-group" data-group="services">
      <span class="tool-group-label">Services</span>
      <button class="tool-btn" data-tool="sell" type="button">Sell 75%</button>
      <button class="tool-btn" data-tool="buy_permit" type="button">Permit · $${(PERMIT_COST / 1000).toFixed(0)}k</button>
      <button class="tool-btn" data-tool="pay_debt" type="button">Pay debt</button>
      <button class="tool-btn" data-tool="draw_credit" type="button">Draw $250k</button>
    </div>
    <div class="tool-meta" id="tool-meta">Booting…</div>
  </footer>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas")!;
// PixiJS (WebGL) is the default renderer (graphics pass: layers + atlas).
// `?canvas` falls back to the battle-tested Canvas 2D path; old `?pixi` links
// simply get the default. If Pixi fails to init we drop to Canvas at runtime.
const USE_CANVAS = new URLSearchParams(location.search).has("canvas");
let ctx: CanvasRenderingContext2D | null = USE_CANVAS
  ? canvas.getContext("2d")
  : null;
let pixi: PixiRenderer | null = null;
const hoverTip = document.querySelector<HTMLDivElement>("#hover-tip")!;
const inspectBody = document.querySelector<HTMLDivElement>("#inspect-body")!;
const dashBody = document.querySelector<HTMLDivElement>("#dash-body")!;
const ledgerBody = document.querySelector<HTMLDivElement>("#ledger-body")!;
const dashPanel = document.querySelector<HTMLDivElement>("#dash-panel")!;
const ledgerPanel = document.querySelector<HTMLDivElement>("#ledger-panel")!;
const triagePanel = document.querySelector<HTMLDivElement>("#triage-panel")!;
const triageMsg = document.querySelector<HTMLDivElement>("#triage-msg")!;
const fleetPanel = document.querySelector<HTMLDivElement>("#fleet-panel")!;
const fleetBody = document.querySelector<HTMLDivElement>("#fleet-body")!;
const guideBar = document.querySelector<HTMLDivElement>("#guide-bar")!;
const confirmBanner = document.querySelector<HTMLDivElement>("#confirm-banner")!;
const gameoverEl = document.querySelector<HTMLDivElement>("#gameover")!;

type Dash = ReturnType<Game["dashboard"]>;
type Led = Dash["ledger"][number];

// --- Build-once SCADA process panel + cash ticker (mutated per frame) ---
dashBody.innerHTML = `
  <div class="scada-alarm" data-k="alarm" hidden></div>
  <div class="scada-stage"><span class="led-dot" data-k="wellsLed"></span><span class="scada-name">Wells</span><span class="scada-val" data-k="wellsVal"></span></div>
  <div class="scada-stage"><span class="led-dot" data-k="tankLed"></span><span class="scada-name">Wellhead</span><span class="scada-val" data-k="tankVal"></span></div>
  <div class="scada-stage"><span class="led-dot" data-k="battLed"></span><span class="scada-name">Battery</span></div>
  <div class="meter"><span class="meter-cap">Crude</span><div class="meter-track"><div class="meter-fill" data-k="crudeFill"></div></div><span class="meter-val" data-k="crudeVal"></span></div>
  <div class="meter"><span class="meter-cap">Clean</span><div class="meter-track"><div class="meter-fill" data-k="cleanFill"></div></div><span class="meter-val" data-k="cleanVal"></span></div>
  <div class="meter"><span class="meter-cap">Treat</span><div class="meter-track"><div class="meter-fill" data-k="treatFill"></div></div><span class="meter-val" data-k="treatVal"></span></div>
  <div class="scada-stage"><span class="led-dot" data-k="salesLed"></span><span class="scada-name">Sales</span><span class="scada-pill" data-k="salesPill"></span></div>
  <div class="meter"><span class="meter-cap">Sales</span><div class="meter-track"><div class="meter-fill" data-k="salesFill"></div></div><span class="meter-val" data-k="salesVal"></span></div>
  <div class="scada-stage"><span class="led-dot" data-k="gasLed"></span><span class="scada-name">Gas plant</span><span class="scada-val" data-k="gasVal"></span></div>
  <div class="meter rep-meter"><span class="meter-cap">Rep</span><div class="meter-track"><div class="meter-fill" data-k="repFill"></div></div><span class="meter-val" data-k="repVal"></span></div>
  <div class="scada-econ"><span>rev <b data-k="rev"></b></span><span>opex <b data-k="opex"></b></span><span>int <b data-k="int"></b></span></div>
  <div class="scada-trucks" data-k="trucks"></div>
`;
const S: Record<string, HTMLElement> = {};
dashBody.querySelectorAll<HTMLElement>("[data-k]").forEach((el) => {
  S[el.dataset.k!] = el;
});

ledgerBody.innerHTML = `
  <div class="led" data-k="t0"><span></span><span></span></div>
  <div class="led" data-k="t1"><span></span><span></span></div>
  <div class="ledger-more">▸ full log</div>
`;
const T: Record<string, HTMLElement> = {};
ledgerBody.querySelectorAll<HTMLElement>("[data-k]").forEach((el) => {
  T[el.dataset.k!] = el;
});

const ledgerModal = document.querySelector<HTMLDivElement>("#ledger-modal")!;
const ledgerModalBody = document.querySelector<HTMLDivElement>("#ledger-modal-body")!;
const ledRow = (e: Led) =>
  `<div class="led ${e.amount >= 0 ? "in" : "out"}"><span>d${e.day.toFixed(0)} ${e.label}</span><span>${e.amount >= 0 ? "+" : ""}$${money(e.amount)}</span></div>`;
function renderLedgerModal() {
  const rows = game.ledger.recent(40);
  ledgerModalBody.innerHTML = rows.length
    ? rows.map(ledRow).join("")
    : "<div>No movements yet</div>";
}
function openLedgerModal() {
  renderLedgerModal();
  ledgerModal.hidden = false;
  applyTimeHold();
}
function closeLedgerModal() {
  ledgerModal.hidden = true;
  applyTimeHold();
}
ledgerBody.style.cursor = "pointer";
ledgerBody.title = "Click for full cash history";
ledgerBody.addEventListener("click", openLedgerModal);
document.querySelector("#ledger-close")!.addEventListener("click", closeLedgerModal);
ledgerModal.addEventListener("click", (e) => {
  if (e.target === ledgerModal) closeLedgerModal();
});

const meterStatus = (pct: number, warn: number, bad: number) =>
  pct >= bad ? "red" : pct >= warn ? "amber" : "green";
function setMeter(
  fill: HTMLElement,
  valEl: HTMLElement,
  pct: number,
  status: string,
  text: string,
) {
  fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  fill.dataset.status = status;
  valEl.textContent = text;
}

function updateScada(d: Dash) {
  if (d.advice) {
    S.alarm.textContent = `⚠ ${d.advice}`;
    S.alarm.hidden = false;
  } else {
    S.alarm.hidden = true;
  }
  S.wellsLed.dataset.status =
    d.wellCount === 0 ? "grey" : d.oilBopd > 0 ? "green" : "amber";
  S.wellsVal.textContent = `${d.wellCount} · ${d.oilBopd.toFixed(0)} bopd / ${d.gasMcfd.toFixed(0)} mcf`;
  S.tankLed.dataset.status = d.stranded === 0 ? "green" : "red";
  S.tankVal.textContent = d.stranded ? `${d.stranded} stranded` : "clear";

  const crudePct = d.crudeCap ? (d.crude / d.crudeCap) * 100 : 0;
  const cleanPct = d.cleanCap ? (d.clean / d.cleanCap) * 100 : 0;
  // Treat meter = live treating rate vs capacity (NOT well production).
  // crude full + clean ~0 + treat live = treating works; inflow ≥ treat rate.
  const treatLive = d.treatLive ?? 0;
  const treatPct = d.treatCap ? Math.min(100, (treatLive / d.treatCap) * 100) : 0;
  const treatBlockedClean = !!(d.treatBlockedClean || (d.crude > 10 && treatLive < 1 && cleanPct >= 90));
  const treatInflow = !!d.treatStarvedByInflow;
  // A storm-damaged (offline) battery freezes treating — call it out plainly so
  // "crude full / clean 0" doesn't read as a mystery.
  const battOffline = (d.batteriesOffline ?? 0) > 0;
  setMeter(S.crudeFill, S.crudeVal, crudePct, meterStatus(crudePct, 70, 90), `${d.crude.toFixed(0)}/${d.crudeCap}`);
  setMeter(S.cleanFill, S.cleanVal, cleanPct, meterStatus(cleanPct, 70, 90), `${d.clean.toFixed(0)}/${d.cleanCap}`);
  setMeter(
    S.treatFill,
    S.treatVal,
    battOffline || treatBlockedClean ? 100 : treatPct,
    battOffline || treatBlockedClean ? "red" : treatInflow ? "amber" : treatLive > 0 ? "green" : "grey",
    battOffline
      ? `OFFLINE — storm damage, repairing`
      : treatBlockedClean
        ? `BLOCKED clean full`
        : treatInflow
          ? `MAX ${treatLive.toFixed(0)}/d · crude in > treat`
          : `${treatLive.toFixed(0)}/${d.treatCap} live`,
  );
  const battWorst = Math.max(crudePct, cleanPct);
  S.battLed.dataset.status = battOffline
    ? "red"
    : battWorst >= 90
      ? "red"
      : battWorst >= 70
        ? "amber"
        : d.batteries
          ? "green"
          : "grey";

  const salesPct = d.refSlotCap ? (d.refSlotUsed / d.refSlotCap) * 100 : 0;
  S.salesLed.dataset.status =
    d.refSlotCap === 0
      ? "red"
      : d.refSlotUsed >= d.refSlotCap - 0.5
        ? "amber"
        : d.refSlotUsed > 0
          ? "green"
          : "grey";
  setMeter(S.salesFill, S.salesVal, salesPct, salesPct >= 99 ? "amber" : "green", `${d.refSlotUsed.toFixed(0)}/${d.refSlotCap}`);
  S.salesPill.textContent = d.oilPiped ? "pipe ✓" : "";

  // Gas plant: show throughput vs stacking capacity (each plant adds cap).
  // Amber when gas exceeds capacity (the surplus flares/gas-lines), green when
  // within capacity, grey when there's no plant.
  const gasCap = d.gasPlantCap ?? 0;
  const overGasCap = d.gasPlants > 0 && d.gasMcfd > gasCap + 1;
  S.gasLed.dataset.status = d.gasPlants === 0
    ? (d.gasMcfd > 0 ? "amber" : "grey")
    : overGasCap
      ? "amber"
      : "green";
  S.gasVal.textContent = d.gasPlants
    ? `${d.gasMcfd.toFixed(0)}/${gasCap} mcf · ${d.gasPlants} plant${d.gasPlants > 1 ? "s" : ""}`
    : d.gasMcfd > 0
      ? "flaring"
      : "—";

  S.repFill.style.width = `${d.rep}%`;
  S.repFill.dataset.status = d.rep < 25 ? "red" : d.rep < 45 ? "amber" : "green";
  S.repVal.textContent = d.rep.toFixed(0);
  S.rev.textContent = `$${money(d.revenueToday)}`;
  S.opex.textContent = `$${money(d.opexToday)}`;
  S.int.textContent = d.interestOn ? `$${money(d.interestToday)}` : "off";

  const truckLine = d.trucks
    .map((t) => `${t.job}${t.cargo > 0 ? ` ${t.kind}:${t.cargo.toFixed(0)}` : ""}`)
    .join(" · ");
  S.trucks.textContent = `Trucks: ${truckLine || "none"}`;
}

function updateTicker(d: Dash) {
  const rows = [T.t0, T.t1];
  for (let i = 0; i < 2; i++) {
    const e = d.ledger[i];
    const row = rows[i];
    if (e) {
      row.hidden = false;
      row.className = `led ${e.amount >= 0 ? "in" : "out"}`;
      (row.children[0] as HTMLElement).textContent = `d${e.day.toFixed(0)} ${e.label}`;
      (row.children[1] as HTMLElement).textContent = `${e.amount >= 0 ? "+" : ""}$${money(e.amount)}`;
    } else {
      row.hidden = true;
      row.className = "led";
    }
  }
}

// Fleet panel: one row per truck with a duty-cycle button and a stop/start
// button. The button STRUCTURE is rebuilt only when the truck set / mode / stop
// state changes — a per-frame innerHTML rebuild would replace a button between
// mousedown and mouseup, so clicks would never fire. Live job/cargo text is
// mutated each frame via cached name refs. One delegated listener drives it.
let fleetSig = "";
const fleetNameEls = new Map<string, HTMLElement>();
function fleetName(t: Dash["trucks"][number], i: number): string {
  const cargo = t.cargo > 0 ? `${t.kind} ${t.cargo.toFixed(0)}` : "empty";
  const job = t.stopped ? "stopped" : t.job;
  return `#${i + 1} · ${t.cargoCap}bbl · ${job} · ${cargo}`;
}
function updateFleet(d: Dash) {
  if (!d.trucks.length) {
    if (fleetSig !== "∅") {
      fleetBody.innerHTML = `<div class="fleet-empty">No trucks — buy one from Machinery.</div>`;
      fleetSig = "∅";
      fleetNameEls.clear();
    }
    return;
  }
  const sig = d.trucks.map((t) => `${t.id}:${t.mode}:${t.stopped ? 1 : 0}`).join("|");
  if (sig !== fleetSig) {
    fleetSig = sig;
    fleetBody.innerHTML = d.trucks
      .map((t) => {
        const modeLabel = t.mode === "auto" ? "Auto" : t.mode === "crude" ? "Crude" : "Clean";
        return `<div class="fleet-row">
          <span class="fleet-name" data-id="${t.id}"></span>
          <button class="fleet-btn mode-${t.mode}" data-id="${t.id}" data-act="mode" data-mode="${t.mode}">${modeLabel}</button>
          <button class="fleet-btn ${t.stopped ? "is-stopped" : ""}" data-id="${t.id}" data-act="stop" data-stopped="${t.stopped}">${t.stopped ? "Start" : "Stop"}</button>
        </div>`;
      })
      .join("");
    fleetNameEls.clear();
    fleetBody.querySelectorAll<HTMLElement>(".fleet-name").forEach((el) => {
      fleetNameEls.set(el.dataset.id!, el);
    });
  }
  d.trucks.forEach((t, i) => {
    const el = fleetNameEls.get(t.id);
    if (el) el.textContent = fleetName(t, i);
  });
}

fleetBody.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest(".fleet-btn") as HTMLElement | null;
  if (!btn) return;
  const id = btn.dataset.id!;
  if (btn.dataset.act === "mode") {
    const order = ["auto", "crude", "clean"] as const;
    const cur = btn.dataset.mode as (typeof order)[number];
    game.setTruckMode(id, order[(order.indexOf(cur) + 1) % 3]);
  } else if (btn.dataset.act === "stop") {
    game.setTruckStopped(id, btn.dataset.stopped !== "true");
  }
  flash(game.message);
  syncDash();
  saveGame();
});

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
  if (pixi?.ready) {
    pixi.resize();
    return;
  }
  // Canvas 2D path — or Pixi still booting (it sizes its canvas on init).
  if (!ctx) return;
  const wrap = canvas.parentElement!;
  const dpr = Math.min(window.devicePixelRatio || 1, 3); // 3 = crisp on retina
  canvas.width = Math.floor(wrap.clientWidth * dpr);
  canvas.height = Math.floor(wrap.clientHeight * dpr);
}
window.addEventListener("resize", resize);
resize();
// Keep the canvas backing store matched to its container even when a surrounding
// element (toolbar/HUD reflow, mobile browser chrome) changes size — otherwise
// the fixed-size canvas gets CSS-stretched and the map appears to shift.
if ("ResizeObserver" in window) {
  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas.parentElement!);
}

if (!USE_CANVAS) {
  // Lazy-load the Pixi renderer chunk; fall back to Canvas 2D if WebGL dies.
  import("./game/renderPixi")
    .then(({ PixiRenderer }) => {
      pixi = new PixiRenderer(canvas);
      return pixi.init();
    })
    .then(() => pixi?.resize())
    .catch((err) => {
      console.error("Pixi renderer failed to init:", err);
      pixi = null;
      ctx = canvas.getContext("2d");
      if (ctx) {
        resize();
        flash("WebGL unavailable — using the Canvas 2D renderer.");
      } else {
        flash("Renderer failed — reload with ?canvas.");
      }
    });
}

function money(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function clearConfirm() {
  pendingConfirm = null;
  confirmBanner.hidden = true;
  applyTimeHold();
}

function askConfirm(tool: BuildTool, detail: string): boolean {
  if (pendingConfirm === tool) {
    clearConfirm();
    return true;
  }
  pendingConfirm = tool;
  applyTimeHold();
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
// Bump on state-schema changes: 2 footprints, 3 terrain+pipes, 4 map+pipes.
// Map size lives in the save's own grid (applyState syncs config to it), so a
// bigger default map needs no version bump — old saves keep their lease size.
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
        mode: game.mode,
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
    // Validity guard: reject only structurally-broken grids. Any well-formed
    // grid loads regardless of size — applyState syncs config to the saved
    // lease, so a save made on the old 56×36 map still opens (and survives).
    const t = snap.game.tiles;
    if (
      !Array.isArray(t) ||
      t.length === 0 ||
      !Array.isArray(t[0]) ||
      t[0].length === 0
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
    // Difficulty: prefer the new `mode`; migrate legacy `intOn` (true → hard).
    if (snap.mode === "easy" || snap.mode === "hard") game.mode = snap.mode;
    else if (typeof snap.intOn === "boolean") game.mode = snap.intOn ? "hard" : "easy";
    return true;
  } catch {
    return false;
  }
}

// --- Decision hold (Bug #6) ---------------------------------------------
// While the player is mid-decision (a two-click confirm is pending, or the
// ledger modal is open) the sim must not advance. We freeze by forcing
// game.timeScale to 0, but keep `currentSpeed` as the player's chosen speed
// so it (including a player-chosen pause of 0) is restored on release.
function decisionHeld(): boolean {
  return pendingConfirm !== null || !ledgerModal.hidden;
}

function applyTimeHold() {
  game.timeScale = decisionHeld() ? 0 : currentSpeed;
}

function setSpeed(s: number) {
  currentSpeed = s;
  applyTimeHold();
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
type UiState = { inspect?: boolean; dash?: boolean; ledger?: boolean; fleet?: boolean; triage?: boolean };
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
// Mobile: start the overlay panels collapsed to chips so the map isn't buried
// under them (one tap on a title opens it). Triage stays visible — it's the
// guide. Only defaults when the user hasn't chosen, so it respects prior taps.
if (
  typeof window !== "undefined" &&
  window.matchMedia?.("(max-width: 720px)").matches
) {
  for (const k of ["inspect", "dash", "ledger", "fleet"] as (keyof UiState)[]) {
    if (uiState[k] === undefined) uiState[k] = true;
  }
}
const PANELS: { sel: string; key: keyof UiState }[] = [
  { sel: "#inspect-panel", key: "inspect" },
  { sel: "#dash-panel", key: "dash" },
  { sel: "#ledger-panel", key: "ledger" },
  { sel: "#fleet-panel", key: "fleet" },
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
// Triage collapses to just its status dot (its own title, so it's wired here).
{
  const tTitle = document.querySelector<HTMLElement>("#triage-panel .triage-title");
  applyPanel("#triage-panel", !!uiState.triage);
  tTitle?.addEventListener("click", () => {
    uiState.triage = !uiState.triage;
    applyPanel("#triage-panel", !!uiState.triage);
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
document.querySelector("#btn-hard")!.addEventListener("click", () => {
  game.mode = game.mode === "hard" ? "easy" : "hard";
  flash(
    game.mode === "hard"
      ? "HARD mode — debt interest accrues; lease shuts in on rep 0 or insolvency."
      : "EASY mode — no interest; the lease can never be shut in.",
  );
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
    (btn as HTMLElement).blur(); // keep keyboard focus off buttons
    const tool = (btn as HTMLElement).dataset.tool as BuildTool;

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
// Suppress the native right-click menu everywhere (buttons/panels) so it can't
// expose Chrome's "Inspect" → DevTools. The in-game menu is a pointerup handler.
document.addEventListener("contextmenu", (e) => e.preventDefault());

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
    // Latched: stay armed for the next survey (Select/Esc/another tool clears).
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
    // Queue the target (up to 6). The rig works the queue automatically:
    // move → spud → next. Clicking a queued tile again removes it. The tool
    // stays armed so you can line up several; AFE is charged as each spuds.
    game.queueDrill(tile.x, tile.y);
    flash(game.message);
    syncAll();
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
// Two-finger pinch-zoom (mobile). Tracks live pointers; a second finger
// cancels any single-pointer drag and enters a smooth pinch gesture.
const activePointers = new Map<number, { x: number; y: number }>();
let pinching = false;
let pinchDist = 0;
// Touch/pen have no right-click; a long-press opens the action menu instead.
let longPressTimer = 0;
let longPressFired = false;
function cancelLongPress() {
  if (longPressTimer) {
    window.clearTimeout(longPressTimer);
    longPressTimer = 0;
  }
}

canvas.addEventListener("pointerdown", (e) => {
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (activePointers.size >= 2) {
    // Second finger down → pinch. Abort any single-pointer gesture cleanly.
    pinching = true;
    leftDown = false;
    panning = false;
    dragKind = null;
    cancelLongPress();
    closeContextMenu();
    const pts = [...activePointers.values()];
    pinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1;
    return;
  }
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

  longPressFired = false;
  cancelLongPress();
  if (e.pointerType !== "mouse") {
    const px = e.clientX;
    const py = e.clientY;
    longPressTimer = window.setTimeout(() => {
      const tile = canvasToTile(canvas, game, cam, px, py);
      if (tile) {
        longPressFired = true;
        openContextMenu(px, py, tile);
      }
    }, 450);
  }
});

canvas.addEventListener("pointermove", (e) => {
  const rect = canvas.getBoundingClientRect();

  if (activePointers.has(e.pointerId)) {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }
  // Two-finger pinch: zoom around the finger midpoint (fractional world anchor
  // keeps it smooth instead of snapping to whole tiles).
  if (pinching && activePointers.size >= 2) {
    const pts = [...activePointers.values()];
    const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1;
    const midX = (pts[0].x + pts[1].x) / 2;
    const midY = (pts[0].y + pts[1].y) / 2;
    const ts = game.config.tileSize;
    const before = screenToWorld(cam, canvas, midX, midY, ts);
    cam.zoom *= dist / pinchDist;
    clampCamera(cam, game.config.cols, game.config.rows);
    const after = screenToWorld(cam, canvas, midX, midY, ts);
    cam.x += before.wx - after.wx;
    cam.y += before.wy - after.wy;
    clampCamera(cam, game.config.cols, game.config.rows);
    pinchDist = dist;
    return;
  }

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
        cancelLongPress(); // a drag is not a long-press
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
      if (t) hover = t; // snap the tile highlight to the cursor while laying
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
    // Top-left of pointer/selection so a right-hand Apple Pencil grip
    // doesn't cover the tip (was bottom-right: +14,+14).
    const gap = 12;
    const ox = e.clientX - wrap.left;
    const oy = e.clientY - wrap.top;
    const tw = hoverTip.offsetWidth || 200;
    const th = hoverTip.offsetHeight || 48;
    const left = Math.max(4, Math.min(ox - tw - gap, wrap.width - tw - 4));
    const top = Math.max(4, Math.min(oy - th - gap, wrap.height - th - 4));
    hoverTip.style.left = `${left}px`;
    hoverTip.style.top = `${top}px`;
  } else {
    hoverTip.style.display = "none";
  }
});

canvas.addEventListener("pointerup", (e) => {
  const wasPinching = pinching;
  activePointers.delete(e.pointerId);
  if (activePointers.size < 2) pinching = false;
  if (wasPinching) {
    // Ending a pinch — the lifted finger must not fire a click/pan.
    leftDown = false;
    panning = false;
    dragKind = null;
    lastPaintTile = null;
    longPressFired = false;
    return;
  }

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
    cancelLongPress();
    // A clean click (no drag, no long-press menu) triggers the tool action
    if (dragKind === null && downTile && !longPressFired) {
      handleTileClick(downTile);
    }
    longPressFired = false;
    dragKind = null;
    lastPaintTile = null;
  }
});
canvas.addEventListener("pointercancel", (e) => {
  activePointers.delete(e.pointerId);
  if (activePointers.size < 2) pinching = false;
  cancelLongPress();
  leftDown = false;
  dragKind = null;
});
canvas.addEventListener("pointerleave", () => {
  hover = null;
  hoverTip.style.display = "none";
});

window.addEventListener("keydown", (e) => {
  // Never hijack browser chords (Ctrl/Cmd/Alt) or keys typed into a control.
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const kt = e.target as HTMLElement | null;
  if (kt && /^(BUTTON|INPUT|SELECT|TEXTAREA)$/.test(kt.tagName)) return;
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
    closeLedgerModal();
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
  const tt = game.tiles[tile.y][tile.x];
  const k = (n: number) => `$${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k`;

  const drillable = !tt.drilled && (tt.terrain === "ground" || tt.terrain === "scrub");
  if (drillable) {
    items.push({
      label: `Queue drill (AFE ${k(DRILL_COST[tt.subsurface.zone])})`,
      act: () => game.queueDrill(tile.x, tile.y),
    });
  }
  const theRig = game.selectedRig();
  if (
    theRig &&
    !(Math.round(theRig.x) === tile.x && Math.round(theRig.y) === tile.y)
  ) {
    items.push({ label: "Move rig here", act: () => game.sendRigTo(tile.x, tile.y) });
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
  if (!tt.surveyed) {
    items.push({ label: `Explore here (${k(EXPLORE_COST)})`, act: () => game.buyExploration(tile.x, tile.y) });
  }
  const truckHere = game.units.find(
    (u) => u.kind === "truck" && Math.round(u.x) === tile.x && Math.round(u.y) === tile.y,
  );
  if (truckHere) {
    const mode = truckHere.cargoMode ?? "auto";
    if (mode !== "auto") items.push({ label: "Truck → Auto (both)", act: () => game.setTruckMode(truckHere.id, "auto") });
    if (mode !== "crude") items.push({ label: "Truck → Crude only", act: () => game.setTruckMode(truckHere.id, "crude") });
    if (mode !== "clean") items.push({ label: "Truck → Clean only", act: () => game.setTruckMode(truckHere.id, "clean") });
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
  // State-specific header — the "second-button tooltip" for whatever's selected.
  const head = document.createElement("div");
  head.className = "ctx-head";
  head.textContent = game.inspectAt(tile.x, tile.y);
  contextMenu.appendChild(head);
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
  const hardBtn = document.querySelector("#btn-hard") as HTMLElement;
  hardBtn.textContent = d.mode === "hard" ? "Mode: Hard" : "Mode: Easy";
  hardBtn.classList.toggle("active", d.mode === "hard");
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
  // Panels collapse to just their title; skip mutating hidden bodies.
  if (!dashPanel.classList.contains("panel-collapsed")) updateScada(d);
  if (!ledgerPanel.classList.contains("panel-collapsed")) updateTicker(d);
  if (!fleetPanel.classList.contains("panel-collapsed")) updateFleet(d);
  if (!ledgerModal.hidden) renderLedgerModal();
  triagePanel.dataset.level = d.triage.level;
  triageMsg.textContent = d.triage.msg;
  // Bug #8: before any production exists (no producing wells / no income
  // path), the generic objective doesn't explain how to become profitable.
  // Surface the full money loop in the guide line. Leave the game-over guide
  // and every post-production guide untouched (triage panel is separate).
  guideBar.textContent =
    !d.gameOver && d.wellCount === 0
      ? "Money loop: Explore → Drill a Good/Sweet LAND tile → Road pad→battery→refinery → trucks haul crude→clean→Sell."
      : d.guide;

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
