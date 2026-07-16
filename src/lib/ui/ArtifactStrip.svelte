<script lang="ts">
  import { ITEMS, itemEffectText, type ItemId, type ItemRarity } from '$lib/gauntlet/items';
  import ItemIcon from './ItemIcon.svelte';

  interface Props {
    items?: ItemId[];
  }

  let { items = [] }: Props = $props();

  const RING: Record<ItemRarity, string> = {
    common: 'ring-slate-500',
    rare: 'ring-sky-400',
    epic: 'ring-purple-400',
  };
  const NAME: Record<ItemRarity, string> = {
    common: 'text-slate-200',
    rare: 'text-sky-300',
    epic: 'text-purple-300',
  };
</script>

{#if items.length > 0}
  <div class="flex items-center gap-1.5" role="list" aria-label="Active artifacts">
    {#each items as id (id)}
      {@const item = ITEMS[id]}
      <div class="group relative" role="listitem">
        <div
          class="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900/85 p-1 shadow ring-1 {RING[item.rarity]}"
        >
          <ItemIcon {id} class="h-7 w-7" />
        </div>
        <!-- Hover card, spellbook-tooltip style; strip sits at the top so it opens downward. -->
        <div
          class="pointer-events-none absolute left-0 top-full z-40 mt-1 w-48 rounded-lg border
            border-slate-600 bg-slate-900/95 p-2.5 text-left text-xs leading-snug text-slate-100
            opacity-0 shadow-xl transition-opacity group-hover:opacity-100"
          role="tooltip"
        >
          <p class="font-bold {NAME[item.rarity]}">{item.name}</p>
          <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{item.rarity}</p>
          <p class="mt-1 font-mono text-amber-200">{itemEffectText(item)}</p>
        </div>
      </div>
    {/each}
  </div>
{/if}
