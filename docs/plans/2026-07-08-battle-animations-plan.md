# Battle Animations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add floating damage/buff numbers, a death fade-out, and a rotating
active-turn shimmer to the battle UI, revealing each action's sub-events
(hit, retaliate, death) as separate incremental beats instead of one instant
state swap.

**Architecture:** The engine (`battle.ts`) is untouched — `applyAction`
still returns the final `BattleState` synchronously. `Battle.svelte` diffs
`battle.log` before/after each `applyAction` call, walks the new entries in
order, and for each one: patches a working state copy (pure functions in a
new `animSteps.ts`), assigns it to trigger a re-render, shows the matching
`AnimStep` via a new `BattleFx.svelte` overlay, and waits before revealing
the next entry. An `animating` lock (new `Battle.svelte` state) blocks
player input and the AI-turn timer for the duration of the sequence. See
`docs/plans/2026-07-08-battle-animations-design.md` for the full rationale.

**Tech Stack:** Svelte 5 (runes), TypeScript, Vitest. No new dependencies.

**Key semantics learned from the engine (battle.ts):**
- `killed` in `attack`/`retaliate`/`shoot`/`cast` log entries is a **count**
  of creatures killed within the stack (from `applyDamage`), not a boolean —
  a stack can lose creatures without dying.
- A stack's actual death is always a **separate** `{ type: 'death', data: { unitId } }`
  log entry, appended by `handleDeath` right after the killing blow's entry
  (and possibly followed by a `{ type: 'status', data: { effect: 'gating', unitId } }`
  if Demon Gating revives it — treat that as "not really dead," see Task 3).
- Buff casts (`bloodlust`/`stoneskin`) log `{ type: 'cast', data: { spell, casterId, targetId } }`
  with **no damage/value field** — the +4 amount is hardcoded in `applyAction`
  (`battle.ts:348-349`) and must be looked up by spell name in the UI layer,
  not read off the log entry.
- Status effects (`burn`, `blind`, `slow`, `drain_morale`, `bind`, `bind_block`,
  `life_drain`, `burn_apply`) all log as `{ type: 'status', data: { effect, unitId, ... } }`.

---

### Task 1: `AnimStep` type and `stepsFromLogEntry` — damage steps

**Files:**
- Create: `src/lib/ui/animSteps.ts`
- Test: `src/lib/ui/__tests__/animSteps.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { stepsFromLogEntry } from '../animSteps';
import type { BattleEvent } from '$lib/engine/types';

describe('stepsFromLogEntry: damage', () => {
  it('maps an attack entry to a single damage step on the target', () => {
    const entry: BattleEvent = {
      type: 'attack',
      data: { attackerId: 'a1', targetId: 't1', damage: 7, killed: 0 },
    };

    const steps = stepsFromLogEntry(entry);

    expect(steps).toEqual([{ unitId: 't1', kind: 'damage', value: 7 }]);
  });

  it('maps a shoot entry with splash to a damage step keyed on its own target', () => {
    const entry: BattleEvent = {
      type: 'shoot',
      data: { attackerId: 'a1', targetId: 't2', damage: 3, killed: 0, splash: true },
    };

    const steps = stepsFromLogEntry(entry);

    expect(steps).toEqual([{ unitId: 't2', kind: 'damage', value: 3 }]);
  });

  it('maps a lightning cast to a damage step on its target', () => {
    const entry: BattleEvent = {
      type: 'cast',
      data: { spell: 'lightning', casterId: 'h1', targetId: 't1', damage: 20, killed: 0 },
    };

    const steps = stepsFromLogEntry(entry);

    expect(steps).toEqual([{ unitId: 't1', kind: 'damage', value: 20 }]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ui/__tests__/animSteps.test.ts`
Expected: FAIL — `Cannot find module '../animSteps'` (or `stepsFromLogEntry is not a function`).

**Step 3: Write minimal implementation**

```typescript
import type { BattleEvent } from '$lib/engine/types';

export type AnimStep =
  | { unitId: string; kind: 'damage'; value: number }
  | { unitId: string; kind: 'buff'; value: number; label: string }
  | { unitId: string; kind: 'death' }
  | { unitId: string; kind: 'status'; icon: string };

/** Translates one battle log entry into the visual steps it should play. */
export function stepsFromLogEntry(entry: BattleEvent): AnimStep[] {
  switch (entry.type) {
    case 'attack':
    case 'retaliate':
    case 'shoot': {
      const { targetId, damage } = entry.data as { targetId: string; damage: number };
      return [{ unitId: targetId, kind: 'damage', value: damage }];
    }
    case 'cast': {
      const { targetId, damage } = entry.data as { targetId: string; damage?: number };
      if (damage !== undefined) {
        return [{ unitId: targetId, kind: 'damage', value: damage }];
      }
      return [];
    }
    default:
      return [];
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/ui/__tests__/animSteps.test.ts`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add src/lib/ui/animSteps.ts src/lib/ui/__tests__/animSteps.test.ts
git commit -m "feat: map attack/shoot/lightning log entries to damage anim steps"
```

---

### Task 2: `stepsFromLogEntry` — buff casts

**Files:**
- Modify: `src/lib/ui/animSteps.ts`
- Test: `src/lib/ui/__tests__/animSteps.test.ts`

**Step 1: Write the failing test**

Add to `animSteps.test.ts`:

```typescript
describe('stepsFromLogEntry: buffs', () => {
  it('maps a bloodlust cast to an attack buff step', () => {
    const entry: BattleEvent = {
      type: 'cast',
      data: { spell: 'bloodlust', casterId: 'h1', targetId: 't1' },
    };

    const steps = stepsFromLogEntry(entry);

    expect(steps).toEqual([{ unitId: 't1', kind: 'buff', value: 4, label: 'ATK' }]);
  });

  it('maps a stoneskin cast to a defense buff step', () => {
    const entry: BattleEvent = {
      type: 'cast',
      data: { spell: 'stoneskin', casterId: 'h1', targetId: 't1' },
    };

    const steps = stepsFromLogEntry(entry);

    expect(steps).toEqual([{ unitId: 't1', kind: 'buff', value: 4, label: 'DEF' }]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ui/__tests__/animSteps.test.ts`
Expected: FAIL — the `cast` branch's `damage === undefined` case currently returns `[]`, not a buff step.

**Step 3: Write minimal implementation**

Replace the `cast` case in `stepsFromLogEntry`:

```typescript
    case 'cast': {
      const { targetId, damage, spell } = entry.data as {
        targetId: string;
        damage?: number;
        spell: 'lightning' | 'bloodlust' | 'stoneskin';
      };
      if (damage !== undefined) {
        return [{ unitId: targetId, kind: 'damage', value: damage }];
      }
      if (spell === 'bloodlust') return [{ unitId: targetId, kind: 'buff', value: 4, label: 'ATK' }];
      if (spell === 'stoneskin') return [{ unitId: targetId, kind: 'buff', value: 4, label: 'DEF' }];
      return [];
    }
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/ui/__tests__/animSteps.test.ts`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add src/lib/ui/animSteps.ts src/lib/ui/__tests__/animSteps.test.ts
git commit -m "feat: map bloodlust/stoneskin casts to buff anim steps"
```

---

### Task 3: `stepsFromLogEntry` — death and status

**Files:**
- Modify: `src/lib/ui/animSteps.ts`
- Test: `src/lib/ui/__tests__/animSteps.test.ts`

**Step 1: Write the failing test**

Add to `animSteps.test.ts`:

```typescript
describe('stepsFromLogEntry: death and status', () => {
  it('maps a death entry to a death step', () => {
    const entry: BattleEvent = { type: 'death', data: { unitId: 't1' } };

    expect(stepsFromLogEntry(entry)).toEqual([{ unitId: 't1', kind: 'death' }]);
  });

  it('maps a burn status entry to a status step with the fire icon', () => {
    const entry: BattleEvent = {
      type: 'status',
      data: { effect: 'burn_apply', unitId: 't1' },
    };

    expect(stepsFromLogEntry(entry)).toEqual([{ unitId: 't1', kind: 'status', icon: '🔥' }]);
  });

  it('maps an unrecognized status effect to no steps rather than throwing', () => {
    const entry: BattleEvent = {
      type: 'status',
      data: { effect: 'some_future_effect', unitId: 't1' },
    };

    expect(stepsFromLogEntry(entry)).toEqual([]);
  });

  it('maps round_start, move, defend, morale_freeze, battle_end to no steps', () => {
    const noop: BattleEvent[] = [
      { type: 'round_start', data: { round: 2 } },
      { type: 'move', data: { unitId: 't1', to: { col: 1, row: 1 } } },
      { type: 'defend', data: { unitId: 't1' } },
      { type: 'morale_freeze', data: { unitId: 't1' } },
      { type: 'battle_end', data: { result: 'player_wins' } },
    ];

    for (const entry of noop) expect(stepsFromLogEntry(entry)).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ui/__tests__/animSteps.test.ts`
Expected: FAIL — no `death` or `status` case exists yet (falls through `default`, so the death test fails; the noop tests already pass via `default`, which is fine, but write them now for completeness before adding the `status` case).

**Step 3: Write minimal implementation**

Add cases to the switch, and a small icon lookup:

```typescript
const STATUS_ICON: Partial<Record<string, string>> = {
  burn_apply: '🔥',
  blind: '😵',
  bind: '⛓',
  bind_block: '⛓',
  slow: '🐌',
  drain_morale: '💔',
  life_drain: '🩸',
  gating: '✨',
};

// inside the switch:
    case 'death': {
      const { unitId } = entry.data as { unitId: string };
      return [{ unitId, kind: 'death' }];
    }
    case 'status': {
      const { unitId, effect } = entry.data as { unitId: string; effect: string };
      const icon = STATUS_ICON[effect];
      return icon ? [{ unitId, kind: 'status', icon }] : [];
    }
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/ui/__tests__/animSteps.test.ts`
Expected: PASS (9 tests)

**Step 5: Commit**

```bash
git add src/lib/ui/animSteps.ts src/lib/ui/__tests__/animSteps.test.ts
git commit -m "feat: map death and status log entries to anim steps"
```

---

### Task 4: `applyLogEntry` state patcher

This is the piece that lets the UI show an intermediate state after just one
log entry, without waiting for the engine's final result. It only patches
what the animation needs to read (`count`, `hp`, `attackBuff`, `defenseBuff`)
— it does not need to be a perfect replica of the engine's own logic (ATB,
morale, gating revival) because Task 6 always corrects to the engine's real
`next` state after the last step.

**Files:**
- Modify: `src/lib/ui/animSteps.ts`
- Test: `src/lib/ui/__tests__/animSteps.test.ts`

**Step 1: Write the failing test**

Add to `animSteps.test.ts` (reuse `makeStack`/`makeState` helpers copied from
`src/lib/engine/__tests__/selectors.test.ts` — see that file for the exact
shape):

```typescript
import { applyLogEntry } from '../animSteps';
import { createGrid, placeUnits } from '$lib/engine/grid';
import type { BattleState, UnitDef, UnitStack, Pos } from '$lib/engine/types';
import { GOBLIN } from '$lib/engine/barbarian';

function makeStack(def: UnitDef, pos: Pos, side: 'player' | 'enemy', overrides: Partial<UnitStack> = {}): UnitStack {
  return {
    id: `${side}-${def.name}-${pos.col}-${pos.row}`,
    definition: def,
    count: 5,
    hp: def.hp,
    pos,
    side,
    hasRetaliated: false,
    shotsLeft: def.shots,
    morale: 0,
    luck: 0,
    atb: 0,
    isDefending: false,
    ...overrides,
  };
}

function makeState(units: UnitStack[]): BattleState {
  let grid = createGrid(12, 10);
  grid = placeUnits(grid, units);
  return {
    grid,
    units,
    hero: { class: 'barbarian', level: 1, xp: 0, attack: 0, defense: 0, statPoints: 0, factionSkills: [] },
    round: 1,
    battleTime: 0,
    currentUnitId: units[0]?.id ?? null,
    log: [],
    result: 'ongoing',
    seed: 1,
  };
}

describe('applyLogEntry', () => {
  it('reduces the target stack toward 0 count by damage, one creature at a time', () => {
    const target = makeStack(GOBLIN, { col: 5, row: 5 }, 'enemy', { count: 5, hp: GOBLIN.hp });
    const state = makeState([target]);
    const entry: BattleEvent = {
      type: 'attack',
      data: { attackerId: 'x', targetId: target.id, damage: GOBLIN.hp + 1, killed: 1 },
    };

    const next = applyLogEntry(state, entry);

    const patched = next.units.find(u => u.id === target.id)!;
    expect(patched.count).toBe(4);
  });

  it('zeroes the stack on a death entry', () => {
    const target = makeStack(GOBLIN, { col: 5, row: 5 }, 'enemy', { count: 1 });
    const state = makeState([target]);
    const entry: BattleEvent = { type: 'death', data: { unitId: target.id } };

    const next = applyLogEntry(state, entry);

    expect(next.units.find(u => u.id === target.id)!.count).toBe(0);
  });

  it('applies an attack buff on a bloodlust cast', () => {
    const target = makeStack(GOBLIN, { col: 5, row: 5 }, 'player');
    const state = makeState([target]);
    const entry: BattleEvent = {
      type: 'cast',
      data: { spell: 'bloodlust', casterId: 'h1', targetId: target.id },
    };

    const next = applyLogEntry(state, entry);

    expect(next.units.find(u => u.id === target.id)!.attackBuff).toBe(4);
  });

  it('is a no-op for entry types it does not need to patch', () => {
    const target = makeStack(GOBLIN, { col: 5, row: 5 }, 'player');
    const state = makeState([target]);
    const entry: BattleEvent = { type: 'defend', data: { unitId: target.id } };

    const next = applyLogEntry(state, entry);

    expect(next.units).toEqual(state.units);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ui/__tests__/animSteps.test.ts`
Expected: FAIL — `applyLogEntry is not exported`.

**Step 3: Write minimal implementation**

Add to `animSteps.ts`, reusing `applyDamage` from the engine (it already
does the "damage the top creature, spill into the rest" math correctly —
no need to reimplement it):

```typescript
import type { BattleEvent, BattleState } from '$lib/engine/types';
import { applyDamage } from '$lib/engine/combat';

/** Patches only what an animation step needs to read (count/hp/buffs) from
 *  one log entry. Not a full engine replica — Battle.svelte always
 *  overwrites with the engine's real result after the last entry. */
export function applyLogEntry(state: BattleState, entry: BattleEvent): BattleState {
  const patchUnit = (unitId: string, patch: (u: BattleState['units'][number]) => BattleState['units'][number]) => ({
    ...state,
    units: state.units.map(u => (u.id === unitId ? patch(u) : u)),
  });

  switch (entry.type) {
    case 'attack':
    case 'retaliate':
    case 'shoot': {
      const { targetId, damage } = entry.data as { targetId: string; damage: number };
      return patchUnit(targetId, u => applyDamage(u, damage).remaining);
    }
    case 'death': {
      const { unitId } = entry.data as { unitId: string };
      return patchUnit(unitId, u => ({ ...u, count: 0 }));
    }
    case 'cast': {
      const { targetId, damage, spell } = entry.data as {
        targetId: string;
        damage?: number;
        spell: 'lightning' | 'bloodlust' | 'stoneskin';
      };
      if (damage !== undefined) return patchUnit(targetId, u => applyDamage(u, damage).remaining);
      if (spell === 'bloodlust') return patchUnit(targetId, u => ({ ...u, attackBuff: (u.attackBuff ?? 0) + 4 }));
      if (spell === 'stoneskin') return patchUnit(targetId, u => ({ ...u, defenseBuff: (u.defenseBuff ?? 0) + 4 }));
      return state;
    }
    default:
      return state;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/ui/__tests__/animSteps.test.ts`
Expected: PASS (13 tests)

**Step 5: Commit**

```bash
git add src/lib/ui/animSteps.ts src/lib/ui/__tests__/animSteps.test.ts
git commit -m "feat: add applyLogEntry state patcher for incremental battle replay"
```

---

### Task 5: `BattleFx.svelte` overlay component

Renders the currently-active `AnimStep`s as floating/fading elements
positioned over their unit's cell. Read `src/lib/ui/BattleGrid.svelte` first
(already open in the IDE) to match its cell-sizing conventions — it uses a
CSS grid where each cell is `aspect-square` inside `grid-template-columns:
repeat(width, minmax(0, 1fr))`, so a step's position is just `grid-column`/
`grid-row` matching the unit's `pos.col + 1`/`pos.row + 1` (CSS grid is
1-indexed) overlaid on an absolutely-positioned grid sibling with the same
template.

**Files:**
- Create: `src/lib/ui/BattleFx.svelte`
- Modify: `src/lib/ui/BattleGrid.svelte` (mount `BattleFx` inside `.board-viewport`, sized to match `.board`)

**Step 1: No test — this is a visual component; there is no Svelte component-test harness in this repo (confirmed during the prior bug-fix session) and one will not be added for this task.** Skip to implementation, then verify by hand in Task 8.

**Step 2: Write the component**

```svelte
<script lang="ts">
  import type { AnimStep } from './animSteps';
  import type { Pos } from '$lib/engine/types';

  interface Props {
    gridWidth: number;
    gridHeight: number;
    steps: { step: AnimStep; pos: Pos; key: string }[];
  }

  let { gridWidth, gridHeight, steps }: Props = $props();
</script>

<div
  class="fx-layer grid"
  style="grid-template-columns: repeat({gridWidth}, minmax(0, 1fr)); grid-template-rows: repeat({gridHeight}, minmax(0, 1fr));"
>
  {#each steps as { step, pos, key } (key)}
    <div class="fx-cell" style="grid-column: {pos.col + 1}; grid-row: {pos.row + 1};">
      {#if step.kind === 'damage'}
        <span class="fx-text fx-damage">-{step.value}</span>
      {:else if step.kind === 'buff'}
        <span class="fx-text fx-buff">+{step.value} {step.label}</span>
      {:else if step.kind === 'status'}
        <span class="fx-text fx-status">{step.icon}</span>
      {/if}
    </div>
  {/each}
</div>

<style>
  .fx-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .fx-cell {
    position: relative;
  }

  .fx-text {
    position: absolute;
    left: 50%;
    top: 30%;
    transform: translateX(-50%);
    font-weight: 700;
    font-size: 1rem;
    text-shadow: 0 1px 3px rgb(0 0 0 / 0.8);
    white-space: nowrap;
    animation: float-up 0.9s ease-out forwards;
  }

  .fx-damage {
    color: #f87171;
  }

  .fx-buff {
    color: #4ade80;
  }

  .fx-status {
    font-size: 1.1rem;
  }

  @keyframes float-up {
    0% {
      opacity: 0;
      transform: translate(-50%, 0);
    }
    15% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translate(-50%, -140%);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .fx-text {
      animation: fade-only 0.9s ease-out forwards;
    }
    @keyframes fade-only {
      0% { opacity: 0; }
      15% { opacity: 1; }
      100% { opacity: 0; }
    }
  }
</style>
```

Note: this component takes fully-resolved `{ step, pos, key }[]` rather than
looking up positions itself, since `BattleGrid` already has `unitsById` and
knows how to resolve a unit's current cell — keeps `BattleFx` a dumb
renderer.

**Step 3: Wire it into `BattleGrid.svelte`**

In `BattleGrid.svelte`, add a `steps` prop (`{ unitId: string; step: AnimStep }[]`,
passed from `Battle.svelte`), resolve each to a position via the existing
`unitsById` map, and mount `BattleFx` as a sibling of `.board` inside
`.board-viewport` (same stacking context, so it tilts/scales with the board):

```svelte
<!-- new prop -->
activeSteps: { unitId: string; step: AnimStep }[];

<!-- inside .board-viewport, after the .board div -->
<BattleFx
  gridWidth={battleState.grid.width}
  gridHeight={battleState.grid.height}
  steps={activeSteps
    .map(({ unitId, step }) => {
      const u = unitsById.get(unitId);
      return u ? { step, pos: u.pos, key: `${unitId}-${step.kind}-${battleState.log.length}` } : null;
    })
    .filter((s): s is { step: AnimStep; pos: Pos; key: string } => s !== null)}
/>
```

**Step 4: Typecheck**

Run: `npx svelte-check --tsconfig ./tsconfig.json`
Expected: 0 errors (fix any prop-type mismatches before proceeding).

**Step 5: Commit**

```bash
git add src/lib/ui/BattleFx.svelte src/lib/ui/BattleGrid.svelte
git commit -m "feat: BattleFx overlay renders floating damage/buff/status text"
```

---

### Task 6: Death fade on `UnitToken`/`.token-standing`

**Files:**
- Modify: `src/lib/ui/BattleGrid.svelte`

**Step 1: No test — visual CSS transition, verify by hand in Task 8.**

**Step 2: Add a `dying` set of unit IDs, driven by `Battle.svelte`**

In `BattleGrid.svelte`, add a `dyingIds: Set<string>` prop. In the template,
where `.token-standing` is rendered (around line 180):

```svelte
<div
  class="token-standing"
  class:hover-glow={occupant.id === hoveredId}
  class:dying={dyingIds.has(occupant.id)}
>
  <UnitToken unit={occupant} />
</div>
```

Add the CSS:

```css
.token-standing.dying {
  transition: opacity 0.5s ease-in, transform 0.5s ease-in;
  opacity: 0;
  transform: rotateX(calc(-1 * var(--tilt))) translateY(15%);
}
```

Note this only works if `dyingIds` is set *before* the step's reveal delay
elapses and the unit is still rendered (i.e. `Battle.svelte` must keep a
unit's `count` momentarily nonzero — or independently keep rendering it via
`dyingIds` — through the fade; see Task 7's sequencing, which reveals the
`death` step and only removes the unit from `battleState.units` on the
following `applyLogEntry`/final swap, giving the transition time to run).

**Step 3: Typecheck**

Run: `npx svelte-check --tsconfig ./tsconfig.json`
Expected: 0 errors

**Step 4: Commit**

```bash
git add src/lib/ui/BattleGrid.svelte
git commit -m "feat: fade-and-sink transition for dying unit standees"
```

---

### Task 7: Active-turn shimmer

**Files:**
- Modify: `src/lib/ui/BattleGrid.svelte`

**Step 1: No test — pure CSS, verify by hand in Task 8.**

**Step 2: Add the shimmer to `.active-arc`**

The arc already exists (`BattleGrid.svelte:320-331`, class `.active-arc`,
rendered when `occupant.id === activeId`). Add a rotating highlight layer:

```css
.active-arc {
  position: absolute;
  left: 8%;
  right: 8%;
  bottom: 3%;
  height: 34%;
  border: 3px solid #facc15;
  border-top-color: transparent;
  border-radius: 50%;
  filter: drop-shadow(0 0 3px rgb(250 204 21 / 0.7));
  pointer-events: none;
  overflow: hidden;
}

.active-arc::after {
  content: '';
  position: absolute;
  inset: -20%;
  background: conic-gradient(from 0deg, transparent 0%, rgb(253 230 138 / 0.9) 6%, transparent 16%);
  animation: shimmer-spin 1.6s linear infinite;
}

@keyframes shimmer-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .active-arc::after {
    animation: none;
  }
}
```

**Step 3: Typecheck**

Run: `npx svelte-check --tsconfig ./tsconfig.json`
Expected: 0 errors

**Step 4: Commit**

```bash
git add src/lib/ui/BattleGrid.svelte
git commit -m "feat: rotating shimmer on the active-turn indicator"
```

---

### Task 8: Wire incremental reveal + `animating` lock into `Battle.svelte`

This is the integration task that ties Tasks 1-7 together: replaces the
current instant `battle = applyAction(...)` call sites with a stepping
sequence, and gates player input + the AI timer on an `animating` flag.

**Files:**
- Modify: `src/lib/ui/Battle.svelte`

**Step 1: No unit test — this is Svelte effect/timing logic with no
component-test harness available (see design doc's Non-goals). Verify by
hand in this task's final step and again in Task 9.**

**Step 2: Add state and the stepping function**

Near the top of the `<script>` block, alongside the existing `battle` state:

```typescript
import { stepsFromLogEntry, applyLogEntry, type AnimStep } from './animSteps';

let animating = $state(false);
let activeSteps = $state<{ unitId: string; step: AnimStep }[]>([]);
let dyingIds = $state(new Set<string>());

const STEP_DELAY_MS = $derived({ slow: 700, normal: 450, fast: 200 }[battleSpeed]);

async function revealAction(result: BattleState) {
  animating = true;
  const newEntries = result.log.slice(battle.log.length);
  let working = battle;

  for (const entry of newEntries) {
    working = applyLogEntry(working, entry);
    const steps = stepsFromLogEntry(entry).map(step => ({ unitId: step.unitId, step }));
    activeSteps = steps;
    if (entry.type === 'death') {
      dyingIds = new Set([...dyingIds, (entry.data as { unitId: string }).unitId]);
    }
    battle = working;
    await new Promise(r => setTimeout(r, STEP_DELAY_MS));
  }

  activeSteps = [];
  dyingIds = new Set();
  battle = result; // ground-truth correction
  animating = false;
}
```

**Step 3: Replace every `battle = applyAction(...)` call site with `revealAction(applyAction(...))`**

There are five call sites: `attackFrom`, `castAt`, `handleCellClick`, the
AI-turn `$effect`, and `handleWait` (grep `applyAction(battle,` in
`Battle.svelte` to find each one — do not miss any, an unconverted site
would apply instantly and desync from the animation lock). Example for
`attackFrom`:

```typescript
function attackFrom(targetId: string, origin: Pos) {
  const inPlace = activeUnit && origin.col === activeUnit.pos.col && origin.row === activeUnit.pos.row;
  const next = applyAction(
    battle,
    inPlace ? { type: 'attack', targetId } : { type: 'attack', targetId, moveTo: origin }
  );
  revealAction(next);
  hovered = null;
}
```

For the AI-turn effect (already patched in a prior session with the
forfeit-race fix — keep that guard, and add the `animating` gate):

```typescript
$effect(() => {
  if (battle.result !== 'ongoing' || animating) return;
  const unit = battle.units.find(u => u.id === battle.currentUnitId);
  if (!unit || unit.side !== 'enemy') return;
  const timer = setTimeout(() => {
    if (battle.result !== 'ongoing' || animating) return;
    revealAction(applyAction(battle, aiTakeTurn(battle, unit.id)));
  }, AI_DELAY_MS);
  return () => clearTimeout(timer);
});
```

**Step 4: Gate player input on `animating`**

In `handleCellClick`, `handleUnitClick`, `handleMeleeAim`, `handleWait`, add
`animating` to the existing `!isPlayerTurn` early-return guards, e.g.:

```typescript
function handleCellClick(pos: Pos) {
  if (!isPlayerTurn || animating) return;
  ...
```

**Step 5: Pass the new props into `BattleGrid`**

```svelte
<BattleGrid
  ...
  activeSteps={activeSteps}
  dyingIds={dyingIds}
  interactive={isPlayerTurn && !animating}
/>
```

**Step 6: Typecheck**

Run: `npx svelte-check --tsconfig ./tsconfig.json`
Expected: 0 errors

**Step 7: Run the full test suite** (nothing in the engine changed, but confirm no regressions)

Run: `npx vitest run`
Expected: PASS, all tests (158+ from before this plan, +13 new from Tasks 1-4)

**Step 8: Commit**

```bash
git add src/lib/ui/Battle.svelte
git commit -m "feat: reveal battle actions incrementally with an animating input lock"
```

---

### Task 9: Manual verification in the browser

**Use the `verify` skill** to launch the app and drive a real battle. Check:

1. **Damage numbers**: attack an enemy stack, confirm a red `-N` floats up
   and fades over its tile, timed with `battleSpeed`.
2. **Retaliation sequencing**: attack a stack that can retaliate, confirm the
   attacker's hit reveals first, then a beat later the retaliation damage
   appears on the original attacker — not simultaneously.
3. **Death**: reduce a stack to 0, confirm its standee fades and sinks in
   place rather than instantly vanishing, and that the fade finishes before
   the unit disappears from the grid (no visible "pop").
4. **Buff cast**: cast Bloodlust/Stoneskin (if the current hero's class has
   it — check via the hero's spellbook), confirm a green `+4 ATK`/`+4 DEF`
   floats over the target.
5. **Active-turn shimmer**: confirm the yellow arc under the current actor
   visibly rotates/shimmers continuously, and moves to the next actor's tile
   when the turn passes.
6. **Input lock**: click an enemy mid-animation (fast-click twice), confirm
   the second click is ignored until the first action's sequence finishes.
7. **AI pacing**: confirm the AI's turn doesn't start until the player's own
   action animation has fully settled (no overlapping reveals).
8. **Speed control**: switch `battleSpeed` to `fast` and `slow`, confirm step
   timing visibly changes accordingly.
9. **Reduced motion**: enable "reduce motion" in OS accessibility settings,
   reload, confirm the shimmer and floating numbers still communicate the
   same information via fade-only (no spin, no fly-up) rather than being
   invisible or broken.

If anything looks wrong, fix it in `Battle.svelte`/`BattleGrid.svelte`/
`BattleFx.svelte` directly (no engine changes should ever be needed for a
visual bug at this stage) and re-verify. No commit needed for this task
unless verification uncovers a fix.

---

### Non-goals (explicitly out of scope for this plan)

- Battle replay (re-watching a finished battle) — `animSteps.ts`'s functions
  are written generically enough to reuse later, but persistence and a
  playback UI are separate follow-up work.
- Component-test harness for Svelte (`@testing-library/svelte` + jsdom) —
  not worth the setup cost for this feature; all Svelte-layer work in this
  plan is verified manually per Task 9.
