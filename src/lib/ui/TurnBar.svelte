<script lang="ts">
  import type { BattleState, UnitStack } from '$lib/engine/types';
  import { predictTurnOrder } from '$lib/engine/turnOrder';
  import UnitToken from './UnitToken.svelte';

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

<div class="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5">
  <span class="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">
    Round {state.round}
  </span>
  <div class="flex min-w-0 items-center gap-1 overflow-x-auto">
    {#each entries as unit, i (`${unit.id}-${i}`)}
      <button
        type="button"
        class="h-9 w-9 shrink-0 rounded p-0.5 transition-transform
          {i === 0 ? 'bg-amber-500/25' : ''}
          {unit.id === hoveredId ? 'scale-110 bg-slate-600' : ''}"
        aria-label="turn {i + 1}: {unit.definition.name} ×{unit.count}"
        onmouseenter={() => onhover(unit)}
        onmouseleave={() => onhover(null)}
      >
        <UnitToken {unit} small isActive={i === 0} />
      </button>
      {#if i === 0}
        <div class="h-8 w-px shrink-0 bg-slate-600" aria-hidden="true"></div>
      {/if}
    {/each}
  </div>
</div>
