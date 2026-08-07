# Energy Epoch — agent instructions

A browser game (oil/energy ops sim): Vite + TypeScript + Pixi.js client, playable **fully offline** (localStorage saves). Runtime is the browser (or later a Capacitor shell).  
Backend is a single Cloudflare Worker (`worker/index.ts`): D1 (`DB`) + R2 (`SAVES`) + magic-link auth, serving accounts, cloud saves, and the admin dashboard. No game servers — the simulation runs entirely client-side and never requires the backend.

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

## Cursor Cloud specific instructions

Node 22 is required (Wrangler 4). Dependencies install with `npm install` (single `package-lock.json`). Standard scripts are in the `## Commands` table above; the notes below are the non-obvious full-stack bits.

### Two ways to run

- Game only (fastest loop): `npm run dev` → http://localhost:5173. The game is fully playable offline (localStorage). There is **no Vite `/api` proxy and no `vite.config.*`**, so account sign-in / cloud saves do **not** work here — `/api/*` calls just hit Vite's HTML and the client falls back to offline mode.
- Full stack (auth + cloud saves + host-split): the Cloudflare Worker (`worker/index.ts`) serves the built `dist/` and all `/api/*`. Run:
  - `npm run build` (Worker serves `dist/`, not live Vite — rebuild after client changes, or run `vite build --watch` in another shell)
  - `npx wrangler d1 execute energy-epoch-db --local --file=worker/schema.sql` (apply schema to the local emulated D1 once per fresh `.wrangler` state)
  - `npx wrangler dev --port 8787 --local` → http://localhost:8787 (emulated D1 `DB` + R2 `SAVES`, same-origin `/api`)
  - Prefix wrangler commands with `CI=1 WRANGLER_SEND_METRICS=false` to avoid interactive prompts.

### Gotchas (full stack)

- Host-split keys off the `Host` header. On `localhost`, `/` serves the marketing landing (`public/landing.html`) and `/api/*` works; the game SPA is on the `app.` host or at `/index.html`, admin dashboard on the `admin.` host. To exercise a specific host locally, send a header, e.g. `curl -H 'Host: app.playenergyepoch.com' http://localhost:8787/`.
- Magic-link **without a real email provider**: `login_tokens` stores only the SHA-256 of the token (the raw token is only ever emailed). To complete sign-in locally, insert a row with a hash you control, then consume it:
  - `HASH=$(printf '%s' "$RAW" | sha256sum | cut -d' ' -f1)`; `INSERT INTO login_tokens (token_hash,email,expires_at,created_at) VALUES ('$HASH','you@example.com',<now+900000>,<now>);`
  - `curl -si -X POST localhost:8787/api/auth/consume --data-urlencode "token=$RAW"` → returns `{ok,handoff}` and sets cookie `ee_sess=<sid>`.
  - `curl localhost:8787/api/me -H "Cookie: ee_sess=<sid>"` → authenticated user JSON. Session cookie name is `ee_sess`.
- No secrets are needed for local dev. `RESEND_API_KEY` (magic-link email) is only required to actually send mail — put it in a gitignored `.dev.vars` if you want real emails; otherwise `/api/auth/request` still returns `{ok:true}` and the email send fails silently.
- Admin API (`/api/admin/*`) is gated to the hardcoded `ADMIN_EMAIL` in `worker/index.ts`.
