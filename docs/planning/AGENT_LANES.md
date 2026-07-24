# Agent lanes — avoid collisions

Claude is actively building the game. Planning/deploy steering happens in parallel. **Stay in your lane.**

## Active git reality (check before large edits)

- Branch is often `cleanup/qa-fixes` (or successor feature branches), not only `main`.
- Hot files Claude often owns mid-session:
  - `src/game/Game.ts`
  - `src/game/data/economy.ts`
  - `src/game/types.ts`
  - `src/main.ts`
  - `src/game/systems/*`
  - `src/game/render*.ts`, `src/styles.css`
- **Before editing those:** coordinate with user (“is Claude mid-edit?”) or stick to docs/deploy-only files.

## Lane map

| Area | Who | Notes |
|------|-----|--------|
| `src/game/**`, gameplay UX, balance | **Claude** (primary) | Ship the loop |
| `smoke.ts` / `npm test` | Claude | Keep green when touching systems |
| `docs/planning/**` | **Grok / user** | Strategy; Claude may *read* freely |
| `DESIGN.md` | User + Claude (gameplay intent) | Don’t contradict DECISION_LOCK |
| Deploy scripts, CI, PWA, Capacitor | **Only when user asks** | Prefer small isolated PRs; don’t drive-by while Claude is mid-feature |
| Unity projects / Path U port | **User trigger only** | Out of scope for Claude unless tasked |
| `package.json` scripts / deps | Careful | Coordinate; Claude may add game deps |

## Rules for Claude (gameplay agent)

1. **Read** `docs/planning/DECISION_LOCK.md` — Path W only.
2. **Do not** scaffold Unity, Capacitor, or a second engine unless the user explicitly asks.
3. **Do not** add a backend, auth, or multiplayer server.
4. Keep sim **renderer-agnostic** (`Game.ts` does not draw) — canvas default, Pixi opt-in is fine.
5. Prefer completing the **ops loop** and mobile playability over polish deploy infra.
6. If deploy work is requested: touch only deploy-related files; avoid rewriting game systems in the same pass.
7. Leave planning docs alone unless asked to update checklist status.

## Rules for Grok / planning agent

1. Prefer writing under `docs/planning/**` and root `AGENTS.md` / README deploy notes.
2. Do not large-refactor `Game.ts` / systems while Claude is building.
3. When implementing deploy (user-requested): branch or clear handoff; run `npm test` + `npm run build`.
4. Update `CHECKLIST.md` when ship milestones complete.

## Handoff phrase (user → Claude)

Copy-paste:

```text
Read docs/planning/ (especially DECISION_LOCK.md and AGENT_LANES.md).
Path W only — no Unity port. Stay out of docs/planning edits unless I ask.
Focus on: <gameplay task>. Avoid drive-by deploy/PWA work.
```

## Handoff phrase (user → Grok)

```text
Planning/deploy lane only. Claude owns src/game. Update docs/planning or implement
deploy only if I say so. No collisions on Game.ts / systems.
```
