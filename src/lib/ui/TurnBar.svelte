<script lang="ts">
  import type { BattleState, UnitStack } from '$lib/engine/types';
  import UnitToken from './UnitToken.svelte';

  interface Props {
    state: BattleState;
  }

  let { state }: Props = $props();

  const entries = $derived(
    [state.currentUnitId, ...state.turnQueue]
      .map(id => state.units.find(u => u.id === id))
      .filter((u): u is UnitStack => !!u && u.count > 0)
  );
</script>

<div class="flex flex-col gap-1 rounded-lg border border-slate-700 bg-slate-800 p-2">
  <h2 class="text-xs font-semibold uppercase tracking-wide text-slate-400">
    Round {state.round}
  </h2>
  {#each entries as unit, i (unit.id)}
    <div
      class="flex items-center gap-2 rounded p-1 {i === 0 ? 'bg-amber-500/20' : ''}"
    >
      <div class="h-8 w-8 shrink-0">
        <UnitToken {unit} small isActive={i === 0} />
      </div>
      <span class="truncate text-xs {unit.side === 'player' ? 'text-sky-300' : 'text-red-300'}">
        {unit.definition.name}
      </span>
    </div>
  {/each}
</div>
