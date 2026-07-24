# Milestones checklist

Update status when something ships. Use: `todo` | `doing` | `done` | `blocked` | `n/a`

## Path W — product (Claude / gameplay)

| ID | Milestone | Status | Notes |
|----|-----------|--------|-------|
| G1 | Core loop playable (road → drill → haul → sell → debt/rep) | doing | Active build |
| G2 | Terrain / pipes / logistics levers stable | doing | Level-up pass in progress |
| G3 | Persistence reliable (save/load, reset) | doing | localStorage |
| G4 | Mobile touch UX acceptable (no desktop-only critical path) | todo | Coordinate with playtest |
| G5 | Pixi path decision (scaffold vs default renderer) | todo | `?pixi` today |
| G6 | Balance pass for “first 15 min” new player | todo | After loop solid |

## Path W — ship (planning / when user prioritizes)

| ID | Milestone | Status | Notes |
|----|-----------|--------|-------|
| S1 | `npm test` + `npm run build` clean on mainline | done | Local gate green 2026-07-24 |
| S2 | Reliable static deploy + correct `base` `/` | done | Railway: https://energy-epoch-production.up.railway.app |
| S2b | Auto-deploy tracks Claude branch | done | Source branch → `cleanup/qa-fixes` (was stuck on `main`) |
| S3 | Phone playtest on deployed URL | todo | User: open Railway URL on phone |
| S4 | PWA install + offline session | todo | |
| S5 | Save export/import JSON | todo | Before stores |
| S6 | Capacitor Android APK | todo | |
| S7 | iOS TestFlight | todo | Needs Apple + Mac |
| S8 | Optional custom domain | todo | CF Pages nice |

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
