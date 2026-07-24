# Path U — Unity roadmap (not active)

**Status:** Roadmapped only. Path W is the product until the user flips this.

Unity on machine: **6.5** (installing). Old platformer at `Energy Epoch` is **not** a port base — start empty 2D if/when triggered.

Official Unity MCP (Unity AI) can help Editor/console/asset loops later. It is **not** a reason to rewrite now.

---

## Trigger criteria (any one + user OK)

1. **Perf:** Path W cannot hold acceptable FPS on target phones at desired map/entity scale  
2. **Product:** Native App Store feel / Game Center / deep IAP is launch-critical  
3. **Content:** Art/animation pipeline is the bottleneck; Unity tools clearly win  
4. **Explicit:** User chooses native-first and accepts multi-week feature freeze on web  

Until then: **do not open a Unity port PR.**

---

## When triggered — project setup

1. Archive/delete disposable platformer project (not this game).  
2. New empty **Unity 6.5 2D** (or URP 2D) project, e.g. `energy-epoch-unity`, git from day one.  
3. Optional: enable Unity MCP (official AI sub/trial **or** community MCP) for Claude/Cursor Editor loop.  
4. **Do not** dual-ship features on web + Unity. Pick cutover policy (web freeze vs web = demo only).

### Suggested Unity Hub modules (Windows) — already advised

- Android Build Support + OpenJDK + SDK/NDK  
- iOS Build Support (export only; Mac still required to compile)  
- IDE (VS or Rider)  
- Optional: Windows IL2CPP  
- Skip WebGL unless you deliberately want Unity-in-browser (usually worse than keeping Vite client)

---

## Port order (preserve design, not scenes)

Port **logic first** from Path W (executable spec):

| Order | Source (web) | Unity target |
|------|----------------|--------------|
| 1 | `DESIGN.md`, `economy.ts` | Data / ScriptableObjects / constants |
| 2 | `systems/*` (mapgen, pathfind, finance, production, terrain, world, ledger) | C# + EditMode tests |
| 3 | `Game.ts` snapshot / save | Versioned JSON save (ideally compatible) |
| 4 | Camera + grid presentation | Tilemap or mesh + pan/zoom |
| 5 | `main.ts` HUD | UI Toolkit |
| 6 | Polish | Audio, VFX, particles (MCP/generators useful) |
| 7 | Mobile | Android APK → TestFlight → stores |

Vertical slice gate before art pass: **pad → road → battery → truck → refinery → debt/rep pressure.**

---

## Path U deploy ladder

```
Editor play mode
  → Android APK sideload
  → TestFlight (Apple $99 + Mac)
  → App Store + Play
  → Optional static marketing site (not game compute)
```

Still **no game servers** unless product changes.

---

## What stays valuable from Path W after port

- `DESIGN.md` and locked economy intent  
- Player learning from live web playtests  
- Possibly free browser demo (freeze web feature set)  
- Save schema if designed for compatibility  

What does **not** transfer: DOM HUD, Vite/PWA specifics, Capacitor shell (replaced by Unity player).

---

## Anti-patterns

- Evolving the platformer microgame into Energy Epoch  
- Maintaining full feature parity on web and Unity  
- Starting Path U mid-feature on Path W without a freeze date  
- Using Unity WebGL as the only “mobile web” strategy while deleting the fast Vite client  

---

## Agent note

If you are Claude/Grok and the task is gameplay on this repo: **ignore Path U implementation.** Only update this file if the user changes roadmap status.
