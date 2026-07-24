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

Repo root = package root (no nested `cd` into another app folder).

## Gotchas

- No env vars/secrets required. Google Fonts are cosmetic.
- Simulation is renderer-agnostic: keep drawing out of `Game.ts`.
- Saves use `localStorage`; don’t assume a server.
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
