# Leveled Abilities & New Units Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Abilities carry a numeric level (lifesteal 1–15 → 10–150%, defense reduction per-level, …) with additive stacking for leveled skills and once-only semantics for boolean skills (double strike, no retaliation) — plus new units built on leveled variations.

**Architecture:** Level is a *parameter*, not fifteen separate skills. Identity stays where it is (`UnitDef.abilities: string[]` — all 22 `abilities.includes` call sites keep working untouched); a new `abilityLevels?: Record<string, number>` on `UnitDef` carries magnitudes, read through one helper backed by a single engine-side **ability catalog** (`kind: 'leveled' | 'unique'`, `maxLevel`, magnitude formula, default legacy level). Only the 4 existing magnitude hardcodes change. Gauntlet skill grants become `(id → level)` maps that sum additively (capped) for leveled skills and stay once-only for unique ones.

**Tech Stack:** TypeScript, Svelte 5, Vitest.

---

## Design decision (the "does it make sense?" answer)

Yes — with one refinement: **don't define "lifesteal 1" … "lifesteal 15" as 15
skills.** Define one `life_drain` ability whose *instance* has a level; a
catalog formula maps level → magnitude (10%·L). This is what makes the rest
cheap:

- **Additive stacking is just integer addition**: lifesteal 3 + lifesteal 2 =
  lifesteal 5, `min(maxLevel)` capped. No combinatorial skill ids.
- **Boolean skills opt out via `kind: 'unique'`**: double strike, no
  retaliation, flying, no-melee-penalty-style abilities can never be granted
  twice — the draft already excludes owned unique skills per unit, and the
  catalog makes that rule data, not code.
- **New units are content, not code**: a unit def says
  `abilities: ['life_drain'], abilityLevels: { life_drain: 3 }` and the engine
  already knows what 3 means.
- **Back-compat is a default**: existing defs (Vampire, Behemoth) have no
  `abilityLevels`; the catalog's `defaultLevel` reproduces today's numbers
  exactly (Vampire = lifesteal 10 = 100%, Behemoth = defense reduction 8 =
  40%), so no existing battle changes until content opts in.

Rejected alternative: migrating `abilities` to `{ id, level }[]` objects —
touches all 22 identity call sites + every unit def + every test fixture for
zero extra capability. The parallel-map design gets the same power for 4 call
sites.

## Launch catalog

| id | kind | maxLevel | magnitude | legacy default |
|---|---|---|---|---|
| `life_drain` | leveled | 15 | heals `10%·L` of damage dealt | 10 (Vampire = 100%) |
| `defense_reduction` | leveled | 15 | target defense `−5%·L` | 8 (Behemoth = 40%) |
| `bravery` | leveled | 3 | `+L` morale | 1 |
| `fleet_footwork` | leveled | 3 | `+L` speed | 1 |
| `double_strike` | unique | — | second melee blow | — |
| `no_retaliation` | unique | — | — | — |
| (all other existing ability ids) | unique | — | unchanged | — |

---

### Task 1: Engine ability catalog + `abilityLevel` helper

**Files:**
- Create: `src/lib/engine/abilityCatalog.ts`
- Test: `src/lib/engine/__tests__/abilityCatalog.test.ts`

**Step 1: Failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { ABILITY_CATALOG, abilityLevel, addAbilityLevels, isUnique } from '../abilityCatalog';
import { GOBLIN } from '../barbarian';
import type { UnitDef } from '../types';

describe('abilityLevel', () => {
  it('reads the explicit level from abilityLevels', () => {
    const def: UnitDef = { ...GOBLIN, abilities: ['life_drain'], abilityLevels: { life_drain: 3 } };
    expect(abilityLevel(def, 'life_drain')).toBe(3);
  });

  it('falls back to the catalog default for legacy defs (Vampire = 100% lifesteal)', () => {
    const def: UnitDef = { ...GOBLIN, abilities: ['life_drain'] };
    expect(abilityLevel(def, 'life_drain')).toBe(10);
  });

  it('returns 0 when the unit lacks the ability', () => {
    expect(abilityLevel(GOBLIN, 'life_drain')).toBe(0);
  });
});

describe('addAbilityLevels', () => {
  it('adds levels additively, capped at maxLevel', () => {
    expect(addAbilityLevels('life_drain', 14, 3)).toBe(15); // cap 15
    expect(addAbilityLevels('bravery', 1, 1)).toBe(2);
  });

  it('unique abilities never exceed 1', () => {
    expect(addAbilityLevels('double_strike', 1, 1)).toBe(1);
  });
});

describe('catalog shape', () => {
  it('classifies the launch leveled set and defaults everything else to unique', () => {
    for (const id of ['life_drain', 'defense_reduction', 'bravery', 'fleet_footwork']) {
      expect(ABILITY_CATALOG[id]?.kind).toBe('leveled');
    }
    expect(isUnique('double_strike')).toBe(true);
    expect(isUnique('some_future_ability')).toBe(true); // unknown ⇒ unique (safe)
  });
});
```

**Step 2: Run — verify fail** (`npx vitest run src/lib/engine/__tests__/abilityCatalog.test.ts`).

**Step 3: Implement `abilityCatalog.ts`**

```ts
import type { UnitDef } from './types';

export interface AbilityCatalogEntry {
  kind: 'leveled' | 'unique';
  maxLevel: number;          // 1 for unique
  /** Level assumed for legacy defs that list the ability without a level. */
  defaultLevel: number;
}

/** Leveled entries only — any id not listed is 'unique' (safe default: new
 *  engine abilities are once-only until deliberately made leveled here). */
export const ABILITY_CATALOG: Record<string, AbilityCatalogEntry> = {
  life_drain:        { kind: 'leveled', maxLevel: 15, defaultLevel: 10 },
  defense_reduction: { kind: 'leveled', maxLevel: 15, defaultLevel: 8 },
  bravery:           { kind: 'leveled', maxLevel: 3,  defaultLevel: 1 },
  fleet_footwork:    { kind: 'leveled', maxLevel: 3,  defaultLevel: 1 },
};

export const isUnique = (id: string) => (ABILITY_CATALOG[id]?.kind ?? 'unique') === 'unique';

/** Effective level of an ability on a def: explicit, else catalog default,
 *  else 0 when absent. The single read path for every magnitude. */
export function abilityLevel(def: UnitDef, id: string): number {
  if (!def.abilities.includes(id)) return 0;
  return def.abilityLevels?.[id] ?? ABILITY_CATALOG[id]?.defaultLevel ?? 1;
}

/** Additive stacking, capped; unique abilities clamp to 1. */
export function addAbilityLevels(id: string, a: number, b: number): number {
  const max = ABILITY_CATALOG[id]?.kind === 'leveled' ? ABILITY_CATALOG[id].maxLevel : 1;
  return Math.min(max, a + b);
}

/** Magnitude formulas — keep beside the catalog so a new leveled ability adds
 *  its number here, not in combat/battle code. */
export const lifestealFraction = (level: number) => 0.1 * level;      // 10%·L of damage dealt
export const defenseReductionMult = (level: number) => 1 - 0.05 * level; // −5%·L target defense
```

Add to `types.ts` `UnitDef`:

```ts
  /** Per-ability numeric levels; absent entries use the catalog default. */
  abilityLevels?: Record<string, number>;
```

**Step 4: Run — verify pass; full suite** (nothing consumes it yet).

**Step 5: Commit** — `feat: engine ability catalog with leveled/unique kinds`

---

### Task 2: Parameterize the four magnitude call sites

**Files:**
- Modify: `src/lib/engine/combat.ts` (defense_reduction ×0.6 hardcode)
- Modify: `src/lib/engine/battle.ts` (life_drain heal; bravery morale in `slotToStack`)
- Modify: `src/lib/gauntlet/skills.ts` (fleet speed merge — Task 4 finishes this)
- Test: extend `src/lib/engine/__tests__/abilities.test.ts` + `armyBonuses.test.ts`

**Step 1: Failing tests**

- combat: attacker with `defense_reduction` level 4 → defender def ×0.8 (was
  a flat ×0.6); legacy Behemoth (no abilityLevels) still ×0.6.
- battle: striker with `life_drain` level 5 heals `round(damage·0.5/count)`;
  legacy Vampire heals `round(damage·1.0/count)` — the current behavior test
  must keep passing unmodified.
- bravery level 3 → morale 3 at init (clamped ±3).

**Step 2: Verify fail.**

**Step 3: Implement** — replace the hardcodes:

```ts
// combat.ts (was: def = Math.floor(def * 0.6))
const drLevel = abilityLevel(attacker.definition, 'defense_reduction');
if (drLevel > 0) def = Math.floor(def * defenseReductionMult(drLevel));

// battle.ts applyOnHitEffects (was: heal = Math.round(damageDealt / a.count))
const lsLevel = abilityLevel(striker.definition, 'life_drain');
if (lsLevel > 0 && a.count > 0) {
  const heal = Math.round((damageDealt * lifestealFraction(lsLevel)) / a.count);
  …
}

// battle.ts slotToStack (was: includes('bravery') ? 1 : 0)
morale: clampProc(abilityLevel(slot.unit, 'bravery')),
```

**Step 4: Verify pass + full suite** — the legacy-default tests prove no
existing battle changed.

**Step 5: Commit** — `feat: ability magnitudes read from the catalog by level`

---

### Task 3: Leveled gauntlet skill grants (additive, unique-aware)

**Files:**
- Modify: `src/lib/gauntlet/skills.ts`, `src/lib/gauntlet/run.ts`
- Test: `src/lib/gauntlet/__tests__/skills.test.ts`, `run.test.ts`

**Step 1: Failing tests**

- `unitSkills` value shape becomes `Partial<Record<SkillId, number>>` (id →
  granted level). `applySkillPick(run, skill, unitName)` on a unit that
  already has lifesteal 2 → lifesteal 3 (additive), capped at catalog max.
- `applySkillPick` with a *unique* skill the unit owns stays a no-op.
- `skillDraftOptions` keeps offering a leveled skill while any unit is below
  its cap; stops offering a unique skill only when every unit owns it.
- `applyUnitSkills` merges levels into `def.abilityLevels` via
  `addAbilityLevels` on top of the def's own level (a Vampire granted
  lifesteal 2 → level 12), stays idempotent (re-application compares granted
  totals, never re-adds), and still stamps `grantedAbilities`.
- Old-save migration: a legacy `unitSkills: Record<string, SkillId[]>` array
  value is upgraded to `{ id: 1 }` maps by the page loader (test the pure
  `migrateUnitSkills` helper).

**Step 2: Verify fail. Step 3: Implement.** Notable points:

- Grant flow: leveled picks always grant **+1 level** per draft pick (the
  card can read "Lifesteal +10%"); display shows the unit's resulting total.
- `applyUnitSkills`: for each granted `(id, lvl)` — if unique and already in
  `abilities`, skip; else ensure id in `abilities`, set
  `abilityLevels[id] = addAbilityLevels(id, baseLevel, lvl)` where baseLevel
  is the *pre-grant* def level (idempotency: compute from the clean def name
  lookup in `FACTION_UNITS`, not from the possibly-already-merged def).
  Fleet speed bump becomes `+grantedLevel` applied once (same clean-base
  rule).
- `migrateUnitSkills(saved)`: array → `{ [id]: 1 }`.

**Step 4: Verify pass + full suite. Step 5: Commit** —
`feat: leveled skill grants stack additively, unique skills stay once-only`

---

### Task 4: Display — levels and magnitudes in the UI

**Files:**
- Modify: `src/lib/ui/abilities.ts` (`abilityInfo(id, level?)` returns
  magnitude-aware text: "Lifesteal 30% — heals 30% of damage dealt";
  roman-numeral suffix for leveled labels: "Lifesteal III")
- Modify: `src/lib/ui/UnitInfo.svelte` (pass `abilityLevel(def, id)` through;
  taught-violet styling unchanged)
- Modify: `src/routes/gauntlet/+page.svelte` (skill cards + sidebar tags show
  the level the unit would reach: "Lifesteal → II")
- Test: `src/lib/ui/__tests__/` — pure `abilityInfo` cases only.

TDD the `abilityInfo` text cases; Svelte wiring verified in Task 6.
Commit — `feat: ability levels and magnitudes shown across the UI`

---

### Task 5: New units on leveled variations (content)

**Files:**
- Modify: one faction file per unit (e.g. `src/lib/engine/necromancer.ts`,
  `knight.ts`, …), `src/lib/engine/recruit.ts` (UNIT_COSTS)
- Run: `npm run sprites` (scripts/generate-sheets.mjs) so each new unit gets a
  placeholder sheet — without it new units render as empty vectors
- Test: `src/lib/engine/__tests__/factions.test.ts` conventions (roster
  size/tier assertions will guide what to update)

Six showcase units (one per faction, filling tier gaps), each exercising a
leveled variant — exact stats tuned against neighbors in the same file:

| Faction | Unit (tier) | Leveled hook |
|---|---|---|
| Necromancer | Blood Acolyte (T3) | `life_drain` 3 (30%) |
| Barbarian | Ram Rider (T4) | `defense_reduction` 4 (20%) |
| Knight | Standard Bearer (T3) | `bravery` 2 |
| Ranger | Outrider (T2) | `fleet_footwork` 2 |
| Wizard | Siege Golem (T5) | `defense_reduction` 6 (30%) |
| Demon | Blood Fiend (T4) | `life_drain` 5 (50%) |

Steps per unit: add def (+`abilityLevels`), cost, sprite sheet, run faction
tests, adjust roster assertions deliberately (they exist to force this
review). Commit per faction or as one content commit —
`feat: six new units built on leveled ability variants`

---

### Task 6: End-to-end verification

**REQUIRED SUB-SKILL:** `verify` skill. Remember: battles open in a deploy
phase — click `Begin battle ⚔️` before waiting on turn text.

1. Legacy magnitudes hold: Vampire heals as before; Behemoth hits like before.
2. Grant Lifesteal twice to one unit across battles 2 and 5 → UnitInfo shows
   "Lifesteal II · 20%" (violet/taught), log heals scale.
3. Unique skill (Double Strike) never re-offered for a unit that owns it.
4. New units appear in drafts/enemy armies with sprites and correct ability
   text; a Blood Fiend visibly heals half its damage.
5. Old save (array-shaped unitSkills) migrates and plays.

---

## Out of scope

- Rarity/weighting of leveled offers; leveled *enemy* scaling knobs.
- Percent-based display for bravery/fleet (flat text is clearer).
- Reworking proc-chance abilities (death_blow, blind_on_hit…) to levels —
  each is a later one-line catalog entry + one call-site change, by design.
