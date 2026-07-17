# Tier Unlocks in the Main Game — Implementation Plan

**Status:** Planned
**Goal:** The main game (free play + campaign army setup) should only let the player
recruit unit tiers they have unlocked through hero levels, instead of offering the
full tier 1–7 roster from level 1.

---

## 1. Problem today

- `ArmySetup.svelte` renders `FACTION_UNITS[hero.class]` unfiltered — all 7 tiers
  are recruitable at hero level 1.
- `budgetForLevel(1)` is 300 gold (`src/lib/engine/progression.ts`), and tier-7
  units cost 100–180 gold (`UNIT_COSTS` in `src/lib/engine/recruit.ts`), so a fresh
  hero can field Behemoths/Devils immediately. This flattens the progression curve
  and makes early campaign encounters trivial.
- Gauntlet mode already tier-gates by act (`ACT_TIERS` in `src/lib/gauntlet/run.ts`)
  and campaign enemies are gated by `Encounter.enemyTiers` — only the *player's*
  main-game recruiting is ungated.

## 2. Design

### 2.1 Unlock schedule

A pure function of hero level, no new persisted state:

| Tier | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|------|---|---|---|---|---|---|---|
| Unlocks at hero level | 1 | 1 | 2 | 4 | 6 | 8 | 10 |

Rationale: `budgetForLevel` grows 50/level, so tier 7 (cost 100–180) unlocks at
level 10 when the budget is 750 — enough to buy a meaningful count (4–7) rather
than a single token creature. Tiers 1–2 stay open so level-1 armies still have
two unit types to mix (mirrors `newRun`'s T1+T2 starting army in gauntlet).

### 2.2 Engine API (`src/lib/engine/progression.ts`)

```ts
/** Hero level at which each tier (1-indexed) becomes recruitable. */
export const TIER_UNLOCK_LEVELS: readonly number[] = [1, 1, 2, 4, 6, 8, 10];

export function tierUnlockLevel(tier: UnitDef['tier']): number {
  return TIER_UNLOCK_LEVELS[tier - 1];
}

export function maxUnlockedTier(level: number): UnitDef['tier'] {
  let t = 1;
  for (let i = 0; i < TIER_UNLOCK_LEVELS.length; i++) {
    if (level >= TIER_UNLOCK_LEVELS[i]) t = i + 1;
  }
  return t as UnitDef['tier'];
}

export function isTierUnlocked(level: number, tier: UnitDef['tier']): boolean {
  return level >= tierUnlockLevel(tier);
}
```

Living in `progression.ts` keeps it next to `budgetForLevel`, which it is tuned
against. Export through `src/lib/engine/index.ts`.

### 2.3 Army validation (defense in depth)

Add to `recruit.ts`:

```ts
/** Drops slots whose tier the hero hasn't unlocked yet. */
export function filterToUnlockedTiers(slots: ArmySlot[], level: number): ArmySlot[] {
  return slots.filter(s => isTierUnlocked(level, s.unit.tier));
}
```

Called in `startBattle` in `src/routes/+page.svelte` before `initBattle`, so a
stale UI state (e.g. hero reset while counts were populated) can never field a
locked unit. The Necromancy `bonusSkeletons` append is tier 1 and unaffected.

### 2.4 Enemy generation parity

Free-play enemies come from `generateEnemyArmy(budget, rng)` in `recruit.ts`,
which currently samples the whole Barbarian roster. Add an optional `maxTier`
parameter (default 7) and filter `BARBARIAN_UNITS` by it in both the pick loop
and the goblin top-up guard:

```ts
export function generateEnemyArmy(budget: number, rng: Rng, maxTier = 7): ArmySlot[]
```

`+page.svelte` passes `maxUnlockedTier(hero.level)` so the free-play enemy is
gated the same way the player is. Campaign enemies (`campaign/encounters.ts`)
already carry explicit `enemyTiers` and are untouched — the campaign is *meant*
to throw higher tiers at you as scripted difficulty. Gauntlet's act gating is
also untouched.

## 3. UI (`ArmySetup.svelte`)

- Keep locked units **visible but disabled** rather than hidden — showing what's
  coming is the reward loop. Render the same row with:
  - `opacity-40 grayscale` on the sprite and stats,
  - the +/− buttons replaced by a lock line: `🔒 Unlocks at level {tierUnlockLevel(unit.tier)}`,
  - row not counted by `canAdd`.
- `canAdd(name)` gains an `isTierUnlocked(hero.level, unit.tier)` guard.
- The `$effect` that resets `counts` on faction switch already zeroes everything;
  also reset when `hero.level` changes downward (hero reset) — cheapest is to key
  the effect on `hero.level` too.
- Show a one-line "New tier unlocked!" note next to the existing `Level up!`
  badge when `lastBattle.levels > 0` and `maxUnlockedTier` increased across the
  level-up (compute from `hero.level - lastBattle.levels`).

## 4. Persistence / migration

None. Unlocks are derived from `hero.level`, which is already persisted in
IndexedDB via `saveHero`. Existing high-level saves see nothing locked; existing
level-1 saves lose access to tiers 3–7, which is the intended behavior change.

## 5. Tests

Extend `src/lib/engine/__tests__/recruit.test.ts` (and add progression cases):

- `maxUnlockedTier` boundaries: level 1 → 2, level 2 → 3, level 3 → 3, level 4 → 4,
  level 10+ → 7.
- `filterToUnlockedTiers` drops a tier-7 slot at level 1, keeps it at level 10.
- `generateEnemyArmy(300, rng, 2)` never returns a unit with `tier > 2` across a
  seeded sweep (e.g. 50 seeds).
- Goblin top-up still fires when `maxTier = 1`.

## 6. Steps

1. Add `TIER_UNLOCK_LEVELS` / `tierUnlockLevel` / `maxUnlockedTier` / `isTierUnlocked`
   to `progression.ts`; re-export from `engine/index.ts`.
2. Thread `maxTier` through `generateEnemyArmy` and add `filterToUnlockedTiers`.
3. Wire both into `+page.svelte` (`startBattle`).
4. Lock rows in `ArmySetup.svelte` + unlock toast.
5. Tests, then a `verify` pass: level-1 Barbarian should see Goblin/Wolf Rider
   recruitable and Orc+ locked.

## 7. Interactions with other planned features

- **Deployment phase** (2026-07-17-deployment-phase-plan.md): operates on the
  already-validated army; no coupling.
- **Augments** (2026-07-17-unit-augments-plan.md): augment picker should also
  hide/lock units whose tier is locked, using the same `isTierUnlocked`.
