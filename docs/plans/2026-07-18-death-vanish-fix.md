# Death Vanish Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Killed units stay visible until their death fade plays, and a killing projectile visibly lands on its target before the fade begins.

**Architecture:** The bug is a mount gap, not an animation problem (diagnosis below). Fix: `revealAction` pre-computes which units die anywhere in the incoming entry batch (`doomedIds`), and BattleGrid keeps those units mounted even at `count === 0`. The fade itself still starts at the death beat via the existing `dyingIds`. One pure helper in `animSteps.ts` (TDD), one state set in `Battle.svelte`, one filter change in `BattleGrid.svelte`.

**Tech Stack:** Svelte 5 (runes), TypeScript, Vitest.

---

## Diagnosis — why this happens (the "any reason for this?" answer)

The animation-smoothness work (FX buffer, 1.1s fade, death pose) fixed the *floaters* but not the *standee*, because of an unmount gap between two beats:

1. On the **hit beat** (attack/retaliate/shoot), `applyLogEntry` runs `applyDamage`
   immediately — the target's `count` drops to 0 at the *start* of that beat
   ([animSteps.ts:135-140](../../src/lib/ui/animSteps.ts)).
2. The `death` log entry is a **separate, later beat**: `dyingIds` only gains the
   unit one `STEP_DELAY_MS` later ([Battle.svelte:150-176](../../src/lib/ui/Battle.svelte)).
3. BattleGrid renders only `u.count > 0 || dyingIds.has(u.id)`
   ([BattleGrid.svelte:118-120](../../src/lib/ui/BattleGrid.svelte)). In the gap
   between the lethal hit and the death beat the unit satisfies *neither*
   condition → **the standee unmounts the instant the hit lands**.
4. One beat later the death entry re-mounts it with `.dying` already applied —
   a fresh mount starts at `opacity: 0`, so the 1.1s transition and the death
   pose never visibly play. Net effect: the unit blinks out instantly.
5. Ranged is worse: damage applies at the *start* of the shoot beat, but the
   projectile flight takes 60% of the beat — the target vanishes **before the
   arrow arrives**, so the arrow flies into an empty cell. That is exactly
   "no projectile that actually kills the dying unit."

The fix keeps doomed units mounted (alive pose, full opacity) through the hit
beat, so the arrow lands on a visible target; the death beat then applies
`.dying` to an already-mounted standee, so the 1→0 fade and death pose actually
run.

Known cosmetic side effect (accepted): the count badge shows 0 during the
sub-second window between the hit and the fade — same timing as every other
badge update, and the skull floater covers the story.

---

### Task 1: Pure helper — which units die in an entry batch (`animSteps.ts`)

**Files:**
- Modify: `src/lib/ui/animSteps.ts`
- Test: `src/lib/ui/__tests__/animSteps.test.ts`

**Step 1: Write the failing test** — append to `animSteps.test.ts`:

```ts
describe('deathIdsIn', () => {
  it('collects every death entry unit id from a batch', () => {
    const entries: BattleEvent[] = [
      { type: 'attack', data: { attackerId: 'a1', targetId: 't1', damage: 9, killed: 3 } },
      { type: 'death', data: { unitId: 't1' } },
      { type: 'retaliate', data: { attackerId: 't2', targetId: 'a1', damage: 4, killed: 1 } },
      { type: 'death', data: { unitId: 'a1' } },
    ];
    expect(deathIdsIn(entries)).toEqual(new Set(['t1', 'a1']));
  });

  it('returns an empty set when nothing dies', () => {
    expect(deathIdsIn([{ type: 'move', data: { unitId: 'u1', to: { col: 1, row: 1 } } }])).toEqual(new Set());
  });
});
```

Add `deathIdsIn` to the existing import from `'../animSteps'`.

**Step 2: Run — verify fail**

Run: `npx vitest run src/lib/ui/__tests__/animSteps.test.ts`
Expected: FAIL — `deathIdsIn` is not exported.

**Step 3: Implement** — add to `animSteps.ts`:

```ts
/** Unit ids that die anywhere in this entry batch. Known before the reveal
 *  starts, so the grid can keep doomed units mounted at count 0 until their
 *  death beat starts the fade — otherwise they unmount the instant the
 *  lethal hit's damage is applied, one beat before dyingIds knows. */
export function deathIdsIn(entries: BattleEvent[]): Set<string> {
  const ids = new Set<string>();
  for (const e of entries) {
    if (e.type === 'death') ids.add((e.data as { unitId: string }).unitId);
  }
  return ids;
}
```

**Step 4: Run — verify pass**

Run: `npx vitest run src/lib/ui/__tests__/animSteps.test.ts && npm test`
Expected: PASS (full suite too).

**Step 5: Commit**

```bash
git add src/lib/ui/animSteps.ts src/lib/ui/__tests__/animSteps.test.ts
git commit -m "feat: deathIdsIn — pre-scan a reveal batch for deaths"
```

---

### Task 2: Keep doomed units mounted (Battle.svelte + BattleGrid.svelte)

**Files:**
- Modify: `src/lib/ui/Battle.svelte` (revealAction + state + BattleGrid invocation)
- Modify: `src/lib/ui/BattleGrid.svelte` (Props + `unitsById` filter)

No unit test — Svelte state wiring; verified in Task 3.

**Step 1: Battle.svelte** — next to `dyingIds` (~line 74) add:

```ts
// Units that die later in the current reveal batch: kept mounted (alive pose)
// through their lethal hit so projectiles land on a visible target; dyingIds
// takes over at the death beat to run the fade.
let doomedIds = $state(new Set<string>());
```

In `revealAction`, right after `const newEntries = …`:

```ts
doomedIds = deathIdsIn(newEntries);
```

(Import `deathIdsIn` from `'./animSteps'`.)

In the teardown at the end of `revealAction` (where `activeSteps = []` and
`dyingIds = new Set()`), and in `restart()` beside the same resets, add:

```ts
doomedIds = new Set();
```

Pass it to the grid — in the `<BattleGrid` invocation add:

```svelte
{doomedIds}
```

**Step 2: BattleGrid.svelte** — add to `Props` and destructuring:

```ts
doomedIds: Set<string>;
```

Change the `unitsById` filter (line ~118):

```ts
const unitsById = $derived(
  new Map(
    battleState.units
      .filter(u => u.count > 0 || dyingIds.has(u.id) || doomedIds.has(u.id))
      .map(u => [u.id, u])
  )
);
```

**Step 3: Type-check + suite**

Run: `npm run check && npm test`
Expected: clean / PASS.

**Step 4: Commit**

```bash
git add src/lib/ui/Battle.svelte src/lib/ui/BattleGrid.svelte
git commit -m "fix: doomed units stay mounted until their death beat"
```

---

### Task 3: End-to-end verification

**REQUIRED SUB-SKILL:** Use the `verify` skill (project skill: build, launch, drive the battle UI headless).

Set combat speed **slow** (900ms beats) and sample the DOM every ~80ms
(MutationObserver or polling — see the verify skill's transient-capture notes).

1. **Melee kill:** kill an enemy stack with a melee hit. The target's standee
   must remain visible through the hit beat (alive pose while the damage/skull
   floaters pop), then fade over ~1.1s from the death beat — sample its
   `.token-standing` opacity: near 1.0 at the hit beat, decreasing after the
   death beat, never a frame where the element is absent before the fade.
2. **Ranged kill (the projectile complaint):** kill with an archer/lich shot.
   While `.fx-projectile` is mid-flight the target's standee must be mounted
   and visible; the `.dying` fade may only begin after the flight ends.
3. **Retaliation death:** attacker dies to the retaliation — same holds for
   the attacker's standee.
4. **Restart mid-fade:** restart during a death fade — no orphaned standees,
   `doomedIds` cleared (fresh battle shows only live units).
5. **Fast speed:** repeat check 1 on fast — shorter beats, same no-gap rule.

Fix anything found, re-run `npm test`, commit fixes with explicit paths.

---

## Out of scope

- Deferring the count-badge update to the floater's landing (cosmetic; the
  badge has always updated at beat start).
- Beat restructuring (merging death into the hit beat) — unnecessary once the
  mount gap is closed.
