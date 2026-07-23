# Energy Epoch

A single, purely client-side browser game (oil/energy operations sim) built with Vite + TypeScript. There is no backend, database, or external service — the whole product runs in the browser.

## Cursor Cloud specific instructions

### Services

Only one service: the Vite dev server. Run it from the repository root (`/workspace`).

| Task  | Command         | Notes |
|-------|-----------------|-------|
| Run   | `npm run dev`   | Vite dev server on http://localhost:5173 with HMR. This is the entire product runtime. |
| Build | `npm run build` | Runs `tsc` (typecheck, no emit) then `vite build` to `dist/`. Use this as the lint/typecheck gate — there is no separate lint script. |
| Preview | `npm run preview` | Serves the built `dist/` on http://localhost:4173. |

There is no test runner, no separate lint command, and no `vite.config.*` (all Vite settings are defaults).

### Gotchas

- The `README.md` says `cd energy-epoch` before running — ignore that. The app lives at the repository root, so run `npm install` / `npm run dev` from `/workspace` directly.
- No environment variables or secrets are required. Google Fonts load from a CDN but are cosmetic only; the game works offline/without them.
- In-game, the **Drill** action is confirmed by clicking the **Drill toolbar button twice** (arm, then confirm) — clicking the map only disarms it. Drilling a zone-N tile requires a rig of tier ≥ N (buy `Rig+`), and takes a few game-days to complete. Surveyed "Good"/"Sweet" tiles (via `Explore`) have ~90%+ hit odds; unsurveyed wildcats are lower.
