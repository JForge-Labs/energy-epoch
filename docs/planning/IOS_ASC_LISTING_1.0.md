# App Store Connect — Version 1.0 listing draft

Use this to fill **Prepare for Submission** before a binary exists.

**Screenshots (no Mac):**

```bash
npm run store:seed          # mid-game lease fixture
npm run dev                 # other terminal
npm run store:shots -- --headless
# optional polish: npm run store:shots -- --interactive
```

Outputs: `store-assets/ios/screenshots/iphone-6.7/` and `iphone-6.5/` (landscape).  
`?store=1` matches native shell — no gate/account. Mac/Xcode remains deferred until archive time.

---

## Fixed / paste-ready fields

| Field | Value |
|--------|--------|
| **Version** | `1.0` |
| **Copyright** | `2026 John Fodchuk` *(or your legal name / company)* |
| **Support URL** | `https://playenergyepoch.com` |
| **Marketing URL** | `https://playenergyepoch.com` |
| **Privacy Policy URL** (App Information, not only version) | `https://playenergyepoch.com/privacy` |
| **Category** | Games → **Simulation** (secondary: Strategy if allowed) |
| **Price** | Free |
| **Sign-in required** | **No** (uncheck / off) |
| **App Review contact** | Your real name, phone, email |
| **Routing App Coverage** | Leave empty |
| **IAP / Game Center** | None for 1.0 |
| **Release** | Prefer **Manually release** until you’ve smoke-tested the live listing |

### App Review Notes (paste)

```text
Energy Epoch is a single-player oil & energy operations simulation.

• No account or sign-in is required to play.
• All core gameplay runs on-device (offline-capable once installed).
• Optional web account / cloud save features (if present in a build) are not required for review — reviewers can play immediately after launch.

Suggested first-minute path:
1. Dismiss any intro tips.
2. Use Explore on open ground to survey a 3×3.
3. Drill a Good/Sweet tile; build road pad → battery → refinery if needed.
4. Watch trucks/pipes move crude to treating and clean oil to sales.

Contact: landman@playenergyepoch.com
```

---

## Promotional Text (max 170 characters)

**Primary (169 chars):**

```text
Strike oil. Lay pipe. Run the battery. Pay the facility. A real-time energy ops sim — wildcat risk, logistics pressure, markets, and reputation.
```

**Shorter alt (118):**

```text
Real-time oil & energy ops: drill wildcats, treat crude, lay pipe, and stay green on a $5M facility.
```

---

## Description (max 4000 characters)

**Primary draft:**

```text
Energy Epoch is a real-time oil and energy operations sim. You’re financed on a multi-million-dollar facility — drill wells, treat crude, move product, and try to operate in the green while interest, reputation, weather, and markets push back.

STRIKE AND SCALE
• Explore the lease with 3×3 surveys to reveal Sweet, Good, Fair, Lean, or Barren rock.
• Drill wildcats or derisked targets. Manage decline, choke wells, and grow the field.
• Upgrade rigs to reach tougher zones.

LOGISTICS ARE THE GAME
• Build roads (cardinal connections) for trucks.
• Run tank batteries: crude storage, treating throughput, and clean oil inventory.
• Haul to the refinery or lay oil pipe for hands-free sales — watch capacity and bottlenecks.
• Handle associated gas: incinerators, gas plants, and flares that hit reputation if ignored.

RUN THE BUSINESS
• Facility debt and optional Hard mode interest.
• Reputation, fines, and shut-in risk if you let ops fall apart.
• Weather that slows hauls and drilling.
• Difficulty modes and map presets for longer campaigns.

PLAY YOUR WAY
• Free to start. Designed for touch, including Apple Pencil–friendly controls.
• Core progress can stay on-device. Optional cloud features on the web are not required for the mobile game loop.

Whether you’re a logistics puzzle fan or an energy-industry nerd, Energy Epoch is about building the whole operation — not just clicking a single well.

Questions or feedback: landman@playenergyepoch.com
Web: https://playenergyepoch.com
```

---

## Keywords (max 100 characters, comma-separated, no spaces after commas preferred)

Count carefully — Apple limit is **100 characters total** including commas.

**Primary (99 chars):**

```text
oil,energy,pipeline,drilling,logistics,strategy,simulation,factory,idle,tycoon,gas,refinery,wildcat
```

**Alt (focus strategy):**

```text
oil,drilling,pipeline,logistics,strategy,simulation,tycoon,energy,refinery,factory,sandbox,idle
```

---

## What’s what’s for screenshots (shot list)

Aim for **5–8 iPhone shots** (first 3 matter most for install sheet). Prefer **landscape** if the UI is map-first; ASC accepts landscape sizes for 6.5".

| # | Shot name | What to show |
|---|-----------|----------------|
| 1 | **Hero field** | Full lease map, several wells, roads/pipes, battery + refinery visible, HUD readable |
| 2 | **Survey / drill** | Explore 3×3 with G/S pips; drill or rig on a Sweet/Good tile |
| 3 | **Logistics spine** | Trucks and/or live oil pipe battery → refinery; clean/crude meters |
| 4 | **Battery / treat** | Facility or SCADA-style readouts: crude storage, treat, clean, sales |
| 5 | **Bottleneck / ops** | Triage or capacity warning + player fixing roads/trucks (shows depth) |
| 6 | **Gas / flare** | Gas plant or incinerator / flare management |
| 7 | **Market / money** | Cash, debt, oil price, day — business pressure |
| 8 | **Mobile UI** | Command dock / tools without covering the whole map |

**Device sizes (upload what Media Manager accepts):**  
6.5" class: **1284 × 2778** (portrait) or **2778 × 1284** (landscape) — or listed 1242×2688 / 2688×1242 variants.

**No app previews required** for first submit (0 of 3 is fine).

---

## Screenshot browser-agent prompt (copy-paste)

```text
You are a browser QA / screenshot agent for the mobile game Energy Epoch.

GOAL
Capture App Store–ready screenshots of the LIVE game for iOS App Store Connect version 1.0.

URL
Primary: https://app.playenergyepoch.com/
Fallback: https://playenergyepoch.com/ then open Play / app link if needed.
If localhost is required: http://localhost:5173/

VIEWPORT / DEVICE EMULATION
1. Use Chrome (or Chromium) device emulation.
2. Prefer iPhone 14 Pro Max / iPhone 15 Plus class:
   - CSS viewport ~430×932, device scale factor 3
   - OR set outer size so exported PNGs match one of:
     1284×2778 (portrait) OR 2778×1284 (landscape)
3. Energy Epoch is a MAP game. Prefer LANDSCAPE screenshots if the UI is usable that way (rotate device emulation). If the game forces portrait, capture portrait at 1284×2778.
4. Hide browser chrome; full-page game canvas only. No DevTools overlay in the frame.
5. Wait for the map/WebGL to fully load (no blank/black canvas). Wait 2–3s after load.

PREP / SESSION
1. Hard refresh once (cache bypass).
2. Dismiss tutorials/modals that block the map if they obscure gameplay — but one shot MAY show a clean HUD.
3. If a “new lease / reset” is needed for a pretty field: Reset lease only if saves are disposable; prefer an existing mid-game lease with roads, wells, battery, refinery.
4. Do NOT use real personal accounts in screenshots if login UI appears — play logged out.
5. Avoid accidental email/profile UI in frames.

CAPTURE SET (save PNGs with these exact filenames)
01-hero-field.png — Wide map view: multiple wells, roads and/or pipes, battery + refinery, readable top HUD (cash/day).
02-survey-drill.png — Explore/survey showing grade pips (Sweet/Good preferred); rig or drill action visible.
03-logistics.png — Trucks moving and/or oil pipe highlighted battery→refinery; inventory/process readable.
04-battery-treat.png — Focus battery area or facility panel: crude/clean/treat/sales sense of ops.
05-bottleneck.png — Triage/warning or full tanks with player tools visible (shows systems depth).
06-gas-flare.png — Gas handling: plant, incinerator, or flare context.
07-money-market.png — Cash, debt/facility, oil price, day clearly visible.
08-mobile-ui.png — Toolbar/command dock usable without covering entire map.

For EACH shot:
- Pause game time if a pause control exists (for clean frames without chaos).
- Pan/zoom so the subject is centered and uncluttered.
- Ensure text is legible (not microscopic).
- Export PNG only; no JPEG compression artifacts.
- If exact App Store pixel size isn’t possible from the tool, capture the highest resolution possible and note the actual dimensions so a human can letterbox/crop in Media Manager.

QUALITY BAR
- No blank WebGL, no half-loaded fonts, no overlapping broken panels.
- No desktop browser bookmarks bar.
- Prefer dark industrial look already in the game (don’t restyle).

DELIVERABLE
1. Folder of PNGs named as above.
2. A short manifest.md listing: filename, orientation, pixel size, what the shot shows, any issues.
3. If a shot is impossible (feature missing), skip and explain — do not fake UI.

START
Open the game URL, wait for load, then capture 01 through 08 in order.
```

---

## iPad slot (optional for 1.0)

If you enabled iPad: same narrative shots, sizes per Media Manager (e.g. 12.9" 2048×2732 or landscape).  
If iPhone-only for 1.0: skip iPad section or use “iPhone only” in device coverage if offered.

---

## Privacy nutrition labels (App Privacy)

**iOS binary (Capacitor offline):** treat as **Data Not Collected** for core play  
(saves stay on-device; no analytics SDK; no ads).

If you later enable magic-link / cloud saves **inside the App Store binary**, update labels:

| Data type | Linked to user? | Used for tracking? | Purpose |
|-----------|-----------------|--------------------|---------|
| Email Address | Yes | No | App Functionality (account) |
| User Content (save blobs) | Yes | No | App Functionality (backup) |
| Product Interaction (optional later) | No | No | Analytics only if you add it |

**v1 recommendation:** ship native path with **no cloud** (current `IS_NATIVE` behavior) →  
App Privacy: **Data Not Collected**.

---

## Age rating questionnaire (likely answers)

Industrial oil ops sim, no violence against people, no horror. Expect **4+** or **9+**.

| Topic | Suggested answer |
|-------|------------------|
| Cartoon or Fantasy Violence | None |
| Realistic Violence | None |
| Prolonged Graphic / Sadistic | None |
| Profanity or Crude Humor | None |
| Mature / Suggestive Themes | None |
| Horror / Fear Themes | None |
| Medical / Treatment Info | None |
| Alcohol, Tobacco, Drugs | None |
| Simulated Gambling | None |
| Sexual Content / Nudity | None |
| Unrestricted Web Access | No (embedded game, not a browser) |
| Gambling and Contests | No |
| Contests | No |

Complete the official questionnaire in ASC — answers above are guidance only.

---

## After screenshots land

1. Upload **6.7"** set first (`store-assets/ios/screenshots/iphone-6.7/*`).  
2. Upload **6.5"** or let Media Manager reuse sizes.  
3. Build still required before **Add for Review**.  
4. Keep **Sign-in required** off (native app has no account gate).
