# Battle UI — Design

Milestone: render the battle on screen and make it playable — grid, unit stacks,
turn order bar, click-to-move/attack. Engine (`src/lib/engine`) is done and stays
UI-agnostic.

## Approach

**DOM + CSS grid, no canvas.** 120 cells and ~12 unit tokens is trivial for the
DOM; Svelte reactivity gives us re-render for free, clicks need no hit-testing
math, and Tailwind handles styling. Canvas/SVG would only pay off with sprite
animation, which is out of scope for this milestone.

**Placeholder art.** No sprite assets yet. Each stack renders as a token: a
rounded tile with the unit's emoji glyph (per-tier mapping), a count badge, and
a thin HP bar for the top creature. Side is shown by ring/tint colour — player
blue, enemy red. Tokens are a single component so real sprites can replace the
glyph later without touching layout.

## Components

```
+page.svelte            — army setup, mounts <Battle>
lib/ui/Battle.svelte    — owns BattleState, turn loop, selection logic
lib/ui/BattleGrid.svelte— 12×10 CSS grid, renders cells + tokens, emits clicks
lib/ui/UnitToken.svelte — one stack: glyph, count badge, HP bar, highlights
lib/ui/TurnBar.svelte   — vertical bar: current unit + upcoming queue
lib/ui/BattleLog.svelte — humanized event log, auto-scrolls
lib/engine/selectors.ts — pure helpers the UI needs (unit-tested)
```

## Engine selectors (new, TDD)

- `getReachableCells(grid, unit)` — BFS from the unit's position, cost 1 per
  step, bounded by `definition.speed`; occupied/blocked cells are impassable
  (flyers ignore occupants while pathing but can't land on them). Returns empty
  cells only.
- `getMeleeTargets(state, unit)` — living enemy stacks adjacent to the unit.
- `canShoot(unit)` — has shots left; per current engine rules an adjacent enemy
  blocks shooting? Engine has no adjacency restriction, so v1: shooting allowed
  whenever `shotsLeft > 0` (matches AI). Noted as future refinement.

## Interaction model (player turn)

When `currentUnitId` is a player unit:

1. Highlight the active token; tint reachable cells; mark attackable enemies
   (adjacent always; all enemies when the unit can shoot).
2. Click reachable cell → `{type:'move', to}`. Click adjacent enemy →
   `{type:'attack'}`. Click any enemy when shooter → `{type:'shoot'}`
   (adjacent enemy prefers melee, matching HoMM3 instinct).
3. **Wait button** dispatches `{type:'wait'}`.
4. One action per turn (move OR attack), matching the engine and AI. HoMM3's
   combined move+attack needs an engine change — deferred to a later milestone.

Enemy turns run automatically: `aiTakeTurn` → `applyAction` on a ~450 ms timer
per action so the player can follow, with input locked meanwhile.

## State & flow

`Battle.svelte` holds `let state = $state(initBattle(...))` and replaces it
wholesale after every `applyAction` (engine is immutable). Derived (`$derived`)
values: active unit, reachable set, target set, ordered turn bar entries,
humanized log lines. Log lines resolve unit ids to names via `state.units`
(dead stacks stay in the array, so lookups never dangle).

Battle end (`state.result !== 'ongoing'`) shows an overlay with the result and
a "New battle" button that re-inits with a fresh seed.

## Testing

- Vitest for `selectors.ts` (reachability edge cases: blocked ring, speed 0,
  flyer over occupants, board edges) — added to the existing engine suite.
- UI verified by running the app: play a full battle manually via dev server.
