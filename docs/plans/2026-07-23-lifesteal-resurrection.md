# Lifesteal Resurrection (heal up to starting stack count) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `life_drain` lifesteal heal a stack's whole HP pool and resurrect fallen creatures back up to the count the stack started the battle with, instead of only topping up the lead creature.

**Architecture:** Introduce a `startCount` field on `UnitStack` capturing the count at battle start (the resurrection ceiling). Add a pure helper `applyHeal` in `combat.ts` that mirrors `applyDamage`'s stack model in reverse: convert the stack to a total-HP pool, add the heal, clamp to `startCount × fullHp`, and derive the new `count`/`hp`. Rewrite the `life_drain` branch in `battle.ts` to use it, and surface any revived creatures in the battle log.

**Tech Stack:** TypeScript, Vitest. Engine is pure/deterministic (no I/O). Stack HP model: `count` creatures where only the top one is partially wounded; total HP = `(count - 1) × def.hp + hp`.

---

## Background: the stack HP model

A `UnitStack` (see [types.ts:25](src/lib/engine/types.ts:25)) stores `count` (number of creatures) and `hp` (current HP of the **top** creature only). Full-health creatures below the top are implied. So:

- **Total current HP** = `(count - 1) × def.hp + hp`
- **Damage** ([combat.ts:102 `applyDamage`](src/lib/engine/combat.ts:102)) peels HP off the top creature, then kills whole creatures below it.
- **Healing** must do the reverse: fill the top creature, then revive whole creatures — but never beyond the count the stack began with.

Today the `life_drain` branch ([battle.ts:91](src/lib/engine/battle.ts:91)) only raises the top creature's `hp`, capped at one creature's max. This plan adds resurrection.

**Resurrection ceiling:** a stack must not grow past its starting size. There is no such field today, so Task 1 adds `startCount`.

---

## Task 1: Add `startCount` to the UnitStack type

**Files:**
- Modify: `src/lib/engine/types.ts:25-51`

**Step 1: Add the field**

In the `UnitStack` interface, add after the `count` line ([types.ts:28](src/lib/engine/types.ts:28)):

```ts
  count: number;
  startCount: number;  // count at battle start; resurrection (life_drain) ceiling
  hp: number;          // HP of the top creature only
```

**Step 2: Verify it fails to compile**

Run: `npx tsc --noEmit`
Expected: FAIL — several `UnitStack` object literals in `battle.ts` now lack `startCount` (this is the compiler enumerating every construction site we must touch in Task 2). Note the reported locations.

**Step 3: Commit**

```bash
git add src/lib/engine/types.ts
git commit -m "feat: add startCount field to UnitStack for lifesteal resurrection"
```

---

## Task 2: Populate `startCount` at every stack construction site

There are four literals that build a `UnitStack` from scratch. The two `{ ...spread }` sites ([battle.ts:144](src/lib/engine/battle.ts:144) gating revive, [combat.ts:130](src/lib/engine/combat.ts:130) `applyDamage`) already carry `startCount` through the spread and need no change.

**Files:**
- Modify: `src/lib/engine/battle.ts:207-212` (`slotToStack`)
- Modify: `src/lib/engine/battle.ts:286-296` (hero stack)
- Modify: `src/lib/engine/battle.ts:435-456` (split-stack deploy)

**Step 1: `slotToStack` — the normal army path**

At [battle.ts:210](src/lib/engine/battle.ts:210):

```ts
    count: slot.count,
    startCount: slot.count,
    hp: slot.unit.hp,
```

**Step 2: The hero combatant stack**

At [battle.ts:294](src/lib/engine/battle.ts:294):

```ts
    count: 1,
    startCount: 1,
    hp: 1,
```

(The hero has no `life_drain`, but the field is required by the type.)

**Step 3: The split-stack deploy action**

The split ([battle.ts:435](src/lib/engine/battle.ts:435)) carves `amount` creatures off an existing stack into a new one. Conserve the resurrection ceiling: the new stack's ceiling is `amount`, and the source's ceiling drops by `amount`.

For the created stack at [battle.ts:438](src/lib/engine/battle.ts:438):

```ts
    count: amount,
    startCount: amount,
    hp: unit.definition.hp,
```

For the source stack at [battle.ts:455](src/lib/engine/battle.ts:455):

```ts
    .map(u => (u.id === unitId ? { ...u, count: u.count - amount, startCount: u.startCount - amount } : u))
```

**Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS (no missing-property errors).

**Step 5: Verify existing engine tests still pass**

Run: `npx vitest run src/lib/engine`
Expected: PASS — 209 tests. (Test fixtures build stacks via `initBattle`, so they inherit `startCount` through `slotToStack`.)

**Step 6: Commit**

```bash
git add src/lib/engine/battle.ts
git commit -m "feat: populate startCount at all UnitStack construction sites"
```

---

## Task 3: Add the `applyHeal` helper to combat.ts

A pure function that heals a stack's HP pool and revives creatures up to `startCount`. Mirrors `applyDamage`.

**Files:**
- Modify: `src/lib/engine/combat.ts` (add after `applyDamage`, ~line 132)
- Test: `src/lib/engine/__tests__/combat.test.ts` (create if absent; otherwise append)

**Step 1: Write the failing tests**

Create/append `src/lib/engine/__tests__/combat.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyHeal } from '../combat.ts';
import type { UnitStack } from '../types.ts';

// Minimal stack: fullHp = 55, started the battle at 3 creatures.
function fiend(count: number, hp: number): UnitStack {
  return {
    id: 'x', definition: { hp: 55 } as UnitStack['definition'],
    count, startCount: 3, hp,
    pos: { col: 0, row: 0 }, side: 'player', hasRetaliated: false,
    shotsLeft: 0, morale: 0, luck: 0, atb: 0, isDefending: false,
  };
}

describe('applyHeal', () => {
  it('tops up the lead creature without reviving', () => {
    // count 3, top at 20/55, heal 10 -> top 30, no revive
    const r = applyHeal(fiend(3, 20), 10);
    expect(r.stack.count).toBe(3);
    expect(r.stack.hp).toBe(30);
    expect(r.revived).toBe(0);
    expect(r.healed).toBe(10);
  });

  it('caps healing at the lead creature max when already at startCount', () => {
    // full stack (3 × 55): nothing to heal
    const r = applyHeal(fiend(3, 55), 40);
    expect(r.stack.count).toBe(3);
    expect(r.stack.hp).toBe(55);
    expect(r.revived).toBe(0);
    expect(r.healed).toBe(0);
  });

  it('revives fallen creatures with overflow, up to startCount', () => {
    // count 2, top 20/55 -> total 75; heal 40 -> total 115
    // 115 = 2*55 + 5 -> count 3, top hp 5, revived 1
    const r = applyHeal(fiend(2, 20), 40);
    expect(r.stack.count).toBe(3);
    expect(r.stack.hp).toBe(5);
    expect(r.revived).toBe(1);
    expect(r.healed).toBe(40);
  });

  it('never exceeds startCount even with huge overheal', () => {
    // count 1, top 10/55 -> total 10; heal 9999 -> clamp to 3*55 = 165
    const r = applyHeal(fiend(1, 10), 9999);
    expect(r.stack.count).toBe(3);
    expect(r.stack.hp).toBe(55);
    expect(r.revived).toBe(2);
    expect(r.healed).toBe(165 - 10); // actual HP restored, not the requested 9999
  });

  it('is a no-op for a dead stack', () => {
    const r = applyHeal(fiend(0, 0), 50);
    expect(r.stack.count).toBe(0);
    expect(r.revived).toBe(0);
    expect(r.healed).toBe(0);
  });
});
```

**Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/engine/__tests__/combat.test.ts`
Expected: FAIL — `applyHeal` is not exported.

**Step 3: Implement `applyHeal`**

Add to `src/lib/engine/combat.ts` after `applyDamage` (~line 132):

```ts
export interface HealResult {
  stack: UnitStack;
  healed: number;   // HP actually restored (after clamping)
  revived: number;  // creatures brought back (newCount - oldCount)
}

/**
 * Heal a stack's HP pool in the mirror of applyDamage: fill the top creature,
 * then revive whole creatures below it, never past the count it started the
 * battle with (startCount). `heal` is the requested amount; the returned
 * `healed` is what was actually restored after clamping.
 */
export function applyHeal(stack: UnitStack, heal: number): HealResult {
  if (stack.count <= 0 || heal <= 0) return { stack, healed: 0, revived: 0 };

  const fullHp = stack.definition.hp;
  const currentTotal = (stack.count - 1) * fullHp + stack.hp;
  const maxTotal = stack.startCount * fullHp;
  const newTotal = Math.min(maxTotal, currentTotal + heal);

  const newCount = Math.min(stack.startCount, Math.ceil(newTotal / fullHp));
  const newHp = newTotal - (newCount - 1) * fullHp;

  return {
    stack: { ...stack, count: newCount, hp: newHp },
    healed: newTotal - currentTotal,
    revived: newCount - stack.count,
  };
}
```

**Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/engine/__tests__/combat.test.ts`
Expected: PASS — all 5 cases.

**Step 5: Commit**

```bash
git add src/lib/engine/combat.ts src/lib/engine/__tests__/combat.test.ts
git commit -m "feat: add applyHeal helper with stack resurrection"
```

---

## Task 4: Wire life_drain through applyHeal

**Files:**
- Modify: `src/lib/engine/battle.ts:91-100` (the `life_drain` branch)
- Modify import at `src/lib/engine/battle.ts:4`
- Test: `src/lib/engine/__tests__/abilities.test.ts` (append a resurrection case)

**Step 1: Write the failing test**

Append to the `describe('leveled lifesteal', ...)` block in [abilities.test.ts](src/lib/engine/__tests__/abilities.test.ts:262):

```ts
  it('revives fallen creatures up to the starting stack count', () => {
    // 100% lifesteal, big single-hit damage. Start count 2, reduce to 1 and
    // wound it, then a hit that heals more than one creature's worth revives it.
    const VAMP: UnitDef = { ...GOBLIN, name: 'Vamp', hp: 30, attack: 0, minDamage: 60, maxDamage: 60, abilities: ['life_drain'], abilityLevels: { life_drain: 10 } };
    let s = initBattle([{ unit: VAMP, count: 2 }], [{ unit: { ...GOBLIN, name: 'Tank', hp: 500, defense: 0, minDamage: 0, maxDamage: 0 }, count: 1 }], hero2, 7);
    for (let i = 0; i < 40 && s.units.find(u => u.id === s.currentUnitId)?.definition.name !== 'Vamp'; i++) {
      s = applyAction(s, { type: 'wait' });
    }
    const enemy = s.units.find(u => u.side === 'enemy')!;
    // Knock the vamp down to a single wounded creature (count 1, hp 5).
    s = { ...s, units: s.units.map(u => (u.definition.name === 'Vamp' ? { ...u, count: 1, hp: 5 } : u)) };
    const adj = [[-1, 0], [-1, -1], [-1, 1], [0, -1], [0, 1]]
      .map(([dc, dr]) => ({ col: enemy.pos.col + dc, row: enemy.pos.row + dr }))
      .find(p => p.row >= 0 && p.row < s.grid.height && !s.grid.cells[p.row][p.col].blocked && !s.grid.cells[p.row][p.col].occupantId)!;
    const next = applyAction(s, { type: 'attack', targetId: enemy.id, moveTo: adj });
    const vamp = next.units.find(u => u.definition.name === 'Vamp')!;
    // Healed the full 30 top-up plus overflow that revives the 2nd creature.
    expect(vamp.count).toBe(2);
    const ev = next.log.find(e => e.type === 'status' && e.data.effect === 'life_drain');
    expect(ev!.data.revived).toBe(1);
  });
```

**Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/engine/__tests__/abilities.test.ts`
Expected: FAIL — `vamp.count` is still 1 (no resurrection yet) and `ev.data.revived` is undefined.

**Step 3: Update the import**

At [battle.ts:4](src/lib/engine/battle.ts:4) add `applyHeal` to the `combat.ts` import:

```ts
import { calculateDamage, applyDamage, applyHeal, canRetaliate, checkMorale, type LuckSink } from './combat.ts';
```

**Step 4: Rewrite the life_drain branch**

Replace [battle.ts:91-100](src/lib/engine/battle.ts:91) with:

```ts
  const lsLevel = abilityLevel(striker.definition, 'life_drain');
  if (lsLevel > 0 && a.count > 0) {
    // Heal the striking stack by 10%·level of the total damage dealt (legacy
    // Vampire = level 10 = 100%), reviving fallen creatures up to the count it
    // started the battle with. Heals the stack as a whole, never per-creature.
    const heal = Math.round(damageDealt * lifestealFraction(lsLevel));
    const { stack, healed, revived } = applyHeal(a, heal);
    if (healed > 0) {
      a = stack;
      events.push({ type: 'status', data: { effect: 'life_drain', unitId: a.id, heal: healed, revived } });
    }
  }
```

**Step 5: Run to verify both new and existing lifesteal tests pass**

Run: `npx vitest run src/lib/engine/__tests__/abilities.test.ts`
Expected: PASS. (The existing `heals 10% per level` test wounds the striker to `hp: 1` without dropping below `startCount`, so `revived` is 0 and `healed` equals `round(damage × 0.5)` — the assertion still holds.)

**Step 6: Run the full engine suite**

Run: `npx vitest run src/lib/engine`
Expected: PASS.

**Step 7: Commit**

```bash
git add src/lib/engine/battle.ts src/lib/engine/__tests__/abilities.test.ts
git commit -m "feat: life_drain revives fallen creatures up to starting stack count"
```

---

## Task 5: Surface revivals in the battle log

Right now the log reads "drain N HP of life." When creatures come back, say so.

**Files:**
- Modify: `src/lib/ui/logLines.ts:105`
- Test: `src/lib/ui/__tests__/` (add/append a log-line test if the suite exists there; otherwise skip and rely on manual verification in Step 4)

**Step 1: Inspect the log helpers**

Read [logLines.ts:105](src/lib/ui/logLines.ts:105) and the `line`/`num`/`t` helpers it uses so the new branch matches their style and pluralization conventions.

**Step 2: Update the life_drain line**

```ts
        case 'life_drain': {
          const revived = (d.revived as number) ?? 0;
          return revived > 0
            ? line(u, t(' drain '), num(d.heal), t(' HP, reviving '), num(revived), t(revived === 1 ? ' creature.' : ' creatures.'))
            : line(u, t(' drain '), num(d.heal), t(' HP of life.'));
        }
```

**Step 3: Run the UI tests**

Run: `npx vitest run src/lib/ui`
Expected: PASS.

**Step 4: Manual verification in the app**

Use the `verify` skill to launch the battle UI, field a Blood Fiend / Vampire stack that has lost a creature, and land a large hit. Confirm the log shows the revive line and the on-grid stack count ticks up. Screenshot for the user.

**Step 5: Commit**

```bash
git add src/lib/ui/logLines.ts
git commit -m "feat: show creature revivals in the life_drain battle log line"
```

---

## Task 6: Full regression pass

**Step 1: Type-check and test everything**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS across the whole suite.

**Step 2: Commit any final touch-ups, then finish the branch**

Use the `superpowers:finishing-a-development-branch` skill to decide merge/PR.

---

## Notes & decisions

- **Resurrection ceiling = `startCount`.** A stack can never exceed the size it began the battle with. Split-stack deploy conserves the total ceiling across the two resulting stacks (Task 2, Step 3).
- **`healed` is actual HP restored, not requested.** The log and events report what really went into the pool after clamping, so a near-full stack won't claim a heal it didn't receive.
- **Spread-built stacks (`applyDamage` result, gating revive) inherit `startCount` for free** — no change needed there.
- **Out of scope:** healing spells / regeneration abilities. Only `life_drain` is wired to `applyHeal` here, but the helper is general and reusable if those land later.
- **Balance caveat worth flagging to the design owner:** 100%-lifesteal units (legacy Vampire, `life_drain: 10`) can now rebuild a decimated stack from a single big hit. If that proves too strong, the lever is `lifestealFraction` or a cap on `revived` per hit — not the resurrection mechanic itself.
