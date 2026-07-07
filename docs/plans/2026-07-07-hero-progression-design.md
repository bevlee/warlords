# Hero Progression — Design

Next meta-game piece from `docs/VISION.md`: the hero grows between battles
and survives page reloads.

## Rules

- **XP**: victory grants XP equal to the defeated army's gold value
  (`armyCost(enemyArmy)`); defeat grants nothing. Awarded once per battle,
  including overlay "New battle" replays.
- **Levels**: cumulative XP to *reach* level L is `100·L·(L−1)`
  (level 2 at 200, 3 at 600, 4 at 1200 …) — roughly one level per win early
  on. Each level grants **+1 attack, +1 defense** automatically; mana and
  the hero strike/Lightning already scale with level.
- **Budget**: both sides recruit with `300 + 50·(level−1)` gold, so battles
  grow with the hero.
- Pure engine module `progression.ts`: `xpToReach`, `applyXp(hero, gained)`
  (handles multi-level jumps), `budgetForLevel` — all TDD'd.

## Persistence

- `src/lib/storage.ts` on `idb` (already a dependency): a `kv` store in a
  `warlords` database holding the hero record. Load on mount, save after
  every battle result, plus a **Reset hero** button on the setup screen.

## UI

- Setup screen header gains a hero card: 👑 level, attack/defense/mana,
  an XP progress bar toward the next level, and the battle budget.
- `Battle` gets an `onresult` callback (fired exactly once per battle via a
  guard, re-armed by the overlay's New battle); `+page.svelte` applies XP,
  persists, and the setup screen reflects new stats on return. A "Level up!"
  flash shows on the setup screen after a level gain.

## Testing

TDD `progression.ts` (curve values, single and multi-level jumps with stat
gains, budget scaling). Persistence verified in the browser: win → return to
setup with higher XP/level → reload the page → hero unchanged.
