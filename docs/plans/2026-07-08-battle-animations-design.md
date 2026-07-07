# Battle Animations — Design

Three gaps: hits/heals/buffs have no visual feedback beyond an instant number
change, dying stacks just vanish, and the active-turn indicator (`.active-arc`)
is static — easy to miss whose turn it is.

## Principle: engine stays pure, UI replays the log

`applyAction` keeps returning the final `BattleState` in one synchronous call
— no engine changes. `battle.log` already carries every sub-event of an
action (e.g. `attack` + `hitEvents` + `retaliate` + `retEvents`) with the
data needed to animate it: `targetId`, `damage`, `killed`.

`Battle.svelte` reveals that log slice incrementally instead of swapping to
the final state in one jump:

1. `applyAction` runs immediately and produces `next` (ground truth).
2. Diff `next.log.slice(battle.log.length)` to get this action's new entries.
3. Walk them **in order**: for each entry, patch a working copy's affected
   unit(s) (`count`/`hp`/buffs) from the entry's own `data`, assign
   `battle = { ...working }` so Svelte re-renders that one beat, show the
   matching `AnimStep`, await a per-step delay, move to the next entry.
4. After the last entry, assign the real `next` wholesale — a cheap
   correctness backstop in case the per-step patch missed a field (ATB,
   morale, etc.) that doesn't matter mid-sequence but must be right at rest.

This makes attack → retaliate → death play as three separate beats, matching
how the log itself is already sequenced, and needs no engine changes because
the patcher only ever reads `data` already on each log entry.

## Event → animation mapping

| Log entry | Animation |
|---|---|
| `attack` / `retaliate` / `shoot` (incl. splash) | floating red `-N` over `targetId`; add a 💀 marker if `killed` |
| `cast` with `damage` | floating red `-N` over target |
| `cast` without `damage` (Bloodlust/Stoneskin) | floating green `+N ATK`/`+N DEF` over target |
| `morale_boost` | small ⭐ / "Extra turn!" tag over the actor |
| `status` (`burn`, `blind`, `bind_block`) | small icon ping (🔥/😵/⛓) over the unit |
| unit's `count` reaches 0 | fade + sink on that unit's standee, timed to finish as the step reveals |

Same-unit steps that land back-to-back stagger by a fixed delay so numbers
don't overlap; steps touching different units may render concurrently.

## Components

- **`animSteps.ts`** (new, plain module) — `stepsFromLogEntry(entry, stateBeforeEntry): AnimStep[]`
  and the state patcher `applyLogEntry(state, entry): BattleState`. Pure
  functions, no Svelte — this is the unit-testable core.
- **`AnimStep`** — `{ unitId: string; kind: 'damage' | 'heal' | 'buff' | 'death' | 'status'; value?: number; icon?: string }`.
  Position is resolved at render time from the unit's cell in the state being
  displayed, not stored on the step.
- **`BattleFx.svelte`** (new) — overlay layer inside `BattleGrid`'s board
  stage; renders the active step(s) as floating/fading elements positioned
  over the right cell. Uses Svelte's keyed `{#each}` + transitions for
  enter/exit.
- **Death fade** — a `dying` boolean passed to `UnitToken`/`.token-standing`
  in `BattleGrid`, triggering an opacity + slight `translateY` sink via CSS
  transition (~500ms), not a separate overlay (it has to affect the real
  sprite in place).
- **Active-turn shimmer** — pure CSS: a `conic-gradient` layer on
  `.active-arc` rotating via `@keyframes`, looping while the unit is
  `activeId`. Disabled under `prefers-reduced-motion`.

## Pacing

Per-step delay derives from the existing `battleSpeed` control
(`slow/normal/fast`) so animation pacing and AI move pacing stay in sync off
one dial — e.g. 700/450/200ms per step.

An `animating` boolean locks input in `Battle.svelte` for the duration of the
full step sequence:
- Player clicks are ignored while `animating` (mirrors the existing
  `interactive` prop already threaded into `BattleGrid`).
- The AI-turn `setTimeout` effect only schedules once `animating` is false,
  and (per the earlier forfeit-race fix) still re-checks `battle.result`
  inside the timeout callback.

## Testing

TDD on `animSteps.ts`: `stepsFromLogEntry` for each log entry type (damage
with/without kill, buff cast, morale boost, status), and `applyLogEntry` for
each (count/hp decrement, death zeroing, buff application). These are pure
data functions — no DOM needed.

CSS timing, the shimmer loop, and the `animating` lock's actual blocking
behavior aren't unit-testable (no Svelte component-test harness in this
repo, and none will be added just for this). Verify those by hand in-browser
per the project's established pattern for UI work: trigger a multi-hit
exchange and confirm beats reveal in order, confirm input is blocked mid
-sequence, confirm the AI doesn't move until the player's animation settles.

## Non-goals

Battle replay (re-watching a finished battle) falls naturally out of the same
log-driven step machinery, but needs persistence (saving the log + initial
armies on battle end) and a playback UI that don't exist yet. Out of scope
here; `animSteps.ts`'s functions are written generically enough to reuse for
it later.
