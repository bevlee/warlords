# Main Mode Fixes — Plan

Three defects in the main (campaign) mode:

1. New heroes can recruit any unit from level 1 — they should start capped at
   tier 2 and unlock higher tiers as they progress.
2. Encounter gold rewards are displayed on the victory screen but never
   applied anywhere — coins have no effect after winning battles.
3. The army selection resets to empty every time the setup screen is shown —
   it should keep the player's last selection by default.

## Current behaviour (root causes)

- **Tiers**: `ArmySetup.svelte` renders the full `FACTION_UNITS[hero.class]`
  roster with no tier check; the only recruiting limit is gold. The free-play
  enemy generator (`recruit.ts:generateEnemyArmy`) likewise draws from the
  full roster.
- **Gold**: `Hero` has no gold field. The recruiting budget is purely
  `budgetForLevel(hero.level)` (300 + 50/level). In `+page.svelte`
  `handleResult` sets `lastReward = { gold: activeEncounter.goldReward }` for
  the result screen and then drops it — nothing is ever credited.
- **Army reset**: `ArmySetup.svelte` keeps `counts` in local `$state({})` and
  the component unmounts on every screen change, so each visit to setup
  starts from zero. Nothing persists the selection.

## 1. Tier unlocks

Add to `engine/progression.ts`:

```ts
/** Highest unit tier the hero may recruit: tier 2 at level 1, +1 per level, capped at 7. */
export function maxRecruitTier(level: number): number {
  return Math.min(7, level + 1);
}
```

Level 1 → tier 2, level 2 → tier 3, … level 6+ → tier 7. One tier per level
keeps pace with the campaign's enemy-tier curve (enemies first field tier 3
in ch1-3, tier 7 in the ch3-4 boss) without the player falling behind, since
campaign XP levels the hero slower than `enemyLevel` grows.

Wiring:

- `ArmySetup.svelte`: compute `maxTier = maxRecruitTier(hero.level)`. Locked
  units stay **visible but disabled** — row greyed out, steppers disabled,
  price replaced by "🔒 Unlocks at level N" (N = `unit.tier − 1`). Seeing the
  locked roster is the progression carrot.
- `canAdd()` additionally requires `unit.tier <= maxTier`.
- Free-play enemy: `generateEnemyArmy(budget, rng, maxTier)` filters
  `BARBARIAN_UNITS` by tier so the practice enemy obeys the same cap as the
  player (campaign enemies already have explicit `enemyTiers` per encounter —
  unchanged).
- On level-up the newly unlocked tier row simply becomes active; no
  migration needed since unlocks only ever grow.

## 2. Gold rewards

Keep the existing "re-buy your full army each battle" model and make gold a
persistent wallet that **adds to** the level budget rather than replacing it:

- `Hero` gains `gold: number` (persisted with the hero as today).
  `DEFAULT_HERO.gold = 0`; the `onMount` migration in `+page.svelte`
  backfills `gold: saved.gold ?? 0` alongside the existing
  `factionSkills` backfill.
- Budget becomes `budgetForLevel(hero.level) + hero.gold`. Add
  `recruitBudget(hero)` to `progression.ts` so the formula lives in one
  place; `+page.svelte`'s `$derived` uses it.
- `handleResult` on a campaign win: `hero.gold += activeEncounter.goldReward`
  before `saveHero`. Free-play wins stay XP-only — the campaign is the
  economy driver, and free-play already scales via level budget. (If
  free-play feels flat later, a small `armyCost(enemyArmy) / 10` gold trickle
  is a one-line follow-up.)
- UI: the setup header's gold line already shows `goldLeft / budget`; add a
  small breakdown tooltip or `(+{hero.gold} won)` suffix so the reward
  visibly lands. The result screen keeps its `+N gold` line — now truthful.
- `handleReset` already rebuilds from `DEFAULT_HERO`, so reset zeroes gold
  for free.
- Found during verification: `saveHero`'s shallow spread left the nested
  `factionSkills` `$state` proxy in the record, so every hero save threw an
  async `DataCloneError` — XP, levels, and (without a fix) gold silently
  never persisted. `saveHero` now deep-plains via JSON round-trip, matching
  `saveRun`.

## 3. Persistent army selection

Lift the selection out of the component and persist it:

- `+page.svelte` owns `savedArmy: ArmySlot[]` (`$state`), passed to
  `ArmySetup` as `initialArmy`. `ArmySetup` seeds `counts` from it on mount
  instead of all-zeroes.
- Update `savedArmy` in `startBattle(army)` — the last army the player
  actually fielded is the thing worth restoring after win, loss, or forfeit.
- Persist it in the existing `warlords` IDB kv store (`storage.ts`:
  `loadArmy` / `saveArmy` / `clearArmy`, key `army`), saved alongside the
  hero and restored in `onMount`, so the selection also survives reloads.
- Restore defensively: when seeding `counts`, drop units not in the current
  faction's roster (faction switched since save), zero units above
  `maxRecruitTier`, and trim counts that exceed the budget (can only happen
  after a hero reset). Cheapest correct trim: walk slots in order, keep what
  still fits.
- The in-component `$effect` that zeroes `counts` when `units` changes stays
  — switching faction genuinely invalidates the picks — but it must not fire
  on the initial mount seeding (guard by tracking the previous class).
- Add a **Clear** button next to the gold readout so wiping the selection is
  an explicit action rather than the default.
- `handleReset` clears the saved army too.

## Testing

- `progression.test.ts`: `maxRecruitTier` boundaries (level 1 → 2, level 6 →
  7, stays 7 beyond), `recruitBudget` includes gold.
- `recruit.test.ts`: `generateEnemyArmy` with a `maxTier` never fields a
  higher-tier unit; existing invariants (budget ceiling, 70% floor) hold at
  `maxTier = 2` where only Goblin/Wolf Rider are legal.
- New `storage`-level test or campaign test covering the win path: campaign
  victory adds `goldReward` to `hero.gold`; free-play victory does not.
- Browser verification (`/verify`): fresh hero sees tiers 3–7 locked; win
  ch1-1, confirm budget grew by 80 and the pre-battle army is still selected
  on returning to setup; Clear empties it; level up unlocks tier 3.

## Out of scope

- Gold as a spend-down wallet (armies consuming gold permanently) — a much
  bigger economy redesign; the additive-budget model fixes the reported bug
  without touching the battle loop.
- Gauntlet mode — it has its own run economy and is unaffected.
