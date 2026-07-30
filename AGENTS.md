# Energy Epoch — agent instructions

A **pure client-side** browser game (oil/energy ops sim): Vite + TypeScript + Pixi.js.  
No backend, database, or game servers. Runtime is the browser (or later a Capacitor shell).

## Engine decision (read this)

| | |
|--|--|
| **Active** | **Path W** — this web repo |
| **Future only** | **Path U** — Unity 6.5 rewrite *if* criteria met |
| **Detail** | **`docs/planning/`** — DECISION_LOCK, AGENT_LANES, deploy + Unity roadmap |

Do **not** start a Unity port, second engine, or multiplayer server unless the user explicitly asks.

## Commands

| Task | Command | Notes |
|------|---------|-------|
| Run | `npm run dev` | http://localhost:5173 — canvas default; `?pixi` for WebGL scaffold |
| Test | `npm test` | Headless smoke (`smoke.ts`) |
| Build | `npm run build` | `tsc` + Vite → `dist/` (typecheck gate) |
| Preview | `npm run preview` | Serves `dist/` |
| Deploy web | `npm run deploy` | `build` + Wrangler 4 → Cloudflare; or push **`main`** for Actions |

Repo root = package root (no nested `cd` into another app folder).

## Deploy (read before shipping web)

Canonical doc: **`docs/planning/PATH_W_DEPLOY.md`** (section *Deploy hard lessons*).

Non-negotiables:

1. CI Node **22** + Wrangler **4** (not 20 / Wrangler 3).  
2. `wrangler.toml`: `run_worker_first = true`.  
3. HTML shells via Worker with **`no-store`** (apex landing, app index, confirm, admin).  
4. After deploy: confirm live **`index-*.js` hash** matches this build (not CF HIT on old shell).  
5. Magic-link: absolute **app.** URL + **session form POST** handoff — never relative `/`.  
6. Xcode Cloud: **disable** if email spam on every push; iOS = local Mac Archive.

## Gotchas

- No env vars/secrets required for local game. Production uses CF secrets (`RESEND_API_KEY`, etc.).
- Simulation is renderer-agnostic: keep drawing out of `Game.ts`.
- Saves: localStorage offline; optional cloud on **app.** after magic-link.
- Admin: `admin.playenergyepoch.com` — **Accounts** = `users` rows, not raw email requests.
- **Collision avoidance:** if another agent is mid-build, don’t drive-by rewrite `Game.ts` / systems. See `docs/planning/AGENT_LANES.md`.

## Planning pack (Claude handoff)

Point agents at:

```text
docs/planning/
```

Especially:

1. `docs/planning/DECISION_LOCK.md`
2. `docs/planning/AGENT_LANES.md`
3. `DESIGN.md` (gameplay design)

Gameplay agents: implement features, keep tests green.  
Deploy/PWA/Capacitor: only when user prioritizes ship work.
