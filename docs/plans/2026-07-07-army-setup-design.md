# Army Setup Screen — Design

First meta-game piece from `docs/VISION.md`: replace the hardcoded rosters in
`+page.svelte` with a recruiting screen, closing the loop
setup → battle → result → setup.

## Recruiting model

- A **gold budget** (300) buys creatures at tier-based prices:
  Goblin 3, Wolf Rider 8, Orc 12, Ogre 25, Cyclops 40, Thunderbird 60,
  Behemoth 100 (`UNIT_COSTS` in a new engine module `recruit.ts`).
- Up to **6 stacks** (the battle grid spawns six rows per side); any subset of
  the Barbarian roster with count > 0.
- `armyCost(slots)` and `generateEnemyArmy(budget, rng)` are pure and tested:
  the enemy is seeded-random, spends at least 70% of the budget, never
  exceeds it, and fields 1–6 stacks.
- Hero stays the fixed level-1 barbarian for now (levelling is a later
  milestone).

## UI / flow

- `+page.svelte` holds `screen: 'setup' | 'battle'` plus the chosen army and
  a battle seed.
- `ArmySetup.svelte`: one row per unit type — glyph, name, key stats, price —
  with −/+ steppers (and +5 for cheap stacks); gold remaining; stack count
  x/6; Start battle (disabled until at least one creature is bought).
- The battle-end overlay gains a **Change army** button next to New battle;
  New battle keeps the same armies with a fresh seed, Change army returns to
  setup (fresh enemy roll).

## Testing

TDD `recruit.ts` (cost math, generation invariants, determinism per seed).
Browser verification drives the full loop: recruit → battle → victory →
change army → recruit again.
