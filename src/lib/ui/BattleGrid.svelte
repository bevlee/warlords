<script lang="ts">
  import type { BattleState, Pos, UnitStack } from '$lib/engine/types';
  import type { DamagePreview } from '$lib/engine/selectors';
  import type { AnimStep } from './animSteps';
  import { pickOrigin } from './aim';
  import UnitToken from './UnitToken.svelte';
  import Sprite from './Sprite.svelte';
  import BattleFx from './BattleFx.svelte';

  interface Props {
    state: BattleState;
    reachableKeys: Set<string>;
    rangeKeys: Set<string>;
    targetIds: Set<string>;
    activeId: string | null;
    interactive: boolean;
    /** Deployment: highlight `deployableKeys`, route clicks to ondeploy*. */
    deployMode?: boolean;
    deployableKeys?: Set<string>;
    selectedDeployId?: string | null;
    actionIcons: Map<string, 'melee' | 'shoot' | 'spell'>;
    originsByTarget: Map<string, Pos[]>;
    previews: Map<string, DamagePreview>;
    hoveredId: string | null;
    activeSteps: { unitId: string; step: AnimStep }[];
    dyingIds: Set<string>;
    /** Die later in this reveal batch — kept mounted at count 0 until then. */
    doomedIds: Set<string>;
    stepMs: number;
    oncellclick: (pos: Pos) => void;
    onunitclick: (unit: UnitStack, shift: boolean) => void;
    onmeleeaim: (targetId: string, origin: Pos) => void;
    ondeploycell?: (pos: Pos) => void;
    ondeployunit?: (unit: UnitStack) => void;
    onunithover: (unit: UnitStack | null) => void;
    onunitinspect: (unit: UnitStack | null) => void;
  }

  let {
    state: battleState,
    reachableKeys,
    rangeKeys,
    targetIds,
    activeId,
    interactive,
    deployMode = false,
    deployableKeys = new Set<string>(),
    selectedDeployId = null,
    actionIcons,
    originsByTarget,
    previews,
    hoveredId,
    activeSteps,
    dyingIds,
    doomedIds,
    stepMs,
    oncellclick,
    onunitclick,
    onmeleeaim,
    ondeploycell,
    ondeployunit,
    onunithover,
    onunitinspect,
  }: Props = $props();

  const TILT_DEG = 38;

  // The board is tilted back by TILT_DEG, so one board-row of movement covers only
  // cos(TILT_DEG) of the screen pixels one board-column does. Aim math compares screen
  // offsets against board-space cell deltas — divide dy through to undo the
  // foreshortening, or vertical origins are ~30% harder to select than horizontal ones.
  const ROW_SQUASH = Math.cos((TILT_DEG * Math.PI) / 180);

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
  const SPELL_CURSOR = emojiCursor('✨');

  // Shift forces melee aiming for shooters (LordsWM parity).
  let shiftHeld = $state(false);
  function onKey(e: KeyboardEvent) {
    shiftHeld = e.shiftKey;
  }

  // Aim: hovering an attackable enemy picks the landing tile from the cursor's
  // position within the enemy tile — the valid origin whose direction from the
  // enemy best matches the cursor offset.
  let aim = $state<{ targetId: string; origin: Pos } | null>(null);

  function meleeAimable(id: string): boolean {
    if (!originsByTarget.has(id)) return false;
    const icon = actionIcons.get(id);
    return icon === 'melee' || (icon === 'shoot' && shiftHeld);
  }

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

  const aimKey = $derived(aim ? `${aim.origin.col},${aim.origin.row}` : null);
  const aimTarget = $derived(aim ? (unitsById.get(aim.targetId) ?? null) : null);

  // updateAim only clears on mousemove, so a locked board (animating, AI turn) would
  // otherwise strand the red origin tile and arrow on an origin that may no longer be
  // reachable — and clicking it is a silent no-op, since handleMeleeAim re-checks.
  $effect(() => {
    if (!interactive) aim = null;
  });

  function arrowAngle(): number {
    if (!aim || !aimTarget) return 0;
    return (Math.atan2(aimTarget.pos.row - aim.origin.row, aimTarget.pos.col - aim.origin.col) * 180) / Math.PI;
  }

  function cellKey(col: number, row: number): string {
    return `${col},${row}`;
  }

  function cursorFor(occupantId: string | null, attackable: boolean): string {
    if (!interactive) return 'default';
    if (occupantId && attackable) {
      if (meleeAimable(occupantId)) return SWORD_CURSOR;
      const icon = actionIcons.get(occupantId);
      if (icon === 'shoot') return BOW_CURSOR;
      if (icon === 'spell') return SPELL_CURSOR;
      return SWORD_CURSOR;
    }
    return '';
  }

  function handleClick(col: number, row: number, shift: boolean) {
    const cell = battleState.grid.cells[row][col];
    if (cell.blocked) return;
    const occupant = cell.occupantId ? unitsById.get(cell.occupantId) : undefined;
    if (deployMode) {
      if (occupant) ondeployunit?.(occupant);
      else ondeploycell?.({ col, row });
      return;
    }
    if (!interactive) return;
    if (occupant) {
      if (aim && aim.targetId === occupant.id && meleeAimable(occupant.id)) {
        onmeleeaim(occupant.id, aim.origin);
      } else {
        onunitclick(occupant, shift);
      }
    } else {
      oncellclick({ col, row });
    }
  }
</script>

<svelte:window onkeydown={onKey} onkeyup={onKey} />

<!-- Perspective viewport: tilts the board like a tabletop. The stage is a
     size container so the perspective distance scales with board width —
     without that, browser zoom changes the board's px size against a fixed
     perspective and the projection balloons past its layout box. -->
<div class="board-stage">
<div class="board-viewport">
  <div
    class="board grid rounded-md border border-indigo-300/20 bg-slate-800/60 p-0.5"
    style="grid-template-columns: repeat({battleState.grid.width}, minmax(0, 1fr)); --tilt: {TILT_DEG}deg;"
  >
    {#each battleState.grid.cells as row (row[0].row)}
      {#each row as cell (cellKey(cell.col, cell.row))}
        {@const occupant = cell.occupantId ? unitsById.get(cell.occupantId) : undefined}
        {@const deployTarget = deployMode && deployableKeys.has(cellKey(cell.col, cell.row))}
        {@const reachable = reachableKeys.has(cellKey(cell.col, cell.row)) || deployTarget}
        {@const inHoverRange = rangeKeys.has(cellKey(cell.col, cell.row))}
        {@const attackable = !deployMode && !!occupant && targetIds.has(occupant.id)}
        {@const isAimOrigin = aimKey === cellKey(cell.col, cell.row)}
        {@const deploySelected = deployMode && !!occupant && occupant.id === selectedDeployId}
        <button
          type="button"
          class="cell relative aspect-square border border-indigo-300/15
            {reachable ? 'bg-slate-500/50 hover:bg-slate-400/50' : 'bg-slate-900/70'}
            {inHoverRange ? 'range-cell' : ''}
            {attackable ? 'attackable' : ''}
            {isAimOrigin ? 'aim-origin' : ''}
            {deploySelected ? 'deploy-selected' : ''}
            {!interactive && !deployMode ? 'cursor-default' : ''}"
          style:cursor={deployMode ? (occupant?.side === 'player' && !occupant.isHero ? 'pointer' : deployTarget ? 'pointer' : 'default') : cursorFor(cell.occupantId, attackable)}
          aria-label={cell.blocked
            ? `obstacle at ${cell.col},${cell.row}`
            : occupant
              ? `${occupant.definition.name} ×${occupant.count} at ${cell.col},${cell.row}`
              : `cell ${cell.col},${cell.row}`}
          onclick={e => handleClick(cell.col, cell.row, e.shiftKey)}
          oncontextmenu={e => {
            e.preventDefault(); // suppress the browser menu: right-click inspects
            onunitinspect(occupant ?? null);
          }}
          onmouseenter={() => onunithover(occupant ?? null)}
          onmousemove={occupant && !deployMode ? e => updateAim(e, occupant) : undefined}
          onmouseleave={() => {
            onunithover(null);
            if (aim && occupant && aim.targetId === occupant.id) aim = null;
          }}
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
          {#if isAimOrigin}
            <span class="aim-arrow" style="transform: rotate({arrowAngle()}deg)" aria-hidden="true">➤</span>
          {/if}
        </button>
      {/each}
    {/each}
  </div>
  <BattleFx
    gridWidth={battleState.grid.width}
    gridHeight={battleState.grid.height}
    {stepMs}
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

  /* Hovered stack's threat range: shooting range for shooters, movement
     reach for melee. Declared before the red target rules so those win
     when a cell is both. */
  .cell.range-cell {
    box-shadow: inset 0 0 0 1.5px rgb(56 189 248 / 0.4);
    background-color: rgb(56 189 248 / 0.12);
  }

  /* Hovering an attackable enemy edges its tile red (LordsWM). */
  .cell.attackable:hover,
  .cell.aim-origin {
    box-shadow: inset 0 0 0 2px rgb(239 68 68 / 0.9);
  }

  .cell.aim-origin {
    background-color: rgb(239 68 68 / 0.18);
  }

  /* The stack picked up during deployment. */
  .cell.deploy-selected {
    box-shadow: inset 0 0 0 2.5px rgb(251 191 36 / 0.95);
    background-color: rgb(251 191 36 / 0.15);
  }

  .aim-arrow {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.4rem;
    color: #f97316;
    text-shadow: 0 1px 2px rgb(0 0 0 / 0.7);
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
    transition: opacity 1.1s ease-out, transform 1.1s ease-out;
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
