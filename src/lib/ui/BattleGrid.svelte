<script lang="ts">
  import type { BattleState, Pos, UnitStack } from '$lib/engine/types';
  import UnitToken from './UnitToken.svelte';

  interface Props {
    state: BattleState;
    reachableKeys: Set<string>;
    targetIds: Set<string>;
    activeId: string | null;
    interactive: boolean;
    oncellclick: (pos: Pos) => void;
    onunitclick: (unit: UnitStack) => void;
  }

  let {
    state,
    reachableKeys,
    targetIds,
    activeId,
    interactive,
    oncellclick,
    onunitclick,
  }: Props = $props();

  const TILT_DEG = 38;

  const unitsById = $derived(new Map(state.units.filter(u => u.count > 0).map(u => [u.id, u])));

  function cellKey(col: number, row: number): string {
    return `${col},${row}`;
  }

  function handleClick(col: number, row: number) {
    if (!interactive) return;
    const cell = state.grid.cells[row][col];
    const occupant = cell.occupantId ? unitsById.get(cell.occupantId) : undefined;
    if (occupant) {
      onunitclick(occupant);
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
        <button
          type="button"
          class="cell relative aspect-square rounded-sm p-0
            {reachable ? 'bg-emerald-800/60 hover:bg-emerald-600/70 cursor-pointer' : 'bg-slate-900'}
            {occupant && targetIds.has(occupant.id) ? 'cursor-crosshair' : ''}
            {!interactive ? 'cursor-default' : ''}"
          aria-label={occupant
            ? `${occupant.definition.name} ×${occupant.count} at ${cell.col},${cell.row}`
            : `cell ${cell.col},${cell.row}`}
          onclick={() => handleClick(cell.col, cell.row)}
        >
          {#if occupant}
            <span class="token-shadow" aria-hidden="true"></span>
            <div class="token-standing">
              <UnitToken
                unit={occupant}
                isActive={occupant.id === activeId}
                isTarget={targetIds.has(occupant.id)}
              />
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
