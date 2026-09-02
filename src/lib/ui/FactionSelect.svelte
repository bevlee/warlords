<script lang="ts">
  import KeywordText from '$lib/ui/keyword/KeywordText.svelte';
  import { FACTION_UNITS, FACTION_INFO } from '$lib/engine/factions';
  import Sprite from './Sprite.svelte';
  import { heroSpriteName } from './sprites';
  import { entryHref } from '$lib/compendium/entries';
  import type { FactionClass } from '$lib/engine/types';

  interface Props {
    onchoose: (cls: FactionClass) => void;
  }

  let { onchoose }: Props = $props();

  let picked: FactionClass | null = $state(null);

  const factions = Object.entries(FACTION_INFO) as [FactionClass, { name: string; description: string }][];

  /** The three cheapest tiers stand in for "what this faction feels like". */
  function taster(cls: FactionClass) {
    return FACTION_UNITS[cls].filter(u => u.tier <= 3);
  }
</script>

<div class="mx-auto max-w-4xl">
  <div class="mb-5 text-center">
    <h2 class="text-xl font-bold text-amber-200">Choose your faction</h2>
    <p class="mx-auto mt-1 max-w-lg text-sm text-slate-400">
      Your warlord commands this faction's units for the whole campaign. The choice is locked in once
      you begin — only resetting your hero can change it.
    </p>
  </div>

  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {#each factions as [cls, info] (cls)}
      <!-- The card is the picker button, so the compendium link is a sibling:
           an <a> nested in a <button> is invalid HTML. -->
      <div class="relative">
        <button
          type="button"
          class="flex h-full w-full flex-col rounded-lg border-2 px-3 py-3 pr-7 text-left transition
            {picked === cls
              ? 'border-amber-500 bg-slate-700'
              : 'border-slate-700 bg-slate-800 hover:border-slate-500 hover:bg-slate-700/60'}"
          aria-pressed={picked === cls}
          onclick={() => (picked = cls)}
        >
          <div class="flex items-center gap-2">
            <Sprite name={heroSpriteName(cls)} class="h-12 w-10 shrink-0" />
            <p class="text-sm font-semibold text-slate-100">{info.name}</p>
          </div>
          <p class="mt-1.5 flex-1 text-[11px] leading-tight text-slate-400"><KeywordText text={info.description} /></p>
          <div class="mt-2 flex items-end gap-1 border-t border-slate-700/60 pt-2">
            {#each taster(cls) as unit (unit.name)}
              <Sprite name={unit.name} class="h-8 w-7 shrink-0" />
            {/each}
          </div>
        </button>
        <a
          href={entryHref('faction', cls)}
          target="_blank"
          rel="noopener"
          title="Read about the {info.name} faction in the compendium"
          aria-label="Read about the {info.name} faction in the compendium"
          class="absolute right-1 top-1 rounded px-1 text-xs text-slate-500 hover:bg-slate-600 hover:text-amber-300"
        >
          📖
        </a>
      </div>
    {/each}
  </div>

  <div class="mt-5 flex items-center justify-center gap-4">
    <p class="text-sm text-slate-400">
      {picked ? `Marching as ${FACTION_INFO[picked].name}.` : 'Pick a faction to begin.'}
    </p>
    <button
      type="button"
      class="rounded bg-amber-600 px-5 py-2 font-semibold text-white hover:bg-amber-500
        disabled:cursor-not-allowed disabled:opacity-40"
      disabled={picked === null}
      onclick={() => picked && onchoose(picked)}
    >
      Begin campaign ⚔️
    </button>
  </div>
</div>
