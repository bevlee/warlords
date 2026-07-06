# Move+Attack, Shooter Range, Unit Info — Design

Three requests: HoMM3-style combined move+attack, visible unit attributes
(attack, defense, damage, speed, range, HP, count, shots), and distinct UI
indicators for attacking vs moving (sword for melee, arrow for shooting).

## Engine (TDD)

- `UnitDef.range: number` — max shooting distance in cells (Chebyshev).
  Orc 7, Cyclops 8, melee units 0. Enforced by selectors and AI; `applyAction`
  stays permissive like the rest of the engine.
- `BattleAction` attack gains optional `moveTo: Pos`: `applyAction` relocates
  the actor (grid occupancy + pos) before resolving the melee, so retaliation
  comes from the new position.
- New selectors:
  - `canShootTarget(unit, target)` — shots left and target within `range`.
  - `getMeleeApproaches(state, unit)` — Map of enemy id → destination:
    `null` when already adjacent, else the first reachable cell (BFS order ≈
    nearest) adjacent to that enemy; enemies out of reach are absent.
- AI upgraded to use both: shoot only when in range, use move+attack when a
  melee approach exists, otherwise walk toward the nearest enemy.

## UI

- Click behaviour on an enemy, in priority order: adjacent → melee;
  in shooting range with shots → shoot; melee approach exists → move+attack.
  Attackable enemies (any of the three) get the red target ring.
- Hovering an attackable enemy shows ⚔️ (melee / move+attack) or 🏹 (shoot)
  on its cell, so attack reads differently from the green move highlight.
- New `UnitInfo` sidebar panel shows the hovered unit (falling back to the
  active unit): glyph, name, count, top-creature HP / max HP, attack, defense,
  damage range, speed, range, shots left/total, abilities. Grid emits hover
  events; glyph map moves to a shared `glyphs.ts`.

## Testing

Vitest first for the engine work (moveTo relocation + retaliation, range
gating, approach map edge cases, AI choices). UI verified by driving a battle
in headless Chrome per the project verify skill.
