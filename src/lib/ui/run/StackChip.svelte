<script lang="ts">
  import Sprite from '$lib/ui/Sprite.svelte';
  import Keyword from '$lib/ui/keyword/Keyword.svelte';
  import { unitSlug } from '$lib/ui/sprites';
  import { TIER_STYLE } from '$lib/ui/tierStyle';
  import type { UnitDef } from '$lib/engine/types';
  import type { Snippet } from 'svelte';

  interface Props {
    unit: UnitDef;
    count: number;
    /** Taught skills, artifact ties — anything that makes this stack not the
     *  stock unit. Rendered under the name, so the chip stays one glance. */
    notes?: string[];
    /** Present on the army's own stacks, which open their full card. */
    ontoggle?: (() => void) | null;
    open?: boolean;
    children?: Snippet;
  }

  let { unit, count, notes = [], ontoggle = null, open = false }: Props = $props();

  const ts = $derived(TIER_STYLE[unit.tier]);
</script>

<!-- The name is a keyword term, so the chip cannot itself be a button: the
     toggle is a sibling that covers the rest of the chip. -->
<div
  class="flex items-center gap-2 rounded border bg-slate-900/70 px-2 py-1
    {open ? 'border-amber-400' : 'border-slate-700'}"
>
  <span class="rounded ring-1 {ts.ring}"><Sprite name={unit.name} class="h-8 w-7" /></span>

  <span class="min-w-0">
    <span class="block text-sm {ts.text}">
      {count} × <Keyword entryKind="unit" id={unitSlug(unit.name)} label={unit.name} />
    </span>
    {#if notes.length > 0}
      <span class="block text-[11px] leading-tight text-violet-300">{notes.join(' · ')}</span>
    {/if}
  </span>

  {#if ontoggle}
    <button
      type="button"
      class="ml-1 rounded px-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-amber-300"
      aria-expanded={open}
      aria-label={open ? `Hide ${unit.name} details` : `Show ${unit.name} details`}
      onclick={ontoggle}
    >
      {open ? '▴' : '▾'}
    </button>
  {/if}
</div>
