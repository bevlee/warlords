<script lang="ts">
  import type { CompendiumEntry } from '$lib/compendium/entries';
  import { TIER_STYLE } from '../tierStyle';
  import { abilityInfo } from '../abilities';
  import { skillIconFor, skillGlyph } from '../skillIcons';
  import Sprite from '../Sprite.svelte';
  import { stripKeywords } from '$lib/compendium/keywords';
  import { spellIconFor } from '../spellIcons';

  interface Props {
    entry: CompendiumEntry;
    href: string;
    selected?: boolean;
    seen?: boolean;
  }

  let { entry, href, selected = false, seen = false }: Props = $props();

  const tier = $derived(entry.kind === 'unit' ? TIER_STYLE[entry.tier] : null);

  const RARITY_TEXT = {
    default: 'text-slate-300',
    common: 'text-slate-300',
    rare: 'text-sky-300',
    epic: 'text-fuchsia-300',
  } as const;

  // Second line of the card: whatever identifies this kind at a glance.
  const subtitle = $derived.by(() => {
    switch (entry.kind) {
      case 'unit':
        return `Tier ${entry.tier} · ${entry.unit.base.hp} HP · ${entry.unit.base.minDamage}–${entry.unit.base.maxDamage} dmg`;
      case 'faction':
        return `${entry.roster.length} units`;
      case 'ability':
        return entry.units.length > 0
          ? `${entry.units.length} unit${entry.units.length === 1 ? '' : 's'}`
          : 'Taught in gauntlet runs';
      case 'spell':
        return `${entry.manaCost} mana · ${entry.target}`;
      case 'item':
        return stripKeywords(entry.effect);
      case 'unitSkill':
        return 'Gauntlet draft';
      case 'concept':
        return stripKeywords(entry.description);
    }
  });
</script>

<a
  {href}
  aria-current={selected ? 'true' : undefined}
  class="flex w-full items-center gap-3 rounded-lg border bg-slate-800 px-3 text-left transition
    {entry.kind === 'ability' ? 'py-2' : 'py-2.5'}
    hover:bg-slate-700/70 focus:outline-none focus:ring-2 focus:ring-amber-500
    {selected ? 'border-amber-500 bg-slate-700 ring-1 ring-amber-500/40' : 'border-slate-700'}
    {tier?.glow ?? ''}"
>
  <!-- Abilities and artifacts use their titles as their visual identity;
       glossary terms are words, so they have nothing to show either. -->
  {#if entry.kind !== 'ability' && entry.kind !== 'item' && entry.kind !== 'concept'}
    <span class="grid h-12 w-11 shrink-0 place-items-center">
      {#if entry.kind === 'unit'}
        <Sprite name={entry.name} class="h-12 w-11" />
      {:else if entry.kind === 'faction'}
        <Sprite name="Hero {entry.faction}" class="h-12 w-11" />
      {:else if entry.kind === 'spell'}
        {#if spellIconFor(entry.id)}
          <img
            src={spellIconFor(entry.id)}
            alt=""
            class="h-10 w-10 object-contain [image-rendering:pixelated]"
          />
        {:else}
          <span class="text-2xl">{entry.glyph}</span>
        {/if}
      {:else if entry.kind === 'unitSkill'}
        {#if skillIconFor(entry.id)}
          <img src={skillIconFor(entry.id)} alt="" class="h-8 w-8" />
        {:else}
          <span class="text-2xl">{skillGlyph(entry.id)}</span>
        {/if}
      {:else}
        <span class="text-2xl">🎖️</span>
      {/if}
    </span>
  {/if}

  <span class="min-w-0 flex-1">
    <span class="flex items-center gap-1.5">
      <span
        class="truncate text-sm font-semibold
          {entry.kind === 'unit' ? tier!.text : entry.kind === 'item' ? RARITY_TEXT[entry.rarity] : 'text-slate-100'}"
      >
        {entry.name}
      </span>
      {#if seen}
        <span
          class="shrink-0 rounded-full bg-emerald-500/15 px-1.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300"
          title="You have met this in battle"
        >
          met
        </span>
      {/if}
    </span>
    <span class="mt-0.5 block truncate text-[11px] leading-tight text-slate-400">{subtitle}</span>
    {#if entry.kind === 'unit' && entry.abilities.length > 0}
      <span class="mt-0.5 block truncate text-[10px] leading-tight text-amber-400/80">
        {entry.abilities.map((a) => abilityInfo(a.id, a.level).label).join(' · ')}
      </span>
    {/if}
    <!-- An artifact you cannot draft without the right unit is worth seeing
         before you open it — it is the difference between a live pick and a
         line of flavour text. -->
    {#if entry.kind === 'item' && entry.requiresUnit.length > 0}
      <span class="mt-0.5 block truncate text-[10px] leading-tight text-amber-400/80">
        Needs {entry.requiresUnit.join(' or ')}
      </span>
    {/if}
  </span>
</a>
