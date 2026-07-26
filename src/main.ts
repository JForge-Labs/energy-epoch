import "./styles.css";
import { Capacitor } from "@capacitor/core";
import { clampCamera, createCamera, screenToWorld } from "./game/camera";
import { Game } from "./game/Game";

// The packaged iOS/Android app bundles dist/ and has no backend origin, so
// accounts/cloud saves don't apply — run offline with local saves only.
const IS_NATIVE = Capacitor.isNativePlatform();
import {
  ADD_TANK_COST,
  BATTERY_COST,
  DRILL_COST,
  EXPLORE_COST,
  EXTRA_TRUCK_COST,
  GAS_LINE_COST,
  GAS_PIPE_COST,
  GAS_PLANT_COST,
  MAP_PRESETS,
  type MapPreset,
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
import type { BuildTool, GameConfig } from "./game/types";

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
      <div id="rep-wrap" class="clickable" title="Reputation (0–100). Low rep brings fines, then a shut-in order at 0. Falls from flaring and spills. Click for status.">Rep <strong id="stat-rep">70</strong></div>
      <div id="ops-wrap" class="clickable" title="Operating status. GREEN = revenue beats interest + opex. RED = losing money. Click for the exact reason.">Ops <strong id="stat-ops">—</strong></div>
      <div title="Days elapsed on the lease.">Day <strong id="stat-day">1</strong></div>
      <div id="wx-wrap" class="wx-wrap" title="Weather — affects haul speed & drilling"><strong id="stat-wx" class="wx-icon" aria-label="weather">☀️</strong></div>
      <div class="metrics-more" id="metrics-more" data-open="false">
        <div>Debt <strong id="stat-debt">$0</strong></div>
        <div title="Debt interest charged per day. Only accrues in Hard mode — pay down debt to shrink it.">Int/day <strong id="stat-int">$0</strong></div>
        <div title="Live crude price ($/bbl).">Oil <strong id="stat-oil">$0</strong></div>
      </div>
      <button type="button" class="metrics-toggle" id="metrics-toggle" title="More stats" aria-label="More stats">⋯</button>
      <button type="button" class="metrics-toggle" id="inspect-toggle" title="Inspect tooltip (press I) — hover tiles for details" aria-label="Toggle inspect tooltip">ⓘ</button>
      <div class="speed-ctl" title="Time speed">
        <button type="button" class="spd-btn" data-spd="0">❚❚</button>
        <button type="button" class="spd-btn" data-spd="0.5">0.5×</button>
        <button type="button" class="spd-btn active" data-spd="1">1×</button>
        <button type="button" class="spd-btn" data-spd="2">2×</button>
      </div>
    </div>
    <div class="hud-actions">
      <span id="account-tag" class="account-tag" hidden></span>
      <button type="button" class="tool-btn" id="btn-account" title="Sign in with a magic link to save your games & maps to the cloud.">Sign in</button>
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
    <div class="objectives" id="objectives" hidden>
      <div class="obj-head">
        <span class="obj-title">Get to first oil</span>
        <button class="obj-x" id="obj-dismiss" type="button" aria-label="Dismiss">✕</button>
      </div>
      <ol class="obj-list">
        <li class="obj-step" data-step="explore"><span class="obj-check"></span>Explore a 3×3 to survey the odds</li>
        <li class="obj-step" data-step="drill"><span class="obj-check"></span>Drill a <b>Good</b> or <b>Sweet</b> tile</li>
        <li class="obj-step" data-step="road"><span class="obj-check"></span>Road the pad → get <b>crude to a battery</b></li>
      </ol>
    </div>
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
    <div class="map-picker" id="map-picker" hidden>
      <div class="map-picker-card">
        <h2>Choose your lease</h2>
        <div class="map-list" id="map-list"></div>
      </div>
    </div>
    <div class="signin-gate" id="signin-gate" hidden>
      <div class="signin-card">
        <h2>ENERGY EPOCH</h2>
        <p>Sign in to play — we'll email you a one-tap link. Your maps and games save to the cloud and follow you across devices.</p>
        <form id="gate-form">
          <input type="email" id="gate-email" placeholder="you@example.com" autocomplete="email" required />
          <button type="submit" class="tool-btn active" id="gate-submit">Send sign-in link</button>
        </form>
        <p class="gate-status" id="gate-status"></p>
        <a class="gate-home" href="https://playenergyepoch.com/">← Back to home</a>
      </div>
    </div>
  </div>
  <footer class="bottom-bar" id="bottom-bar" data-collapsed="false">
    <div class="dock-rail" id="dock-rail">
      <button class="tool-btn tool-dock active" id="tool-dock" data-tool="select" type="button" aria-pressed="false">
        <span class="dock-mark" id="dock-mark">●</span>
        <span class="dock-name" id="dock-name">Select</span>
        <span class="dock-hint" id="dock-hint">tap a tile to inspect</span>
        <span class="dock-x" aria-hidden="true">✕ Done</span>
      </button>
      <div class="tool-tabs" id="tool-tabs" role="tablist">
        <button class="tool-tab active" data-tab="actions" role="tab" type="button">Actions</button>
        <button class="tool-tab" data-tab="build" role="tab" type="button">Build</button>
        <button class="tool-tab" data-tab="services" role="tab" type="button">Services</button>
        <button class="tabbar-caret" id="tabbar-caret" type="button" aria-label="Collapse toolbar">▾</button>
      </div>
    </div>
    <div class="tool-scroll" id="tool-scroll">
      <div class="tool-group" data-tab="actions">
        <button class="tool-btn action" data-tool="drill" type="button">Drill</button>
        <button class="tool-btn action" data-tool="choke" type="button">Shut in</button>
        <button class="tool-btn action" data-tool="move_rig" type="button">Move rig</button>
        <button class="tool-btn action" data-tool="explore" type="button">Explore · $${(EXPLORE_COST / 1000).toFixed(0)}k</button>
        <button class="tool-btn action" data-tool="add_tank" type="button">+Tank · $${(ADD_TANK_COST / 1000).toFixed(0)}k</button>
        <button class="tool-btn action" data-tool="gas_line" type="button">Incinerator · $${(GAS_LINE_COST / 1000).toFixed(0)}k</button>
      </div>
      <div class="tool-group" data-tab="build" hidden>
        <button class="tool-btn" data-tool="road" type="button">Road</button>
        <button class="tool-btn" data-tool="crude_pipe" type="button">Crude pipe · $${(OIL_PIPE_COST / 1000).toFixed(0)}k</button>
        <button class="tool-btn" data-tool="clean_pipe" type="button">Clean pipe · $${(OIL_PIPE_COST / 1000).toFixed(0)}k</button>
        <button class="tool-btn" data-tool="gas_pipe" type="button">Gas pipe · $${(GAS_PIPE_COST / 1000).toFixed(0)}k</button>
        <button class="tool-btn" data-tool="battery" type="button">Battery · $${(BATTERY_COST / 1000).toFixed(0)}k</button>
        <button class="tool-btn" data-tool="gas_plant" type="button">Gas Refinery · $${(GAS_PLANT_COST / 1000).toFixed(0)}k</button>
        <button class="tool-btn" data-tool="refinery" type="button">Refinery · $${(REFINERY_COST / 1000000).toFixed(1)}M</button>
        <button class="tool-btn" data-tool="truck" type="button">Truck 400 · $${(EXTRA_TRUCK_COST / 1000).toFixed(0)}k</button>
        <button class="tool-btn" data-tool="small_truck" type="button">Truck 200 · $${(SMALL_TRUCK_COST / 1000).toFixed(0)}k</button>
        <button class="tool-btn" data-tool="upgrade_rig" type="button">Rig+ · $${(UPGRADE_RIG_COST / 1000).toFixed(0)}k</button>
      </div>
      <div class="tool-group" data-tab="services" hidden>
        <button class="tool-btn" data-tool="sell" type="button">Sell 75%</button>
        <button class="tool-btn" data-tool="buy_permit" type="button">Permit · $${(PERMIT_COST / 1000).toFixed(0)}k</button>
        <button class="tool-btn" data-tool="pay_debt" type="button">Pay debt</button>
        <button class="tool-btn" data-tool="draw_credit" type="button">Draw $250k</button>
      </div>
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
// The Inspect panel was removed as redundant (hover tooltip on desktop, toast +
// right-click state header on mobile). inspectBody is now a detached sink so the
// existing write-sites keep working; the same text also flows to game.message
// (bottom status line) and flash() toasts.
const inspectBody = document.createElement("div");
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
  <div class="scada-stage"><span class="led-dot" data-k="gasLed"></span><span class="scada-name">Gas Refinery</span><span class="scada-val" data-k="gasVal"></span></div>
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
  updateToolDock();
}

function disarmToSelect() {
  setActiveTool("select");
}

// --- Command Dock: Select IS the universal tool-release control -------------
// Latched tools stay armed after use (repeated place / toggle / pathing); the
// Dock morphs in place to show the held tool + a big "✕ Done" so dropping it is
// one obvious tap — the fix for "releasing a latched tool is unintuitive".
const LATCHED = new Set<BuildTool>([
  "road", "crude_pipe", "clean_pipe", "gas_pipe", "sell", "choke", "move_rig", "drill", "explore",
]);
const TOOL_LABEL: Record<string, string> = {
  select: "Select", drill: "Drill", choke: "Shut in", move_rig: "Move rig",
  explore: "Explore", add_tank: "Tank", gas_line: "Incinerator", road: "Road",
  crude_pipe: "Crude pipe", clean_pipe: "Clean pipe", gas_pipe: "Gas pipe", battery: "Battery",
  gas_plant: "Gas Refinery", refinery: "Refinery", sell: "Sell",
};
const TOOL_HINT: Record<string, string> = {
  select: "tap a tile to inspect", drill: "tap tiles to queue wells",
  road: "drag to lay road", crude_pipe: "drag tank → battery (crude)",
  clean_pipe: "drag battery → refinery (clean)",
  gas_pipe: "drag to lay gas pipe", sell: "drag over tiles to sell",
  choke: "tap a well to shut it in", move_rig: "tap to move the rig",
  explore: "tap to survey a 3×3", add_tank: "tap a pad to add a tank",
  gas_line: "tap to tie in the nearest well", battery: "tap to place battery",
  gas_plant: "tap to place gas refinery", refinery: "tap to place refinery",
};
let dockTimer = 0;
function updateToolDock() {
  const dock = document.getElementById("tool-dock");
  if (!dock) return;
  const armed = game.tool !== "select";
  window.clearTimeout(dockTimer);
  dock.classList.remove("placed");
  dock.classList.toggle("armed", armed);
  dock.setAttribute("aria-pressed", String(armed));
  document.getElementById("bottom-bar")?.classList.toggle("tool-armed", armed);
  document.getElementById("dock-mark")!.textContent = armed ? "◉" : "●";
  document.getElementById("dock-name")!.textContent = TOOL_LABEL[game.tool] ?? game.tool;
  document.getElementById("dock-hint")!.textContent = TOOL_HINT[game.tool] ?? "";
}
// Brief "✓ placed → Select" pulse so a one-shot tool's auto-return is *seen*.
function flashDockPlaced() {
  const dock = document.getElementById("tool-dock");
  if (!dock) return;
  dock.classList.add("placed");
  document.getElementById("dock-name")!.textContent = "Placed";
  document.getElementById("dock-hint")!.textContent = "✓ back to Select";
  dockTimer = window.setTimeout(updateToolDock, 700);
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
        updatedAt: Date.now(),
        cam,
        spd: currentSpeed,
        mode: game.mode,
        map: {
          name: game.config.mapName ?? "Prairie",
          seed: game.config.seed,
          cols: game.config.cols,
          rows: game.config.rows,
          params: game.config.mapParams,
        },
        game: game.serialize(),
      }),
    );
    pushCloudSave();
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
    // Map identity (tiles themselves come from applyState; this is for display
    // + the cloud). config is mutable field-wise even though the ref is readonly.
    if (snap.map) {
      game.config.mapName = snap.map.name;
      game.config.seed = snap.map.seed;
      game.config.mapParams = snap.map.params;
    }
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

// Turn a picked preset into a Game config (Random rolls a fresh seed).
function presetToConfig(p: MapPreset): Partial<GameConfig> {
  const seed = p.random ? Math.floor(Math.random() * 1_000_000_000) : p.seed;
  const name = p.random ? `Random #${seed}` : p.name;
  return { cols: p.cols, rows: p.rows, seed, mapParams: p.params, mapName: name };
}

// Construct a fresh Game (optionally with a chosen map), else restore the save.
function bootGame(restore: boolean, config?: Partial<GameConfig>): boolean {
  game = new Game(config);
  game.timeScale = currentSpeed;
  cam = createCamera(game.config.cols, game.config.rows);
  clearConfirm();
  gameoverEl.classList.remove("is-open");
  gameoverEl.hidden = true;
  pinnedInspect = "";
  inspectBody.textContent = "Tap a tile to inspect.";
  // Onboarding objectives are per-lease — clear the sticky step latches so a
  // fresh lease re-derives them from this game's dashboard (objectivesDone stays
  // global: the tutorial is shown once, not on every new lease).
  uiState.objExplore = false;
  uiState.objDrill = false;
  uiState.objRoad = false;
  document
    .querySelectorAll("#objectives .obj-step.done")
    .forEach((el) => el.classList.remove("done"));
  document.getElementById("objectives")?.classList.remove("obj-complete");
  const restored = restore ? loadGame() : false;
  syncAll();
  setActiveTool(game.tool); // sync the active button + Dock to the (restored) tool
  return restored;
}

const mapPickerEl = document.querySelector<HTMLDivElement>("#map-picker")!;
// Show the map picker and start a fresh lease with the chosen preset.
function showMapPicker(onPick: (cfg: Partial<GameConfig>) => void) {
  const list = document.querySelector<HTMLDivElement>("#map-list")!;
  list.innerHTML = "";
  for (const p of MAP_PRESETS) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "map-choice";
    card.innerHTML = `<strong>${p.name}</strong><span>${p.blurb}</span>`;
    card.addEventListener("click", () => {
      mapPickerEl.hidden = true;
      onPick(presetToConfig(p));
    });
    list.appendChild(card);
  }
  mapPickerEl.hidden = false;
}

function resetLease() {
  showMapPicker((cfg) => {
    localStorage.removeItem(activeSaveKey());
    bootGame(false, cfg);
    flash(`New ${cfg.mapName} lease. Road pad→battery→refinery, then drill.`);
    saveGame();
  });
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
  refreshProfileUI();
  showMapPicker((cfg) => {
    bootGame(false, cfg);
    saveGame();
    flash(`Created "${name}" on ${cfg.mapName}.`);
  });
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

// ---- Cloud accounts (magic-link) + save sync. Best-effort & offline-first:
//      every API call fails silently, so the game always works logged-out. ----
let account: { email: string; name: string } | null = null;
const accountBtn = document.querySelector<HTMLButtonElement>("#btn-account")!;

async function gzip(str: string): Promise<Blob> {
  const cs = new CompressionStream("gzip");
  return await new Response(new Blob([str]).stream().pipeThrough(cs)).blob();
}
async function gunzip(blob: Blob): Promise<string> {
  const ds = new DecompressionStream("gzip");
  return await new Response(blob.stream().pipeThrough(ds)).text();
}

const accountTag = document.querySelector<HTMLElement>("#account-tag")!;
function refreshAccountUI() {
  if (account) {
    accountBtn.textContent = "Sign out";
    accountBtn.title = `Signed in as ${account.name || account.email} (${account.email}). Games & maps sync to the cloud. Click to sign out.`;
    accountTag.textContent = `🎮 ${account.name || account.email.split("@")[0]}`;
    accountTag.hidden = false;
  } else {
    accountBtn.textContent = "Sign in";
    accountBtn.title = "Sign in with a magic link to save your games & maps to the cloud.";
    accountTag.hidden = true;
  }
  accountBtn.classList.toggle("active", !!account);
}

// First sign-in: ask for a gamertag (display name) and save it to the account.
async function ensureGamertag() {
  if (!account || account.name) return;
  const name = window
    .prompt("Choose a gamertag for your account:", account.email.split("@")[0])
    ?.trim();
  if (!name) return;
  try {
    const r = await fetch("/api/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (r.ok) {
      account.name = (await r.json()).name;
      refreshAccountUI();
    }
  } catch {
    /* offline */
  }
}

// "in" = signed in · "out" = reachable but no session (gate) · "offline" =
// couldn't reach the API (dev server, outage) → fail open so play isn't blocked.
type AuthState = "in" | "out" | "offline";
const gateEl = document.querySelector<HTMLDivElement>("#signin-gate")!;
function showGate(show: boolean) {
  gateEl.hidden = !show;
}

async function apiMe(): Promise<AuthState> {
  try {
    const r = await fetch("/api/me");
    if (r.status === 401) {
      account = null;
      refreshAccountUI();
      return "out";
    }
    if (!r.ok) throw new Error("unreachable");
    account = await r.json(); // throws on non-JSON (dev server HTML) → offline
    refreshAccountUI();
    return "in";
  } catch {
    account = null;
    refreshAccountUI();
    return "offline";
  }
}

// Debounced cloud push of the active profile's save blob (gzip'd).
let cloudPushTimer = 0;
function pushCloudSave() {
  if (!account) return;
  if (cloudPushTimer) window.clearTimeout(cloudPushTimer);
  cloudPushTimer = window.setTimeout(async () => {
    try {
      const raw = localStorage.getItem(activeSaveKey());
      if (!raw) return;
      await fetch(`/api/saves/${encodeURIComponent(profiles.active)}`, {
        method: "PUT",
        headers: {
          "x-map": encodeURIComponent(game.config.mapName ?? "Prairie"),
          "x-save-version": String(SAVE_VERSION),
        },
        body: await gzip(raw),
      });
    } catch {
      /* offline — stays local */
    }
  }, 3000);
}

// Pull cloud saves and merge (last-write-wins by updatedAt). Reloads the active
// profile only if the cloud copy is newer, so live play isn't disrupted.
async function pullCloudSaves() {
  if (!account) return;
  try {
    const r = await fetch("/api/saves");
    if (!r.ok) return;
    const { saves } = (await r.json()) as { saves: { slot: string; updatedAt: number }[] };
    let listChanged = false;
    let activeUpdated = false;
    for (const s of saves) {
      const key = `${SAVE_PREFIX}:${s.slot}`;
      const localRaw = localStorage.getItem(key);
      const localTs = localRaw ? (JSON.parse(localRaw).updatedAt ?? 0) : -1;
      if (s.updatedAt <= localTs) continue;
      const blobR = await fetch(`/api/saves/${encodeURIComponent(s.slot)}`);
      if (!blobR.ok) continue;
      localStorage.setItem(key, await gunzip(await blobR.blob()));
      if (!profiles.names.includes(s.slot)) {
        profiles.names.push(s.slot);
        listChanged = true;
      }
      if (s.slot === profiles.active) activeUpdated = true;
    }
    if (listChanged) {
      saveProfiles();
      refreshProfileUI();
    }
    if (activeUpdated) bootGame(true);
  } catch {
    /* offline */
  }
}

accountBtn.addEventListener("click", async () => {
  if (account) {
    if (window.confirm("Sign out? Local saves stay on this device.")) {
      try {
        await fetch("/api/logout", { method: "POST" });
      } catch {
        /* ignore */
      }
      account = null;
      refreshAccountUI();
      flash("Signed out. Local play still works.");
    }
    return;
  }
  const email = window.prompt("Email for cloud saves (we'll send a sign-in link):")?.trim();
  if (!email) return;
  try {
    await fetch("/api/auth/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    flash("Sign-in link sent — check your email (and your spam folder). Expires in 15 min.");
  } catch {
    flash("Cloud saves need the deployed site — can't reach the server here.");
  }
});

// On load: check the session and either open the game, gate it, or fail open.
// Native app: skip auth entirely — offline, local saves, no gate, no cloud.
if (IS_NATIVE) {
  showGate(false); // offline app: no gate, no cloud, local saves only
  accountBtn.hidden = true;
  accountTag.hidden = true;
} else
  apiMe().then((state) => {
  if (state === "in") {
    showGate(false);
    pullCloudSaves();
    ensureGamertag();
    if (new URLSearchParams(location.search).has("signedin")) {
      flash(`Signed in as ${account?.name || account?.email}. Your games & maps now sync.`);
      history.replaceState(null, "", location.pathname);
    }
  } else if (state === "out") {
    // Deployed, reachable, no session → require sign-in to play the full game.
    showGate(true);
  } else {
    showGate(false); // offline / dev — keep playing locally.
  }
});

// Gate sign-in form (mirrors the HUD Sign in flow, but blocking).
const gateForm = document.querySelector<HTMLFormElement>("#gate-form")!;
const gateStatus = document.querySelector<HTMLElement>("#gate-status")!;
gateForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.querySelector<HTMLInputElement>("#gate-email")!.value.trim();
  if (!email) return;
  gateStatus.textContent = "Sending…";
  try {
    await fetch("/api/auth/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    gateStatus.textContent =
      "Link sent! Check your email — and your spam folder. Expires in 15 min.";
  } catch {
    gateStatus.textContent = "Couldn't reach the server. Try again in a moment.";
  }
});

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
type UiState = {
  // overlay-panel collapse flags
  inspect?: boolean; dash?: boolean; ledger?: boolean; fleet?: boolean; triage?: boolean;
  // bottom toolbar
  tab?: "actions" | "build" | "services"; // active tab (default "actions")
  toolbarCollapsed?: boolean; // caret ▾ hides the tool row
  // top-bar secondary readouts folded away
  metricsCollapsed?: boolean;
  // objectives — sticky per-step latches + retire flag
  objExplore?: boolean; objDrill?: boolean; objRoad?: boolean; objectivesDone?: boolean;
  // inspect tooltip toggle (undefined/true = on, false = off) — hotkey "i"
  inspectTip?: boolean;
};
// The overlay-panel collapse flags (all boolean) — used by the generic
// collapse loops, which mustn't touch the non-boolean keys (tab, etc.).
type PanelKey = "inspect" | "dash" | "ledger" | "fleet" | "triage";
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
const inspectOn = () => uiState.inspectTip ?? true; // hover tooltip on by default
// Mobile: start the overlay panels collapsed to chips so the map isn't buried
// under them (one tap on a title opens it). Triage stays visible — it's the
// guide. Only defaults when the user hasn't chosen, so it respects prior taps.
// Phone chrome = the two orientation-scoped CSS blocks; mirror them here so the
// JS defaults (panels collapsed, metrics folded) fire on the same devices,
// including large phones in landscape (wide but short).
const PHONE_MEDIA =
  "(orientation: portrait) and (max-width: 700px), (orientation: landscape) and (max-height: 600px) and (pointer: coarse)";
if (typeof window !== "undefined" && window.matchMedia?.(PHONE_MEDIA).matches) {
  for (const k of ["dash", "ledger", "fleet"] as PanelKey[]) {
    if (uiState[k] === undefined) uiState[k] = true;
  }
}
const PANELS: { sel: string; key: PanelKey }[] = [
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

// --- Bottom-toolbar tabs (Actions / Build / Services) -----------------------
function setTab(tab: NonNullable<UiState["tab"]>) {
  uiState.tab = tab;
  saveUi();
  document.querySelectorAll<HTMLElement>(".tool-tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === tab);
  });
  document.querySelectorAll<HTMLElement>(".tool-group[data-tab]").forEach((g) => {
    g.hidden = g.dataset.tab !== tab;
  });
  const scroll = document.getElementById("tool-scroll");
  if (scroll) scroll.scrollLeft = 0;
}
document.querySelectorAll<HTMLElement>(".tool-tab").forEach((t) => {
  t.addEventListener("click", () => setTab(t.dataset.tab as NonNullable<UiState["tab"]>));
});
setTab(uiState.tab ?? "actions"); // restore on boot

// Caret collapses the tool row down to just the Dock + tabs.
function applyToolbarCollapsed() {
  document
    .getElementById("bottom-bar")
    ?.setAttribute("data-collapsed", String(!!uiState.toolbarCollapsed));
}
applyToolbarCollapsed();
document.getElementById("tabbar-caret")?.addEventListener("click", () => {
  uiState.toolbarCollapsed = !uiState.toolbarCollapsed;
  applyToolbarCollapsed();
  saveUi();
});

// --- Top-bar secondary-metrics fold -----------------------------------------
function applyMetrics() {
  document
    .getElementById("metrics-more")
    ?.setAttribute("data-open", String(!uiState.metricsCollapsed));
}
if (
  uiState.metricsCollapsed === undefined &&
  typeof window !== "undefined" &&
  window.matchMedia?.(PHONE_MEDIA).matches
) {
  uiState.metricsCollapsed = true; // default folded on phones
}
applyMetrics();
document.getElementById("metrics-toggle")?.addEventListener("click", () => {
  uiState.metricsCollapsed = !uiState.metricsCollapsed;
  applyMetrics();
  saveUi();
});

// --- Inspect tooltip toggle (hotkey "i" + HUD ⓘ button) ---------------------
function applyInspectToggle() {
  document.getElementById("inspect-toggle")?.classList.toggle("active", inspectOn());
}
function toggleInspect() {
  uiState.inspectTip = !inspectOn();
  saveUi();
  applyInspectToggle();
  flash(
    inspectOn()
      ? "Inspect tooltip ON — hover a tile for details (I)"
      : "Inspect tooltip OFF — ⓘ marks the cursor (press I to turn on)",
  );
}
applyInspectToggle();
document.getElementById("inspect-toggle")?.addEventListener("click", toggleInspect);

// --- Objectives card (replaces the money-loop banner) -----------------------
// Sticky ||= latches so scrapping infra mid-tutorial never un-completes a step.
// Runs every frame from syncDash, but only writes localStorage when a latch
// flips, and only celebrates once.
let objCelebrated = false;
function evalObjectives(d: ReturnType<typeof game.dashboard>) {
  const box = document.getElementById("objectives");
  if (!box) return;
  // Stay visible during the 1.8s celebration; hide once retired.
  if (uiState.objectivesDone && !objCelebrated) {
    box.hidden = true;
    return;
  }
  const e0 = !!uiState.objExplore,
    d0 = !!uiState.objDrill,
    r0 = !!uiState.objRoad;
  const explore = (uiState.objExplore ||= d.surveyedCount > 0);
  const drill = (uiState.objDrill ||= d.wellCount > 0);
  const road = (uiState.objRoad ||= d.crude > 0);
  const changed = explore !== e0 || drill !== d0 || road !== r0;
  const steps: [string, boolean][] = [
    ["explore", explore],
    ["drill", drill],
    ["road", road],
  ];
  for (const [s, flag] of steps) {
    box.querySelector(`.obj-step[data-step="${s}"]`)?.classList.toggle("done", flag);
  }
  box.hidden = false;
  if (changed) saveUi();
  if (explore && drill && road) {
    if (!objCelebrated) {
      objCelebrated = true;
      uiState.objectivesDone = true; // persist atomically with the sub-latches
      saveUi();
      box.classList.add("obj-complete");
      flash("Onboarding complete — you're pumping. Good luck out there.");
      window.setTimeout(() => {
        objCelebrated = false; // now the retire guard hides the card
        const b = document.getElementById("objectives");
        if (b) b.hidden = true;
      }, 1800);
    }
  } else if (changed) {
    flash("Objective complete.");
  }
}
document.getElementById("obj-dismiss")?.addEventListener("click", () => {
  uiState.objectivesDone = true;
  saveUi();
  const b = document.getElementById("objectives");
  if (b) b.hidden = true;
});

// Render the neutral Dock once now that its elements exist.
updateToolDock();

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
          ? `Rep ${r.toFixed(0)} — fines active. Incinerators + haul crude to cut flare.`
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

    // Tap the armed latched tool's own button again = drop back to Select.
    if (tool === game.tool && LATCHED.has(tool)) {
      disarmToSelect();
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
    flashDockPlaced();
    syncAll();
    return;
  }

  if (tool === "gas_plant") {
    if (!askConfirm("gas_plant", `2×2 gas refinery with top-left at ${tile.x},${tile.y}.`)) {
      return;
    }
    game.placeGasPlant(tile.x, tile.y);
    flash(game.message);
    disarmToSelect();
    flashDockPlaced();
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
    flashDockPlaced();
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
    flashDockPlaced();
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
    flashDockPlaced();
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
    tool === "crude_pipe" ||
    tool === "clean_pipe" ||
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
    tool === "crude_pipe" ||
    tool === "clean_pipe" ||
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
  } else if (game.tool === "crude_pipe") {
    if (game.player.cash < OIL_PIPE_COST) {
      flash(`Out of cash for crude pipe at ${x},${y}.`);
      return false;
    }
    game.layPipe(x, y, "crude");
  } else if (game.tool === "clean_pipe") {
    if (game.player.cash < OIL_PIPE_COST) {
      flash(`Out of cash for clean pipe at ${x},${y}.`);
      return false;
    }
    game.layPipe(x, y, "clean");
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
    if (inspectOn()) {
      hoverTip.textContent = game.inspectAt(hover.x, hover.y);
      hoverTip.classList.remove("tip-mini");
    } else {
      // Toggled off: a small ⓘ trails the cursor to remind that inspect is a
      // press-"i" away, without covering the map with text.
      hoverTip.textContent = "ⓘ";
      hoverTip.classList.add("tip-mini");
    }
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
  if (e.key === "i" || e.key === "I") toggleInspect();
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
      label: well.choked ? "Bring well online" : "Shut in well",
      act: () => game.toggleChoke(tile.x, tile.y),
    });
    items.push({ label: `Incinerator (${k(GAS_LINE_COST)})`, act: () => game.placeGasLine(tile.x, tile.y) });
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
    if (!tt.oilPipe) {
      items.push({ label: `Crude pipe (${k(OIL_PIPE_COST)})`, act: () => game.layPipe(tile.x, tile.y, "crude") });
      items.push({ label: `Clean pipe (${k(OIL_PIPE_COST)})`, act: () => game.layPipe(tile.x, tile.y, "clean") });
    }
    if (!tt.gasPipe) items.push({ label: `Gas pipe (${k(GAS_PIPE_COST)})`, act: () => game.layPipe(tile.x, tile.y, "gas") });
  }
  if (tt.hasRoad || tt.oilPipe || tt.gasPipe || (b && b.kind !== "gas_flare")) {
    items.push({ label: "Sell / remove (75%)", act: () => game.sellAt(tile.x, tile.y) });
  }
  items.push({
    label: "Inspect",
    act: () => {
      const info = game.inspectAt(tile.x, tile.y);
      game.message = info; // bottom status line
      flash(info); // toast (the Inspect panel is gone)
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
        : "var(--ok)";
  document.querySelector("#stat-oil")!.textContent = `$${game.market.oilPrice.toFixed(2)}`;
  document.querySelector("#stat-day")!.textContent = game.market.day.toFixed(1);
  const ops = document.querySelector("#stat-ops")!;
  ops.textContent = game.player.operatingGreen ? "GREEN" : "RED";
  (ops as HTMLElement).style.color = game.player.operatingGreen
    ? "var(--ok)"
    : "var(--danger)";
  const wx = game.weather.kind;
  const wxIcon = wx === "clear" ? "☀️" : wx === "lightning_cell" ? "⛈️" : "🌧️";
  const wxText =
    wx === "clear"
      ? "Clear skies"
      : wx === "lightning_cell"
        ? "Lightning — drilling stands down"
        : "Storm — slow haul";
  document.querySelector("#stat-wx")!.textContent = wxIcon;
  (document.querySelector("#wx-wrap") as HTMLElement).title = wxText;
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
  // Onboarding now lives in the Objectives card; the guide line just carries
  // the live per-state hint.
  guideBar.textContent = d.guide;
  evalObjectives(d);

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
let lastFrameAt = last; // watchdog heartbeat
let rafId = 0;
function frame(now: number) {
  lastFrameAt = now;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  try {
    // Self-heal the sim clock every frame: if a decision-hold (pending confirm
    // / open ledger) was ever cleared without re-asserting the speed, this puts
    // timeScale back to the player's chosen speed — so the sim can never get
    // wedged at 0 and freeze the rig/trucks until a manual refresh.
    applyTimeHold();
    game.update(dt);
    if (pixi?.ready) pixi.render(game, cam, hover);
    else if (ctx) renderGame(ctx, game, cam, hover);
    syncHud();
    syncDash();
    if (game.message !== lastMsg) {
      lastMsg = game.message;
      syncMeta();
    }
  } catch (err) {
    // A single transient error must NOT kill the loop — that used to freeze the
    // game (rig/trucks stop) until a manual refresh. Log it and keep animating.
    console.error("[frame]", err);
  }
  rafId = requestAnimationFrame(frame);
}

// Watchdog: if the loop ever stops ticking (a wedged frame, a throttled tab
// that never resumed), restart it — no manual refresh needed. A live loop
// refreshes lastFrameAt every frame, so this only fires on a real stall.
window.setInterval(() => {
  if (document.hidden) return; // RAF is legitimately paused when backgrounded
  const now = performance.now();
  if (now - lastFrameAt > 3000) {
    console.warn("[watchdog] frame loop stalled — restarting");
    cancelAnimationFrame(rafId); // kill any zombie so we keep a single chain
    last = now;
    lastFrameAt = now;
    rafId = requestAnimationFrame(frame);
  }
}, 2000);

const restored = loadGame();
refreshProfileUI();
syncAll();
setActiveTool(game.tool); // reflect any tool restored from the save on the Dock + tab
if (restored) {
  flash(`Profile "${profiles.active}" restored. Autosaves as you play.`);
} else {
  // First run on this profile — let the player choose their lease.
  showMapPicker((cfg) => {
    bootGame(false, cfg);
    saveGame();
    flash(`${cfg.mapName} lease. Road pad→battery→refinery, then drill.`);
  });
}
rafId = requestAnimationFrame(frame);

// Persist periodically and on tab hide / reload so progress survives refreshes.
window.setInterval(saveGame, 4000);
window.addEventListener("pagehide", saveGame);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveGame();
});
