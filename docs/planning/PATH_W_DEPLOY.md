# Path W — Deploy plan (active)

Pure client static game. **No hosted game compute.** Server only serves files (CDN).

```
Vite build → dist/
    ├── Phase A: Static URL (mobile browser)     $0
    ├── Phase B: PWA (install + offline)         $0
    ├── Phase C: Capacitor Android               $0–$25 Play
    └── Phase D: Capacitor iOS → TestFlight/Store  $99/yr Apple
```

**Primary (Railway, Path W):** https://energy-epoch-production.up.railway.app  
Optional GitHub Pages (may lag): https://jfodchuk.github.io/energy-epoch/

### Railway link (this machine)

| | |
|--|--|
| Project | `steadfast-determination` (`bed2d934-f737-4351-8f2b-7b3fa9eafeda`) |
| Service | `energy-epoch` |
| Config | `railway.toml` (Railpack + `npm run build`; `npm start` → `serve dist`) |
| Redeploy from local | `railway up` (from repo root, already linked) |
| GitHub source | `jfodchuk/energy-epoch` branch **`cleanup/qa-fixes`** (retargeted 2026-07-24) |
| Auto-deploy | Pushes to **`cleanup/qa-fixes`** should trigger Railway; **`main` will not** until branch is changed back |
| Vite base | **`/`** only (never `/energy-epoch/` on Railway) |

### Pipeline gotchas

1. Claude ships on `cleanup/qa-fixes`, not `main` — Railway must watch that branch (done) or patches never auto-land.
2. GitHub Pages (`/energy-epoch/` base) is a **different** host; visual changes there ≠ Railway.
3. Hard refresh if assets look sticky (`Ctrl+Shift+R`); hashed filenames change every build.
4. Gate before ship: `npm test && npm run build` (interest smoke assumes Hard mode default **off**).

---

## Phase A — Static host (mobile link)

**Goal:** Share a URL; phone can play.

| Item | Detail |
|------|--------|
| Artifact | `npm run build` → `dist/` |
| Gate | `npm test` then `npm run build` |
| Host options | **Railway** (active target) · GitHub Pages (optional) · Cloudflare Pages |
| Base path | GH project pages need Vite `base: '/energy-epoch/'` (or equivalent). Root domain → `base: '/'` |
| Deploy mechanism | Restore `gh-pages` script **or** GitHub Action on `main` (preferred long-term) |

**Do not block gameplay on perfect CI.** When ship is requested: one reliable path is enough.

### A acceptance

- [ ] Fresh clone → install → test → build succeeds  
- [ ] Deployed URL loads on a real phone  
- [ ] Core loop playable with touch (tap / pan / zoom)  

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

Prefer packaging assets (offline) over TWA-that-needs-network-only.

### C acceptance

- [ ] APK installs and runs offline  
- [ ] Same save behavior as web (or documented migration)  

---

## Phase D — iOS (later)

| Item | Detail |
|------|--------|
| Tool | Capacitor iOS project |
| Requirements | Apple Developer **$99/yr**, Mac + Xcode for build/sign |
| Ladder | TestFlight → free App Store listing |
| Not required for free web launch | |

### D acceptance

- [ ] TestFlight build runs on a physical iPhone  
- [ ] Privacy copy accurate: no accounts; data on device  

---

## Cost summary (Path W)

| Stage | Host/compute | Fees |
|-------|--------------|------|
| A–B | $0 | $0 |
| C Play | $0 servers | ~$25 once |
| D App Store | $0 servers | $99/yr Apple |
| Domain (optional) | — | ~$10–15/yr |

---

## Implementation order (when user prioritizes ship work)

1. Reliable build + correct `base` + deploy path (Action or script)  
2. Mobile layout / safe-area / touch targets (may overlap Claude UX work — coordinate)  
3. PWA + icons  
4. Save export/import  
5. Capacitor Android  
6. iOS when Apple account + Mac ready  

**Gameplay agents:** skip this list unless asked. See AGENT_LANES.md.

---

## Architecture note for later Path U

Path W `dist/` and Capacitor are **not** thrown away as marketing: even after a Unity rewrite, a static site can remain the free browser demo **or** be retired. Do not dual-implement features in both engines.
