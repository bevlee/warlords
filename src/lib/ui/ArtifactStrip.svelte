<script lang="ts">
  import { ITEMS, itemEffectText, type ItemId, type ItemRarity } from '$lib/gauntlet/items';
  import { stripKeywords } from '$lib/compendium/keywords';

  interface Props {
    items?: ItemId[];
    selected?: ItemId | null;
    onselect?: (id: ItemId) => void;
  }

  let { items = [], selected = null, onselect }: Props = $props();

  const RING: Record<ItemRarity, string> = {
    default: 'ring-slate-500',
    common: 'ring-slate-500',
    rare: 'ring-sky-400',
    epic: 'ring-purple-400',
  };
  const NAME: Record<ItemRarity, string> = {
    default: 'text-slate-200',
    common: 'text-slate-200',
    rare: 'text-sky-300',
    epic: 'text-purple-300',
  };
</script>

{#if items.length > 0}
  <div class="artifact-strip flex min-h-0 w-full flex-col items-stretch gap-1.5 overflow-x-hidden overflow-y-auto" role="list" aria-label="Army artifacts">
    <p class="w-full text-center font-mono text-[8px] font-bold uppercase tracking-wider text-slate-500">Army artifacts</p>
    {#each items as id (id)}
      {@const item = ITEMS[id]}
      <div class="min-w-0 px-0.5" role="listitem">
        <button
          type="button"
          aria-label="Inspect army artifact: {item.name}"
          aria-pressed={selected === id}
          title="{item.name} — {stripKeywords(itemEffectText(item))}"
          class="flex min-h-8 w-full min-w-0 items-center justify-center rounded-lg bg-slate-900/85 px-1 py-1 text-center text-[10px]
            whitespace-normal [overflow-wrap:anywhere]
            font-semibold leading-tight shadow ring-1 {RING[item.rarity]} {NAME[item.rarity]}
            {selected === id ? 'outline outline-2 outline-amber-300' : 'hover:bg-slate-800'}"
          onclick={() => onselect?.(id)}
        >
          {item.name}
        </button>
      </div>
    {/each}
  </div>
{/if}
