# Unit Augments — Implementation Plan

**Status:** Planned
**Goal:** Let the player permanently augment unit types with stat boosts or extra
abilities, spent from points earned by levelling, persisted with the hero.

---

## 1. Where augments fit in the current architecture

Every stack carries its own copy of the unit definition (`UnitStack.definition:
UnitDef` in `src/lib/engine/types.ts`), and the whole engine — damage
(`combat.ts`), abilities (`battle.ts` reads `definition.abilities`), movement,
UI (`UnitInfo.svelte`, `ArmySetup.svelte`) — reads stats from that embedded
definition. That means augments need **zero engine changes**: transform the
`UnitDef` inside each `ArmySlot` *before* `initBattle`, and everything downstream
(HP, damage rolls, `slow_on_hit` procs, flying pathing) picks it up for free.

One caveat: `UNIT_COSTS` is keyed by `unit.name` (`recruit.ts`), so augments must
never rename units. They don't.

## 2. Data model

### 2.1 Augment catalogue (`src/lib/engine/augments.ts`, new)

```ts
export interface AugmentDef {
  id: string;
  name: string;
  description: string;
  /** Flat stat deltas applied onto the base UnitDef. */
  stats?: Partial<Pick<UnitDef,
    'hp' | 'attack' | 'defense' | 'minDamage' | 'maxDamage' | 'speed' | 'initiative' | 'shots'>>;
  /** Ability id appended to definition.abilities (deduped). */
  grantsAbility?: string;
  /** Restrict to shooters / melee / a tier band; undefined = any unit. */
  requires?: { shooter?: boolean; minTier?: number; maxTier?: number };
}
```

Initial catalogue (all engine mechanics already exist — no new combat code):

| id | Name | Effect | Requires |
|---|---|---|---|
| `veterancy` | Veterancy | +2 attack | — |
| `plating` | Plating | +2 defense, +15% hp (rounded) | — |
| `fleetfoot` | Fleet of Foot | +1 speed | — |
| `keen_edge` | Keen Edge | +1 min/max damage | — |
| `drilled` | Drilled | +1 initiative | — |
| `deep_quiver` | Deep Quiver | +4 shots | shooter |
| `savagery` | Savagery | grants `no_retaliation` | tier ≤ 3 |
| `war_pinions` | War Pinions | grants `flying` | tier ≤ 4, melee |

Percentage HP is expressed as a computed flat delta at application time
(`Math.round(def.hp * 0.15)`) so `stats` stays a plain delta record.

### 2.2 Hero state (`types.ts`)

```ts
export interface Hero {
  // ...existing fields
  augmentPoints?: number;                      // unspent
  unitAugments?: Record<string, string[]>;     // unit name -> augment ids (max 2)
}
```

Optional fields keep old IndexedDB saves loading; `+page.svelte`'s existing
migration spot (`onMount`, where `factionSkills` is backfilled) defaults them
to `0` / `{}`.

Earning: `applyXp` in `progression.ts` grants **+1 augmentPoint per level
gained** (alongside the existing +1 attack/defense). Retroactive backfill for
existing saves: on migration set `augmentPoints = hero.level - 1 - totalSpent`.

Cap: **2 augments per unit type**, no duplicates. Augments are keyed by unit
name, so they apply across factions if two factions ever share a name (they
don't today).

## 3. Application function

```ts
// augments.ts
export function augmentedDef(def: UnitDef, ids: string[]): UnitDef {
  return ids.reduce((d, id) => {
    const a = AUGMENTS[id];
    if (!a) return d;
    const stats = resolveStats(a, d); // expands % hp to flat
    return {
      ...d,
      ...Object.fromEntries(Object.entries(stats ?? {}).map(([k, v]) => [k, (d as any)[k] + v])),
      abilities: a.grantsAbility && !d.abilities.includes(a.grantsAbility)
        ? [...d.abilities, a.grantsAbility]
        : d.abilities,
    };
  }, def);
}

export function applyAugmentsToArmy(army: ArmySlot[], hero: Hero): ArmySlot[] {
  return army.map(s => {
    const ids = hero.unitAugments?.[s.unit.name] ?? [];
    return ids.length ? { ...s, unit: augmentedDef(s.unit, ids) } : s;
  });
}
```

Call sites:

- `startBattle` in `src/routes/+page.svelte`: `playerArmy = applyAugmentsToArmy(army, hero)`
  (after the Necromancy skeleton append — augmented Skeletons apply too, which
  is fine and consistent).
- Gauntlet mode: **not** wired in v1; gauntlet has its own elite/talent design
  (see `docs/plans/roguelite-draft-mode.md` §2.1) and its own per-run hero.

Because `slotToStack` in `battle.ts` sets `hp: slot.unit.hp` and
`shotsLeft: slot.unit.shots` from the definition, augmented HP/shots initialize
correctly with no engine edits. Enemy armies are never augmented.

## 4. Spending UI (`ArmySetup.svelte` + new `AugmentPicker.svelte`)

- Hero header row gains `✦ {hero.augmentPoints} augment points` when > 0.
- Each unlocked unit row gets a small `✦` button (badge shows current count,
  e.g. `✦1/2`). Clicking opens `AugmentPicker.svelte`, a modal listing the
  catalogue filtered by `requires` (shooter check: `unit.shots > 0`), each
  entry costing 1 point, already-owned entries shown checked and non-refundable
  in v1 (refunds are a balance hole with per-battle rebuying of armies —
  revisit later).
- Picking calls back to `+page.svelte`, which updates `hero` immutably and
  `saveHero(hero)`.
- Unit stat line in the row and in `UnitInfo.svelte` reflects augments
  automatically **if** the displayed `UnitDef` is the augmented one — so
  `ArmySetup`'s `units` derivation becomes
  `FACTION_UNITS[hero.class].map(u => augmentedDef(u, hero.unitAugments?.[u.name] ?? []))`.
  Costs still resolve by name, so this is safe.
- Augmented stacks in battle: `UnitInfo.svelte` already reads
  `stack.definition`, so the modal shows boosted stats; add a small `✦` marker
  next to the name when the def differs from the roster base (pass a flag on
  the slot rather than deep-comparing).

## 5. Tests (`src/lib/engine/__tests__/augments.test.ts`, new)

- `augmentedDef` applies flat deltas; +15% hp rounds correctly; unknown id is a
  no-op; ability grant dedupes.
- `applyAugmentsToArmy` leaves un-augmented slots referentially intact.
- Integration: `initBattle` with a `plating`-augmented Goblin slot produces a
  stack with boosted `hp` and `definition.defense`.
- `applyXp` grants 1 point per level across a multi-level gain.
- Requires-gating: `deep_quiver` rejected for a melee unit (validation lives in
  the picker helper `availableAugments(unit, owned)` — test that helper).

## 6. Steps

1. `augments.ts` (catalogue + `augmentedDef` + `applyAugmentsToArmy` +
   `availableAugments`), export via `engine/index.ts`.
2. `Hero` fields + migration in `+page.svelte` `onMount`, `applyXp` point grant.
3. Wire `applyAugmentsToArmy` into `startBattle`.
4. `AugmentPicker.svelte` + `ArmySetup.svelte` row button and header points.
5. Tests, `verify` run: buy Plating for Goblins, confirm boosted HP in battle
   modal and correct kill math.

## 7. Balance notes / open questions

- 1 point/level with 2-slot caps means a level-10 hero has 9 points ≈ 4–5 fully
  augmented types — deliberate scarcity; tune after playtests.
- Ability grants are much stronger than stat boosts; if that proves true in
  play, make them cost 2 points (catalogue gains a `cost` field — trivial).
- The **neutral structures** plan (2026-07-17-neutral-structures-plan.md)
  proposes item drops; if hero items land, they should reuse `AugmentDef`'s
  stat-delta shape for army-wide effects rather than inventing a second stat
  system.
