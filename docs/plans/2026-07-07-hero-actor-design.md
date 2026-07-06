# Hero as a Battlefield Actor — Design

Last combat gap in `docs/VISION.md`: the hero fights, LordsWM/HoMM5-style —
a combatant with its own place on the ATB scale, standing on the flank,
striking once per turn, untargetable.

## Engine model

- `initBattle` adds a **hero stack**: `isHero: true` on `UnitStack`
  (optional flag), side `player`, count 1, positioned **off-grid** at
  `{col: -2, row: 4}` (never placed on the grid, ≥2 cells from any cell so
  the melee-block rule can't trigger). Synthesized definition:
  - `name: 'Hero'`, `initiative: 10`, `speed: 0` (can't move),
  - `attack: 0` (the hero's real attack already applies to player units via
    the `heroAttack` damage bonus — a nonzero value would double-dip),
  - `minDamage: 2 + 3·level`, `maxDamage: 5 + 6·level`, `shots: 9999`,
    `range: 99` — the strike is a whole-board ranged attack, so the
    existing `shoot` action gives no retaliation for free.
- **Untargetable**: AI target selection, `getMeleeTargets`,
  `getMeleeApproaches`, and the melee-block check all skip `isHero` stacks.
- **Battle end**: a side with only its hero alive has lost —
  `checkBattleEnd` ignores hero stacks.
- Enemy armies have no hero for now; the enemy AI is never asked to play one.

## UI

- Hero renders as a **flank portrait** beside the board (👑 standee, attack/
  defense shown), amber-highlighted on its turn; it also appears in the ATB
  bar via `predictTurnOrder` like any stack.
- On the hero's turn every living enemy is a 🏹-style target; status reads
  "Your hero's turn — click any enemy to strike." Wait/Defend work normally.
- Log lines say "your hero" / "enemy hero" instead of pluralized stack names.

## Testing

TDD: hero present on the ATB forecast and absent from the grid; AI ignores
the hero even when nearest; selectors exclude hero targets; hero strike does
damage with no retaliation; battle ends when the army (not hero) dies.
