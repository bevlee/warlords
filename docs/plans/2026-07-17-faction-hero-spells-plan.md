# Faction-Unique Hero Spells & Abilities — Implementation Plan

**Status:** Planned
**Goal:** Every faction's hero gets a unique spell (and casting identity) instead
of the shared Lightning/Bloodlust/Stoneskin kit. Different per faction, built on
the status-effect machinery the engine already has.

---

## 1. Current state

- `SpellId = 'lightning' | 'bloodlust' | 'stoneskin'` (`types.ts`), with costs
  and friendliness in the `SPELLS` record and **all resolution logic inlined in
  `applyAction`'s `cast` branch** (`battle.ts:338-384`).
- `spellPreview` special-cases Lightning. `SpellBook.svelte` renders a fixed
  three-spell bar. Sorcery (`getSorceryMultiplier`) multiplies Lightning only.
- The enemy side has **no hero actor** (`initBattle` only creates the player's
  hero stack), so spells remain player-only; the AI needs no changes.
- Reusable status machinery already on `UnitStack`: `attackBuff`, `defenseBuff`,
  `morale`, `luck`, `speedPenalty`, `blindedUntilRound`, `burnDamage`/
  `burnRoundsLeft`, `boundUntilRound` — plus splash-damage precedent in the Lich
  `area_shot` block and healing precedent in `life_drain`.

## 2. Design: spell registry

### 2.1 Data model (`src/lib/engine/spells.ts`, new)

```ts
export type SpellTarget = 'enemy' | 'friendly' | 'friendly_shooter';

export interface SpellResolution {
  units: UnitStack[];          // full replacement array
  hero?: Partial<Hero>;        // e.g. nothing today; reserved
  events: BattleEvent[];       // appended to the log
  summons?: UnitStack[];       // new stacks to place (Raise Dead)
}

export interface SpellDef {
  id: SpellId;
  name: string;
  icon: string;                // emoji for SpellBook v1
  cost: number;
  target: SpellTarget;
  factions: FactionClass[] | 'all';
  unlockLevel: number;         // hero level gating, like faction skills
  /** Damage forecast for the aiming tooltip; null for pure buffs. */
  preview?(hero: Hero, target: UnitStack): DamagePreview | null;
  resolve(state: BattleState, target: UnitStack, rng: Rng): SpellResolution;
}
```

`applyAction`'s cast branch shrinks to: validate (mana, target side/liveness via
`def.target`, faction knows spell) → `def.resolve` → apply `SpellResolution` →
deduct mana → log. Lightning/Bloodlust/Stoneskin move into the registry
unchanged in behavior, which is the refactor's regression baseline.

`getKnownSpells(hero): SpellDef[]` = spells whose `factions` includes
`hero.class` (or `'all'`) and `hero.level >= unlockLevel`. Exported for
`SpellBook.svelte` and validation.

Sorcery: apply `getSorceryMultiplier(hero)` centrally to any resolution that
reports damage (resolvers compute base damage; the dispatcher scales it) so
Wizard/Necromancer Sorcery automatically covers new damage spells.

### 2.2 The spell set

Shared (all factions, as today): **Lightning** (3), **Bloodlust** (2),
**Stoneskin** (2).

One unique spell per faction, unlocked at hero level 3, chosen so each one
reuses an existing mechanic (engine-new code is marked):

| Faction | Spell | Cost | Target | Effect | Mechanism |
|---|---|---|---|---|---|
| Barbarian | **Battle Cry** | 4 | friendly (whole army) | all friendly stacks +2 `attackBuff`, +1 morale | existing fields, loop over own units |
| Knight | **Healing Light** | 4 | friendly | restore `15 + 5·level` HP, reviving fallen creatures | **new** `reviveHeal` helper in `combat.ts` (inverse of `applyDamage`: fills top-creature hp, then `count += floor(rest / def.hp)` capped at a recorded `startCount`) |
| Wizard | **Fireball** | 5 | enemy | `8 + 4·level` damage + 50% splash to adjacent enemies + burn 2 rounds | splash pattern copied from the Lich `area_shot` block; burn fields exist |
| Necromancer | **Raise Dead** | 5 | friendly (undead) | add `floor((20 + 10·level) / def.hp)` creatures to a friendly Necromancer-faction stack, up to its battle-start count | needs `startCount` on `UnitStack` (also used by Healing Light) |
| Ranger | **Wasp Swarm** | 3 | enemy | `6 + 3·level` damage + `speedPenalty +2` until round start | existing `speedPenalty` (cleared at round start already) |
| Demon | **Immolate** | 4 | enemy | 5 immediate damage + burn `4 + 2·level`/turn for 2 rounds, Fire Magic scales it | existing burn fields + `applyFireMagicBonus` |

Whole-army targeting (Battle Cry): `target: 'friendly'` with the resolver
ignoring the specific target and buffing all — v1 keeps the click-a-friendly
gesture so `SpellBook`/cursor code needs no new targeting mode. A `'none'`
target mode (cast instantly) is a v1.1 polish item.

### 2.3 New engine pieces (kept minimal)

1. `UnitStack.startCount?: number` — set in `slotToStack`/deployment building;
   used as the revive/raise ceiling. Migration-free (battles aren't persisted).
2. `reviveHeal(stack, hp): UnitStack` in `combat.ts` + unit tests.
3. Summon placement helper (only if Raise Dead is later changed to summon new
   stacks — current design mutates an existing stack, so **no summoning code in
   v1**; the `summons` field in `SpellResolution` is reserved but unused).

## 3. UI changes

- `SpellBook.svelte`: render `getKnownSpells(hero)` instead of the fixed trio;
  show cost, icon, greyed when unaffordable; tooltip from `description`.
  Locked-but-coming spells shown with `🔒 lv 3` (same pattern as the tier-unlock
  plan) to advertise progression.
- Targeting cursors: reuse existing sparkle cursor for all casts; enemy-target
  spells reuse the damage-preview tooltip via `def.preview`.
- `BattleLog.svelte`: `cast` events already carry `spell`; add display strings
  for the six new ids; burn/slow applications already log via `status` events.
- `BattleFx.svelte`: map new spells onto existing effect primitives (lightning
  flash → recolor for Fireball/Immolate; buff sparkle for Battle Cry/Healing).
  New bespoke animations are out of scope.

## 4. Validation matrix (dispatcher, replaces inline checks at `battle.ts:338`)

Reject keeping the turn (as today) when: caster isn't hero · unknown/unknown-to-
faction spell · insufficient mana · dead/hero target · target side mismatch vs
`def.target` · Raise Dead on a non-Necromancer-roster stack or one at
`startCount` · Healing Light on an undamaged stack (count = startCount and
hp = def.hp).

## 5. Tests (`src/lib/engine/__tests__/spells.test.ts`, new)

- Registry refactor regression: lightning/bloodlust/stoneskin produce identical
  states to the current implementation for a fixed seed (write these *before*
  the refactor).
- `getKnownSpells`: barbarian lv1 → 3 spells; lv3 → +Battle Cry; wizard never
  sees Immolate.
- `reviveHeal` math: partial top-creature heal, multi-revive, `startCount` cap.
- Each unique spell: one deterministic resolution test (damage numbers, status
  fields set, mana deducted, log events emitted).
- Sorcery multiplier applies to Fireball/Immolate/Wasp Swarm damage.

## 6. Steps

1. Characterization tests for the existing three spells.
2. `spells.ts` registry + dispatcher refactor of `applyAction`; `spellPreview`
   delegates to `def.preview`. All existing tests green.
3. `startCount` + `reviveHeal`.
4. Implement the six uniques, tests per spell.
5. `SpellBook.svelte` dynamic rendering, log strings, fx mapping.
6. `verify` run per caster-heavy faction (Wizard Fireball splash, Necromancer
   Raise Dead ceiling, Demon Immolate + Fire Magic interaction).

## 7. Future hooks

- The registry is the natural home for the gauntlet plan's spell cards
  (`docs/plans/roguelite-draft-mode.md` §2.3) — same `SpellDef`, availability
  driven by run state instead of faction.
- Deferred unit-cast abilities (Demon Gate, Devil Teleport, Pit Fiend Haste,
  per VISION) can reuse `SpellResolution` with a unit caster once needed.
- An enemy hero actor would need AI cast selection; explicitly out of scope.
