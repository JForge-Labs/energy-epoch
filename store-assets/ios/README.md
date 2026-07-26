# Energy Epoch — iOS App Store screenshots

**No Mac required** for this step. Capture from the web build at App Store pixel sizes, then upload in App Store Connect Media Manager.

Mac / cloud-VM work (Xcode archive, TestFlight) stays deferred until you have time.

---

## What ASC needs (1.0)

**1.0 device family: iPhone only** (`TARGETED_DEVICE_FAMILY = 1`). Landscape-only.
Re-enable iPad later if you want tablet screenshots + family change in Xcode.

| Slot | Display class | Preferred PNG size | Min shots |
|------|---------------|--------------------|-----------|
| **Required** | iPhone 6.7" / 6.9" class | **2796 × 1290** landscape (primary) | 3–10 (use 5–8) |
| **Often also asked** | iPhone 6.5" | **2778 × 1284** landscape | same set or reuse |
| **iPad** | n/a for 1.0 | — | skip until family re-enabled |
| App Preview video | optional | skip for 1.0 | 0 |

**Tips**

- First **3** shots appear on the product page without scrolling — make those the hero map, survey/drill, and logistics.
- ASC Media Manager can often **scale / reuse** one iPhone size into others — upload the 6.7" set first, then check **View All Sizes**.
- Landscape is fine for a map game; pick **one** orientation and stick to it across the set (mixed is allowed but looks messy).
- **No sign-in UI** in frames (native path A has no account). Use `?store=1` on the web build.

---

## Shot list (filenames)

| # | File | Show |
|---|------|------|
| 1 | `01-hero-field.png` | Full lease: wells, roads/pipes, battery + refinery, readable HUD |
| 2 | `02-survey-drill.png` | Explore 3×3 with G/S pips; rig/drill on Sweet/Good |
| 3 | `03-logistics.png` | Trucks and/or oil pipe battery → refinery |
| 4 | `04-battery-treat.png` | Battery / Process panel: crude, treat, clean, sales |
| 5 | `05-bottleneck.png` | Triage warning or capacity pressure + tools |
| 6 | `06-gas-flare.png` | Gas plant / incinerator / flare context |
| 7 | `07-money-market.png` | Cash, debt/facility, oil price, day |
| 8 | `08-mobile-ui.png` | Command dock usable; map still visible |

Output folders (created by the capture script):

```text
store-assets/ios/screenshots/
  iphone-6.7/     # primary upload set
  iphone-6.5/     # optional second size
  ipad-12.9/      # required while iPad is targeted
  manifest.md     # auto-written sizes + notes
```

---

## Capture workflow (Windows, ~30–45 min once the lease looks good)

### 0. Build a photogenic mid-game lease

Play until you have roughly:

- 3+ wells, roads to a battery, path to refinery  
- At least one truck or oil pipe moving product  
- Gas handling if you can spare a minute  

Saves are local (`localStorage`). Prefer **localhost** so the sign-in gate never appears.

### 1. Start the game in store-shot mode

```bash
cd energy-epoch
npm run dev
# open: http://localhost:5173/?store=1
```

`?store=1` = native shell (no gate, no account button) — matches the App Store binary.

### 2. Capture (pick one)

**A. Fixture + Playwright (recommended)** — mid-game lease, exact ASC pixels:

```bash
# install browser once
npx playwright install chromium

npm run store:seed              # writes store-assets/ios/fixture-save.json
npm run dev                     # other terminal
npm run store:shots -- --headless
# or one-shot: npm run store:shots:ci   (still needs dev server on :5173)
```

Headed interactive polish (pause before each shot):

```bash
npm run store:shots -- --interactive
```

**B. Manual Chrome**

1. DevTools → device toolbar  
2. Dimensions: **430 × 932**, DPR **3** → ~1290×2796  
3. Fullscreen the game tab; hide DevTools dock if it steals pixels  
4. Capture with Win+Shift+S or a full-window tool; crop to exact size if needed  

### 3. Upload to App Store Connect

1. My Apps → Energy Epoch → version 1.0 → **Previews and Screenshots**  
2. Upload `iphone-6.7/*` into the **6.7" Display** slot  
3. Open Media Manager → enable reuse for other iPhone sizes if offered  
4. Upload `ipad-12.9/*` if iPad is still targeted  

---

## Defer / later

| Item | When |
|------|------|
| Mac / MacStadium / UTM VM + Xcode | When ready to archive |
| TestFlight device smoke | After first binary |
| App Preview video | Optional post-1.0 |

---

## Quality bar

- No blank/black WebGL canvas  
- No browser chrome, bookmarks, or DevTools in frame  
- No email / Sign-in / account UI  
- HUD text legible at phone size  
- Prefer **paused** sim (speed 0 if available) for clean truck positions  
