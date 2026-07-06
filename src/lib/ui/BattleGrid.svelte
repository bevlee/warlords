<script lang="ts">
  import type { BattleState, Pos, UnitStack } from '$lib/engine/types';
  import UnitToken from './UnitToken.svelte';

  interface Props {
    state: BattleState;
    reachableKeys: Set<string>;
    targetIds: Set<string>;
    activeId: string | null;
    interactive: boolean;
    actionIcons: Map<string, 'melee' | 'shoot'>;
    attackFromKeys: Set<string>;
    pendingTargetId: string | null;
    hoveredId: string | null;
    oncellclick: (pos: Pos) => void;
    onunitclick: (unit: UnitStack, shift: boolean) => void;
    onunithover: (unit: UnitStack | null) => void;
  }

  let {
    state,
    reachableKeys,
    targetIds,
    activeId,
    interactive,
    actionIcons,
    attackFromKeys,
    pendingTargetId,
    hoveredId,
    oncellclick,
    onunitclick,
    onunithover,
  }: Props = $props();

  const TILT_DEG = 38;

  const unitsById = $derived(new Map(state.units.filter(u => u.count > 0).map(u => [u.id, u])));

  function cellKey(col: number, row: number): string {
    return `${col},${row}`;
  }

  function handleClick(col: number, row: number, shift: boolean) {
    if (!interactive) return;
    const cell = state.grid.cells[row][col];
    if (cell.blocked) return;
    const occupant = cell.occupantId ? unitsById.get(cell.occupantId) : undefined;
    if (occupant) {
      onunitclick(occupant, shift);
    } else {
      oncellclick({ col, row });
    }
  }
</script>

<!-- Perspective viewport: tilts the board like a tabletop. -->
<div class="board-viewport">
  <div
    class="board grid gap-0.5 rounded-lg border border-slate-700 bg-slate-800 p-1"
    style="grid-template-columns: repeat({state.grid.width}, minmax(0, 1fr)); --tilt: {TILT_DEG}deg;"
  >
    {#each state.grid.cells as row (row[0].row)}
      {#each row as cell (cellKey(cell.col, cell.row))}
        {@const occupant = cell.occupantId ? unitsById.get(cell.occupantId) : undefined}
        {@const reachable = reachableKeys.has(cellKey(cell.col, cell.row))}
        {@const attackFrom = attackFromKeys.has(cellKey(cell.col, cell.row))}
        <button
          type="button"
          class="cell relative aspect-square rounded-sm p-0
            {attackFrom
              ? 'bg-amber-700/60 hover:bg-amber-500/70 cursor-pointer'
              : reachable
                ? 'bg-emerald-800/60 hover:bg-emerald-600/70 cursor-pointer'
                : 'bg-slate-900'}
            {occupant && targetIds.has(occupant.id) ? 'cursor-crosshair' : ''}
            {!interactive ? 'cursor-default' : ''}"
          aria-label={cell.blocked
            ? `obstacle at ${cell.col},${cell.row}`
            : occupant
              ? `${occupant.definition.name} ×${occupant.count} at ${cell.col},${cell.row}${attackFrom ? ' — attack from here' : ''}`
              : `cell ${cell.col},${cell.row}${attackFrom ? ' — attack from here' : ''}`}
          onclick={e => handleClick(cell.col, cell.row, e.shiftKey)}
          onmouseenter={() => onunithover(occupant ?? null)}
          onmouseleave={() => onunithover(null)}
        >
          {#if occupant}
            <span class="token-shadow" aria-hidden="true"></span>
            <div class="token-standing" class:hover-glow={occupant.id === hoveredId}>
              <UnitToken
                unit={occupant}
                isActive={occupant.id === activeId}
                isTarget={targetIds.has(occupant.id)}
              />
              {#if interactive && (actionIcons.has(occupant.id) || attackFrom)}
                <span
                  class="action-icon"
                  class:pinned={occupant.id === pendingTargetId || attackFrom}
                  aria-hidden="true"
                >
                  {actionIcons.get(occupant.id) === 'shoot' ? '🏹' : '⚔️'}
                </span>
              {/if}
            </div>
          {:else if attackFrom}
            <div class="token-standing origin-wrap" aria-hidden="true">
              <span class="origin-icon">⚔️</span>
            </div>
          {:else if cell.blocked}
            <span class="token-shadow" aria-hidden="true"></span>
            <div class="token-standing origin-wrap rock" aria-hidden="true">
              <span class="rock-icon">🪨</span>
            </div>
          {/if}
        </button>
      {/each}
    {/each}
  </div>
</div>

<style>
  .board-viewport {
    perspective: 1400px;
    perspective-origin: 50% 40%;
  }

  .board {
    transform: rotateX(var(--tilt)) scale(0.97);
    transform-style: preserve-3d;
    transform-origin: 50% 50%;
    /* Reclaim the vertical space the tilt foreshortens away at the far edge.
       No negative bottom margin: the perspective-magnified near edge projects
       below the layout box and would cover the controls. */
    margin-top: -4%;
  }

  .cell {
    transform-style: preserve-3d;
  }

  /* Token rises out of the board plane, like a cardboard standee. */
  .token-standing {
    position: absolute;
    inset: 0;
    height: 115%;
    top: auto;
    bottom: 0;
    transform: rotateX(calc(-1 * var(--tilt)));
    transform-origin: 50% 100%;
    pointer-events: none;
  }

  /* Turn-bar hover sync: pick the stack out on the battlefield. */
  .hover-glow {
    filter: brightness(1.4) drop-shadow(0 0 6px rgb(255 255 255 / 0.5));
  }

  /* Sword/bow appears above the standee while hovering an attackable enemy. */
  .action-icon {
    position: absolute;
    top: -30%;
    left: 50%;
    transform: translateX(-50%);
    font-size: 1.25rem;
    line-height: 1;
    opacity: 0;
    transition: opacity 0.1s;
    filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.8));
  }

  .cell:hover .action-icon,
  .action-icon.pinned {
    opacity: 1;
  }

  /* Standing sword marking a tile you can attack from. */
  .origin-wrap {
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding-bottom: 10%;
  }

  .origin-icon {
    font-size: 1.1rem;
    line-height: 1;
    filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.8));
  }

  .cell:hover .origin-icon {
    font-size: 1.35rem;
  }

  .rock-icon {
    font-size: 1.6rem;
    line-height: 1;
    filter: drop-shadow(0 2px 3px rgb(0 0 0 / 0.7));
  }

  .token-shadow {
    position: absolute;
    left: 12%;
    right: 12%;
    bottom: 6%;
    height: 26%;
    border-radius: 50%;
    background: radial-gradient(ellipse at center, rgb(0 0 0 / 0.55), transparent 70%);
    pointer-events: none;
  }
</style>
