# Energy Epoch — Graphics Quality Pass (plan only)

**Status:** Plan — **do not execute** until user green-lights.  
**Goal:** One coordinated pass that lifts *all* visual artifacts as far as practical without breaking sim, mobile, or Path W deploy.  
**Date:** 2026-07-24

---

## 1. Current graphic quality — hard limits

### What you ship today

| Layer | Reality |
|-------|---------|
| **Default renderer** | Canvas 2D (`render.ts`) — **procedural shapes only** (rects, paths, fills) |
| **WebGL path** | PixiJS v8 scaffold (`renderPixi.ts`) — **opt-in `?pixi` only** |
| **Pixi draw model** | Immediate-mode `Graphics` redraw each frame — **no textures, no sprites, no atlas** |
| **Art assets** | Essentially **none** (`public/favicon.svg` only) |
| **Animation** | Minimal / fake (static shapes; maybe simple flicker) |
| **Lighting / materials** | Flat colors + a few hard-coded shades |
| **Particles / VFX** | None as a system (flare is a shape) |
| **UI chrome** | DOM/CSS SCADA — industrial mono, not art-directed game HUD |
| **Sim coupling** | Good: `Game.ts` is renderer-agnostic (keep this) |

### Ceiling of the *current* approach

Even if you polish Canvas/Pixi Graphics heavily:

1. **No pixel/art density** — everything is geometric “programmer art.”
2. **No silhouette language** — tanks/jacks/trucks read as colored blobs at zoom.
3. **No motion craft** — pumpjacks, trucks, flares, weather won’t feel alive.
4. **Scale cost** — redrawing all Graphics every frame will choke mobile once you add detail *without* sprites/batching.
5. **Dual renderer tax** — Canvas default + Pixi scaffold doubles work unless you pick a winner.
6. **Ops readability** — dense 2D art can hide roads/pipes/fill levels; beauty cannot bury state.

### Soft limits (product / device)

| Constraint | Budget |
|------------|--------|
| Target | Mobile Safari + mid Android + desktop |
| Map | ~56×36 tiles (already larger than early 40×24) |
| Download | Prefer **&lt; 8–15 MB** extra art for free web |
| GPU | Integrated / phone; avoid huge atlases uncropped |
| Server | Irrelevant (static host) — all cost is client |

### Practical max under Path W (web + Pixi)

You can reach **strong “premium indie ops sim”** look (think polished Factorio-lite / Oil Rush-adjacent UI + readable tile art), **not** AAA cinematic 3D.

Path U (Unity) only if you later want heavier lighting, 3D pad models, post FX — **not required** for a huge web visual jump.

---

## 2. What “all artifacts in one pass” means

Treat the lease as one **visual system**, not a pile of one-off drawings.

### Artifact families (must ship together)

| Family | Examples |
|--------|----------|
| **Terrain** | Ground, scrub, rock peaks, water, creek, pad gravel |
| **Infra** | Road, bridge, oil pipe, gas pipe (live vs dead) |
| **Facilities** | Battery (2×1), refinery (2×2), gas plant, pad |
| **Wellsite** | Pumpjack (anim), wellhead tank(s), duster, choked state |
| **Fleet** | Truck (empty / crude / clean), drill rig |
| **FX** | Flare, spill, storm/lightning, selection, survey overlays |
| **Readouts** | Fill bars, prospect pips, stranded/hot markers (must stay legible) |
| **Chrome** | Optional: toolbar icons, brand marks — same style bible |

### One-pass definition of done

1. **Pixi is default** (Canvas kept as `?canvas` fallback or deleted after soak).  
2. **Single sprite atlas** (or 2–3 atlases: terrain / buildings / units+fx).  
3. **Every sim entity** has a sprite (or sprite stack), not a freehand Graphics shape.  
4. **Shared style bible** (palette, outline weight, light direction, pixel scale).  
5. **Idle + active motion** for jack, flare, truck roll, weather.  
6. **Mobile 30–60 fps** on a mid phone at default zoom.  
7. **No sim regressions** (`npm test` green; hit-testing unchanged).

---

## 3. Recommended architecture for the pass

```
DESIGN LOCK (style bible + scale)
        │
        ▼
ASSET FACTORY (one model, one prompt family, full set)
        │
        ▼
ATLAS PACK (TexturePacker / free-tex-packer / Pixi tools)
        │
        ▼
PIXI DEFAULT RENDERER (sprites + layers + animation)
        │
        ▼
PERF + MOBILE SOAK → Railway
```

### Renderer decision (locked recommendation)

| Choice | Recommendation |
|--------|----------------|
| **Default engine** | **PixiJS v8** (already a dependency) |
| **Canvas 2D** | Fallback only, or remove after 1 week |
| **Unity for this pass** | **No** — rewrites everything; Path U stays future |
| **3D** | **No** for this pass — kills mobile budget |

### Layer stack (Pixi)

```
world
  ├─ terrain (tile sprites / multi-tile stamps)
  ├─ pipes + roads
  ├─ buildings
  ├─ wells / jacks
  ├─ units
  ├─ fx (flare, spill, weather)
  └─ overlays (select, survey, hover)
ui = existing DOM SCADA (optional icon pack only)
```

**Do not** redraw full-map Graphics every frame. Prefer:

- Static terrain batch / container rebuilt on map change  
- Dirty buildings on place/sell  
- Units + FX tick every frame  

---

## 4. One-pass work breakdown (execution order when approved)

### Phase A — Art direction lock (½–1 day, human + model)

- Pick **one** look: e.g. *“top-down industrial oilfield, soft pixel-illustrative, warm amber/steel, readable silhouettes, mild isometric optional vs pure ortho.”*  
- **Recommendation:** **orthographic top-down** (not heavy iso) so roads/cardinal adjacency stay readable.  
- Lock: tile size in px (e.g. **64×64** source, mip/down to 32–48 on mobile), outline (1–2 px), light from top-left, no pure black.  
- Produce a **style board**: 1 terrain strip + 1 facility strip + 1 unit strip.

### Phase B — Full asset generation (1–2 days)

Generate the **entire set** under one style (see models below). Output:

- Terrain variants (2–4 per type to break tiling)  
- Roads: straight, corner, T, cross, bridge  
- Pipes: oil/gas straight/corner + active glow variant  
- Buildings: battery, refinery, gas plant, pad  
- Jack: 4–8 frame cycle  
- Tank: empty / mid / full optional (or fill bar overlay stays code)  
- Truck: 4 facings × cargo tint (or 3 cargo skins)  
- Rig, flare (2–4 frames), spill decal, storm overlay  

**Rule:** same seed/style ref image for every batch; reject outliers.

### Phase C — Engine integration (2–4 days coding)

1. Atlas load at boot; fail soft to solid colors if missing.  
2. Replace Pixi Graphics drawing with sprite placement by `kind` / terrain.  
3. Animation clocks from `market.day` / real time.  
4. Keep fill bars / prospect pips as **code overlays** (don’t bake critical state into pixels only).  
5. Make Pixi default in `main.ts`; `?canvas` escape hatch.  
6. Zoom LOD: simplified sprites under min zoom if needed.

### Phase D — Polish & budget (1–2 days)

- Outline contrast pass for night-ish ground  
- Mobile GPU profile (iPhone mid + Android mid)  
- Bundle size check; compress to WebP/AVIF if needed  
- Railway deploy soak  

**Total calendar estimate:** ~1 hard week for a strong pass with AI art + one focused coding agent; 2 weeks if polish-heavy.

---

## 5. Model recommendations

### A) Image / sprite generation (art)

| Rank | Model / tool | Why |
|------|----------------|-----|
| **1 — Best for this pass** | **Flux-class / high-end image model with strong style lock** (Flux Pro / Ideogram / Midjourney v6–7 with consistent refs) **or Grok Imagine** if you want it in-house | Strong silhouette control + batch consistency when using a fixed reference board |
| **2** | **Unity AI Sprite Generator** | Only if you already live in Unity — wrong engine for Path W one-pass |
| **3** | **Generic SDXL without ref** | Cheap but style drifts; bad for “all artifacts one pass” |

**Art workflow tip:** generate a **master style tile** first, then every prompt: *“same style as reference, top-down game sprite, transparent BG, 64px tile, industrial oilfield…”*

### B) Code / systems agent (renderer pass)

| Rank | Model | Why for *this* job |
|------|--------|---------------------|
| **1 — Best** | **Claude Opus 4.x (or Sonnet 4.x if cost-capped)** with full repo context | Best at multi-file Pixi refactors, keeping sim/render split, careful mobile edge cases |
| **2** | **GPT-5 / o-series high-reasoning** | Strong planner/implementer; good for atlas pipeline scripts |
| **3** | **Grok (this stack)** | Good for orchestration, Railway, planning, review; pair with Opus for the heavy Pixi rewrite if you want max one-pass quality |

**Recommendation:**  
- **Art:** Flux/MJ/Imagine **with locked style ref**.  
- **Code:** **Claude Opus** on a dedicated “graphics pass” branch, instructions: *Pixi default, atlas-only, no Game.ts logic changes, keep tests green.*  
- **Grok:** plan, review diffs, perf checklist, deploy.

### C) What *not* to use as the hero model

- Tiny local SD without LoRA — inconsistency will force a second pass.  
- Unity MCP for this pass — engine mismatch.  
- “Just prompt the whole game into Unreal” — out of scope for Path W.

---

## 6. Difficulty rating

| Dimension | Level | Notes |
|-----------|-------|--------|
| **Art direction** | Medium | One style lock solves 80% |
| **Asset volume** | **Hard** | Many entities + variants + anim frames |
| **Pixi integration** | **Hard** | Default swap, LOD, mobile, dirty layers |
| **Sim risk** | Low–Med | If agents stay out of `Game.ts` systems |
| **Overall “huge improvement one pass”** | **Hard (7.5/10)** | Achievable in one dedicated pass; not a weekend tweak |

**Difficulty recommendation:** run it as **Hard mode / single epic**, not a soft polish ticket:

- Freeze gameplay features for 3–7 days  
- One branch: `graphics/pixi-atlas-v1`  
- Explicit non-goals: new buildings, multiplayer, Unity  

If you want **maximum detail** (full anim sets, road autotile set, weather particles, HQ atlas @ 128px): rate it **Hard+ (8.5/10)** and budget **two coding days extra** for perf.

---

## 7. Detail budget (“as much as practical”)

### In scope (recommended max for one pass)

- 64px master tiles (display ~32–48)  
- Road autotile 16-set **or** simplified 6-set (straight/corner/T/cross/bridge/pad)  
- Pipe set oil + gas  
- Battery, refinery, plant, pad with 1–2 shadow layers  
- Pumpjack 6-frame  
- Truck 4-dir + cargo tint  
- Flare 4-frame + spill decal  
- Soft ambient darken for storm  
- Selection ring + survey grade pips  

### Explicitly later (second pass)

- Seasonal terrain  
- Night cycle lighting  
- High-end particle dust/rain  
- 3D or isometric rebuild  
- Cinematic camera  
- Per-well custom skins  

---

## 8. Risks & guardrails

| Risk | Mitigation |
|------|------------|
| Pretty but unreadable logistics | Keep roads/pipes high contrast; state bars in code |
| Mobile jank | Atlas batching, no full-map Graphics, cap DPR |
| Style drift across assets | One ref board; reject batches that don’t match |
| Claude/agent edits sim | `AGENT_LANES`: graphics owns `render*`, `public/`, atlas tools only |
| Bundle bloat | WebP, trim atlas, max ~10–15 MB art |
| Dual renderer forever | Time-box Canvas removal |

---

## 9. Success metrics

| Metric | Target |
|--------|--------|
| First-glance “this looks like a real game” | Yes on phone screenshot |
| FPS mid phone default zoom | ≥ 30 stable, prefer 60 desktop |
| Artifact coverage | 100% of drawn sim entities are sprite-based |
| Tests | `npm test` green; manual road/truck/treat smoke |
| Deploy | Railway still static; no new server cost |

---

## 10. Recommendation summary (executive)

| Question | Answer |
|----------|--------|
| **Current limitation** | Procedural Canvas/Pixi Graphics, almost zero art assets, Pixi not default, no atlas/anim/VFX system |
| **How to improve everything in one pass** | Lock style → generate full atlas set → Pixi default sprite renderer → motion + mobile perf |
| **Best art model** | High-end image model with **style reference lock** (Flux/MJ/Imagine class) |
| **Best code model** | **Claude Opus** for the Pixi/atlas integration epic |
| **Difficulty** | **Hard (7.5/10)**; **Hard+** if max detail anim/autotile |
| **Engine** | Stay **Path W + Pixi**; do **not** pivot to Unity for this pass |
| **Outcome ceiling** | Large jump to premium 2D ops-sim look; not AAA 3D |

---

## 11. When you say “go”

Suggested kickoff command to the coding agent:

```text
Read docs/planning/GRAPHICS_PASS.md.
Branch graphics/pixi-atlas-v1.
Do not change Game.ts sim rules.
Make Pixi default; integrate atlas sprites for all entities in renderPixi.ts.
Keep npm test green. No Unity.
```

Art agent / human: produce style board + full asset list in `docs/planning/GRAPHICS_ASSET_LIST.md` first (optional checklist file).

---

**End of plan — no code or assets generated under this document alone.**
