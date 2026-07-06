<script lang="ts">
  import type { UnitStack } from '$lib/engine/types';
  import { glyphFor } from './glyphs';

  interface Props {
    unit: UnitStack;
    isActive?: boolean;
    isTarget?: boolean;
    small?: boolean;
  }

  let { unit, isActive = false, isTarget = false, small = false }: Props = $props();

  const glyph = $derived(glyphFor(unit.definition.name));
  const hpPct = $derived(Math.round((unit.hp / unit.definition.hp) * 100));
  const bgClass = $derived(unit.side === 'player' ? 'bg-sky-950/80' : 'bg-red-950/80');
  // One ring style at a time: target > active > side colour.
  // Thin rings only: the 2.5D projection magnifies the standee's top edge,
  // so thick rings render as a solid cap. Emphasis comes from glow instead.
  const ringClass = $derived(
    isTarget
      ? 'ring-2 ring-red-500 animate-pulse shadow-lg shadow-red-500/60'
      : isActive
        ? 'ring-2 ring-amber-300 shadow-lg shadow-amber-400/50'
        : unit.side === 'player'
          ? 'ring-2 ring-sky-400'
          : 'ring-2 ring-red-400'
  );
</script>

<div
  class="relative flex h-full w-full flex-col items-center justify-center rounded {bgClass} {ringClass}"
  title="{unit.definition.name} ×{unit.count}"
>
  <span class={small ? 'text-base leading-none' : 'text-2xl leading-none sm:text-3xl'}>{glyph}</span>

  <span
    class="absolute bottom-0 right-0 rounded-tl bg-black/70 px-1 font-mono leading-tight text-slate-100
      {small ? 'text-[9px]' : 'text-[10px] sm:text-xs'}"
  >
    {unit.count}
  </span>

  {#if unit.isDefending}
    <span
      class="absolute left-0 top-0 leading-none {small ? 'text-[9px]' : 'text-xs'}"
      title="defending"
    >
      🛡️
    </span>
  {/if}

  {#if !small}
    <div class="absolute left-1 right-1 top-0.5 h-1 overflow-hidden rounded bg-black/50">
      <div
        class="h-full {hpPct > 50 ? 'bg-green-400' : hpPct > 25 ? 'bg-yellow-400' : 'bg-red-400'}"
        style="width: {hpPct}%"
      ></div>
    </div>
  {/if}
</div>
