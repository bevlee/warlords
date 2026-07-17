# Pre-Battle Deployment Phase — Implementation Plan

**Status:** Planned
**Goal:** A placement step between army setup and combat where the player positions
their stacks in a deployment zone and may split them strategically, capped at
**7 stacks on the field**.

---

## 1. Current behavior

`initBattle` (`src/lib/engine/battle.ts`) auto-places player stacks via
`slotToStack`: column `1 + tacticsShift`, rows spaced by
`1 + i * Math.floor((GRID_H - 2) / 6)`. The player has no say. Recruiting caps
at `MAX_STACKS = 6` unit *types* (`recruit.ts`); splitting during deployment is
what raises the field cap to 7 *stacks*.

Two structural facts shape this plan:

1. **Obstacles are seeded inside `initBattle`** using the same `mulberry32(seed)`
   stream that first draws per-stack ATB jitter. The player must see rocks while
   placing units, and the number of stacks (which splitting changes!) must not
   perturb the rock layout. So obstacle generation must move to its own
   deterministic stream, decoupled from unit count.
2. Knight **Tactics** (`getTacticsShift`) currently shifts the start column.
   With manual placement it becomes a *wider deployment zone* instead.

## 2. Engine changes

### 2.1 Types (`types.ts`)

```ts
export interface Deployment {
  unit: UnitDef;   // same reference/copy as the ArmySlot it came from
  count: number;
  pos: Pos;
}
export const MAX_FIELD_STACKS = 7;
```

### 2.2 Deterministic battlefield preview (`battle.ts`)

Extract obstacle seeding into a pure function on an independent RNG stream
(reuse the `mixSeed` hash from `src/lib/gauntlet/run.ts` — move it to
`engine/rng.ts` since it's engine-grade):

```ts
const OBSTACLE_SALT = 0x0b57ac1e;

/** Rock positions for a given seed — independent of army composition. */
export function generateObstacles(seed: number): Pos[] {
  const rng = mulberry32(mixSeed(seed, OBSTACLE_SALT));
  // same loop as today: 7 rocks, cols 3–8, guard 100, skipping duplicates
}
```

`initBattle` calls `generateObstacles(seed)` and marks cells blocked; the ATB
jitter keeps the raw `mulberry32(seed)` stream. Existing replays aren't a
feature (no battle persistence), so changing layouts for a given seed is safe.

Also export the deployment zone so UI and validation agree:

```ts
/** Player columns 0..(1 + tacticsShift), all rows, minus obstacle cells. */
export function deploymentZone(hero: Hero, obstacles: Pos[]): Pos[];
```

### 2.3 `initBattle` accepts a deployment

```ts
export function initBattle(
  playerArmy: ArmySlot[],
  enemyArmy: ArmySlot[],
  hero: Hero,
  seed = Date.now(),
  playerDeployment?: Deployment[],
): BattleState
```

- When `playerDeployment` is provided, player stacks are built from it (one
  `UnitStack` per entry — each gets its own morale/luck/logistics bonuses from
  the existing per-stack loop, its own ATB jitter, its own `shotsLeft`).
- When absent (enemy side, AI, tests, gauntlet in v1), the current
  `slotToStack` auto-layout runs unchanged.
- Validation before building (`validateDeployment(playerArmy, deployment, hero, obstacles)`):
  - ≤ `MAX_FIELD_STACKS` entries, every `count ≥ 1`;
  - positions unique and inside `deploymentZone`;
  - per unit name, `Σ deployment.count === Σ playerArmy.count` (splits must
    conserve creatures; no partial benching in v1).
  On failure, throw in dev/tests; the UI can't produce invalid input because it
  builds from the same helpers.

The Necromancy `bonusSkeletons` slot is appended to `playerArmy` in
`+page.svelte` *before* the deployment screen, so free Skeletons are placeable
and splittable like anything else.

### 2.4 Split/merge helpers (pure, tested)

```ts
// engine/deploy.ts (new)
export function autoDeploy(army: ArmySlot[], hero: Hero, obstacles: Pos[]): Deployment[]; // today's layout
export function splitDeployment(d: Deployment[], index: number, count: number): Deployment[]; // clones entry, count moved to a new unplaced entry; rejects if d.length >= MAX_FIELD_STACKS
export function mergeDeployment(d: Deployment[], from: number, into: number): Deployment[];   // same unit name only
```

## 3. UI

### 3.1 Flow (`src/routes/+page.svelte`)

New screen state `'deploy'` between `'setup'` and `'battle'`:

```
startBattle(army):
  seed = Date.now() % 2**31
  enemyArmy = generate... (as today)
  obstacles = generateObstacles(seed)
  deployment = autoDeploy(playerArmy, hero, obstacles)
  screen = 'deploy'
confirmDeploy(deployment):
  screen = 'battle'   // Battle.svelte receives seed + deployment
```

`Battle.svelte` gains optional `seed` and `deployment` props forwarded to
`initBattle` (it currently seeds internally; make the prop win so the preview
and the battle share rocks).

### 3.2 `DeploymentScreen.svelte` (new, `src/lib/ui/`)

- Renders the same 12×10 perspective board (reuse `BattleGrid.svelte` in a new
  `mode="deploy"`: no ATB bar, no action handling; alternatively a slimmer
  read-only grid component if `BattleGrid` is too battle-coupled — decide during
  implementation, prefer reuse).
- **Deploy zone highlighted** (existing lit-square styling); rocks rendered from
  `generateObstacles(seed)`; enemy stacks drawn at their auto positions as
  dimmed silhouettes (they're deterministic from `enemyArmy`, and LordsWM shows
  the enemy during tactics too).
- Interactions:
  - click a placed stack → pick up; click a zone cell → drop;
  - drag-and-drop as progressive enhancement, click-click is the baseline;
  - **Split** button on the selected stack → numeric input (1..count−1),
    creates a tray entry; disabled at 7 stacks with a `7/7 stacks` counter;
  - **Merge**: dropping a stack onto a same-name stack merges;
  - **Auto** button restores `autoDeploy`;
  - **Start battle** disabled while any tray entry is unplaced.
- Tray strip along the bottom lists unplaced entries with sprite + count
  (reuses `Sprite.svelte`).

### 3.3 Persistence nice-to-have (v1.1)

Save the confirmed layout as a template keyed by
`faction + sorted unit names` in the existing `kv` store (`storage.ts`), and
seed `autoDeploy` from it when the army composition matches. Not in v1.

## 4. AI / enemy

Enemy keeps auto-layout. A later pass can give campaign bosses scripted
deployments via the same `Deployment[]` parameter — the engine API already
supports it after this change (add `enemyDeployment?` at that point, not now).

## 5. Tests

- `generateObstacles`: same seed → same rocks regardless of army sizes; rocks
  within cols 3–8; ≤ 7 rocks.
- `validateDeployment`: rejects out-of-zone, duplicate cell, count mismatch,
  8 stacks; accepts a legal 7-stack split.
- `splitDeployment`/`mergeDeployment` conservation invariants (property-style:
  total per unit name never changes).
- `initBattle` with a deployment: stacks land on given cells, occupancy set,
  per-stack buffs (Leadership morale, Logistics speed) applied to *each* split
  stack, tacticsShift widens the zone.
- Regression: `initBattle` without deployment matches today's layout.

## 6. Steps

1. Move `mixSeed` to `engine/rng.ts`; extract `generateObstacles`; keep
   `initBattle` behavior identical (rock layouts may differ per seed — fine).
2. `Deployment` type, `deploy.ts` helpers, `validateDeployment`,
   `initBattle` param. Tests green.
3. `DeploymentScreen.svelte` + screen wiring in `+page.svelte`; `Battle.svelte`
   seed/deployment props.
4. Split/merge UI, 7-stack counter, silhouettes.
5. `verify` run: split Goblins into three stacks, confirm rocks match preview,
   confirm each split stack gets its own turn on the ATB bar.

## 7. Interactions with other planned features

- **Tier unlocks**: deployment consumes the validated army; order in
  `startBattle` is filter → skeleton append → augment → deploy.
- **Augments**: `Deployment.unit` must be the *augmented* def — apply
  `applyAugmentsToArmy` before `autoDeploy`.
- **Neutral structures** (2026-07-17-neutral-structures-plan.md): structures are
  seeded from the same battlefield seed and shown on the deployment preview.
- **Gauntlet**: out of scope in v1; it calls `initBattle` without a deployment
  and keeps auto-layout until this ships and stabilizes.
