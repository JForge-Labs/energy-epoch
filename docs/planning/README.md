# Energy Epoch — Planning Pack

**Point Claude (or any agent) at this directory** for ship/engine decisions.

| Doc | Purpose |
|-----|---------|
| [DECISION_LOCK.md](./DECISION_LOCK.md) | Engine + product decisions that are **locked** |
| [AGENT_LANES.md](./AGENT_LANES.md) | Who owns what — **avoid collisions** with active game work |
| [PATH_W_DEPLOY.md](./PATH_W_DEPLOY.md) | Active path: web → PWA → Capacitor → stores |
| [PATH_U_ROADMAP.md](./PATH_U_ROADMAP.md) | Future path: Unity 6.5 port criteria + order |
| [CHECKLIST.md](./CHECKLIST.md) | Milestones and status |
| [GRAPHICS_PASS.md](./GRAPHICS_PASS.md) | Visual quality one-pass plan (Pixi + atlas) |
| [IOS_APP_STORE.md](./IOS_APP_STORE.md) | **Active:** Capacitor → TestFlight → App Store ($99/yr Apple) |
| [../../DESIGN.md](../../DESIGN.md) | Game design (gameplay source of truth) |

## One-liner for agents

> **Path W is active** (Vite + TypeScript + Pixi, pure client). **Path U is roadmapped only** (Unity later if ceilings hit). Do not start a Unity port, dual engine, or backend. Prefer gameplay/systems work over deploy scaffolding unless the user asks.

## Owner split (current)

| Lane | Owner |
|------|--------|
| Gameplay, systems, UX, balance | Claude (and user playtests) |
| Deploy/engine strategy, planning docs | Grok + user |
| Unity install / Path U trigger | User decision only |

Update [CHECKLIST.md](./CHECKLIST.md) when milestones land; update [DECISION_LOCK.md](./DECISION_LOCK.md) only when the user explicitly changes course.
