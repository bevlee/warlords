# Unit Skills (Per-Unit Ability Buffs) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Every 3rd battle starting from the 2nd (battles 2, 5, 8, …), the post-battle draft also offers 3 skill cards; the player picks one skill and assigns it to one of their unit types, permanently granting that ability to every stack of that unit for the rest of the run.

**Architecture:** A new pure module `src/lib/gauntlet/skills.ts` holds the skill catalog, seeded offers, and an idempotent `applyUnitSkills(army, unitSkills)` that merges granted abilities into unit definitions right before each battle. `RunState` gains `unitSkills` (unitName → ability ids) and `pendingSkills`, following the artifacts pattern exactly (`pendingItems` fires on `battlesWon % 3 === 0`; skills fire on `% 3 === 2` — the two never collide). Two abilities need engine work: `double_strike` (new melee mechanic) and `bravery` (+1 morale at battle init); the rest reuse existing ability machinery (`life_drain`, `no_retaliation`) or definition merging (`fleet_footwork` = +1 speed).

**Tech Stack:** TypeScript, Svelte 5 (runes), Vitest.

---

## Context for the implementer

- **Abilities are strings on `UnitDef.abilities`** ([types.ts](../../src/lib/engine/types.ts)); the engine checks them with `abilities.includes(...)` — granting an existing ability to a new unit is free (`life_drain` heals-on-hit lives in `applyOnHitEffects`, `no_retaliation` in `canRetaliate`).
- **Melee resolution** is [battle.ts:518-578](../../src/lib/engine/battle.ts): hit → death check → battle-end check → retaliation. `double_strike` inserts a second hit after the retaliation block.
- **initBattle player-stack mapping** ([battle.ts:~200](../../src/lib/engine/battle.ts)) already bumps morale from hero skills with a ±3 clamp (`clampProc`) — `bravery` hooks the same spot, but engine-side off the *definition* so it applies to any stack carrying the ability.
- **The artifacts pattern to mirror** ([run.ts](../../src/lib/gauntlet/run.ts), [items.ts](../../src/lib/gauntlet/items.ts)): `pendingItems` set in `recordBattle`, one-of-each draft semantics (`applyPick`/`applyItemPick` each clear only their own slot; `status` returns to `'map'` when nothing is pending), tolerant load of missing fields in the gauntlet page's `onMount`.
- **UI ability descriptions** come from `ABILITY_INFO` in [src/lib/ui/abilities.ts](../../src/lib/ui/abilities.ts) — every new ability id needs an entry or the draft cards/UnitInfo show nothing.
- **survivorsFrom interaction:** survivors carry the *merged* definitions back into `run.army`, then `applyUnitSkills` runs again next battle — so the merge MUST be idempotent (skip abilities already present; only add +1 speed when adding `fleet_footwork`, never when it's already on the def).
- **Excluded by design:** melee/ranged-penalty style abilities are not in the catalog (user decision). Also excluded from *offers*: any skill every army unit already has.

**Skill catalog** (ids are engine ability strings):

| id | Name | Effect | Engine status |
|---|---|---|---|
| `life_drain` | Lifesteal | Heals the stack for damage dealt on hit | exists (Vampire) |
| `double_strike` | Double Strike | Melee attacks hit a second time after retaliation | **new** |
| `no_retaliation` | No Retaliation | Targets cannot retaliate | exists |
| `fleet_footwork` | Fleet Footwork | +1 speed | merge-time (+1 to def.speed) |
| `bravery` | Bravery | +1 morale | **new** (initBattle bump) |

---

### Task 1: `double_strike` engine ability

**Files:**
- Modify: `src/lib/engine/battle.ts:562-578` (after the retaliation block)
- Test: `src/lib/engine/__tests__/abilities.test.ts`

**Step 1: Write the failing tests** — append to `abilities.test.ts` (reuse its `makeStack`/`sequenceRng` helpers; build a minimal two-unit battle via `initBattle` + `applyAction` the way `factionWiring.test.ts` does):

```ts
describe('Double strike', () => {
  const DOUBLE: UnitDef = { ...GOBLIN, name: 'Doubler', attack: 5, minDamage: 2, maxDamage: 2, abilities: ['double_strike'] };

  function meleeBattle(attackerDef: UnitDef) {
    const hero: Hero = { class: 'barbarian', level: 1, xp: 0, attack: 0, defense: 0, statPoints: 0, factionSkills: [] };
    let s = initBattle([{ unit: attackerDef, count: 5 }], [{ unit: { ...GOBLIN, hp: 200, defense: 0 }, count: 1 }], hero, 7);
    // Walk turns until the player stack is current, then attack adjacent-most enemy…
    // (follow the loop pattern in factionWiring.test.ts:118)
    return s;
  }

  it('logs two attack entries for one melee action', () => {
    // …drive one attack action with the double_strike unit adjacent to the enemy
    // assert: log contains exactly two entries of type 'attack' with attackerId === the doubler's id
  });

  it('second hit is skipped when the target dies to the first', () => {
    // low-hp target: one 'attack' entry, one 'death', no second attack
  });

  it('retaliation happens once, between the two hits', () => {
    // log order: attack, retaliate, attack
  });
});
```

(Write these as real tests — the sketch above marks the assertions; the
factionWiring tests show the exact drive-a-turn loop to copy.)

**Step 2: Run — verify fail**

Run: `npx vitest run src/lib/engine/__tests__/abilities.test.ts`
Expected: FAIL — only one attack entry logged.

**Step 3: Implement** — in `battle.ts`, immediately after the retaliation block (line ~578), add:

```ts
    // Double strike: a second melee hit after the retaliation, no second
    // retaliation. Skipped if either side died in the exchange.
    const striker = s.units.find(u => u.id === actorId);
    const victim = s.units.find(u => u.id === targetId);
    if (
      attacker.definition.abilities.includes('double_strike') &&
      striker && striker.count > 0 &&
      victim && victim.count > 0
    ) {
      const { damage: d2, luckEvents: luck2 } = rollHit(s.hero, striker, victim, rng, s.hero.attack);
      const { killed: k2, remaining: v2 } = applyDamage(victim, d2);
      const { striker: s2after, victim: v2after, events: hit2Events } =
        applyOnHitEffects(rng, striker, v2, d2, s.round, s.hero);
      s = { ...s, units: s.units.map(u => (u.id === targetId ? v2after : u.id === actorId ? s2after : u)) };
      s.log = [...s.log, ...luck2, { type: 'attack', data: { attackerId: actorId, targetId, damage: d2, killed: k2 } }, ...hit2Events];
      if (v2after.count === 0) s = handleDeath(s, v2after, rng);
      const end2 = checkBattleEnd(s);
      if (end2) {
        s.log = [...s.log, { type: 'battle_end', data: { result: end2 } }];
        return { ...s, result: end2 };
      }
    }
```

**Step 4: Run — verify pass**

Run: `npx vitest run src/lib/engine/__tests__/abilities.test.ts && npm test`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/engine/battle.ts src/lib/engine/__tests__/abilities.test.ts
git commit -m "feat: double_strike melee ability"
```

---

### Task 2: `bravery` engine ability (+1 morale at battle init)

**Files:**
- Modify: `src/lib/engine/battle.ts` (initBattle player/enemy stack mapping)
- Test: `src/lib/engine/__tests__/armyBonuses.test.ts` (same fixtures fit)

**Step 1: Failing test:**

```ts
it('bravery grants +1 morale at battle init, clamped with other sources', () => {
  const BRAVE: UnitDef = { ...GOBLIN, abilities: ['bravery'] };
  const state = initBattle([{ unit: BRAVE, count: 5 }], [{ unit: GOBLIN, count: 5 }], mockHero, 7);
  const brave = state.units.find(u => u.side === 'player' && !u.isHero)!;
  expect(brave.morale).toBe(1);
});
```

**Step 2: Run — verify fail** (`morale` is 0).

**Step 3: Implement** — in `initBattle`'s `slotToStack` result handling (both player and enemy mapping so the ability is side-agnostic), after the existing hero-skill bumps:

```ts
if (stack.definition.abilities.includes('bravery')) {
  stack = { ...stack, morale: clampProc(stack.morale + 1) };
}
```

(For enemies the simplest hook is inside `slotToStack` itself or a small
shared `withBravery(stack)` applied in both maps — keep it one code path.)

**Step 4: Run — verify pass; full suite.**

**Step 5: Commit**

```bash
git add src/lib/engine/battle.ts src/lib/engine/__tests__/armyBonuses.test.ts
git commit -m "feat: bravery ability — +1 morale at battle init"
```

---

### Task 3: Skill catalog + offers + idempotent merge (`skills.ts`)

**Files:**
- Create: `src/lib/gauntlet/skills.ts`
- Test: `src/lib/gauntlet/__tests__/skills.test.ts`

**Step 1: Failing tests:**

```ts
import { describe, it, expect } from 'vitest';
import { UNIT_SKILLS, SKILL_IDS, skillDraftOptions, applyUnitSkills, type SkillId } from '../skills';
import { newRun } from '../run';
import { GOBLIN, WOLF_RIDER } from '../../engine/barbarian';

describe('catalog', () => {
  it('has the five launch skills with names and descriptions', () => {
    expect(new Set(SKILL_IDS)).toEqual(new Set(['life_drain', 'double_strike', 'no_retaliation', 'fleet_footwork', 'bravery']));
    for (const id of SKILL_IDS) {
      expect(UNIT_SKILLS[id].name).toBeTruthy();
      expect(UNIT_SKILLS[id].description).toBeTruthy();
    }
  });
});

describe('skillDraftOptions', () => {
  it('offers 3 distinct skills, deterministic per run state', () => {
    const run = { ...newRun('barbarian', 42), battlesWon: 2 };
    const a = skillDraftOptions(run);
    expect(a).toEqual(skillDraftOptions(run));
    expect(a).toHaveLength(3);
    expect(new Set(a).size).toBe(3);
  });

  it('excludes a skill every army unit already has', () => {
    const base = newRun('barbarian', 7);
    const run = {
      ...base,
      battlesWon: 5,
      unitSkills: Object.fromEntries(base.army.map(s => [s.unit.name, ['bravery' as SkillId]])),
    };
    for (let seed = 0; seed < 100; seed++) {
      expect(skillDraftOptions({ ...run, seed })).not.toContain('bravery');
    }
  });
});

describe('applyUnitSkills', () => {
  it('merges granted abilities into matching units and adds fleet speed', () => {
    const army = [{ unit: GOBLIN, count: 10 }, { unit: WOLF_RIDER, count: 5 }];
    const out = applyUnitSkills(army, { Goblin: ['fleet_footwork', 'life_drain'] });
    const g = out.find(s => s.unit.name === 'Goblin')!;
    expect(g.unit.abilities).toContain('fleet_footwork');
    expect(g.unit.abilities).toContain('life_drain');
    expect(g.unit.speed).toBe(GOBLIN.speed + 1);
    expect(out.find(s => s.unit.name === 'Wolf Rider')!.unit).toBe(WOLF_RIDER); // untouched
  });

  it('is idempotent — reapplying never stacks speed or duplicates abilities', () => {
    const army = [{ unit: GOBLIN, count: 10 }];
    const once = applyUnitSkills(army, { Goblin: ['fleet_footwork'] });
    const twice = applyUnitSkills(once, { Goblin: ['fleet_footwork'] });
    expect(twice[0].unit.speed).toBe(GOBLIN.speed + 1);
    expect(twice[0].unit.abilities.filter(a => a === 'fleet_footwork')).toHaveLength(1);
  });
});
```

**Step 2: Run — verify fail** (module not found).

**Step 3: Implement `skills.ts`:**

```ts
import type { ArmySlot } from '../engine/types';
import { mixSeed, mulberry32 } from '../engine/rng';
import type { RunState } from './run';

export type SkillId = 'life_drain' | 'double_strike' | 'no_retaliation' | 'fleet_footwork' | 'bravery';

export interface UnitSkillDef {
  id: SkillId;
  name: string;
  description: string;
}

export const UNIT_SKILLS: Record<SkillId, UnitSkillDef> = {
  life_drain: { id: 'life_drain', name: 'Lifesteal', description: 'Heals the stack for the damage it deals on hit.' },
  double_strike: { id: 'double_strike', name: 'Double Strike', description: 'Melee attacks land a second blow after the retaliation.' },
  no_retaliation: { id: 'no_retaliation', name: 'No Retaliation', description: 'Targets this unit hits cannot retaliate.' },
  fleet_footwork: { id: 'fleet_footwork', name: 'Fleet Footwork', description: '+1 speed.' },
  bravery: { id: 'bravery', name: 'Bravery', description: '+1 morale.' },
};

export const SKILL_IDS = Object.keys(UNIT_SKILLS) as SkillId[];
export const SKILL_OFFER_COUNT = 3;

/** Seeded pick of skills to offer. Excludes skills every army unit already
 *  has (nothing left to grant them to). */
export function skillDraftOptions(run: RunState): SkillId[] {
  const granted = run.unitSkills ?? {};
  const pool = SKILL_IDS.filter(id =>
    run.army.some(slot => !(granted[slot.unit.name] ?? []).includes(id) && !slot.unit.abilities.includes(id))
  );
  const rng = mulberry32(mixSeed(run.seed, run.battlesWon * 4271 + 17));
  const picks: SkillId[] = [];
  const bag = [...pool];
  while (picks.length < SKILL_OFFER_COUNT && bag.length > 0) {
    picks.push(bag.splice(Math.floor(rng() * bag.length), 1)[0]);
  }
  return picks;
}

/** Merge granted skills into unit definitions for battle. Idempotent: safe to
 *  apply to an army whose definitions already carry the skills (survivors
 *  round-trip merged defs back into the run). fleet_footwork bakes +1 speed
 *  only at the moment the ability is first added. */
export function applyUnitSkills(army: ArmySlot[], unitSkills: Record<string, SkillId[]>): ArmySlot[] {
  return army.map(slot => {
    const granted = unitSkills[slot.unit.name] ?? [];
    const missing = granted.filter(id => !slot.unit.abilities.includes(id));
    if (missing.length === 0) return slot;
    const speedBump = missing.includes('fleet_footwork') ? 1 : 0;
    return {
      ...slot,
      unit: {
        ...slot.unit,
        speed: slot.unit.speed + speedBump,
        abilities: [...slot.unit.abilities, ...missing],
      },
    };
  });
}
```

**Step 4: Run — verify pass; full suite.**

**Step 5: Commit**

```bash
git add src/lib/gauntlet/skills.ts src/lib/gauntlet/__tests__/skills.test.ts
git commit -m "feat: unit skill catalog, seeded offers, idempotent merge"
```

---

### Task 4: Run-state wiring (`run.ts`) — cadence + one-of-each pick

**Files:**
- Modify: `src/lib/gauntlet/run.ts`
- Test: `src/lib/gauntlet/__tests__/run.test.ts`

**Step 1: Failing tests** (mirror the item-cadence tests already there):

```ts
it('recordBattle offers skills on battles 2, 5, 8 — never colliding with items', () => {
  let run = newRun('barbarian', 9);
  for (let i = 1; i <= 8; i++) {
    run = recordBattle(run, true, run.army);
    if (i % 3 === 2) expect(run.pendingSkills).toHaveLength(3);
    else expect(run.pendingSkills).toBeNull();
    if (run.pendingSkills) expect(run.pendingItems).toBeNull(); // no double-offer battles
    run = applyPick(run, run.pendingDraft![0]);
    if (run.pendingSkills) run = applySkillPick(run, run.pendingSkills[0], run.army[0].unit.name);
    if (run.pendingItems) run = applyItemPick(run, run.pendingItems[0]);
  }
});

it('applySkillPick grants the skill to the unit and resolves like the item pick', () => {
  let run = { ...newRun('barbarian', 9), battlesWon: 2 };
  run = { ...run, status: 'draft' as const, pendingDraft: draftOptions(run), pendingSkills: skillDraftOptions(run) };
  const skill = run.pendingSkills![0];
  const unitName = run.army[0].unit.name;

  const afterSkill = applySkillPick(run, skill, unitName);
  expect(afterSkill.unitSkills[unitName]).toContain(skill);
  expect(afterSkill.pendingSkills).toBeNull();
  expect(afterSkill.status).toBe('draft'); // unit card still owed

  const done = applyPick(afterSkill, afterSkill.pendingDraft![0]);
  expect(done.status).toBe('map');
});
```

**Step 2: Run — verify fail.**

**Step 3: Implement in `run.ts`:**

- `RunState` gains `unitSkills: Record<string, SkillId[]>` and `pendingSkills: SkillId[] | null`; `newRun` initializes `{}` / `null`.
- `recordBattle`'s return: `pendingSkills: next.battlesWon % 3 === 2 ? skillDraftOptions(next) : null`.
- `applyPick` / `applyItemPick`: status stays `'draft'` while ANY of the other pendings remain (`pendingItems`/`pendingSkills`/`pendingDraft` respectively) — generalize the existing two-way check to all three.
- New:

```ts
export function applySkillPick(run: RunState, skillId: SkillId, unitName: string): RunState {
  const existing = run.unitSkills[unitName] ?? [];
  if (existing.includes(skillId)) return run;
  return {
    ...run,
    unitSkills: { ...run.unitSkills, [unitName]: [...existing, skillId] },
    pendingSkills: null,
    status: run.pendingDraft || run.pendingItems ? 'draft' : 'map',
  };
}
```

**Step 4: Run — verify pass; full suite** (existing one-of-each item tests must still pass — the generalized status check covers them).

**Step 5: Commit**

```bash
git add src/lib/gauntlet/run.ts src/lib/gauntlet/__tests__/run.test.ts
git commit -m "feat: skill offers every 3rd battle from battle 2"
```

---

### Task 5: UI — draft section, unit assignment, battle wiring, ability info

**Files:**
- Modify: `src/lib/ui/abilities.ts` (add `double_strike`, `fleet_footwork`, `bravery` entries; confirm `life_drain`/`no_retaliation` exist)
- Modify: `src/routes/gauntlet/+page.svelte`

No unit test — Svelte rendering; verified in Task 6.

**Step 1: `ABILITY_INFO` entries** (labels/descriptions matching the catalog).

**Step 2: Gauntlet page — draft section** (below the artifacts section, same pattern):

- If `run.pendingSkills?.length`: heading "…and teach a unit a skill".
- 3 skill cards (name + description; amber selected ring). Clicking selects
  `chosenSkill` (page-local `$state`).
- When `chosenSkill` is set, an "apply to:" row lists `run.army` units
  (sprite + name, reuse the sidebar row style); units whose def/grants already
  include the skill are disabled. Clicking one calls
  `applySkillPick(run, chosenSkill, unitName)` + `saveRun`.
- Draft headline/`Pick one of each.` hint already derives from what's pending —
  extend the copy to cover skills.

**Step 3: Battle wiring** — pass the merged army:

```svelte
playerArmy={applyUnitSkills(run.army, run.unitSkills)}
```

**Step 4: Tolerant load** — in `onMount`, alongside the items defaults:

```ts
unitSkills: saved.unitSkills ?? {}, pendingSkills: saved.pendingSkills ?? null,
```

**Step 5: Sidebar** — under each army row, tiny amber ability tags for granted
skills (`run.unitSkills[name]`, `title` = description).

**Step 6: `npm run check && npm test` → clean. Commit:**

```bash
git add src/lib/ui/abilities.ts src/routes/gauntlet/+page.svelte
git commit -m "feat: skill draft UI — pick a skill, teach it to a unit"
```

---

### Task 6: End-to-end verification

**REQUIRED SUB-SKILL:** Use the `verify` skill.

1. Inject a run at `battlesWon: 1`, win battle 2 → draft shows units + 3 skill
   cards; picking a skill then a unit stores it (sidebar tag appears); draft
   only resolves once the unit card is also taken.
2. Next battle: the taught unit's UnitInfo (draft card + in-battle hover) lists
   the new ability with its description.
3. **Mechanics spot-checks:** grant `double_strike` → one melee action logs two
   attack lines; `fleet_footwork` → reachable-cell range grows by 1;
   `bravery` → unit's morale reads 1 in battle; `no_retaliation` → no
   retaliate line when it strikes.
4. Battles 3–4: no skill offer; battle 5: offer again; skill every unit owns
   stops appearing.
5. Old save (no `unitSkills` field) loads cleanly.
6. Split a skilled stack in deployment → both halves show the ability;
   survivors merge back to one slot and the skill persists next battle
   (idempotent merge — speed doesn't creep).

Fix findings, `npm test`, commit with explicit paths.

---

## Out of scope

- Melee/ranged-penalty abilities (excluded by design).
- Skill rarity/weighting (uniform offer), removal/respec, or per-stack (vs
  per-unit-type) grants.
- Enemy armies gaining skills.
- More abilities beyond the launch five — the catalog is the extension point.
