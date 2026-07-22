<script lang="ts">
  import type { BattleState, Pos, UnitStack } from '$lib/engine/types';
  import type { DamagePreview } from '$lib/engine/selectors';
  import type { AnimStep } from './animSteps';
  import { pickScreenOrigin, type ScreenOrigin, type ScreenPoint } from './aim';
  import UnitToken from './UnitToken.svelte';
  import Sprite from './Sprite.svelte';
  import BattleFx from './BattleFx.svelte';

  interface Props {
    state: BattleState;
    reachableKeys: Set<string>;
    movementRangeKeys: Set<string>;
    shootingRangeKeys: Set<string>;
    targetIds: Set<string>;
    activeId: string | null;
    interactive: boolean;
    /** Deployment: highlight `deployableKeys`, route clicks to ondeploy*. */
    deployMode?: boolean;
    deployableKeys?: Set<string>;
    selectedDeployId?: string | null;
    actionIcons: Map<string, 'melee' | 'shoot' | 'spell'>;
    penalizedShotIds: Set<string>;
    originsByTarget: Map<string, Pos[]>;
    previews: Map<string, DamagePreview>;
    hoveredId: string | null;
    activeSteps: { unitId: string; step: AnimStep }[];
    dyingIds: Set<string>;
    /** Die later in this reveal batch — kept mounted at count 0 until then. */
    doomedIds: Set<string>;
    stepMs: number;
    fxFloatMs: number;
    deathMs: number;
    oncellclick: (pos: Pos) => void;
    onunitclick: (unit: UnitStack, shift: boolean) => void;
    onmeleeaim: (targetId: string, origin: Pos) => void;
    ontargetingchange?: (mode: 'choose' | 'drag' | null) => void;
    ondeploycell?: (pos: Pos) => void;
    ondeployunit?: (unit: UnitStack) => void;
    onunithover: (unit: UnitStack | null) => void;
    onunitinspect: (unit: UnitStack | null) => void;
  }

  let {
    state: battleState,
    reachableKeys,
    movementRangeKeys,
    shootingRangeKeys,
    targetIds,
    activeId,
    interactive,
    deployMode = false,
    deployableKeys = new Set<string>(),
    selectedDeployId = null,
    actionIcons,
    penalizedShotIds,
    originsByTarget,
    previews,
    hoveredId,
    activeSteps,
    dyingIds,
    doomedIds,
    stepMs,
    fxFloatMs,
    deathMs,
    oncellclick,
    onunitclick,
    onmeleeaim,
    ontargetingchange,
    ondeploycell,
    ondeployunit,
    onunithover,
    onunitinspect,
  }: Props = $props();

  const TILT_DEG = 38;

  // One cell of travel in percent of the standee's own box (92% × 118% of a cell).
  const CELL_X = 100 / 0.92;
  const CELL_Y = 100 / 1.18;

  // Per-standee animation for the current beat. This is the seam for richer
  // combat animation later: add a step kind in animSteps.ts, then map it here
  // to a class plus CSS vars (and keyframes below). All animations run in the
  // board plane — translate before the rotateX that stands the token up.
  const standeeAnim = $derived.by(() => {
    const map = new Map<string, { cls: string; style: string }>();
    const ms = `--anim-ms: ${Math.round(stepMs * 0.9)}ms;`;
    for (const { unitId, step } of activeSteps) {
      if (step.kind === 'move') {
        // Slide: start translated back at the source cell, settle in place.
        const dx = (step.from.col - step.to.col) * CELL_X;
        const dy = (step.from.row - step.to.row) * CELL_Y;
        map.set(unitId, { cls: 'sliding', style: `--slide-x: ${dx}%; --slide-y: ${dy}%; ${ms}` });
      } else if (step.kind === 'strike') {
        // Melee lunge: bump ~45% of a cell toward the target and spring back.
        const attacker = unitsById.get(unitId);
        const target = unitsById.get(step.targetId);
        if (!attacker || !target) continue;
        const dx = Math.max(-1, Math.min(1, target.pos.col - attacker.pos.col)) * 0.45 * CELL_X;
        const dy = Math.max(-1, Math.min(1, target.pos.row - attacker.pos.row)) * 0.45 * CELL_Y;
        map.set(unitId, { cls: 'striking', style: `--strike-x: ${dx}%; --strike-y: ${dy}%; ${ms}` });
      } else if (step.kind === 'recoil') {
        // Hit reaction: flinch ~18% of a cell away from the attacker, delayed
        // to the moment of impact — melee contact (~35% into the lunge, which
        // peaks at 40%) or the projectile's landing (flight = 60% of the beat).
        const victim = unitsById.get(unitId);
        const attacker = unitsById.get(step.fromId);
        if (!victim || !attacker) continue;
        const dx = Math.max(-1, Math.min(1, victim.pos.col - attacker.pos.col)) * 0.18 * CELL_X;
        const dy = Math.max(-1, Math.min(1, victim.pos.row - attacker.pos.row)) * 0.18 * CELL_Y;
        const delay = Math.round(stepMs * (step.delayed ? 0.6 : 0.9 * 0.35));
        map.set(unitId, {
          cls: 'recoiling',
          style: `--recoil-x: ${dx}%; --recoil-y: ${dy}%; --recoil-delay: ${delay}ms; ${ms}`,
        });
      }
    }
    return map;
  });

  // A dying stack's count already reads 0 (patched by applyLogEntry ahead of
  // the engine's real state) but must keep rendering — still occupying its
  // grid cell — through the death-fade transition.
  const unitsById = $derived(
    new Map(
      battleState.units
        .filter(u => u.count > 0 || dyingIds.has(u.id) || doomedIds.has(u.id))
        .map(u => [u.id, u])
    )
  );

  // LordsWM-style cursors: the pointer itself becomes a sword/bow near targets.
  function emojiCursor(emoji: string): string {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28'><text y='22' font-size='20'>${emoji}</text></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 14 14, crosshair`;
  }
  const SWORD_CURSOR = emojiCursor('⚔️');
  const BOW_CURSOR = emojiCursor('🏹');
  // There is no broken-bow Unicode glyph, so draw one in the same warm,
  // illustrated vein as the normal bow cursor: a split wooden stave, loose
  // string, and snapped arrow. It only appears while hovering a penalized shot.
  const BROKEN_BOW_CURSOR = (() => {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='30' height='30' viewBox='0 0 30 30'>
      <path d='M6 3Q15 7 18 13L14 12L17 16' fill='none' stroke='#8b4513' stroke-width='4.5' stroke-linecap='round' stroke-linejoin='round'/>
      <path d='M15 18L12 16L13 20Q11 25 6 27' fill='none' stroke='#8b4513' stroke-width='4.5' stroke-linecap='round' stroke-linejoin='round'/>
      <path d='M6 3Q14 7 17 13' fill='none' stroke='#f6ad3c' stroke-width='2.2' stroke-linecap='round'/>
      <path d='M13 19Q11 24 6 27' fill='none' stroke='#f6ad3c' stroke-width='2.2' stroke-linecap='round'/>
      <path d='M6 3L12 12M11 19L6 27' fill='none' stroke='#f8e7bd' stroke-width='1.4' stroke-linecap='round'/>
      <path d='M3 25L12 16M17 11L25 3' fill='none' stroke='#d7dde8' stroke-width='2.1' stroke-linecap='round'/>
      <path d='M23 3L27 1L25 5Z' fill='#cbd5e1' stroke='#64748b' stroke-width='.7'/>
      <path d='M3 25L1 29M3 25L7 27' fill='none' stroke='#e34b4b' stroke-width='1.7' stroke-linecap='round'/>
      <path d='M13 13L16 16L13 18L17 20' fill='none' stroke='#fef3c7' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/>
    </svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 15 15, crosshair`;
  })();
  const SPELL_CURSOR = emojiCursor('✨');

  // Shift forces melee aiming for shooters (LordsWM parity).
  let shiftHeld = $state(false);
  function onKeyDown(e: KeyboardEvent) {
    shiftHeld = e.shiftKey;
    if (e.key === 'Escape' && (attackDrag || explicitTargetId)) {
      e.preventDefault();
      cancelAttackDrag();
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    shiftHeld = e.shiftKey;
  }

  // Clicking/tapping an attackable enemy enters explicit targeting, where every
  // legal origin is a full-cell choice. Press-drag-release remains an expert
  // shortcut. Pointer capture keeps that gesture stable across the board's
  // transformed, overlapping standees.
  let aim = $state<{ targetId: string; origin: Pos } | null>(null);
  let explicitTargetId = $state<string | null>(null);
  let boardEl: HTMLElement;
  let suppressNextClick = false;

  interface AttackDrag {
    targetId: string;
    pointerId: number;
    captureEl: HTMLElement;
    start: ScreenPoint;
    moved: boolean;
    cancel: boolean;
    origin: Pos | null;
  }

  let attackDrag = $state<AttackDrag | null>(null);

  const DRAG_THRESHOLD_PX = 10;
  const CANCEL_RADIUS_RATIO = 0.28;

  function meleeAimable(id: string): boolean {
    if (!originsByTarget.has(id)) return false;
    const icon = actionIcons.get(id);
    return icon === 'melee' || (icon === 'shoot' && shiftHeld);
  }

  function rectCenter(rect: DOMRect): ScreenPoint {
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  function originCandidates(origins: Pos[]): ScreenOrigin[] {
    if (!boardEl) return [];
    const candidates: ScreenOrigin[] = [];
    for (const origin of origins) {
      const cell = boardEl.querySelector<HTMLElement>(`[data-cell-key="${cellKey(origin.col, origin.row)}"]`);
      if (cell) candidates.push({ origin, center: rectCenter(cell.getBoundingClientRect()) });
    }
    return candidates;
  }

  function originAtPoint(unit: UnitStack, targetEl: HTMLElement, point: ScreenPoint, current: Pos | null): Pos | null {
    const origins = originsByTarget.get(unit.id) ?? [];
    return pickScreenOrigin(current, originCandidates(origins), rectCenter(targetEl.getBoundingClientRect()), point);
  }

  function samePos(a: Pos, b: Pos): boolean {
    return a.col === b.col && a.row === b.row;
  }

  function defaultOrigin(unit: UnitStack): Pos | null {
    const origins = originsByTarget.get(unit.id) ?? [];
    const active = battleState.units.find(candidate => candidate.id === activeId);
    return (active && origins.find(origin => samePos(origin, active.pos))) ?? origins[0] ?? null;
  }

  function beginExplicitTargeting(unit: UnitStack) {
    explicitTargetId = unit.id;
    // Every origin is presented equally after a click. Directional selection
    // only begins if the pointer actually becomes a drag.
    aim = null;
  }

  function clearTargeting() {
    explicitTargetId = null;
    aim = null;
  }

  function releaseDragCapture(drag: AttackDrag) {
    if (drag.captureEl.hasPointerCapture(drag.pointerId)) drag.captureEl.releasePointerCapture(drag.pointerId);
  }

  function suppressFollowingClick() {
    suppressNextClick = true;
    // Native click normally follows pointerup in the same event cycle. Clear
    // defensively so platforms that omit that click cannot swallow the user's
    // next, unrelated action.
    setTimeout(() => {
      suppressNextClick = false;
    }, 0);
  }

  function cancelAttackDrag() {
    if (attackDrag) {
      suppressFollowingClick();
      releaseDragCapture(attackDrag);
    }
    attackDrag = null;
    clearTargeting();
  }

  function handlePointerDown(e: PointerEvent, unit: UnitStack) {
    if (e.button !== 0 || !interactive || !meleeAimable(unit.id)) return;
    // Once the player is choosing a position, let the normal click handler
    // commit an origin, cancel on the selected enemy, or switch targets.
    if (explicitTargetId) return;
    e.preventDefault();
    const captureEl = e.currentTarget as HTMLElement;
    const point = { x: e.clientX, y: e.clientY };
    const origin = originAtPoint(unit, captureEl, point, null) ?? defaultOrigin(unit);
    // Reveal all choices immediately. If this remains a tap they stay open;
    // if it becomes a drag they provide visible destinations for the gesture.
    explicitTargetId = unit.id;
    aim = null;
    attackDrag = {
      targetId: unit.id,
      pointerId: e.pointerId,
      captureEl,
      start: point,
      moved: false,
      cancel: false,
      origin,
    };
    captureEl.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: PointerEvent, unit: UnitStack) {
    const drag = attackDrag;
    if (!drag || drag.pointerId !== e.pointerId || drag.targetId !== unit.id) {
      return;
    }

    const point = { x: e.clientX, y: e.clientY };
    const distance = Math.hypot(point.x - drag.start.x, point.y - drag.start.y);
    const moved = drag.moved || distance >= DRAG_THRESHOLD_PX;
    if (!moved) return;

    const targetRect = drag.captureEl.getBoundingClientRect();
    const targetCenter = rectCenter(targetRect);
    const inCancelZone = Math.hypot(point.x - targetCenter.x, point.y - targetCenter.y)
      <= Math.min(targetRect.width, targetRect.height) * CANCEL_RADIUS_RATIO;
    const boardRect = boardEl.getBoundingClientRect();
    const outsideBoard = point.x < boardRect.left || point.x > boardRect.right || point.y < boardRect.top || point.y > boardRect.bottom;
    const cancel = inCancelZone || outsideBoard;
    const current = drag.origin;
    const origin = cancel ? null : originAtPoint(unit, drag.captureEl, point, current);
    attackDrag = { ...drag, moved, cancel: cancel || !origin, origin };
    aim = origin ? { targetId: unit.id, origin } : null;
  }

  function handlePointerUp(e: PointerEvent, unit: UnitStack) {
    const pending = attackDrag;
    if (!pending || pending.pointerId !== e.pointerId || pending.targetId !== unit.id) return;
    // Re-evaluate the release coordinate itself. A fast pointer can leave the
    // board between the browser's final move event and pointerup.
    handlePointerMove(e, unit);
    const drag = attackDrag;
    if (!drag) return;
    releaseDragCapture(drag);
    attackDrag = null;
    suppressFollowingClick();

    if (!drag.moved) {
      beginExplicitTargeting(unit);
      return;
    }
    if (drag.cancel || !drag.origin) {
      clearTargeting();
      return;
    }
    clearTargeting();
    onmeleeaim(unit.id, drag.origin);
  }

  function handlePointerCancel(e: PointerEvent) {
    if (!attackDrag || attackDrag.pointerId !== e.pointerId) return;
    cancelAttackDrag();
  }

  const aimKey = $derived(aim ? `${aim.origin.col},${aim.origin.row}` : null);
  const explicitOriginKeys = $derived.by(() => {
    if (!explicitTargetId) return new Set<string>();
    return new Set((originsByTarget.get(explicitTargetId) ?? []).map(origin => cellKey(origin.col, origin.row)));
  });

  // A locked board must not retain an in-progress origin or explicit target.
  $effect(() => {
    if (!interactive) {
      if (attackDrag) releaseDragCapture(attackDrag);
      attackDrag = null;
      clearTargeting();
    } else if (explicitTargetId && !originsByTarget.has(explicitTargetId)) {
      clearTargeting();
    }
  });

  $effect(() => {
    ontargetingchange?.(attackDrag?.moved ? 'drag' : explicitTargetId || attackDrag ? 'choose' : null);
  });

  function cellKey(col: number, row: number): string {
    return `${col},${row}`;
  }

  function cursorFor(occupantId: string | null, attackable: boolean): string {
    if (!interactive) return 'default';
    if (occupantId && attackable) {
      if (meleeAimable(occupantId)) return SWORD_CURSOR;
      const icon = actionIcons.get(occupantId);
      if (icon === 'shoot') return penalizedShotIds.has(occupantId) ? BROKEN_BOW_CURSOR : BOW_CURSOR;
      if (icon === 'spell') return SPELL_CURSOR;
      return SWORD_CURSOR;
    }
    return '';
  }

  function handleClick(col: number, row: number, shift: boolean) {
    const cell = battleState.grid.cells[row][col];
    const occupant = cell.occupantId ? unitsById.get(cell.occupantId) : undefined;
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    if (explicitTargetId) {
      const targetId = explicitTargetId;
      if (explicitOriginKeys.has(cellKey(col, row))) {
        clearTargeting();
        onmeleeaim(targetId, { col, row });
      } else if (occupant && occupant.id !== targetId && meleeAimable(occupant.id)) {
        beginExplicitTargeting(occupant);
      } else {
        clearTargeting();
      }
      return;
    }
    if (cell.blocked) return;
    if (deployMode) {
      if (occupant) ondeployunit?.(occupant);
      else ondeploycell?.({ col, row });
      return;
    }
    if (!interactive) return;
    if (occupant) {
      if (meleeAimable(occupant.id)) {
        // Keyboard-generated clicks and browsers without Pointer Events use
        // the same explicit, cancellable flow as a simple pointer click.
        beginExplicitTargeting(occupant);
      } else {
        onunitclick(occupant, shift);
      }
    } else {
      oncellclick({ col, row });
    }
  }
</script>

<svelte:window onkeydown={onKeyDown} onkeyup={onKeyUp} />

<!-- Perspective viewport: tilts the board like a tabletop. The stage is a
     size container so the perspective distance scales with board width —
     without that, browser zoom changes the board's px size against a fixed
     perspective and the projection balloons past its layout box. -->
<div class="board-stage">
<div class="board-viewport">
  <div
    bind:this={boardEl}
    class="board grid rounded-md border border-indigo-300/20 bg-slate-800/60 p-0.5"
    style="grid-template-columns: repeat({battleState.grid.width}, minmax(0, 1fr)); --tilt: {TILT_DEG}deg; --death-ms: {deathMs}ms;"
  >
    {#each battleState.grid.cells as row (row[0].row)}
      {#each row as cell (cellKey(cell.col, cell.row))}
        {@const occupant = cell.occupantId ? unitsById.get(cell.occupantId) : undefined}
        {@const deployTarget = deployMode && deployableKeys.has(cellKey(cell.col, cell.row))}
        {@const reachable = reachableKeys.has(cellKey(cell.col, cell.row)) || deployTarget}
        {@const inMovementRange = movementRangeKeys.has(cellKey(cell.col, cell.row))}
        {@const inShootingRange = shootingRangeKeys.has(cellKey(cell.col, cell.row))}
        {@const attackable = !deployMode && !!occupant && targetIds.has(occupant.id)}
        {@const isAimOrigin = aimKey === cellKey(cell.col, cell.row)}
        {@const isExplicitOrigin = explicitOriginKeys.has(cellKey(cell.col, cell.row))}
        {@const isExplicitTarget = explicitTargetId === occupant?.id}
        {@const deploySelected = deployMode && !!occupant && occupant.id === selectedDeployId}
        <button
          type="button"
          data-cell-key={cellKey(cell.col, cell.row)}
          class="cell relative aspect-square border border-indigo-300/15
            {reachable ? 'bg-slate-500/50 hover:bg-slate-400/50' : 'bg-slate-900/70'}
            {inMovementRange ? 'movement-range-cell' : ''}
            {inShootingRange ? 'shooting-range-cell' : ''}
            {attackable ? 'attackable' : ''}
            {isAimOrigin ? 'aim-origin' : ''}
            {isExplicitOrigin ? 'explicit-origin' : ''}
            {isExplicitTarget ? 'explicit-target' : ''}
            {deploySelected ? 'deploy-selected' : ''}
            {!interactive && !deployMode ? 'cursor-default' : ''}"
          style:cursor={deployMode ? (occupant?.side === 'player' && !occupant.isHero ? 'pointer' : deployTarget ? 'pointer' : 'default') : cursorFor(cell.occupantId, attackable)}
          aria-label={cell.blocked
            ? `obstacle at ${cell.col},${cell.row}`
            : occupant
              ? `${occupant.definition.name} ×${occupant.count} at ${cell.col},${cell.row}${isExplicitOrigin ? ' — attack from here' : ''}`
              : `cell ${cell.col},${cell.row}${isExplicitOrigin ? ' — attack from here' : ''}`}
          aria-pressed={isExplicitTarget || undefined}
          onclick={e => handleClick(cell.col, cell.row, e.shiftKey)}
          oncontextmenu={e => {
            e.preventDefault();
            if (attackDrag || explicitTargetId) cancelAttackDrag();
            else onunitinspect(occupant ?? null); // right-click normally inspects
          }}
          onmouseenter={() => onunithover(occupant ?? null)}
          onpointerdown={occupant && !deployMode ? e => handlePointerDown(e, occupant) : undefined}
          onpointermove={occupant && !deployMode ? e => handlePointerMove(e, occupant) : undefined}
          onpointerup={occupant && !deployMode ? e => handlePointerUp(e, occupant) : undefined}
          onpointercancel={handlePointerCancel}
          onmouseleave={() => onunithover(null)}
        >
          {#if occupant}
            <span class="token-shadow" aria-hidden="true"></span>
            {#if occupant.id === activeId}
              <span class="active-arc" aria-hidden="true"></span>
            {/if}
            {@const anim = standeeAnim.get(occupant.id)}
            <div
              class="token-standing {anim?.cls ?? ''}"
              class:hover-glow={occupant.id === hoveredId}
              class:dying={dyingIds.has(occupant.id)}
              style={anim?.style ?? ''}
            >
              <UnitToken unit={occupant} active={occupant.id === activeId} dying={dyingIds.has(occupant.id)} />
            </div>
            {#if attackable && (hoveredId === occupant.id || aim?.targetId === occupant.id) && previews.has(occupant.id)}
              {@const p = previews.get(occupant.id)!}
              <div class="preview" aria-hidden="true">
                💀 {p.killsMin}–{p.killsMax}<br />💥 {p.min}–{p.max}
              </div>
            {/if}
          {:else if cell.blocked}
            <span class="token-shadow" aria-hidden="true"></span>
            <div class="token-standing rock-wrap" aria-hidden="true">
              <Sprite name="Rock" class="h-3/4 w-auto" />
            </div>
          {/if}
          {#if isExplicitOrigin}
            <span class="origin-marker" aria-hidden="true">⚔</span>
          {/if}
          {#if occupant && attackDrag?.targetId === occupant.id && attackDrag.cancel}
            <span class="cancel-marker" aria-hidden="true">Cancel</span>
          {/if}
        </button>
      {/each}
    {/each}
  </div>
  <BattleFx
    gridWidth={battleState.grid.width}
    gridHeight={battleState.grid.height}
    {stepMs}
    {fxFloatMs}
    steps={activeSteps
      .filter(({ step }) => step.kind !== 'move' && step.kind !== 'strike' && step.kind !== 'recoil')
      .map(({ unitId, step }): { step: AnimStep; pos: Pos; fromPos?: Pos; art?: 'arrow' | 'bolt'; key: string } | null => {
        const key = `${unitId}-${step.kind}-${battleState.log.length}`;
        if (step.kind === 'projectile') {
          // Anchor at the target cell (always on-grid); the source only feeds
          // the flight-start offset, so the hero's off-grid col -2 is fine.
          const from = unitsById.get(unitId);
          const target = unitsById.get(step.targetId);
          if (!from || !target) return null;
          return { step, pos: target.pos, fromPos: from.pos, art: from.isHero ? 'bolt' : 'arrow', key };
        }
        const u = unitsById.get(unitId);
        return u ? { step, pos: u.pos, key } : null;
      })
      .filter(s => s !== null)}
  />
</div>
</div>

<style>
  .board-stage {
    container-type: inline-size;
    position: relative;
  }

  .board-viewport {
    /* 155cqw ≈ the old 1400px at a ~900px board, but zoom/size-invariant:
       the projected shape is now always the same fraction of board width. */
    perspective: 155cqw;
    perspective-origin: 50% 40%;
  }

  .board {
    transform: rotateX(var(--tilt)) scale(0.97);
    transform-style: preserve-3d;
    transform-origin: 50% 50%;
    /* Reclaim the vertical space the tilt foreshortens away: the layout box
       is the untilted height, ~20% taller than the projected board. The
       controls and turn bar below sit in their own z-raised stacking
       contexts, so the projected near edge overlapping this margin cannot
       swallow their clicks (that was the old reason to avoid this). */
    /* Measured with the cqw perspective: these make the layout box hug the
       projected board (visual height ≈ 0.68 × width) at every size/zoom. */
    margin-top: -13%;
    margin-bottom: -2%;
  }

  .cell {
    transform-style: preserve-3d;
  }

  .cell.attackable {
    touch-action: none;
  }

  /* Movement stays the primary hover read for every unit. */
  .cell.movement-range-cell {
    box-shadow: inset 0 0 0 1.5px rgb(56 189 248 / 0.4);
    background-color: rgb(56 189 248 / 0.12);
  }

  /* A ranged unit layers its full-damage shooting radius over movement with
     an amber dashed inset, leaving the blue movement fill visible beneath. */
  .cell.shooting-range-cell::before {
    content: '';
    position: absolute;
    z-index: 1;
    inset: 2px;
    border: 1.5px dashed rgb(251 191 36 / 0.75);
    border-radius: 2px;
    pointer-events: none;
  }

  /* Hovering an attackable enemy edges its tile red (LordsWM). */
  .cell.attackable:hover,
  .cell.aim-origin {
    box-shadow: inset 0 0 0 2px rgb(239 68 68 / 0.9);
  }

  .cell.aim-origin {
    background-color: rgb(239 68 68 / 0.18);
  }

  /* Simple-click targeting: every legal landing cell is an equal full-size
     sword target. The stronger red origin appears only during an active drag. */
  .cell.explicit-origin {
    background-color: rgb(245 158 11 / 0.22);
    box-shadow: inset 0 0 0 2px rgb(245 158 11 / 0.9);
    cursor: pointer;
  }

  .cell.explicit-origin.aim-origin {
    background-color: rgb(239 68 68 / 0.22);
    box-shadow: inset 0 0 0 2px rgb(239 68 68 / 0.95);
  }

  .cell.explicit-target {
    background-color: rgb(239 68 68 / 0.25);
    box-shadow: inset 0 0 0 3px rgb(248 113 113 / 0.95), 0 0 12px rgb(239 68 68 / 0.45);
  }

  /* The stack picked up during deployment. */
  .cell.deploy-selected {
    box-shadow: inset 0 0 0 2.5px rgb(251 191 36 / 0.95);
    background-color: rgb(251 191 36 / 0.15);
  }

  .origin-marker {
    position: absolute;
    right: 7%;
    top: 7%;
    z-index: 2;
    font-size: 0.9rem;
    line-height: 1;
    color: #fbbf24;
    filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.85));
    pointer-events: none;
  }

  .cancel-marker {
    position: absolute;
    inset: 28%;
    z-index: 4;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 9999px;
    background: rgb(15 23 42 / 0.92);
    box-shadow: 0 0 0 2px rgb(148 163 184 / 0.9);
    color: #f8fafc;
    font: 700 9px/1 ui-monospace, monospace;
    pointer-events: none;
  }

  /* Turn-bar hover sync: pick the stack out on the battlefield. */
  .hover-glow {
    filter: brightness(1.35) drop-shadow(0 0 5px rgb(255 255 255 / 0.45));
  }

  /* Token rises out of the board plane, like a cardboard standee.
     pointer-events stays ON: the standee is a child of its cell button, so
     clicks anywhere on the visible token bubble to the right cell. With
     pointer-events: none, real-input hit testing through the 3D transform
     intermittently routed clicks to a neighbouring cell — a silent no-op. */
  .token-standing {
    position: absolute;
    left: 4%;
    right: 4%;
    height: 118%;
    top: auto;
    bottom: 0;
    transform: rotateX(calc(-1 * var(--tilt)));
    transform-origin: 50% 100%;
  }

  /* Move beat: slide from the source cell into place. The translate runs in
     the board plane (before the rotateX that stands the token up). */
  .token-standing.sliding {
    animation: standee-slide var(--anim-ms, 400ms) ease-in-out;
  }

  @keyframes standee-slide {
    from {
      transform: translate(var(--slide-x), var(--slide-y)) rotateX(calc(-1 * var(--tilt)));
    }
    to {
      transform: rotateX(calc(-1 * var(--tilt)));
    }
  }

  /* Attack beat: the attacker lunges into the target and springs back. */
  .token-standing.striking {
    animation: standee-strike var(--anim-ms, 400ms) ease-in-out;
  }

  /* Hit reaction: the target flinches away from the attack and settles
     back. --recoil-delay times it to the moment of impact (melee contact
     or projectile landing), not the start of the beat. */
  .token-standing.recoiling {
    animation: standee-recoil var(--anim-ms, 400ms) ease-out;
    animation-delay: var(--recoil-delay, 0ms);
  }

  @keyframes standee-recoil {
    0%,
    100% {
      transform: rotateX(calc(-1 * var(--tilt)));
    }
    30% {
      transform: translate(var(--recoil-x), var(--recoil-y)) rotateX(calc(-1 * var(--tilt)));
    }
  }

  @keyframes standee-strike {
    0%,
    100% {
      transform: rotateX(calc(-1 * var(--tilt)));
    }
    40% {
      transform: translate(var(--strike-x), var(--strike-y)) rotateX(calc(-1 * var(--tilt)));
    }
  }

  /* Dying stack: collapses (death pose via UnitToken) while slowly fading
     and sinking into the board. ease-out so the drop is visible immediately
     and the ghost lingers; duration must stay inside Battle.svelte's
     fxTailMs hold or the stack unmounts mid-fade. */
  .token-standing.dying {
    transition: opacity var(--death-ms, 1100ms) ease-out, transform var(--death-ms, 1100ms) ease-out;
    opacity: 0;
    transform: rotateX(calc(-1 * var(--tilt))) translateY(15%);
  }

  .rock-wrap {
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }

  /* Damage/kill forecast beside the aimed target (LordsWM tooltip).
     Sibling of .token-standing, not a child: the standee's hover filter
     flattens its 3D subtree, which would cancel this lift exactly when the
     preview is shown. In the board's preserve-3d context paint order is
     depth, not z-index, so translateZ (≈1.5 cell rows, board-relative via
     cqw) floats it in front of every neighbouring standee. */
  .preview {
    position: absolute;
    left: 50%;
    bottom: -8%;
    transform: rotateX(calc(-1 * var(--tilt))) translateX(-50%) translateZ(13cqw);
    transform-origin: 50% 100%;
    white-space: nowrap;
    background: rgb(15 23 42 / 0.85);
    border: 1px solid rgb(148 163 184 / 0.4);
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 10px;
    line-height: 1.25;
    color: #f1f5f9;
    font-family: ui-monospace, monospace;
    pointer-events: none;
  }

  .token-shadow {
    position: absolute;
    left: 12%;
    right: 12%;
    bottom: 6%;
    height: 26%;
    border-radius: 50%;
    background: radial-gradient(ellipse at center, rgb(0 0 0 / 0.55), transparent 70%);
  }

  /* Yellow arc under the acting stack (LordsWM's swirl). */
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

  /* Rotating light sweep so the acting stack is unmissable. */
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

    .token-standing.sliding,
    .token-standing.striking,
    .token-standing.recoiling {
      animation: none;
    }
  }
</style>
