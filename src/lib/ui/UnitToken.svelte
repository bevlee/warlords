<script lang="ts">
  import type { UnitStack } from '$lib/engine/types';
  import Sprite from './Sprite.svelte';

  interface Props {
    unit: UnitStack;
    /** It's this unit's turn — run its idle animation. */
    active?: boolean;
    small?: boolean;
  }

  let { unit, active = false, small = false }: Props = $props();
</script>

<!-- Transparent standee: sprite + count plate, LordsWM-style (no card chrome). -->
<div class="relative flex h-full w-full items-end justify-center" title="{unit.definition.name} ×{unit.count}">
  <Sprite
    name={unit.definition.name}
    animate={active}
    class="h-full w-auto {unit.side === 'enemy' ? '-scale-x-100' : ''}"
  />

  <span
    class="absolute bottom-0 right-0 rounded-sm border px-1 font-mono font-bold leading-tight text-white
      {small ? 'text-[9px]' : 'text-[11px]'}
      {unit.side === 'player' ? 'border-sky-300 bg-sky-700' : 'border-red-300 bg-red-700'}"
  >
    {unit.count}
  </span>

  {#if unit.attackBuff || unit.defenseBuff}
    <span
      class="absolute bottom-0 left-0 leading-none {small ? 'text-[8px]' : 'text-[10px]'}"
      title="{unit.attackBuff ? `+${unit.attackBuff} attack ` : ''}{unit.defenseBuff ? `+${unit.defenseBuff} defense` : ''}"
    >
      {unit.attackBuff ? '💪' : ''}{unit.defenseBuff ? '🗿' : ''}
    </span>
  {/if}

  {#if unit.isDefending}
    <span class="absolute left-0 top-0 leading-none {small ? 'text-[9px]' : 'text-xs'}" title="defending">🛡️</span>
  {/if}
</div>
