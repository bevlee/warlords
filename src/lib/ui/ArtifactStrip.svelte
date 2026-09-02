<script lang="ts">
  import { ITEMS, itemEffectText, type ItemId, type ItemRarity } from '$lib/gauntlet/items';
  import ItemIcon from './ItemIcon.svelte';

  interface Props {
    items?: ItemId[];
    selected?: ItemId | null;
    onselect?: (id: ItemId) => void;
  }

  let { items = [], selected = null, onselect }: Props = $props();

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
  <div class="flex flex-wrap items-center justify-center gap-1.5" role="list" aria-label="Army artifacts">
    <p class="w-full text-center font-mono text-[8px] font-bold uppercase tracking-wider text-slate-500">Army artifacts</p>
    {#each items as id (id)}
      {@const item = ITEMS[id]}
      <div class="group relative" role="listitem">
        <button
          type="button"
          aria-label="Inspect army artifact: {item.name}"
          aria-pressed={selected === id}
          class="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-900/85 p-1 shadow ring-1
            {RING[item.rarity]} {selected === id ? 'outline outline-2 outline-amber-300' : 'hover:bg-slate-800'}"
          onclick={() => onselect?.(id)}
        >
          <ItemIcon {id} class="h-10 w-10" />
        </button>
        <!-- Hover remains a shortcut; click opens the persistent rail detail. -->
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
