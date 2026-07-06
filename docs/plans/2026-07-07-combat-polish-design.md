# Combat Polish: Shooter Melee-Block, Defend, Obstacles — Design

Gaps #2–4 from `docs/VISION.md`, per LordsWM rules.

## Shooter melee-block

LordsWM: "The shooting stacks lose their ability to shoot if there is an
enemy stack directly adjacent to them"; Shift+click forces melee instead.

- New selector `isShootingBlocked(state, unit)` — any living enemy at
  Chebyshev 1. `applyAction` stays permissive (engine style); the rule is
  enforced by AI and UI.
- AI: shoot only when in range **and** not blocked; blocked shooters fall
  through to melee/approach.
- UI: a blocked shooter's targets get ⚔️ instead of 🏹; status line says
  shooting is blocked. Shift+clicking an enemy forces melee targeting even
  when a shot is available (parity with LordsWM's Shift).

## Defend

- New action `{ type: 'defend' }`: the stack takes a defensive stance —
  +30% defense (floored) against damage until the start of its own next
  turn. `UnitStack.isDefending`, cleared by `advanceTurn` alongside the
  retaliation refresh; `defend` log event; re-enters the ATB scale at 0.
- UI: Defend button next to Wait.

## Obstacles

- `initBattle` scatters seeded impassable rocks (~7) in the middle columns
  (3–8), never on spawn columns or occupied cells, from the battle's rng —
  deterministic per seed. Pathfinding/reachability already respect
  `blocked`.
- UI: blocked cells render a 🪨 standee; clicks are no-ops; aria-label
  "obstacle at col,row".

## Testing

TDD per feature: blocked-shooter selector + AI choice; defend damage
reduction and flag lifecycle; obstacle placement invariants (count, columns,
determinism, never under units). Browser verification per the verify skill.
