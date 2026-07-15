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

  const ENTRIES = 16;

  const entries = $derived(
    predictTurnOrder(state.units, ENTRIES)
      .map(id => state.units.find(u => u.id === id))
      .filter((u): u is UnitStack => !!u)
  );
</script>

<!-- LordsWM-style turns bar: bare strip of framed portraits, count in the corner. -->
<div class="flex items-center gap-2">
  <span class="mr-1 shrink-0 text-center text-xs font-semibold uppercase leading-tight tracking-wide text-slate-400">
    Round<br />{state.round}
  </span>
  <!-- overflow-x-scroll (not auto): the horizontal scrollbar is always there,
       so entries never shift vertically; overflow-y-hidden + padding keeps the
       hover scale-up from spawning a vertical scrollbar. -->
  <div class="turnbar-scroll flex min-w-0 items-center gap-1.5 overflow-x-scroll overflow-y-hidden py-2">
    {#each entries as unit, i (`${unit.id}-${i}`)}
      <button
        type="button"
        class="portrait relative h-24 w-[5.25rem] shrink-0 overflow-hidden rounded-sm border-2 transition-transform
          {unit.side === 'player' ? 'border-sky-400 bg-sky-950' : 'border-red-500 bg-red-950'}
          {i === 0 ? 'ring-2 ring-amber-300' : ''}
          {unit.id === hoveredId ? 'scale-110 brightness-125' : ''}"
        aria-label="turn {i + 1}: {unit.definition.name} ×{unit.count}"
        onmouseenter={() => onhover(unit)}
        onmouseleave={() => onhover(null)}
      >
        <Sprite name={unit.definition.name} class="h-full w-full" />
        <span
          class="absolute bottom-0 right-0 bg-black/70 px-1 font-mono text-sm font-bold leading-tight text-amber-300"
        >
          {unit.count}
        </span>
      </button>
      {#if i === 0}
        <div class="h-20 w-px shrink-0 bg-slate-600" aria-hidden="true"></div>
      {/if}
    {/each}
  </div>
</div>

<style>
  /* Persistent scrollbar even with macOS overlay scrollbars: custom-styled
     WebKit scrollbars always render. */
  .turnbar-scroll::-webkit-scrollbar {
    height: 8px;
  }

  .turnbar-scroll::-webkit-scrollbar-track {
    background: rgb(30 41 59 / 0.8);
    border-radius: 4px;
  }

  .turnbar-scroll::-webkit-scrollbar-thumb {
    background: #475569;
    border-radius: 4px;
  }

  /* No scrollbar-width here: in Chrome the standard property would override
     and disable the ::-webkit-scrollbar styling above (which is what keeps
     the bar permanently visible instead of macOS overlay auto-hiding). */
</style>
