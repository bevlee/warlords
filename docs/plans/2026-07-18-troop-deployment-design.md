# Pre-Combat Troop Deployment — Design

Let the player position (and split) their unit stacks on the battlefield
before combat starts, instead of the current fixed auto-placement.

## Goal

Every battle opens in a **deploy phase** on the real board, pre-filled with
the current auto layout. The player may rearrange and split their stacks
within a left-side zone, then press **Begin battle**. Pressing Begin with no
changes is a zero-cost quick start. Applies to both the gauntlet and the main
game (shared `Battle.svelte`).

## Zone & phase model

- **Deploy zone:** the left columns only — base cols `0–2`, extended forward by
  the Knight **Tactics** skill (`0 … 2 + tacticsShift`). All rows open. Enemy
  stacks and obstacles are visible but not placeable-onto. Gated by a pure
  `isInDeployZone(pos, tacticsShift)`.
- **Phase:** `BattleState` gains `phase: 'deploy' | 'combat'`. `initBattle`
  returns `'deploy'` with the auto layout already applied. The combat loop (AI
  timer + player-turn input, currently gated on `result === 'ongoing'`) also
  requires `phase === 'combat'`, so nothing acts and ATB doesn't advance until
  Begin.

## Placement ops (pure engine functions)

- `deployMove(state, unitId, to)` — move one of your stacks to cell `to`. Empty
  in-zone cell → move; another of your stacks → swap. Updates `pos` + grid
  occupancy. Rejects (no-op) if `to` is out of zone, holds an enemy, or the
  unit isn't yours.
- `splitStack(state, unitId, amount, to)` — peel `amount` (`1 ≤ amount <
  source.count`) off `unitId` into a new same-definition stack at empty in-zone
  cell `to`: fresh id, full hp, full shots, neutral morale/luck/atb; decrement
  the source; update grid. Rejects if amount out of range, `to` not an empty
  in-zone cell, or the field-stack cap is reached.
- `beginCombat(state)` — flip `phase` to `'combat'`. The atb head-start seeding
  stays in `initBattle` (position-independent).
- `resetDeploy(state, hero)` — restore the auto layout (re-run `slotToStack`
  positions), collapsing all splits.

**Cap:** total on-field player stacks capped at **7** (HoMM-style,
board-readability); split refused past that.

## Merge-back (key correctness point)

Splits are battle-scoped; the persistent army must stay one entry per unit
type. `survivorsFrom` changes to **group surviving player stacks by unit name
and sum counts** (excluding summoned allies), instead of one slot per stack.
Without this, splitting permanently fragments the gauntlet army (duplicate
"Goblin" slots, breaking the 6-slot cap, `armyCost`, and draft merging).

## Interaction & UI (Battle.svelte + BattleGrid.svelte, deploy phase only)

- Banner replaces the turn status: "Deploy your troops — click a stack, then a
  highlighted cell." Buttons: **Begin battle** (primary), **Reset**.
- Empty in-zone cells get the reachable-cell highlight (`bg-slate-500/50`).
  Your stacks are click-selectable (selected → ring).
- Click flow: click your stack → select; click highlighted empty cell → move;
  click another of your stacks → swap; click selected stack again → deselect.
- Split: with a stack selected, a split panel shows a slider/stepper (`1 …
  count−1`, default `floor(count/2)`, requires `count ≥ 2`); set amount, then
  click an empty in-zone cell to place the new stack.
- Hero standee, obstacles, damage-preview, and aim systems are suppressed
  during deploy. On Begin, `beginCombat` flips the phase; the normal combat
  loop resumes next tick. Whole-cell clicks only — sidesteps the tilted-board
  cursor-aim reliability concerns.
- `Battle.svelte` owns `selectedDeployId` + split-amount UI state; `BattleGrid`
  gets a `deployable(cell)` predicate for highlighting and emits
  `ondeployclick(pos)` in place of combat handlers while deploying.

## Testing

- Engine: `isInDeployZone` (with/without Tactics); `deployMove` (move to empty,
  swap, reject out-of-zone/enemy/foreign, grid updated); `splitStack` (valid
  peel, source decremented, new-stack fields, reject over-cap/bad-amount/
  occupied); `beginCombat` phase flip; `resetDeploy` restores; `survivorsFrom`
  merges same-unit split stacks back into one slot.
- E2e (verify skill): deploy banner + auto layout on battle open; move a stack;
  swap two; split a stack onto an empty cell; Reset restores; Begin starts
  combat and the first turn resolves; quick-start (Begin, no changes) works.

## Out of scope

- Placing outside the left zone; enemy-side deployment.
- Persisting a chosen layout across battles (each battle starts from auto).
- Merging two different-unit stacks (only same-unit splits are reversed on
  merge-back).
- Multi-cell footprints for large units (they remain single-cell, as today).
