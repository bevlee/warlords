# Melee Aim Stability — Design

**Problem:** Choosing the tile a melee attack comes from feels twitchy. Hovering an attackable enemy picks the attack origin by cursor direction inside that one small tile ([BattleGrid.svelte:122-150](../../src/lib/ui/BattleGrid.svelte)); the pick is recomputed on every mousemove as "nearest origin by angle" (max dot product). The boundaries between two candidate origins are razor-thin lines — near one, a couple of pixels of hand jitter flips a lined-up diagonal to the adjacent tile. The only stabilizer today is an 18%-radius dead zone at the tile center, which does nothing at mid-radius where most aiming happens.

**Decision:** Keep the interaction model exactly as it is (hover enemy → cursor direction picks origin → red tile + arrow → click confirms). Make the picking stable. Alternatives considered and rejected for now: directly clickable origin tiles, scroll-wheel cycling, ghost attacker preview — all change or add interaction surface; the complaint was purely about stability.

## The fix: angular hysteresis

Two rules added to the same math:

1. **Hysteresis margin.** The currently-picked origin stays picked unless another origin is *decisively* better: its angular distance to the cursor direction must beat the current pick's by a margin (`AIM_HYSTERESIS_DEG ≈ 20°`). Grazing a boundary no longer flips the pick; deliberately steering toward another tile still switches immediately. The first pick on entering the tile uses plain nearest-angle (no margin) so entry responsiveness is unchanged.

2. **Pick survives only while valid.** If the candidate origins change (a unit moved, shift toggled melee-aim for a shooter) and the current pick is no longer among them, re-pick fresh rather than comparing against a stale tile.

Unchanged: the 18% center dead zone, the `ROW_SQUASH` foreshortening correction (screen-space concern), the red origin tile, the orange direction arrow, shift-forces-melee, and click semantics.

## Structure

The direction math moves out of `BattleGrid.svelte` into a pure, unit-tested function:

```
src/lib/ui/aim.ts
  pickOrigin(current: Pos | null, origins: Pos[], target: Pos, cursor: {dx, dy}): Pos | null
```

- `cursor` is the foreshortening-corrected offset from the target tile's center — pixel/rect concerns stay in the component.
- Returns `current` unless a rival origin beats it by the margin; nearest-angle when `current` is null or invalid; null when `origins` is empty.

`updateAim` in BattleGrid shrinks to: guard interactivity/dead-zone (as now) → compute corrected cursor vector → `aim = { targetId, origin: pickOrigin(...) }`.

## Testing

Unit tests (`src/lib/ui/__tests__/aim.test.ts`) pin the behaviors that can't be seen in review:

- entry pick is nearest-angle;
- a cursor angle just past the midpoint between two origins does **not** flip an existing pick (jitter case);
- an angle beyond midpoint + margin **does** flip (deliberate steer);
- a `current` no longer in `origins` is ignored (fresh pick);
- empty origins → null.

End-to-end feel check via the `verify` skill: line up a diagonal attack, wiggle the cursor near a boundary — the red tile must hold; sweep decisively — it must follow.
