<script lang="ts">
  import type { BattleState, Pos, UnitStack } from '$lib/engine/types';
  import type { DamagePreview } from '$lib/engine/selectors';
  import UnitToken from './UnitToken.svelte';
  import Sprite from './Sprite.svelte';

  interface Props {
    state: BattleState;
    reachableKeys: Set<string>;
    targetIds: Set<string>;
    activeId: string | null;
    interactive: boolean;
    actionIcons: Map<string, 'melee' | 'shoot' | 'spell'>;
    originsByTarget: Map<string, Pos[]>;
    previews: Map<string, DamagePreview>;
    hoveredId: string | null;
    oncellclick: (pos: Pos) => void;
    onunitclick: (unit: UnitStack, shift: boolean) => void;
    onmeleeaim: (targetId: string, origin: Pos) => void;
    onunithover: (unit: UnitStack | null) => void;
  }

  let {
    state: battleState,
    reachableKeys,
    targetIds,
    activeId,
    interactive,
    actionIcons,
    originsByTarget,
    previews,
    hoveredId,
    oncellclick,
    onunitclick,
    onmeleeaim,
    onunithover,
  }: Props = $props();

  const TILT_DEG = 38;

  const unitsById = $derived(new Map(battleState.units.filter(u => u.count > 0).map(u => [u.id, u])));

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
    const dy = e.clientY - (rect.top + rect.height / 2);
    const len = Math.hypot(dx, dy) || 1;
    let best = origins[0];
    let bestDot = -Infinity;
    for (const o of origins) {
      const oc = o.col - unit.pos.col;
      const or = o.row - unit.pos.row;
      const olen = Math.hypot(oc, or) || 1;
      const dot = (dx / len) * (oc / olen) + (dy / len) * (or / olen);
      if (dot > bestDot) {
        bestDot = dot;
        best = o;
      }
    }
    aim = { targetId: unit.id, origin: best };
  }

  const aimKey = $derived(aim ? `${aim.origin.col},${aim.origin.row}` : null);
  const aimTarget = $derived(aim ? (unitsById.get(aim.targetId) ?? null) : null);

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
    if (!interactive) return;
    const cell = battleState.grid.cells[row][col];
    if (cell.blocked) return;
    const occupant = cell.occupantId ? unitsById.get(cell.occupantId) : undefined;
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
        {@const reachable = reachableKeys.has(cellKey(cell.col, cell.row))}
        {@const attackable = !!occupant && targetIds.has(occupant.id)}
        {@const isAimOrigin = aimKey === cellKey(cell.col, cell.row)}
        <button
          type="button"
          class="cell relative aspect-square border border-indigo-300/15
            {reachable ? 'bg-slate-500/50 hover:bg-slate-400/50' : 'bg-slate-900/70'}
            {attackable ? 'attackable' : ''}
            {isAimOrigin ? 'aim-origin' : ''}
            {!interactive ? 'cursor-default' : ''}"
          style:cursor={cursorFor(cell.occupantId, attackable)}
          aria-label={cell.blocked
            ? `obstacle at ${cell.col},${cell.row}`
            : occupant
              ? `${occupant.definition.name} ×${occupant.count} at ${cell.col},${cell.row}`
              : `cell ${cell.col},${cell.row}`}
          onclick={e => handleClick(cell.col, cell.row, e.shiftKey)}
          onmouseenter={() => onunithover(occupant ?? null)}
          onmousemove={occupant ? e => updateAim(e, occupant) : undefined}
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
            <div class="token-standing" class:hover-glow={occupant.id === hoveredId}>
              <UnitToken unit={occupant} />
              {#if attackable && (hoveredId === occupant.id || aim?.targetId === occupant.id) && previews.has(occupant.id)}
                {@const p = previews.get(occupant.id)!}
                <div class="preview" aria-hidden="true">
                  💀 {p.killsMin}–{p.killsMax}<br />💥 {p.min}–{p.max}
                </div>
              {/if}
            </div>
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

  /* Hovering an attackable enemy edges its tile red (LordsWM). */
  .cell.attackable:hover,
  .cell.aim-origin {
    box-shadow: inset 0 0 0 2px rgb(239 68 68 / 0.9);
  }

  .cell.aim-origin {
    background-color: rgb(239 68 68 / 0.18);
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

  .rock-wrap {
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }

  /* Damage/kill forecast beside the aimed target (LordsWM tooltip). */
  .preview {
    position: absolute;
    left: 50%;
    bottom: -8%;
    transform: translateX(-50%);
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
  }
</style>
