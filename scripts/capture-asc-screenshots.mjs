/**
 * App Store Connect screenshot capture for Energy Epoch.
 *
 * Default: injects store-assets/ios/fixture-save.json (from `npm run store:seed`)
 * so each shot is a framed mid-game lease — not eight copies of a blank field.
 *
 * Usage:
 *   npm run store:seed
 *   npm run dev   # other terminal
 *   npm run store:shots -- --headless
 *   npm run store:shots -- --interactive
 *
 * Requires: npx playwright install chromium
 */
import { createInterface } from "node:readline";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "store-assets", "ios", "screenshots");
const FIXTURE = join(ROOT, "store-assets", "ios", "fixture-save.json");
const SAVE_KEY = "energy-epoch-save:Main";
const PROFILES_KEY = "energy-epoch-profiles";

const SHOTS = [
  {
    file: "01-hero-field.png",
    title: "Hero field",
    hint: "Wide map: wells, roads/pipes, battery + refinery, readable HUD",
    frame: "hero",
  },
  {
    file: "02-survey-drill.png",
    title: "Survey / drill",
    hint: "Explore 3×3 with G/S pips; rig or drill on Sweet/Good",
    frame: "wells",
  },
  {
    file: "03-logistics.png",
    title: "Logistics",
    hint: "Trucks and/or oil pipe battery → refinery",
    frame: "spine",
  },
  {
    file: "04-battery-treat.png",
    title: "Battery / treat",
    hint: "Battery area or Process panel (crude/treat/clean/sales)",
    frame: "battery",
    expandDash: true,
  },
  {
    file: "05-bottleneck.png",
    title: "Bottleneck",
    hint: "Triage warning or full tanks + tools visible",
    frame: "battery",
    expandTriage: true,
  },
  {
    file: "06-gas-flare.png",
    title: "Gas / flare",
    hint: "Gas plant, incinerator, or flare context",
    frame: "gas",
  },
  {
    file: "07-money-market.png",
    title: "Money / market",
    hint: "Cash, debt/facility, oil price, day clearly visible",
    frame: "hero",
    expandMetrics: true,
  },
  {
    file: "08-mobile-ui.png",
    title: "Mobile UI",
    hint: "Command dock usable without covering the whole map",
    frame: "hero",
    zoom: 1.0,
  },
];

/** CSS viewport + deviceScaleFactor → physical ASC pixels */
const SIZES = {
  "6.7": {
    folder: "iphone-6.7",
    portrait: { width: 430, height: 932, scale: 3, label: "1290×2796" },
    landscape: { width: 932, height: 430, scale: 3, label: "2796×1290" },
  },
  "6.5": {
    folder: "iphone-6.5",
    portrait: { width: 428, height: 926, scale: 3, label: "1284×2778" },
    landscape: { width: 926, height: 428, scale: 3, label: "2778×1284" },
  },
  "12.9": {
    folder: "ipad-12.9",
    portrait: { width: 1024, height: 1366, scale: 2, label: "2048×2732" },
    landscape: { width: 1366, height: 1024, scale: 2, label: "2732×2048" },
  },
};

function parseArgs(argv) {
  const args = {
    url: "http://localhost:5173/?store=1",
    interactive: false,
    sizes: ["6.7", "6.5"],
    orientation: "landscape",
    headed: true,
    waitMs: 2500,
    fixture: true,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--interactive") args.interactive = true;
    else if (a === "--headless") args.headed = false;
    else if (a === "--portrait") args.orientation = "portrait";
    else if (a === "--landscape") args.orientation = "landscape";
    else if (a === "--url") args.url = argv[++i];
    else if (a === "--wait") args.waitMs = Number(argv[++i]) || args.waitMs;
    else if (a === "--sizes") args.sizes = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--no-fixture") args.fixture = false;
    else if (a === "--help" || a === "-h") args.help = true;
  }
  return args;
}

function prompt(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function originFromUrl(url) {
  const u = new URL(url);
  return u.origin;
}

/** Camera targets derived from fixture lease layout. */
function camForFrame(fixture, frame, zoomOverride) {
  const b = fixture.game.buildings;
  const battery = b.find((x) => x.kind === "battery") || { x: 12, y: 14 };
  const refinery = b.find((x) => x.kind === "refinery") || { x: 40, y: 30 };
  const plant = b.find((x) => x.kind === "gas_plant");
  const wells = fixture.game.wells || [];
  const well = wells[0] || { x: battery.x - 2, y: battery.y + 2 };
  const pad = (() => {
    for (let y = 0; y < fixture.game.tiles.length; y++) {
      for (let x = 0; x < fixture.game.tiles[y].length; x++) {
        if (fixture.game.tiles[y][x].isPad) return { x, y };
      }
    }
    return { x: battery.x - 4, y: battery.y - 4 };
  })();

  const frames = {
    hero: {
      x: (pad.x + battery.x + refinery.x) / 3,
      y: (pad.y + battery.y + refinery.y) / 3,
      zoom: 0.9,
    },
    wells: { x: well.x + 1, y: well.y + 0.5, zoom: 1.45 },
    spine: {
      x: (battery.x + refinery.x) / 2,
      y: (battery.y + refinery.y) / 2,
      zoom: 1.05,
    },
    battery: { x: battery.x + 1, y: battery.y + 1, zoom: 1.55 },
    gas: plant
      ? { x: plant.x + 1, y: plant.y + 1, zoom: 1.5 }
      : { x: well.x, y: well.y, zoom: 1.4 },
  };
  const cam = { ...(frames[frame] || frames.hero) };
  if (typeof zoomOverride === "number") cam.zoom = zoomOverride;
  return cam;
}

function fixturePayload(fixture, cam) {
  const { _meta, ...rest } = fixture;
  return {
    ...rest,
    cam,
    spd: 0.5,
    updatedAt: Date.now(),
  };
}

function buildStorageState(origin, fixture, cam) {
  const save = JSON.stringify(fixturePayload(fixture, cam));
  const profiles = JSON.stringify({ active: "Main", names: ["Main"] });
  return {
    cookies: [],
    origins: [
      {
        origin,
        localStorage: [
          { name: PROFILES_KEY, value: profiles },
          { name: SAVE_KEY, value: save },
        ],
      },
    ],
  };
}

async function openSized(browser, url, vp, storageState) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.scale,
    storageState: storageState || undefined,
  });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector("#game-canvas", { timeout: 30_000 }).catch(() => {});
  // Wait for Pixi or canvas path to paint
  await page.waitForTimeout(1500);
  return { ctx, page };
}

async function prepUi(page, shot) {
  // Expand metrics (debt / oil price) when needed
  if (shot.expandMetrics) {
    const more = page.locator("#metrics-more");
    const open = await more.getAttribute("data-open").catch(() => null);
    if (open !== "true") {
      await page.locator("#metrics-toggle").click().catch(() => {});
      await page.waitForTimeout(200);
    }
  }
  // Ensure process / triage panels visible (defaults usually open)
  if (shot.expandDash) {
    await page.locator("#dash-panel").evaluate((el) => {
      el.hidden = false;
      el.style.opacity = "1";
    }).catch(() => {});
  }
  if (shot.expandTriage) {
    await page.locator("#triage-panel").evaluate((el) => {
      el.hidden = false;
      el.style.opacity = "1";
    }).catch(() => {});
  }
  // Dismiss map picker / gameover if they stole focus
  await page.locator("#map-picker").evaluate((el) => {
    el.hidden = true;
  }).catch(() => {});
  await page.locator("#gameover").evaluate((el) => {
    el.hidden = true;
  }).catch(() => {});
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: node scripts/capture-asc-screenshots.mjs [options]

Options:
  --url URL                 Game URL (default http://localhost:5173/?store=1)
  --interactive             Pause before each shot; frame scene in the browser
  --sizes 6.7,6.5,12.9      Size classes to write
  --portrait | --landscape  Default: landscape
  --headless                No visible browser
  --no-fixture              Do not inject fixture-save.json
  --wait MS                 Extra settle after load (default 2500)
`);
    process.exit(0);
  }

  const sizeKeys = args.sizes.filter((k) => SIZES[k]);
  if (!sizeKeys.length) {
    console.error("No valid --sizes. Use: 6.7, 6.5, 12.9");
    process.exit(1);
  }

  let fixture = null;
  if (args.fixture && existsSync(FIXTURE)) {
    fixture = JSON.parse(await readFile(FIXTURE, "utf8"));
    console.log(
      `Fixture: ${FIXTURE} (wells=${fixture._meta?.wells ?? "?"} buildings=${fixture._meta?.buildings ?? "?"})`,
    );
  } else if (args.fixture) {
    console.warn(`No fixture at ${FIXTURE} — run: npm run store:seed`);
    console.warn("Falling back to whatever save is in the browser (may be empty).");
  }

  for (const k of sizeKeys) {
    await mkdir(join(OUT, SIZES[k].folder), { recursive: true });
  }

  const browser = await chromium.launch({ headless: !args.headed });
  const records = [];
  const rl = args.interactive
    ? createInterface({ input: process.stdin, output: process.stdout })
    : null;
  const origin = originFromUrl(args.url);
  const primary = SIZES[sizeKeys[0]];
  const vp0 = primary[args.orientation];

  console.log(`Opening ${args.url}`);
  console.log(`Orientation: ${args.orientation} · Sizes: ${sizeKeys.join(", ")}`);

  // Warm check that the server is up
  try {
    const warmState = fixture
      ? buildStorageState(origin, fixture, camForFrame(fixture, "hero"))
      : undefined;
    const warm = await openSized(browser, args.url, vp0, warmState);
    await warm.page.waitForTimeout(args.waitMs);
    if (rl) {
      console.log("\nGame loaded. Adjust the lease if you want, then press Enter for the 8-shot loop.\n");
      await prompt(rl, "Ready? ");
    }
    await warm.ctx.close();
  } catch (e) {
    console.error(`\nFailed to open ${args.url}`);
    console.error("Start the dev server first:  npm run dev");
    console.error(String(e.message || e));
    await browser.close();
    process.exit(1);
  }

  for (const shot of SHOTS) {
    console.log(`\n── ${shot.file} — ${shot.title}`);
    const cam = fixture
      ? camForFrame(fixture, shot.frame, shot.zoom)
      : { x: 20, y: 16, zoom: 1.1 };
    const storageState = fixture ? buildStorageState(origin, fixture, cam) : undefined;

    if (rl) {
      console.log(`   ${shot.hint}`);
      const { ctx, page } = await openSized(browser, args.url, vp0, storageState);
      await prepUi(page, shot);
      await prompt(rl, "   Frame if needed, then Enter to capture all sizes… ");
      for (const key of sizeKeys) {
        const size = SIZES[key];
        const vp = size[args.orientation];
        if (key === sizeKeys[0]) {
          const dest = join(OUT, size.folder, shot.file);
          await page.screenshot({ path: dest, type: "png" });
          console.log(`   wrote ${size.folder}/${shot.file} (${vp.label})`);
          records.push({
            file: shot.file,
            folder: size.folder,
            label: vp.label,
            title: shot.title,
            note: `interactive · ${shot.frame}`,
          });
        } else {
          const otherState = fixture ? buildStorageState(origin, fixture, cam) : undefined;
          const other = await openSized(browser, args.url, vp, otherState);
          await prepUi(other.page, shot);
          const dest = join(OUT, size.folder, shot.file);
          await other.page.screenshot({ path: dest, type: "png" });
          console.log(`   wrote ${size.folder}/${shot.file} (${vp.label})`);
          records.push({
            file: shot.file,
            folder: size.folder,
            label: vp.label,
            title: shot.title,
            note: `interactive · ${shot.frame}`,
          });
          await other.ctx.close();
        }
      }
      await ctx.close();
    } else {
      for (const key of sizeKeys) {
        const size = SIZES[key];
        const vp = size[args.orientation];
        const state = fixture ? buildStorageState(origin, fixture, cam) : undefined;
        const { ctx, page } = await openSized(browser, args.url, vp, state);
        await prepUi(page, shot);
        await page.waitForTimeout(400);
        const dest = join(OUT, size.folder, shot.file);
        await page.screenshot({ path: dest, type: "png" });
        console.log(`wrote ${size.folder}/${shot.file} (${vp.label})`);
        records.push({
          file: shot.file,
          folder: size.folder,
          label: vp.label,
          title: shot.title,
          note: fixture ? `fixture · ${shot.frame}` : "no fixture",
        });
        await ctx.close();
      }
    }
  }

  if (rl) rl.close();
  await browser.close();

  const mode = args.interactive ? "interactive" : fixture ? "fixture" : "live";
  const manifest = [
    "# Screenshot capture manifest",
    "",
    `- URL: \`${args.url}\``,
    `- Orientation: ${args.orientation}`,
    `- Mode: ${mode}`,
    `- Fixture: ${fixture ? "yes" : "no"}`,
    `- Captured: ${new Date().toISOString()}`,
    "",
    "| File | Size class | Physical | Notes |",
    "|------|------------|----------|-------|",
    ...records.map(
      (r) => `| ${r.file} | ${r.folder} | ${r.label} | ${r.note || r.title} |`,
    ),
    "",
  ];

  await writeFile(join(OUT, "manifest.md"), manifest.join("\n"));
  console.log(`\nDone → store-assets/ios/screenshots/`);
  console.log(`Manifest → store-assets/ios/screenshots/manifest.md`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
