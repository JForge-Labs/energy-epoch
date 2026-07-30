# Milestones checklist

Update status when something ships. Use: `todo` | `doing` | `done` | `blocked` | `n/a`

## Path W — product (Claude / gameplay)

| ID | Milestone | Status | Notes |
|----|-----------|--------|-------|
| G1 | Core loop playable (road → drill → haul → sell → debt/rep) | doing | Active build |
| G2 | Terrain / pipes / logistics levers stable | doing | Level-up pass in progress |
| G3 | Persistence reliable (save/load, reset) | doing | localStorage |
| G4 | Mobile touch UX acceptable (no desktop-only critical path) | todo | Coordinate with playtest |
| G5 | Pixi path decision (scaffold vs default renderer) | doing | `graphics/pixi-atlas-v1` @ 0429029 pushed: Pixi default + layers + atlas stub; soak + real atlas + terrain batch next |
| G6 | Balance pass for “first 15 min” new player | todo | After loop solid |

## Path W — ship (planning / when user prioritizes)

| ID | Milestone | Status | Notes |
|----|-----------|--------|-------|
| S1 | `npm test` + `npm run build` clean on mainline | done | Local gate green 2026-07-24 |
| S2 | Reliable static deploy + correct `base` `/` | done | Cloudflare Worker: https://playenergyepoch.com |
| S2b | Auto-deploy tracks active branch | done | CF/GitHub Actions (not Railway) |
| S3 | Phone playtest on deployed URL | done | playenergyepoch.com |
| S4 | PWA install + offline session | todo | Nice-to-have; not required for Store |
| S5 | Save export/import JSON | done | Export/Import buttons in HUD (v4 save JSON) |
| S6 | Capacitor Android APK | todo | After or parallel with iOS |
| S7 | iOS App Store (Capacitor) | doing | See IOS_APP_STORE.md; $99/yr approved |
| S7a | Apple Developer enroll + Mac/Xcode | todo | Human — ASC app record + Mac archive |
| S7b | Capacitor iOS scaffold | done | `ios/`, bundle `com.playenergyepoch.app`, iPhone landscape-only 1.0 |
| S7c | TestFlight internal | todo | Needs Mac session (IOS_MAC_SESSION.md) |
| S7d | App Store submission | todo | Copy + shots ready; binary needs Mac + ASC app record |
| S8 | Custom domain | done | playenergyepoch.com on Cloudflare |
| S9 | Privacy policy URL live | done | https://playenergyepoch.com/privacy |
| S10 | ASC listing copy draft | done | `docs/planning/IOS_ASC_LISTING_1.0.md` + age/privacy nutrition |
| S11 | ASC screenshots (Windows) | done | Fixture mid-game: 8× 6.7" + 8× 6.5" landscape; `npm run store:shots:ci` |
| S12 | ASC human portal setup | todo | `docs/planning/IOS_ASC_HUMAN.md` — Bundle ID + New App + upload media |

## Path U — only after trigger

| ID | Milestone | Status | Notes |
|----|-----------|--------|-------|
| U0 | User declares Path U trigger | todo | See PATH_U_ROADMAP |
| U1 | Fresh Unity 6.5 2D repo | todo | Not platformer template |
| U2 | Economy + systems vertical slice in C# | todo | |
| U3 | Android APK | todo | |
| U4 | TestFlight | todo | |

## Decision log (append-only)

| Date | Decision |
|------|----------|
| 2026-07-23 | Path W active; Path U roadmapped only |
| 2026-07-23 | No dual engine; no backend for v1 |
| 2026-07-23 | Unity 6.5 install for future option; modules Android+iOS+IDE |
| 2026-07-23 | Planning pack added under `docs/planning/` for Claude handoff |
| 2026-07-24 | Railway deploy live: project `steadfast-determination` / service `energy-epoch` |
| 2026-07-24 | Railway source branch → `cleanup/qa-fixes` (was `main`; Claude patches weren't auto-landing) |
| 2026-07-24 | Smoke test fixed for Hard-mode interest default off; prod redeployed (`index-HSmv40DC.js`) |
| 2026-07-24 | Graphics scaffold: branch `graphics/pixi-atlas-v1` pushed (Pixi default, atlas stub); Railway still on `cleanup/qa-fixes` |
| 2026-07-24 | Cloudflare Worker primary host: playenergyepoch.com |
| 2026-07-24 | Railway project `steadfast-determination` decommissioned; removed railway.toml + serve; docs point at Cloudflare |
| 2026-07-25 | iOS App Store planning active: Capacitor path, Apple $99/yr approved; see IOS_APP_STORE.md |
| 2026-07-26 | Capacitor iOS scaffold in repo; native offline (no gate); privacy live |
| 2026-07-26 | Store 1.0: iPhone-only + landscape; export/import JSON; ASC listing draft + smoke screenshots |
| 2026-07-26 | Fixture-based ASC screenshots (6.7 + 6.5); human ASC checklist; age rating + privacy labels draft |
| 2026-07-29 | PR #2 merged to main: iOS packaging, HUD polish, brand icons + landing; Cloudflare deploy workflow fixed (Node 22 + Wrangler 4) |
| 2026-07-29 | Canonical iOS ship = local Mac Archive only; Xcode Cloud not configured (emails may be half-setup — disable workflow) |
| 2026-07-29 | Deploy workflow documented in PATH_W_DEPLOY.md; Mac path + Xcode Cloud notes in IOS_MAC_SESSION.md |
| 2026-07-30 | Deploy hard lessons expanded (shell cache, auth handoff, Xcode Cloud spam); admin stats = accounts vs link funnel; D1 ground truth 1 account / 27 link requests |
