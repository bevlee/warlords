# Melee Aim Stability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Melee origin picking stops flipping under hand jitter — the current pick holds until the cursor decisively favors another origin tile (angular hysteresis), with the interaction model otherwise unchanged.

**Architecture:** Per the committed design ([2026-07-17-melee-aim-stability-design.md](2026-07-17-melee-aim-stability-design.md)): the nearest-angle pick moves out of `BattleGrid.svelte`'s `updateAim` into a pure `pickOrigin` function in a new `src/lib/ui/aim.ts`, which adds a ~20° hysteresis margin and ignores stale picks. `updateAim` keeps all pixel/rect concerns (center offset, `ROW_SQUASH` foreshortening, 18% dead zone) and delegates the choice.

**Tech Stack:** TypeScript, Svelte 5, Vitest.

---

## Context for the implementer

- Current logic: [BattleGrid.svelte:122-150](../../src/lib/ui/BattleGrid.svelte) — `updateAim` runs on `mousemove` over an attackable enemy tile, picks `aim = { targetId, origin }` by max dot product (= nearest angle) among `originsByTarget.get(unit.id)`. Every mousemove re-picks from scratch; boundaries between origins are razor-thin.
- `aim` drives the red origin tile, the orange `➤` arrow, and click-to-attack (`onmeleeaim`). None of that changes.
- Board coordinates: `col` grows right, `row` grows down — matching screen axes, so `atan2(dy, dx)` in cursor space and `atan2(drow, dcol)` in board space compare directly (after the existing `ROW_SQUASH` correction, which stays in the component).
- `Pos` is `{ col: number; row: number }` from `$lib/engine/types`.

---

### Task 1: `pickOrigin` with hysteresis (`aim.ts`)

**Files:**
- Create: `src/lib/ui/aim.ts`
- Test: `src/lib/ui/__tests__/aim.test.ts`

**Step 1: Write the failing tests**

Geometry used throughout: target at `(5,5)`; origin **right** = `(6,5)` (0°), origin **below** = `(5,6)` (90°); sector midpoint at 45°.

```ts
import { describe, it, expect } from 'vitest';
import { pickOrigin } from '../aim';
import type { Pos } from '$lib/engine/types';

const TARGET: Pos = { col: 5, row: 5 };
const RIGHT: Pos = { col: 6, row: 5 };  // 0° from target
const BELOW: Pos = { col: 5, row: 6 };  // 90° from target
const ORIGINS = [RIGHT, BELOW];

describe('pickOrigin', () => {
  it('picks the nearest origin by angle when there is no current pick', () => {
    // ~47.7° — just past the 45° midpoint, nearest is BELOW
    expect(pickOrigin(null, ORIGINS, TARGET, { dx: 1, dy: 1.1 })).toEqual(BELOW);
    // ~42.3° — nearest is RIGHT
    expect(pickOrigin(null, ORIGINS, TARGET, { dx: 1.1, dy: 1 })).toEqual(RIGHT);
  });

  it('holds the current pick against jitter just past the boundary', () => {
    // ~47.7°: BELOW is nearer (42.3° vs 47.7°) but only by ~5.4° — inside the margin
    expect(pickOrigin(RIGHT, ORIGINS, TARGET, { dx: 1, dy: 1.1 })).toEqual(RIGHT);
  });

  it('switches when the cursor decisively favors another origin', () => {
    // 70°: BELOW wins by 50° (70° vs 20°) — well past the margin
    expect(pickOrigin(RIGHT, ORIGINS, TARGET, { dx: Math.cos(Math.PI * 70 / 180), dy: Math.sin(Math.PI * 70 / 180) })).toEqual(BELOW);
  });

  it('re-picks fresh when the current pick is no longer a valid origin', () => {
    const stale: Pos = { col: 4, row: 5 }; // left tile — not in ORIGINS
    // ~47.7° with no hysteresis protection → nearest wins
    expect(pickOrigin(stale, ORIGINS, TARGET, { dx: 1, dy: 1.1 })).toEqual(BELOW);
  });

  it('handles the wraparound at ±180°', () => {
    const LEFT: Pos = { col: 4, row: 5 }; // 180°
    // cursor at -170° is only 10° from LEFT across the wrap
    expect(pickOrigin(null, [LEFT, RIGHT], TARGET, { dx: Math.cos(-Math.PI * 170 / 180), dy: Math.sin(-Math.PI * 170 / 180) })).toEqual(LEFT);
  });

  it('returns null for an empty origins list', () => {
    expect(pickOrigin(null, [], TARGET, { dx: 1, dy: 0 })).toBeNull();
  });
});
```

**Step 2: Run — verify fail**

Run: `npx vitest run src/lib/ui/__tests__/aim.test.ts`
Expected: FAIL — module `../aim` not found.

**Step 3: Implement `src/lib/ui/aim.ts`**

```ts
import type { Pos } from '$lib/engine/types';

/** Degrees a rival origin must beat the current pick by before the aim
 *  switches. Big enough to absorb hand jitter at sector boundaries, small
 *  enough that a deliberate steer toward another tile switches immediately. */
export const AIM_HYSTERESIS_DEG = 20;

/** Absolute angular distance (radians, ≤ π) between the cursor direction
 *  and the target→origin direction, both in board space. */
function angularDiff(origin: Pos, target: Pos, cursor: { dx: number; dy: number }): number {
  const cursorAngle = Math.atan2(cursor.dy, cursor.dx);
  const originAngle = Math.atan2(origin.row - target.row, origin.col - target.col);
  const diff = Math.abs(cursorAngle - originAngle);
  return diff > Math.PI ? 2 * Math.PI - diff : diff;
}

/** Choose the melee origin the cursor is pointing at, with hysteresis:
 *  the current pick survives unless a rival beats it by AIM_HYSTERESIS_DEG.
 *  `current` is ignored when it's no longer in `origins` (stale pick after
 *  the board changed) or null (first pick on entering the tile). */
export function pickOrigin(
  current: Pos | null,
  origins: Pos[],
  target: Pos,
  cursor: { dx: number; dy: number }
): Pos | null {
  if (origins.length === 0) return null;

  let best = origins[0];
  let bestDiff = Infinity;
  for (const o of origins) {
    const diff = angularDiff(o, target, cursor);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = o;
    }
  }

  const held = current && origins.some(o => o.col === current.col && o.row === current.row) ? current : null;
  if (!held) return best;

  const heldDiff = angularDiff(held, target, cursor);
  const margin = (AIM_HYSTERESIS_DEG * Math.PI) / 180;
  return bestDiff < heldDiff - margin ? best : held;
}
```

**Step 4: Run — verify pass**

Run: `npx vitest run src/lib/ui/__tests__/aim.test.ts && npm test`
Expected: PASS (full suite too).

**Step 5: Commit**

```bash
git add src/lib/ui/aim.ts src/lib/ui/__tests__/aim.test.ts
git commit -m "feat: origin picking with angular hysteresis (aim.ts)"
```

---

### Task 2: Delegate `updateAim` to `pickOrigin` (BattleGrid.svelte)

**Files:**
- Modify: `src/lib/ui/BattleGrid.svelte:122-150`

No unit test — the extracted math is covered by Task 1; the component glue is verified in Task 3.

**Step 1: Import** — add to the script block:

```ts
import { pickOrigin } from './aim';
```

**Step 2: Replace the body of `updateAim`** (keep the function signature and the guards; only the picking loop goes):

```ts
function updateAim(e: MouseEvent, unit: UnitStack) {
  if (!interactive || !meleeAimable(unit.id)) {
    if (aim?.targetId === unit.id) aim = null;
    return;
  }
  const origins = originsByTarget.get(unit.id)!;
  if (origins.length === 0) return;
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const dx = e.clientX - (rect.left + rect.width / 2);
  const dy = (e.clientY - (rect.top + rect.height / 2)) / ROW_SQUASH;
  // Too close to the centre to read a direction — keep the origin we already have
  // rather than letting sub-pixel jitter reassign it. Entering a tile still picks
  // one immediately; only re-deciding is suppressed.
  if (Math.hypot(dx, dy) < rect.width * 0.18 && aim?.targetId === unit.id) return;
  // Hysteresis lives in pickOrigin: the held pick survives boundary jitter,
  // and a pick that predates a board change (no longer in origins) is dropped.
  const current = aim?.targetId === unit.id ? aim.origin : null;
  const origin = pickOrigin(current, origins, unit.pos, { dx, dy });
  if (origin) aim = { targetId: unit.id, origin };
}
```

Delete the now-unused local `best`/`bestDot` dot-product loop. Everything else in the file — dead zone constant, `ROW_SQUASH`, arrow, cursors, click handling — stays byte-identical.

**Step 3: Type-check + suite**

Run: `npx svelte-check --threshold error && npm test`
Expected: clean / PASS.

**Step 4: Commit**

```bash
git add src/lib/ui/BattleGrid.svelte
git commit -m "refactor: updateAim delegates origin choice to pickOrigin"
```

---

### Task 3: End-to-end feel check

**REQUIRED SUB-SKILL:** Use the `verify` skill (build, launch, and drive the battle UI).

Checklist:

1. **Jitter hold:** hover an enemy reachable from several sides, line up a diagonal origin, then wiggle the cursor a few pixels around the sector boundary — the red origin tile and arrow must hold steady.
2. **Deliberate steer:** sweep the cursor clearly toward a different edge of the enemy tile — the pick must follow without noticeable lag.
3. **Entry pick:** enter the enemy tile from different sides — the initial origin must be the intuitive (nearest-direction) one, instantly.
4. **Dead zone:** park the cursor dead-center on the enemy — the existing pick must not reassign.
5. **Shift shooters:** hold shift over an enemy while a shooter is active — melee aiming engages and behaves per 1–3; release shift — aim clears/reverts per current behavior.
6. **Board change mid-aim:** after any action that changes reachability (unit moves), re-hover — no stale red tile on an unreachable origin, and clicking always attacks from the tile shown.

Fix anything found, re-run `npm test`, then commit with explicit paths (dirty tree — never `git add -A`):

```bash
git add src/lib/ui/aim.ts src/lib/ui/BattleGrid.svelte
git commit -m "fix: aim hysteresis polish from e2e verification"   # only if fixes were needed
```

---

## Out of scope (per the design decision)

- Directly clickable origin tiles, scroll-wheel origin cycling, ghost attacker preview — rejected for now; the complaint was stability, not the interaction model. Revisit if 8-origin cases still feel bad after this lands.
- Tuning `AIM_HYSTERESIS_DEG` beyond 20° — adjust only with evidence from the feel check.
