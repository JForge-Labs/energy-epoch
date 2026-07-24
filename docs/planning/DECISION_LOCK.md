# Decision lock

Last updated: 2026-07-23  
Status: **LOCKED** unless user overrides in writing.

## Engine

| Decision | Value |
|----------|--------|
| **Active engine** | **Path W** — Vite + TypeScript + Pixi.js (browser) |
| **Future engine** | **Path U** — Unity 6.5 2D, *only* if rewrite criteria met (see PATH_U_ROADMAP.md) |
| **Dual-maintain web + Unity** | **No** |
| **Existing Unity platformer project** | Disposable / not this game. Do not treat as codebase |
| **Backend / game servers** | **None** for v1. All sim on device |
| **Monetization v1** | Free. Cheap/paid later optional |

## Product

| Decision | Value |
|----------|--------|
| Genre | Factorio-style energy ops / logistics + debt + rep |
| Design source of truth | `DESIGN.md` + `src/game/data/economy.ts` + systems |
| Persistence | Client-side (`localStorage`); add export/import before store wraps |
| Multiplayer | Out of scope for Path W launch |

## Ship goals

| Goal | How (Path W) |
|------|----------------|
| Mobile immediately | Static URL (GitHub Pages / equivalent) |
| Download, run locally, no hosted compute | Static assets + PWA offline; later Capacitor packages `dist/` |
| Free now | GH Pages / Cloudflare Pages + PWA = $0 |
| Cheap later | Apple Developer $99/yr only when App Store; optional Play $25 once |
| iOS eventually | Capacitor → Xcode first; Unity only if Path U triggers |

## Non-goals (do not do without user OK)

- Rewrite in Unity / start `energy-epoch-unity` as the main product
- Unity WebGL as the primary browser client (existing Vite client stays primary)
- Auth servers, multiplayer hosts, paid game servers for core loop
- Blocking gameplay on store listing polish

## Revisit Path U only if

1. Performance ceiling on mid phones (large maps / entity counts), or  
2. Native App Store polish is a hard product requirement, or  
3. Art/animation pipeline becomes the bottleneck and Unity tools clearly win, or  
4. User explicitly chooses “native-first rewrite” and accepts pause on web features  

See [PATH_U_ROADMAP.md](./PATH_U_ROADMAP.md).
