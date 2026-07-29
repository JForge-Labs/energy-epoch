# Path W — Deploy plan (active)

Pure client static game. **No hosted game compute.** CDN only serves files.

```
Vite build → dist/
    ├── Phase A: Cloudflare Worker + playenergyepoch.com   $0
    ├── Phase B: PWA (install + offline)                   $0
    ├── Phase C: Capacitor Android                         $0–$25 Play
    └── Phase D: Capacitor iOS → TestFlight/Store            $99/yr Apple
```

**Primary:** https://playenergyepoch.com  

Config: `wrangler.toml` (Workers static assets from `./dist`).  
Deploy: `npm run build && npx wrangler deploy` (or GitHub Actions on `main`).

### Host history

| Host | Status |
|------|--------|
| **Cloudflare Worker** | **Active** — custom domain + workers.dev staging |
| Railway (`steadfast-determination` / `energy-epoch`) | **Decommissioned** 2026-07-24 — static-only, no state |
| GitHub Pages | Optional / legacy; needs `base: '/energy-epoch/'` if used |

---

## Production deploy workflow (canonical)

Captured 2026-07-29 after PR #2 merge + fix-up. Follow this so apex routing and brand assets stay correct.

### What ships where

| URL / host | What users get |
|------------|----------------|
| `playenergyepoch.com` (`/`, `/landing`) | Marketing **landing** (`public/landing.html` → `dist/landing.html`) |
| `app.playenergyepoch.com` | Game SPA (`dist/index.html` + hashed assets) |
| `admin.playenergyepoch.com` | Admin dashboard (`public/admin.html`) |
| Static files (`/favicon-*.png`, `/app-icon-512.png`, …) | From `public/` via Vite `dist/` |

Host split is enforced in **`worker/index.ts`** (runs first). Assets alone would serve the SPA at `/` — the Worker rewrites apex to landing.

### Trigger

| Path | When |
|------|------|
| **Auto** | Push / merge to **`main`** → `.github/workflows/deploy-cloudflare.yml` |
| **Manual (local)** | `npm run deploy` (`build` + `wrangler deploy`) |
| Feature branches | **Do not** auto-deploy. Merge to `main` to ship. |

### Required secrets / config

| Item | Where |
|------|--------|
| `CLOUDFLARE_API_TOKEN` | GitHub repo secret (Workers Scripts:Edit + Account:Read + Zone:DNS:Edit) |
| `account_id` | `wrangler.toml` (not a secret) |
| `RESEND_API_KEY` | Wrangler secret (auth email; not needed for static-only ship) |

### Workflow requirements (do not regress)

File: `.github/workflows/deploy-cloudflare.yml`

| Setting | Value | Why |
|---------|--------|-----|
| Node | **22** (not 20) | Wrangler **4** needs Node ≥ 22 |
| Wrangler package pin | `package: wrangler@4.114.0` (or current v4) | Without this, the action installs **Wrangler 3** under Node 20 |
| Build | `npm ci` → `npm run build` | Populates `dist/` including `public/*` |
| Deploy | `cloudflare/wrangler-action@v3` + token | Publishes Worker + assets |

**Hard lesson (2026-07-29):** Node 20 → action fell back to Wrangler 3 → ignored `assets.run_worker_first` → apex `/` served the **game SPA** instead of landing; brand icons looked “missing” until cache-bust. Local `npm run deploy` with Wrangler 4 fixed prod immediately.

### `wrangler.toml` assets (must stay)

```toml
[assets]
directory = "./dist"
binding = "ASSETS"
not_found_handling = "single-page-application"
run_worker_first = true   # Worker host-split before static SPA fallback
```

### Worker landing fetch

Apex `/` / `/landing` must fetch the real file:

```ts
// public/landing.html → dist/landing.html (there is no extensionless asset)
return staticHtml("/landing.html");
```

Responses use `cache-control: no-store` for HTML shells so marketing pages don’t stick behind CF edge cache.

### Local ship commands

```bash
npm test
npm run build
npm run deploy          # build + wrangler deploy (needs CF login / token env)
```

Or trust CI after merge to `main`:

```bash
git checkout main
git pull
# merge PR, or push main
# watch: gh run list --branch main --workflow "Deploy (Cloudflare Workers)"
```

### Post-deploy smoke

```text
https://playenergyepoch.com/              → landing (hero icon, ENERGY EPOCH mark)
https://playenergyepoch.com/landing       → same landing
https://playenergyepoch.com/app-icon-512.png → image/png
https://playenergyepoch.com/favicon-32.png   → image/png
https://app.playenergyepoch.com/          → game shell
```

If `/` still looks like the SPA: hard-refresh / private window (edge may `cf-cache-status: HIT` briefly). Landing HTML itself is `no-store` when served by the Worker.

### Pipeline notes

1. Vite `base` stays **`/`** for the apex domain Worker.  
2. Hard refresh after deploys; hashed game asset filenames change every build. Favicons need a private window more often than JS.  
3. Gate: `npm test && npm run build` before ship.  
4. Auth: D1 / R2 on Cloudflare — see `wrangler.toml`. Do **not** reintroduce Railway for static hosting.

---

## Phase A — Static host (mobile link)

**Goal:** Share a URL; phone can play.

| Item | Detail |
|------|--------|
| Artifact | `npm run build` → `dist/` |
| Gate | `npm test` then `npm run build` |
| Host | **Cloudflare Worker** (`wrangler.toml`) |
| Domain | `playenergyepoch.com` |
| Base path | `/` |

### A acceptance

- [x] Deployed URL loads on a real phone  
- [x] Core loop playable with touch (tap / pan / zoom)  

---

## Phase B — PWA (download / run local feel)

**Goal:** Home-screen install; offline after first load; still $0.

| Item | Detail |
|------|--------|
| Manifest | name, icons 192/512, `display: standalone`, theme |
| Service worker | Precache shell + assets (`vite-plugin-pwa` is the usual choice) |
| iOS | apple-touch-icon + mobile web app meta |
| Saves | Keep `localStorage`; add **export/import JSON** so users can backup |

### B acceptance

- [ ] Android: Install app / Add to Home Screen works  
- [ ] iOS Safari: Add to Home Screen opens standalone  
- [ ] One full session works offline after first visit  
- [ ] Save export/import round-trips  

---

## Phase C — Android package (optional)

**Goal:** Real APK “download,” still no server compute.

| Item | Detail |
|------|--------|
| Tool | Capacitor wraps `dist/` (local assets in WebView) |
| Sideload | Free (itch, Discord, site) |
| Play Store | ~$25 one-time developer fee |

### C acceptance

- [ ] APK installs and runs offline  

---

## Phase D — iOS App Store (**active planning**)

Full plan: **[IOS_APP_STORE.md](./IOS_APP_STORE.md)**

| Item | Detail |
|------|--------|
| Tool | Capacitor iOS project wraps `dist/` |
| Requirements | Apple Developer **$99/yr** (approved), Mac + Xcode |
| Ladder | Scaffold → TestFlight → free App Store listing |
| Web host | Remains Cloudflare; Store app is offline-capable local assets |

### D acceptance

- [ ] Capacitor iOS runs on simulator  
- [ ] TestFlight build runs on a physical iPhone  
- [ ] App Store metadata + privacy policy live  
- [ ] Submitted / Ready for Sale
