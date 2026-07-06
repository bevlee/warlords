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

<div
  class="grid gap-0.5 rounded-lg border border-slate-700 bg-slate-800 p-1"
  style="grid-template-columns: repeat({state.grid.width}, minmax(0, 1fr));"
>
  {#each state.grid.cells as row (row[0].row)}
    {#each row as cell (cellKey(cell.col, cell.row))}
      {@const occupant = cell.occupantId ? unitsById.get(cell.occupantId) : undefined}
      {@const reachable = reachableKeys.has(cellKey(cell.col, cell.row))}
      <button
        type="button"
        class="aspect-square rounded-sm p-0
          {reachable ? 'bg-emerald-800/60 hover:bg-emerald-600/70 cursor-pointer' : 'bg-slate-900'}
          {occupant && targetIds.has(occupant.id) ? 'cursor-crosshair' : ''}
          {!interactive ? 'cursor-default' : ''}"
        aria-label={occupant
          ? `${occupant.definition.name} ×${occupant.count} at ${cell.col},${cell.row}`
          : `cell ${cell.col},${cell.row}`}
        onclick={() => handleClick(cell.col, cell.row)}
      >
        {#if occupant}
          <UnitToken
            unit={occupant}
            isActive={occupant.id === activeId}
            isTarget={targetIds.has(occupant.id)}
          />
        {/if}
      </button>
    {/each}
  {/each}
</div>
