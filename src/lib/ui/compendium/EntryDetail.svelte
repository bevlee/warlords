<script lang="ts">
  import type { CompendiumEntry } from '$lib/compendium/entries';
  import {
    unitEntries,
    factionLabel,
    ITEM_GROUP_LABEL,
    ITEM_GROUP_NOTE,
    type EntryKind,
  } from '$lib/compendium/entries';
  import type { DiscoveryState } from '$lib/compendium/discovery';
  import { factionProgress } from '$lib/compendium/discovery';
  import { FACTION_INFO } from '$lib/engine/factions';
  import { TIER_STYLE } from '../tierStyle';
  import { UNIT_SKILLS } from '$lib/gauntlet/skills';
  import Sprite from '../Sprite.svelte';
  import UnitEntryView from './UnitEntryView.svelte';
  import KeywordText from '../keyword/KeywordText.svelte';
  import { spellIconFor } from '../spellIcons';

  interface Props {
    entry: CompendiumEntry;
    discovery: DiscoveryState;
    /** Filter-preserving link builder, supplied by the route. */
    hrefFor: (kind: EntryKind, id: string) => string;
  }

  let { entry, discovery, hrefFor }: Props = $props();

  const byId = new Map(unitEntries().map((u) => [u.id, u]));

  const RARITY = {
    common: { text: 'text-slate-300', border: 'border-slate-500', label: 'Common' },
    rare: { text: 'text-sky-300', border: 'border-sky-400', label: 'Rare' },
    epic: { text: 'text-fuchsia-300', border: 'border-fuchsia-400', label: 'Epic' },
  } as const;
</script>

{#if entry.kind === 'unit'}
  <UnitEntryView {entry} {hrefFor} />
{:else if entry.kind === 'faction'}
  {@const progress = factionProgress(discovery, entry.roster)}
  <div class="flex items-center gap-4">
    <Sprite name="Hero {entry.faction}" class="h-24 w-20 shrink-0" />
    <div class="min-w-0">
      <h2 class="text-2xl font-black text-slate-100">{entry.name}</h2>
      <p class="mt-1 text-sm text-slate-400"><KeywordText text={entry.description} /></p>
      <p class="mt-1 font-mono text-[11px] text-emerald-300">
        {progress.seen} / {progress.total} units met in battle
      </p>
    </div>
  </div>

  <div class="mt-4 border-t border-slate-700 pt-3">
    <h3 class="mb-2 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Roster</h3>
    <div class="flex flex-col gap-1">
      {#each entry.roster as slug (slug)}
        {@const unit = byId.get(slug)}
        {#if unit}
          <a
            href={hrefFor('unit', slug)}
            class="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-slate-700/60"
          >
            <Sprite name={unit.name} class="h-9 w-8 shrink-0" />
            <span class="flex-1 truncate text-sm font-semibold {TIER_STYLE[unit.tier].text}">{unit.name}</span>
            <span class="font-mono text-[11px] text-slate-500">T{unit.tier}</span>
            {#if discovery.units.includes(slug)}
              <span class="text-[10px] font-bold uppercase text-emerald-400">met</span>
            {/if}
          </a>
        {/if}
      {/each}
    </div>
  </div>

{:else if entry.kind === 'ability'}
  <h2 class="text-2xl font-black text-amber-300">{entry.name}</h2>
  <p class="mt-2 text-sm leading-snug text-slate-300"><KeywordText text={entry.description} /></p>
  {#if entry.teachable}
    <p class="mt-2 text-sm text-violet-300">
      Can be taught to any stack by a
      <a href={hrefFor('unitSkill', entry.id)} class="font-semibold underline">gauntlet skill draft</a>.
    </p>
  {/if}

  <div class="mt-4 border-t border-slate-700 pt-3">
    <h3 class="mb-2 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">
      {entry.units.length > 0 ? 'Units with this ability' : 'No unit has this innately'}
    </h3>
    <div class="flex flex-col gap-1">
      {#each entry.units as slug (slug)}
        {@const unit = byId.get(slug)}
        {#if unit}
          <a href={hrefFor('unit', slug)} class="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-slate-700/60">
            <Sprite name={unit.name} class="h-9 w-8 shrink-0" />
            <span class="flex-1 truncate text-sm font-semibold {TIER_STYLE[unit.tier].text}">{unit.name}</span>
            <span class="font-mono text-[11px] text-slate-500">{FACTION_INFO[unit.faction].name}</span>
          </a>
        {/if}
      {/each}
    </div>
  </div>
{:else if entry.kind === 'spell'}
  <div class="flex items-center gap-4">
    <span class="grid h-20 w-20 shrink-0 place-items-center rounded-lg bg-slate-700">
      {#if spellIconFor(entry.id)}
        <img
          src={spellIconFor(entry.id)}
          alt=""
          class="h-16 w-16 object-contain [image-rendering:pixelated]"
        />
      {:else}
        <span class="text-5xl">{entry.glyph}</span>
      {/if}
    </span>
    <div>
      <h2 class="text-2xl font-black text-slate-100">{entry.name}</h2>
      <p class="mt-1 font-mono text-sm text-sky-300">{entry.manaCost} mana · {entry.target}</p>
      <p class="font-mono text-sm text-amber-300"><KeywordText text={entry.effect} /></p>
    </div>
  </div>
  <p class="mt-4 border-t border-slate-700 pt-3 text-sm leading-snug text-slate-300"><KeywordText text={entry.description} /></p>
{:else if entry.kind === 'item'}
  {@const requires = entry.requiresUnit
    .map((name) => unitEntries().find((u) => u.name === name))
    .filter((u) => u !== undefined)}
  <div>
    <h2 class="text-2xl font-black {RARITY[entry.rarity].text}">{entry.name}</h2>
    <p class="mt-1 flex flex-wrap items-center gap-1.5">
        <span class="inline-block rounded border {RARITY[entry.rarity].border} px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider {RARITY[entry.rarity].text}">
          {RARITY[entry.rarity].label}
        </span>
        <span class="inline-block rounded border border-slate-600 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
          {ITEM_GROUP_LABEL[entry.group]}
        </span>
        <!-- Neutral has no faction page to link to, so it stays a plain tag. -->
        {#if entry.faction === 'neutral'}
          <span class="inline-block rounded border border-slate-600 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            {factionLabel(entry.faction)}
          </span>
        {:else}
          <a
            href={hrefFor('faction', entry.faction)}
            class="inline-block rounded border border-slate-600 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-slate-300 hover:border-amber-500 hover:text-amber-300"
          >
            {factionLabel(entry.faction)}
          </a>
        {/if}
    </p>
    <p class="mt-1 font-mono text-sm text-amber-300"><KeywordText text={entry.effect} /></p>
  </div>

  {#if requires.length > 0}
    <div class="mt-4 border-t border-slate-700 pt-3">
      <h3 class="mb-2 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">
        Only offered while you field {requires.length === 1 ? 'this unit' : 'one of these'}
      </h3>
      <div class="flex flex-col gap-1">
        {#each requires as unit (unit.id)}
          <a href={hrefFor('unit', unit.id)} class="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-slate-700/60">
            <Sprite name={unit.name} class="h-9 w-8 shrink-0" />
            <span class="flex-1 truncate text-sm font-semibold {TIER_STYLE[unit.tier].text}">{unit.name}</span>
            <span class="font-mono text-[11px] text-slate-500">T{unit.tier}</span>
          </a>
        {/each}
      </div>
    </div>
  {/if}

  <p class="mt-4 border-t border-slate-700 pt-3 text-sm text-slate-400">
    {ITEM_GROUP_NOTE[entry.group]}
    {#if entry.group === 'legacy'}
      Its bonuses applied to every stack in the army; morale and luck cap at 3.
    {:else}
      It stays with the army for the rest of the run.
    {/if}
  </p>
{:else if entry.kind === 'concept'}
  <p class="text-[11px] font-bold uppercase tracking-wider text-slate-500">Glossary</p>
  <h2 class="mt-0.5 text-2xl font-black text-sky-300">{entry.name}</h2>
  <p class="mt-2 text-sm leading-snug text-slate-300"><KeywordText text={entry.description} /></p>
  <p class="mt-4 border-t border-slate-700 pt-3 text-sm text-slate-400">
    A rules word rather than a thing in the world. It is here because ability and artifact text uses
    it, and a term the rules lean on should be somewhere you can look it up.
  </p>
{:else if entry.kind === 'unitSkill'}
  <h2 class="text-2xl font-black text-violet-300">{entry.name}</h2>
  <p class="mt-2 text-sm leading-snug text-slate-300"><KeywordText text={UNIT_SKILLS[entry.id as keyof typeof UNIT_SKILLS].description} /></p>
  <p class="mt-3 border-t border-slate-700 pt-3 text-sm text-slate-400">
    Taught to a single stack by a gauntlet skill draft. It becomes a real
    <a href={hrefFor('ability', entry.ability)} class="font-semibold text-amber-300 hover:underline">ability</a>
    on that unit for the rest of the run.
  </p>
{/if}
