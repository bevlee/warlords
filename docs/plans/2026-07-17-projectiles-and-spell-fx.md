# Projectiles & Spell FX Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ranged attacks (archers and the hero) fire a visible projectile that flies from shooter to target before the damage number pops; hero spells get a cast visual (lightning bolt flash, buff glow) instead of bare floating text.

**Architecture:** Pure CSS/DOM, no canvas. Two new `AnimStep` kinds (`projectile`, `spell_fx`) flow through the existing beat pipeline: `stepsFromLogEntry` emits them, `BattleGrid` resolves unit ids to grid positions, `BattleFx` renders them as CSS-animated elements on the existing `pointer-events: none` overlay grid. Damage/buff text gains an optional `delayed` flag so it pops when the projectile lands, not when it launches.

**Tech Stack:** Svelte 5 (runes), TypeScript, CSS keyframe animations, Vitest.

---

## Design decisions (context for the implementer)

1. **The hero shoots for free.** The hero is an off-grid `UnitStack` (`isHero: true`, `pos: {col: -2, row: mid}`) that attacks via the engine's `shoot` action — its log entries carry `attackerId` like any archer ([battle.ts:227-250](../../src/lib/engine/battle.ts), log emit at line ~505). So one `projectile` step kind covers both. The hero's projectile originates at board col −2, which projects near the hero standee on the left flank. It won't be pixel-perfect (the standee is drawn in flat screen space, the projectile in the tilted board plane) — accepted; it reads as "from the hero's direction."

2. **Anchor the FX at the *target* cell, offset the start.** `BattleFx` positions elements with `grid-column: pos.col + 1`. The hero's col −2 would be an invalid/negative grid line, so the projectile's `fx-cell` sits on the **target** cell (always on-grid) and the flight animation starts translated back at the source: `translate(calc(var(--from-x) * 100%), ...)` where `--from-x = from.col - to.col` (cell units; the wrapper is exactly cell-sized so 100% = one cell). This is the same pattern the standee slide already uses in BattleGrid.

3. **Timing within one beat.** A `shoot`/`cast` log entry is one beat (`STEP_DELAY_MS`, 200–700ms). Projectile flight takes ~60% of the beat (`--flight-ms`, set once on the fx layer); damage/buff text with `delayed: true` gets `animation-delay: var(--flight-ms)` + `animation-fill-mode: backwards` so it stays invisible until the arrow lands. `FX_TAIL_MS` (900ms) already holds the layer long enough after the final beat.

4. **Angles are board-plane.** The fx layer lives inside the tilted `.board`, so geometry is plain cell math: `atan2(drow, dcol)` — same as the existing aim arrow. No `ROW_SQUASH` correction (that's only for screen-space mouse input).

5. **Splash shoot entries** (`splash: true` from area_shot) keep damage-only — one arrow flies to the primary target; splash damage just pops.

6. **3D flattening trap:** the lightning bolt stands up out of the board (`rotateX(calc(-1 * var(--tilt)))` — `--tilt` inherits from `.board`'s style attr). That requires `transform-style: preserve-3d` on `.fx-layer` and `.fx-cell`, and **no** `filter`/`overflow` on those elements (either silently flattens the 3D subtree — see the `.preview` comment in BattleGrid for the precedent).

---

### Task 1: `projectile` step for shoot entries (animSteps.ts)

**Files:**
- Modify: `src/lib/ui/animSteps.ts`
- Test: `src/lib/ui/__tests__/animSteps.test.ts`

**Step 1: Update the two existing shoot tests and add the delayed-damage expectation**

Replace the test at `animSteps.test.ts:68` ("maps a shoot entry to damage only (no lunge; projectiles come later)") with:

```ts
it('maps a shoot entry to a projectile from the attacker plus delayed damage on the target', () => {
  const entry: BattleEvent = {
    type: 'shoot',
    data: { attackerId: 'a1', targetId: 't1', damage: 5, killed: 0 },
  };

  const steps = stepsFromLogEntry(entry);

  expect(steps).toEqual([
    { unitId: 'a1', kind: 'projectile', targetId: 't1' },
    { unitId: 't1', kind: 'damage', value: 5, delayed: true },
  ]);
});
```

Keep the splash test at line 77 as-is (splash stays damage-only, no `delayed` flag) — verify its expectation is exactly `[{ unitId: 't2', kind: 'damage', value: 3 }]` and leave it.

**Step 2: Run tests to verify the new one fails**

Run: `npx vitest run src/lib/ui/__tests__/animSteps.test.ts`
Expected: FAIL — new shoot test gets `[{ unitId: 't1', kind: 'damage', value: 5 }]` (no projectile step).

**Step 3: Implement in animSteps.ts**

Add to the `AnimStep` union (and add `delayed?: boolean` to `damage` and `buff`):

```ts
export type AnimStep =
  | { unitId: string; kind: 'damage'; value: number; delayed?: boolean }
  | { unitId: string; kind: 'buff'; value: number; label: string; delayed?: boolean }
  | { unitId: string; kind: 'death' }
  | { unitId: string; kind: 'status'; icon: string }
  | { unitId: string; kind: 'move'; from: Pos; to: Pos }
  | { unitId: string; kind: 'strike'; targetId: string }
  // Ranged shot: unitId is the shooter (or the off-grid hero); BattleGrid
  // resolves both ids to positions at beat time. Anchored at the target cell,
  // flight starts translated back at the source.
  | { unitId: string; kind: 'projectile'; targetId: string };
```

Replace the `shoot` case in `stepsFromLogEntry`:

```ts
case 'shoot': {
  const { attackerId, targetId, damage, splash } = entry.data as {
    attackerId: string;
    targetId: string;
    damage: number;
    splash?: boolean;
  };
  // Splash hits radiate from the primary impact — no second arrow.
  if (splash) return [{ unitId: targetId, kind: 'damage', value: damage }];
  return [
    { unitId: attackerId, kind: 'projectile', targetId },
    { unitId: targetId, kind: 'damage', value: damage, delayed: true },
  ];
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/ui/__tests__/animSteps.test.ts`
Expected: PASS (all).

Also run the full suite — nothing else consumes shoot steps yet, but confirm: `npm test`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/ui/animSteps.ts src/lib/ui/__tests__/animSteps.test.ts
git commit -m "feat: projectile anim step for ranged attacks"
```

---

### Task 2: `spell_fx` step for cast entries (animSteps.ts)

**Files:**
- Modify: `src/lib/ui/animSteps.ts`
- Test: `src/lib/ui/__tests__/animSteps.test.ts`

**Step 1: Update the three cast tests**

Lightning test (line ~88) — new expectation:

```ts
expect(steps).toEqual([
  { unitId: 't1', kind: 'spell_fx', spell: 'lightning' },
  { unitId: 't1', kind: 'damage', value: 20, delayed: true },
]);
```

Bloodlust test (line ~101):

```ts
expect(steps).toEqual([
  { unitId: 't1', kind: 'spell_fx', spell: 'bloodlust' },
  { unitId: 't1', kind: 'buff', value: 4, label: 'ATK', delayed: true },
]);
```

Stoneskin test (line ~112):

```ts
expect(steps).toEqual([
  { unitId: 't1', kind: 'spell_fx', spell: 'stoneskin' },
  { unitId: 't1', kind: 'buff', value: 4, label: 'DEF', delayed: true },
]);
```

**Step 2: Run tests to verify the three fail**

Run: `npx vitest run src/lib/ui/__tests__/animSteps.test.ts`
Expected: FAIL — the three cast tests (no `spell_fx` step, no `delayed`).

**Step 3: Implement**

Add to the `AnimStep` union:

```ts
  // Cast visual at the target cell: lightning bolt flash or buff glow.
  | { unitId: string; kind: 'spell_fx'; spell: 'lightning' | 'bloodlust' | 'stoneskin' };
```

Replace the `cast` case:

```ts
case 'cast': {
  const { targetId, damage, spell } = entry.data as {
    targetId: string;
    damage?: number;
    spell: 'lightning' | 'bloodlust' | 'stoneskin';
  };
  const fx: AnimStep = { unitId: targetId, kind: 'spell_fx', spell };
  if (damage !== undefined) {
    return [fx, { unitId: targetId, kind: 'damage', value: damage, delayed: true }];
  }
  if (spell === 'bloodlust') return [fx, { unitId: targetId, kind: 'buff', value: 4, label: 'ATK', delayed: true }];
  if (spell === 'stoneskin') return [fx, { unitId: targetId, kind: 'buff', value: 4, label: 'DEF', delayed: true }];
  return [];
}
```

**Step 4: Run tests**

Run: `npm test`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/ui/animSteps.ts src/lib/ui/__tests__/animSteps.test.ts
git commit -m "feat: spell_fx anim step for casts"
```

---

### Task 3: Resolve positions in BattleGrid, pass through to BattleFx

BattleGrid owns `unitsById`, so it resolves the projectile's two unit ids into positions and picks the art (hero → bolt, archer → arrow) before handing steps to BattleFx.

**Files:**
- Modify: `src/lib/ui/BattleGrid.svelte:278-288` (the `<BattleFx>` invocation)
- Modify: `src/lib/ui/BattleFx.svelte:5-11` (Props only, render comes in Task 4)

No unit test — Svelte component wiring; this repo tests `.ts` modules only. Verified end-to-end in Task 6.

**Step 1: Extend BattleFx's Props** (BattleFx.svelte)

```ts
interface Props {
  gridWidth: number;
  gridHeight: number;
  /** Beat length — flight/flash durations and text delays derive from it. */
  stepMs: number;
  steps: {
    step: AnimStep;
    pos: Pos;               // anchor cell (target for projectiles)
    fromPos?: Pos;          // projectile launch cell (may be off-grid: hero col -2)
    art?: 'arrow' | 'bolt'; // projectile look: archer arrow vs hero bolt
    key: string;
  }[];
}

let { gridWidth, gridHeight, stepMs, steps }: Props = $props();
```

**Step 2: Replace the steps mapping in BattleGrid.svelte** (the `<BattleFx …>` block, currently lines 278-288)

```svelte
<BattleFx
  gridWidth={battleState.grid.width}
  gridHeight={battleState.grid.height}
  {stepMs}
  steps={activeSteps
    .filter(({ step }) => step.kind !== 'move' && step.kind !== 'strike')
    .map(({ unitId, step }) => {
      const key = `${unitId}-${step.kind}-${battleState.log.length}`;
      if (step.kind === 'projectile') {
        // Anchor at the target cell (always on-grid); the source only feeds
        // the flight-start offset, so the hero's off-grid col -2 is fine.
        const from = unitsById.get(unitId);
        const target = unitsById.get(step.targetId);
        if (!from || !target) return null;
        return { step, pos: target.pos, fromPos: from.pos, art: from.isHero ? 'bolt' : 'arrow', key } as const;
      }
      const u = unitsById.get(unitId);
      return u ? ({ step, pos: u.pos, key } as const) : null;
    })
    .filter(s => s !== null)}
/>
```

(Adjust the trailing type-guard filter to match — the existing one narrows with an `is` predicate; update its type to include `fromPos`/`art` or let inference handle it with `s => s !== null` if the compiler is satisfied.)

**Step 3: Type-check and run the suite**

Run: `npx svelte-check --threshold error` (or `npm run check` if defined — check package.json)
Expected: no errors.
Run: `npm test`
Expected: PASS.

**Step 4: Commit**

```bash
git add src/lib/ui/BattleGrid.svelte src/lib/ui/BattleFx.svelte
git commit -m "feat: resolve projectile positions and art in BattleGrid"
```

---

### Task 4: Projectile rendering + delayed text (BattleFx.svelte)

**Files:**
- Modify: `src/lib/ui/BattleFx.svelte`

**Step 1: Set the shared flight duration on the layer**

```svelte
<div
  class="fx-layer grid"
  style="grid-template-columns: repeat({gridWidth}, minmax(0, 1fr)); grid-template-rows: repeat({gridHeight}, minmax(0, 1fr)); --flight-ms: {Math.round(stepMs * 0.6)}ms;"
>
```

**Step 2: Render the projectile and thread `delayed`**

Inside the `{#each}`, add a branch and extend the text spans:

```svelte
{#each steps as { step, pos, fromPos, art, key } (key)}
  <div class="fx-cell" style="grid-column: {pos.col + 1}; grid-row: {pos.row + 1};">
    {#if step.kind === 'projectile' && fromPos}
      {@const angle = (Math.atan2(pos.row - fromPos.row, pos.col - fromPos.col) * 180) / Math.PI}
      <span
        class="fx-projectile {art === 'bolt' ? 'fx-proj-bolt' : 'fx-proj-arrow'}"
        style="--from-x: {fromPos.col - pos.col}; --from-y: {fromPos.row - pos.row};"
        aria-hidden="true"
      >
        <span class="fx-proj-glyph" style="transform: rotate({angle}deg)">{art === 'bolt' ? '✦' : '➤'}</span>
      </span>
    {:else if step.kind === 'damage'}
      <span class="fx-text fx-damage" class:fx-delayed={step.delayed}>-{step.value}</span>
    {:else if step.kind === 'buff'}
      <span class="fx-text fx-buff" class:fx-delayed={step.delayed}>+{step.value} {step.label}</span>
    {:else if step.kind === 'status'}
      <span class="fx-text fx-status">{step.icon}</span>
    {/if}
  </div>
{/each}
```

**Step 3: CSS**

```css
/* Projectile wrapper is exactly cell-sized (inset: 0), so translate
   percentages are cell multiples: --from-x/-y are (source − target) in
   cells. Flight runs source → rest position (the target cell), fading in
   the last 15% as the delayed damage text takes over. Board-plane flight:
   the layer lives inside the tilted .board, so cell math needs no
   foreshortening correction. */
.fx-projectile {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fx-fly var(--flight-ms, 300ms) linear forwards;
  pointer-events: none;
}

.fx-proj-glyph {
  font-size: 1.1rem;
  line-height: 1;
}

.fx-proj-arrow { color: #fbbf24; text-shadow: 0 1px 2px rgb(0 0 0 / 0.7); }
.fx-proj-bolt  { color: #c084fc; text-shadow: 0 0 6px rgb(192 132 252 / 0.9); font-size: 1.3rem; }

@keyframes fx-fly {
  0% {
    transform: translate(calc(var(--from-x) * 100%), calc(var(--from-y) * 100%));
    opacity: 1;
  }
  85% { opacity: 1; }
  100% {
    transform: translate(0, 0);
    opacity: 0;
  }
}

/* Text that waits for its projectile/bolt to land. backwards fill holds
   the 0% frame (opacity 0) through the delay. */
.fx-text.fx-delayed {
  animation-delay: var(--flight-ms, 0ms);
  animation-fill-mode: backwards;
}
```

And in the existing `prefers-reduced-motion` block:

```css
@media (prefers-reduced-motion: reduce) {
  .fx-projectile {
    animation: none;
    opacity: 0; /* no flight — the damage number alone tells the story */
  }
  .fx-text.fx-delayed {
    animation-delay: 0ms;
  }
}
```

**Step 4: Type-check + suite**

Run: `npx svelte-check --threshold error && npm test`
Expected: clean / PASS.

**Step 5: Commit**

```bash
git add src/lib/ui/BattleFx.svelte
git commit -m "feat: render arrow/bolt projectiles with delayed damage text"
```

---

### Task 5: Spell FX rendering (BattleFx.svelte)

**Files:**
- Modify: `src/lib/ui/BattleFx.svelte`

**Step 1: Add the render branch** (after the projectile branch)

```svelte
{:else if step.kind === 'spell_fx'}
  {#if step.spell === 'lightning'}
    <!-- Bolt stands up out of the board like a standee and strikes downward. -->
    <span class="fx-bolt-strike" aria-hidden="true">⚡</span>
  {:else}
    <span
      class="fx-glow {step.spell === 'bloodlust' ? 'fx-glow-attack' : 'fx-glow-defense'}"
      aria-hidden="true"
    ></span>
  {/if}
```

**Step 2: CSS**

```css
/* Lightning: stood up out of the board plane (inverse of the board tilt,
   hinged at the cell's bottom edge — same trick as .token-standing).
   --tilt inherits from .board's style attribute. Requires preserve-3d all
   the way down and NO filter/overflow on .fx-layer or .fx-cell (either
   flattens the 3D subtree — see the .preview comment in BattleGrid). */
.fx-bolt-strike {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  font-size: 2.4rem;
  line-height: 1;
  text-shadow: 0 0 10px rgb(250 204 21 / 0.9);
  transform-origin: 50% 100%;
  animation: fx-bolt var(--flight-ms, 300ms) ease-in forwards;
  pointer-events: none;
}

@keyframes fx-bolt {
  0% {
    opacity: 0;
    transform: rotateX(calc(-1 * var(--tilt))) translateY(-170%) scaleY(1.7);
  }
  30% {
    opacity: 1;
    transform: rotateX(calc(-1 * var(--tilt))) translateY(0) scaleY(1);
  }
  75% { opacity: 1; }
  100% {
    opacity: 0;
    transform: rotateX(calc(-1 * var(--tilt))) translateY(0) scaleY(1);
  }
}

/* Buff glow: a pulse in the board plane under the target's feet. */
.fx-glow {
  position: absolute;
  inset: 6%;
  border-radius: 50%;
  animation: fx-glow-pulse 0.9s ease-out forwards;
  pointer-events: none;
}

.fx-glow-attack  { background: radial-gradient(ellipse at center, rgb(248 113 113 / 0.65), transparent 70%); }
.fx-glow-defense { background: radial-gradient(ellipse at center, rgb(148 163 184 / 0.7), transparent 70%); }

@keyframes fx-glow-pulse {
  0%   { opacity: 0; transform: scale(0.4); }
  35%  { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(1.15); }
}
```

**Step 3: Enable 3D pass-through** — add to the existing `.fx-layer` and `.fx-cell` rules:

```css
.fx-layer {
  /* …existing… */
  transform-style: preserve-3d;
}

.fx-cell {
  /* …existing… */
  transform-style: preserve-3d;
}
```

**Step 4: Reduced motion** — add to the media block:

```css
.fx-bolt-strike,
.fx-glow {
  animation: fade-only 0.9s ease-out forwards;
}
```

(`fade-only` already exists in that block.) Note: `fade-only` neutralizes the transform keyframes, so the bolt renders flat in the board plane under reduced motion — acceptable.

**Step 5: Type-check + suite + commit**

Run: `npx svelte-check --threshold error && npm test`
Expected: clean / PASS.

```bash
git add src/lib/ui/BattleFx.svelte
git commit -m "feat: lightning bolt and buff glow spell FX"
```

---

### Task 6: End-to-end verification

**REQUIRED SUB-SKILL:** Use the `verify` skill (project skill: build, launch, and drive the battle UI).

Checklist to verify in the running app:

1. **Archer shot:** start a battle with a shooter (e.g. ranger/wizard faction army), shoot an enemy → amber `➤` flies from archer to target along the board plane, rotated toward travel; damage number pops on landing, not at launch.
2. **Hero attack:** on the hero's turn click an enemy → violet `✦` streaks in from the left flank (off-board) to the target.
3. **Lightning:** cast lightning from the spellbook → ⚡ flashes down standing upright at the target cell; damage number delayed until the strike lands.
4. **Bloodlust/Stoneskin:** cast on a friendly stack → red/gray glow pulse under the stack, then the +4 ATK/DEF text.
5. **Splash (area_shot unit, e.g. Liches if available):** primary target gets the arrow; splash victims get plain damage numbers, no arrows.
6. **Speeds:** flip battle speed slow/normal/fast — flight scales with the beat; nothing lingers or gets cut off (the 900ms `FX_TAIL_MS` covers the last beat).
7. **No hit-testing regressions:** during an enemy volley, mouse over the board — projectiles must not intercept clicks (`pointer-events: none` throughout).

Fix anything found (return to the relevant task's file), re-run `npm test`, then:

```bash
git add -A src/lib/ui
git commit -m "fix: projectile/spell fx polish from e2e verification"   # only if fixes were needed
```

---

## Out of scope (deliberately — YAGNI)

- **Projectile arcs / height** (`translateZ` lift mid-flight): flat board-plane flight first; add only if it reads poorly.
- **Per-unit projectile art** (fireballs for burn units, etc.): the `art` seam in Task 3 is where that plugs in later.
- **Hero cast/attack pose animation on the flank standee**: the flank hero `<Sprite>` supports poses (`attack`) — a nice follow-up, separate plan.
- **Particle effects / canvas layer**: not needed for any of this.
