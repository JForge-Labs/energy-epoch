# Energy Epoch — iOS App Store plan

**Status:** Active planning (2026-07-25)  
**Decision:** Stay **Path W** — package the existing Vite + Pixi web game with **Capacitor → Xcode → TestFlight → App Store**.  
**Not doing for v1 Store:** Unity rewrite (Path U), game servers, required online multiplayer.

User commitment: **Apple Developer Program ~$99/yr** — approved.

---

## 1. Why Capacitor (not Unity, not pure PWA)

| Approach | Fit for Energy Epoch |
|----------|----------------------|
| **Capacitor (recommended)** | Same `dist/` as Cloudflare; local WebView; offline-capable; one codebase |
| Safari “Add to Home Screen” only | Free, but **not** App Store discovery; storage eviction; limited IAP |
| Unity rewrite | Highest native polish ceiling; multi-week port; **not** needed for first Store ship |

**Ship model:** free App Store app (or free + later tip/IAP). Compute stays on device. Cloudflare remains the **web** host; the iOS app embeds built assets (or loads local copy after install).

---

## 2. Prerequisites (buy / own / set up)

| Item | Who | Notes |
|------|-----|--------|
| **Apple Developer Program** | You | https://developer.apple.com/programs/ — enroll as Individual or Org |
| **Mac + Xcode** (current) | You | Required to archive, sign, upload. Cloud Mac is Plan B if no hardware |
| **Physical iPhone** | You | TestFlight and device debugging |
| **Bundle ID** | Decide once | e.g. `com.jfodchuk.energyepoch` or `com.playenergyepoch.app` |
| **App name / subtitle** | Marketing | “Energy Epoch” — check App Store name conflicts |
| **Privacy policy URL** | Required for Store | Static page on **playenergyepoch.com** (no accounts = simple) |
| **Support URL** | Required | Same site or mailto: |

**Windows note:** Capacitor project can be **scaffolded on Windows**; **iOS build/sign/upload only on Mac**.

---

## 3. Architecture for Store v1

```
npm run build → dist/
       │
       ├─► Cloudflare Worker (web)     playenergyepoch.com
       │
       └─► Capacitor copy → ios/
              Xcode archive → TestFlight → App Store
              WKWebView loads local dist/ (offline after install)
```

| Concern | Store v1 approach |
|---------|-------------------|
| Updates | Ship new app version via App Store (or optional soft-update later) |
| Saves | `localStorage` / Capacitor Preferences; **export/import JSON before launch** |
| Network | Optional (analytics, auth later). Default: **works offline** |
| IAP / ads | **None** at first free launch |
| Game Center | Optional later — not required |

---

## 4. Phased plan (order of work)

### Phase 0 — Pre-flight (this week, parallel to polish)

| # | Task | Owner |
|---|------|--------|
| 0.1 | Enroll Apple Developer; wait for activation (can take hours–days) | You |
| 0.2 | Confirm Mac + Xcode install (or book cloud Mac) | You |
| 0.3 | Freeze **bundle ID** + display name | You + Grok |
| 0.4 | Store readiness checklist on **product** (below) | Claude + you |
| 0.5 | Privacy policy page live on playenergyepoch.com | **done** (2026-07-25) |

**Product readiness gates (block TestFlight until mostly true):**

- [ ] Core loop stable on iPhone Safari / Capacitor preview  
- [ ] No critical treat/haul freezes; pipe + battery model understood  
- [ ] Touch targets / safe-area / Pencil hover tip OK  
- [x] Save/load reliable; **export/import** exists (HUD Export/Import JSON)  
- [x] Reset lease / new game clear  
- [x] Orientation: **landscape** locked for iPhone 1.0  

- [ ] Performance: 30+ fps mid-iPhone at default zoom  

### Phase 1 — Capacitor scaffold (engineering) — **mostly done in repo**

| # | Task | Status |
|---|------|--------|
| 1.1 | Capacitor core/cli/ios deps | done |
| 1.2 | `capacitor.config.ts` — `com.playenergyepoch.app`, `webDir: dist` | done |
| 1.3 | `ios/` project + sync scripts | done |
| 1.4 | Scripts: `cap:sync`, `cap:open:ios`, `cap:copy` | done |
| 1.5 | iOS 15+, **iPhone-only**, **landscape-only**, status bar dark | done (2026-07-26) |
| 1.6 | Splash + 1024 AppIcon in asset catalog | done (placeholder art OK for TF) |
| 1.7 | `scrollEnabled: false` + native offline shell (`IS_NATIVE`) | done |

**Do not commit secrets.** Signing identities stay in Xcode / CI secrets.

### Phase 2 — Store compliance & content — **drafts ready (upload is human)**

| # | Task | Status |
|---|------|--------|
| 2.1 | Privacy nutrition labels | draft in IOS_ASC_LISTING_1.0.md (**Data Not Collected** for native 1.0) |
| 2.2 | Privacy policy HTML | **done** — live at /privacy |
| 2.3 | Age rating questionnaire | draft answers in listing doc |
| 2.4 | Screenshots 6.7" + 6.5" landscape | **done** — fixture set in `store-assets/ios/screenshots/` |
| 2.5 | App preview video | skip for 1.0 |
| 2.6 | Description, keywords, subtitle, category | draft in IOS_ASC_LISTING_1.0.md |
| 2.7 | Support + marketing URLs | playenergyepoch.com |

### Phase 3 — Signing & TestFlight

| # | Task |
|---|------|
| 3.1 | App Store Connect: create app record + bundle ID |
| 3.2 | Xcode: Team, automatic signing, Archive |
| 3.3 | Upload build → processing → TestFlight internal |
| 3.4 | Device smoke: cold start, full lease loop, background/resume, low memory |
| 3.5 | External TestFlight (optional beta) |

### Phase 4 — App Review submission

| # | Task |
|---|------|
| 4.1 | Submit for Review with notes: “Offline single-player sim; no login required” |
| 4.2 | Demo account: N/A if no auth; if magic-link auth is on, provide test path |
| 4.3 | Respond to rejection quickly (common: missing privacy text, crash on launch, incomplete metadata) |

### Phase 5 — Post-launch

| # | Task |
|---|------|
| 5.1 | Versioning: web can ship daily; iOS cadence weekly/biweekly |
| 5.2 | Optional: Play Store via same Capacitor Android project |
| 5.3 | Optional later: IAP tip jar, Game Center, push (usually skip) |

---

## 5. Cost summary

| Item | Cost |
|------|------|
| Apple Developer | **~$99/year** (you are paying) |
| Mac / Xcode | Own hardware or cloud Mac rental |
| Cloudflare web host | $0 at this scale |
| Game servers | **$0** |
| Google Play (optional later) | ~$25 one-time |

---

## 6. Risks specific to this game

| Risk | Mitigation |
|------|------------|
| WKWebView performance (Pixi) | Test mid-iPhone; reduce min zoom entity work; already chunked terrain |
| `localStorage` wipe on update | Export/import; Preferences plugin as backup store |
| App Review “web wrapper” scrutiny | Offline assets, native splash/icons, real gameplay, privacy page |
| Auth / magic-link mid-flight | If web auth exists, iOS must not brick offline play; document dual mode |
| Landscape map vs portrait UI | Pick one primary orientation for Store screenshots |
| Dual web + store version drift | Same git tag builds both; checklist before each iOS cut |

---

## 7. What polish should finish *before* Capacitor week

Prioritize (gameplay agents):

1. Treat / logistics / battery model stability on phone  
2. Mobile layout (dock, toolbar, safe areas) — in progress  
3. Save export/import  
4. New-player first 10 minutes (explore → drill → roads → sales)  
5. No showstopper WebGL blank screens on older iPhones  

Defer if needed: final HQ atlas art, PWA (nice but not required for Store), Android.

---

## 8. Agent lanes for iOS work

| Lane | Owner |
|------|--------|
| Product polish, UX, balance | Claude (gameplay branch) |
| Capacitor scaffold, icons pipeline, privacy page | Grok or Claude when you greenlight **iOS engineering** |
| Apple account, Xcode signing, ASC submission | **You** (human-in-loop) |
| Store copy / screenshots | You + Grok (assets) |

**Do not** start Capacitor mid-polish feature freeze without a short branch cut (e.g. `ship/ios-capacitor-v1`).

---

## 9. No Mac — what you do on Windows vs cloud Mac

### You can do **now** (Windows + browser)

1. Finish **Apple Developer Program** enrollment (payment, agreements).  
2. **App Store Connect** → create app shell (name, bundle ID, SKU).  
3. Register **Bundle ID** in Certificates, Identifiers & Profiles.  
4. Privacy policy page on **playenergyepoch.com**.  
5. Draft listing copy; collect screenshot frames later from device/simulator.  
6. Capacitor project can be **scaffolded on Windows** (`cap add ios` generates `ios/` folder).  

### You **cannot** do on Windows alone

- Open Xcode, set signing team, **Archive**, upload to App Store Connect.  
- Run iOS Simulator.  

### Recommended Mac path without owning hardware

| Option | Best for | Rough cost |
|--------|----------|------------|
| **MacinCloud / MacStadium / similar** | Hourly/monthly remote Mac + Xcode | ~$20–50/mo or hourly |
| **GitHub Actions `macos-latest`** | CI build + upload with certs in secrets | Minutes billed |
| **Codemagic / similar** | Mobile CI specialized for Flutter/Capacitor | Free tier limited |
| **Borrow a friend Mac** | One-time Archive + upload | $0 |

**Practical first ship:** enroll + ASC app record on Windows → we scaffold Capacitor on this PC → rent Mac for **1–2 sessions** to sign/upload TestFlight → iterate.

### Portal walkthrough (you are here)

#### A. Developer account active?

1. https://developer.apple.com/account  
2. Membership should say **Active** (not Pending).  
3. Accept any **Paid Applications** / updated agreements under **Agreements, Tax, and Banking** (App Store Connect).  

If still **Pending**, wait for email; banking/tax can block submission later even if portal opens.

#### B. App Store Connect access

1. https://appstoreconnect.apple.com  
2. Sign in with the **same** Apple ID as Developer.  
3. Complete **Agreements, Tax, and Banking** if prompted (even for a free app).  

#### C. Create Bundle ID (Identifiers)

1. Developer portal → **Certificates, Identifiers & Profiles** → **Identifiers** → **+**  
2. App IDs → App  
3. Description: `Energy Epoch`  
4. Bundle ID: **Explicit** — recommend `com.playenergyepoch.app`  
   (must match Capacitor `appId` later; cannot easily change after Store record exists)  
5. Capabilities: leave defaults for v1 (no Push, no IAP yet). Enable later if needed.  
6. Register.

#### D. Create the app record

1. App Store Connect → **My Apps** → **+** → **New App**  
2. Platforms: **iOS**  
3. Name: `Energy Epoch` (what users see; can be taken — try variants if needed)  
4. Primary language: English (U.S.)  
5. Bundle ID: select the one you just created  
6. SKU: internal only, e.g. `energy-epoch-ios-001`  
7. User Access: Full Access  

You now have an empty ASC app waiting for a **build** (that’s the Mac step).

#### E. Prepare content while polish continues

- Privacy policy URL (required): e.g. `https://playenergyepoch.com/privacy`  
- Support URL: same site or contact page  
- Category: Games → Simulation or Strategy  
- Price: Free  
- Age rating questionnaire (complete when submitting)  

#### F. First Mac session (when ready)

1. Rent/cloud Mac, install **Xcode** from App Store, sign in with Apple ID.  
2. Clone repo, `npm ci`, `npm run build`, `npx cap sync ios`, `npx cap open ios`.  
3. Xcode: select Team (your Developer team), automatic signing, target device/sim.  
4. **Product → Archive → Distribute App → App Store Connect**.  
5. Wait for processing → **TestFlight** → add yourself as internal tester → install on iPhone.  

---

## 10. Immediate next actions (human)

1. **Confirm membership Active** in developer.apple.com/account.  
2. Complete **ASC Agreements, Tax, Banking**.  
3. Create **Bundle ID** + **New App** (sections C–D above).  
4. Reply with: bundle ID chosen, free app OK?, iPhone only vs iPad too.  
5. When polish is TestFlight-ready: **“scaffold Capacitor iOS”** (Windows) then book a short cloud Mac for upload.

---

## 10. Success criteria

| Milestone | Done when |
|-----------|-----------|
| **M1** | Capacitor iOS project opens in Xcode; runs on simulator |
| **M2** | TestFlight internal install on your iPhone; full lease session offline |
| **M3** | App Store listing complete; build in review |
| **M4** | **Ready for Sale** — searchable as Energy Epoch |

---

## Bottom line

Paying the **$99/yr** is the right gate. **Capacitor + existing web game** is the fastest honest path to App Store without a Unity rewrite. Web stays on Cloudflare; iOS packages `dist/` locally. Next human steps: Developer enrollment + Mac; next engineering step: Capacitor scaffold when polish gates pass.
