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
Deploy: `npm run build && npx wrangler deploy` (or GitHub Actions).

### Host history

| Host | Status |
|------|--------|
| **Cloudflare Worker** | **Active** — custom domain + workers.dev staging |
| Railway (`steadfast-determination` / `energy-epoch`) | **Decommissioned** 2026-07-24 — static-only, no state |
| GitHub Pages | Optional / legacy; needs `base: '/energy-epoch/'` if used |

### Pipeline notes

1. Vite `base` stays **`/`** for the apex domain Worker.  
2. Hard refresh after deploys (`Ctrl+Shift+R`); hashed asset filenames change every build.  
3. Gate: `npm test && npm run build` before ship.  
4. Auth (later): D1 / KV / R2 on Cloudflare — see `wrangler.toml` stubs. Do **not** reintroduce Railway for static hosting.

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

## Phase D — iOS (later)

| Item | Detail |
|------|--------|
| Tool | Capacitor iOS project |
| Requirements | Apple Developer **$99/yr**, Mac + Xcode |
| Ladder | TestFlight → free App Store listing |

### D acceptance

- [ ] TestFlight build runs on a physical iPhone  
