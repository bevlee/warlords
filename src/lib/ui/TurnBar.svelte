<script lang="ts">
  import type { BattleState, UnitStack } from '$lib/engine/types';
  import { predictTurnOrder } from '$lib/engine/turnOrder';
  import Sprite from './Sprite.svelte';

  interface Props {
    state: BattleState;
    hoveredId: string | null;
    onhover: (unit: UnitStack | null) => void;
  }

  let { state, hoveredId, onhover }: Props = $props();

  const ENTRIES = 12;

  const entries = $derived(
    predictTurnOrder(state.units, ENTRIES)
      .map(id => state.units.find(u => u.id === id))
      .filter((u): u is UnitStack => !!u)
  );
</script>

<!-- LordsWM-style turns bar: framed portraits, side-coloured, count in the corner. -->
<div class="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5">
  <span class="mr-1 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">
    Round {state.round}
  </span>
  <div class="flex min-w-0 items-center gap-1 overflow-x-auto">
    {#each entries as unit, i (`${unit.id}-${i}`)}
      <button
        type="button"
        class="portrait relative h-12 w-10 shrink-0 overflow-hidden rounded-sm border-2 transition-transform
          {unit.side === 'player' ? 'border-sky-400 bg-sky-950' : 'border-red-500 bg-red-950'}
          {i === 0 ? 'ring-2 ring-amber-300' : ''}
          {unit.id === hoveredId ? 'scale-110 brightness-125' : ''}"
        aria-label="turn {i + 1}: {unit.definition.name} ×{unit.count}"
        onmouseenter={() => onhover(unit)}
        onmouseleave={() => onhover(null)}
      >
        <Sprite name={unit.definition.name} class="h-full w-full" />
        <span
          class="absolute bottom-0 right-0 bg-black/70 px-0.5 font-mono text-[10px] font-bold leading-tight text-amber-300"
        >
          {unit.count}
        </span>
      </button>
      {#if i === 0}
        <div class="h-10 w-px shrink-0 bg-slate-600" aria-hidden="true"></div>
      {/if}
    {/each}
  </div>
</div>
