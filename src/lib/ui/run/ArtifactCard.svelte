<script lang="ts" module>
  /** Rarity reads as a chip, not as a border colour you have to decode. */
  const RARITY = {
    default: { border: 'border-slate-600', text: 'text-slate-100', chip: 'bg-slate-700 text-slate-300' },
    common: { border: 'border-slate-600', text: 'text-slate-100', chip: 'bg-slate-700 text-slate-300' },
    rare: { border: 'border-sky-700', text: 'text-sky-200', chip: 'bg-sky-900 text-sky-200' },
    epic: { border: 'border-purple-700', text: 'text-purple-200', chip: 'bg-purple-900 text-purple-200' },
  } as const;
</script>

<script lang="ts">
  import KeywordText from '$lib/ui/keyword/KeywordText.svelte';
  import Keyword from '$lib/ui/keyword/Keyword.svelte';
  import { ITEMS, itemEffectText, type ItemId } from '$lib/gauntlet/items';
  import { unitSlug } from '$lib/ui/sprites';

  interface Props {
    id: ItemId;
    /** Unit names currently in the army, for the "dormant" state. */
    armyUnits?: string[];
    /** Present on draft cards; owned artifacts render as plain cards. */
    onpick?: (() => void) | null;
  }

  let { id, armyUnits = [], onpick = null }: Props = $props();

  const item = $derived(ITEMS[id]);
  const rarity = $derived(RARITY[item?.rarity ?? 'common']);
  const required = $derived(item?.requiresUnit ?? []);
  // Requirements are alternatives: one owned unit is enough to make the
  // artifact live. Nothing required means it is army-wide.
  const live = $derived(required.length === 0 || required.some(name => armyUnits.includes(name)));
</script>

{#snippet body()}
  <div class="flex items-baseline justify-between gap-2">
    <span class="text-base font-semibold {rarity.text}">{item.name}</span>
    <span class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest {rarity.chip}">
      {item.rarity}
    </span>
  </div>

  {#if required.length > 0}
    <p class="flex flex-wrap items-center gap-1 text-xs text-slate-400">
      <span class="text-slate-500">Needs</span>
      {#each required as name, i (name)}
        {#if i > 0}<span class="text-slate-600">or</span>{/if}
        <span class="rounded bg-slate-900/70 px-1.5 py-0.5 font-medium text-slate-200">
          <Keyword entryKind="unit" id={unitSlug(name)} label={name} />
        </span>
      {/each}
    </p>
  {/if}

  <p class="text-[13px] leading-snug text-slate-300"><KeywordText text={itemEffectText(item)} /></p>

  {#if !live}
    <p class="text-xs italic text-slate-500">Dormant — no {required.join(' or ')} in your army.</p>
  {/if}
{/snippet}

<!-- The card is never itself a button: its effect text carries keyword
     terms, which are buttons, and a button inside a button is invalid HTML
     the parser unnests during hydration. The pick action gets its own. -->
{#if item}
  <div
    class="flex flex-col gap-2 rounded-lg border bg-slate-800/80 p-3 {rarity.border}
      {onpick ? '' : live ? '' : 'opacity-60'}"
  >
    {@render body()}
    {#if onpick}
      <button
        type="button"
        class="mt-auto rounded bg-amber-500 px-3 py-1.5 text-sm font-bold text-slate-900 transition hover:bg-amber-400"
        onclick={onpick}
      >
        Claim {item.name}
      </button>
    {/if}
  </div>
{/if}
