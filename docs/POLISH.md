# Polish pass — findings and fixes

Reviewed: docs/VISION.md, the full engine (`types`, `combat`, `battle`, `turnOrder`,
`ai`, `selectors`, `factionSkills`, `barbarian`/`knight`/`wizard`/`factions`,
`recruit`, `progression`, `grid`), the UI layer (`Sprite`, `UnitToken`, `TurnBar`,
`BattleGrid`, `Battle`, `ArmySetup`, `UnitInfo`, `BattleLog`, `+page.svelte`), and
every test file under `src/lib/engine/__tests__/`.

## P1 — must fix

1. **`no_retaliation` checked the wrong stack.** `canRetaliate(defender)` only
   looked at the *defender's* abilities. The HoMM-style "no retaliation"
   ability belongs to the *attacker* ("enemies can't retaliate against my
   hits") — it protects the attacker, not the defender's own no-retaliation
   flag (which is a separate, already-correct case: a no-retaliation unit
   can't retaliate when *it's* attacked). Monk, Naga, and Titan all carry
   `no_retaliation` as attackers; whenever they were forced into melee
   (shooting blocked by an adjacent enemy), the enemy retaliated anyway.
   Fix: `canRetaliate(defender, attacker)` now also checks the attacker's
   abilities.
2. **Griffin's `unlimited_retaliation` was never implemented.** It's declared
   in `knight.ts` but `canRetaliate` never checked for it, so Griffins behaved
   like every other unit (one retaliation per turn). Fixed in the same
   function.
3. **14 of 21 units have no sprite.** `Sprite.svelte` only draws the seven
   Barbarian units (plus Hero/Rock); every Knight and Wizard unit falls
   through to the generic "?" circle — in both the army-setup roster and on
   the battlefield. Added distinct SVG standees for all 7 Knight and 7 Wizard
   units.

## P2 — should fix

4. **Sorcery/Intelligence/Mysticism/Tactics were unlockable but inert**,
   despite being wired up in `factionSkills.ts` and unlocked via level-ups —
   VISION.md already flagged these as the last combat hookups outstanding.
   Wired all four:
   - *Sorcery*: `getSorceryMultiplier` now scales Lightning damage.
   - *Intelligence*: adds to the hero's max mana (battle init and the
     army-setup display, which was hard-coding `5 + 3·level` in two places).
   - *Mysticism*: regenerates mana at the start of each new round.
   - *Tactics*: shifts the Knight's starting column toward the enemy by the
     skill level.
5. **No Forfeit button.** A losing player had to fight to the last stack
   with no way to concede. Added a Forfeit control next to Wait/Defend.
6. **No battle speed control.** AI turn delay was a hard-coded 450 ms
   constant. Added Slow/Normal/Fast controls.
7. **Balance**: Wizard Titan (6 shots) and Knight Champion (speed 9) were
   flagged as outliers versus the rest of their tier-7 peers — see Balance
   notes below.

## P3 — noted, not fixed (out of scope for this pass)

- `magic_resistance` (Stone Golem) and `no_melee_penalty` (Mage) are inert
  flavor abilities. `no_melee_penalty` is a true no-op today because the
  engine has no shooter-forced-into-melee penalty to begin with, so there's
  nothing to negate. `magic_resistance` would need a general spell-damage
  hook; deferred as a small future item.
- `isLarge` is unused — real 2-cell creature occupancy (attacking from either
  cell, blocking two tiles) is a grid-model change, not a small polish item.
- `Hero.statPoints` is dead (never incremented, no allocation UI). Left as-is
  since removing a persisted-hero field needs a migration story.
- Behemoth's `defense_reduction` (checked per the review prompt for stacking
  with hero attack): it composes with hero attack through the normal
  atk/defense modifier, but that modifier is capped at ±20 either way, so the
  combination cannot exceed the same +100% cap any other big attack stat
  would hit. Not a stacking bug — left unchanged.

## Balance changes

- **Wizard Titan**: 6 shots → 3. 300 HP / 50–65 ranged / no-retaliation was
  already the strongest tier-7 profile; three unanswerable ranged volleys per
  battle is plenty without approaching "removes a stack a turn all fight."
- **Knight Champion**: speed 9 → 7. At 9 it was tied with Thunderbird for the
  fastest unit in the game *and* had jousting, the highest melee stat line,
  and 130 HP — the speed was doing too much work on top of everything else.
  Still faster than Cavalier's 8 is not preserved (7 < 8) by design: Champion
  wins on every other stat, so trading a bit of speed keeps jousting-chargers
  from being a strict upgrade in every dimension.

## Verification

- `npx vitest run` — all tests green (new coverage added for the retaliation
  fixes and the faction-skill hookups).
- `npm run build` — production build succeeds.
