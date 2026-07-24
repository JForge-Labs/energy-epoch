# Atlas drop zone (art pass)

The Pixi renderer loads a packed spritesheet from here at boot:

- `atlas-v1.json` — PixiJS spritesheet manifest (TexturePacker / free-tex-packer "pixi" format)
- `atlas-v1.png` — the packed page it references

**Frame names must match `MANIFEST` in `src/game/gfx/atlas.ts`**, e.g.
`terrain.ground`, `terrain.rock`, `infra.road`, `building.battery`,
`building.refinery`, `unit.truck`, `fx.flare`, `pip.sweet`, …

Animated frames: the pumpjack is a 4-frame stroke cycle named
`building.pumpjack.0` … `building.pumpjack.3` (beam low → high); the renderer
ping-pongs 0→3→0 while the well produces and freezes on shut-in.

Sizing: 64 px per tile (`TEX_TILE`); multi-tile buildings are footprint-sized
(battery/refinery/gas plant = 128×128). Truck art faces +x; the renderer
rotates it to the direction of travel. Keep inventory levels OUT of the art —
fill bars are drawn in code so state stays readable.

Until these files exist, the game auto-generates placeholder textures from the
current procedural shapes — missing art never breaks the build. A partial
atlas is fine too: found frames are used, gaps fall back to placeholders.
