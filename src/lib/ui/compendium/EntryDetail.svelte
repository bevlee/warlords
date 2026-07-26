<script lang="ts">
  import type { CompendiumEntry } from '$lib/compendium/entries';
  import { factionSkillId, unitEntries, type EntryKind } from '$lib/compendium/entries';
  import type { DiscoveryState } from '$lib/compendium/discovery';
  import { factionProgress } from '$lib/compendium/discovery';
  import { FACTION_SKILL_DEFS } from '$lib/engine/factionSkills';
  import { FACTION_INFO } from '$lib/engine/factions';
  import { TIER_STYLE } from '../tierStyle';
  import { UNIT_SKILLS } from '$lib/gauntlet/skills';
  import Sprite from '../Sprite.svelte';
  import ItemIcon from '../ItemIcon.svelte';
  import UnitEntryView from './UnitEntryView.svelte';

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
      <p class="mt-1 text-sm text-slate-400">{entry.description}</p>
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

  <div class="mt-4 border-t border-slate-700 pt-3">
    <h3 class="mb-2 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Faction skills</h3>
    <div class="flex flex-col gap-2">
      {#each FACTION_SKILL_DEFS[entry.faction] as skill (skill.id)}
        <a href={hrefFor('factionSkill', factionSkillId(entry.faction, skill.id))} class="block hover:underline">
          <p class="text-sm font-semibold text-amber-300">{skill.name}</p>
          <p class="text-sm leading-tight text-slate-400">{skill.description}</p>
        </a>
      {/each}
    </div>
  </div>
{:else if entry.kind === 'ability'}
  <h2 class="text-2xl font-black text-amber-300">{entry.name}</h2>
  <p class="mt-2 text-sm leading-snug text-slate-300">{entry.description}</p>
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
    <span class="grid h-20 w-20 shrink-0 place-items-center rounded-lg bg-slate-700 text-5xl">{entry.glyph}</span>
    <div>
      <h2 class="text-2xl font-black text-slate-100">{entry.name}</h2>
      <p class="mt-1 font-mono text-sm text-sky-300">{entry.manaCost} mana · {entry.target}</p>
      <p class="font-mono text-sm text-amber-300">{entry.effect}</p>
    </div>
  </div>
  <p class="mt-4 border-t border-slate-700 pt-3 text-sm leading-snug text-slate-300">{entry.description}</p>
{:else if entry.kind === 'factionSkill'}
  <h2 class="text-2xl font-black text-slate-100">{entry.name}</h2>
  <p class="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
    <a href={hrefFor('faction', entry.faction)} class="hover:text-amber-300">{FACTION_INFO[entry.faction].name}</a>
    · unlocks at hero level {entry.unlockLevel}
  </p>
  <p class="mt-3 border-t border-slate-700 pt-3 text-sm leading-snug text-slate-300">{entry.description}</p>
  <p class="mt-2 text-sm text-slate-500">
    Faction skills level up as the hero does — one rank at the unlock level, then a rank every three
    levels to a maximum of three.
  </p>
{:else if entry.kind === 'item'}
  <div class="flex items-center gap-4">
    <ItemIcon id={entry.id} class="h-20 w-20 shrink-0" />
    <div>
      <h2 class="text-2xl font-black {RARITY[entry.rarity].text}">{entry.name}</h2>
      <p class="mt-1 inline-block rounded border {RARITY[entry.rarity].border} px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider {RARITY[entry.rarity].text}">
        {RARITY[entry.rarity].label}
      </p>
      <p class="mt-1 font-mono text-sm text-amber-300">{entry.effect}</p>
    </div>
  </div>
  <p class="mt-4 border-t border-slate-700 pt-3 text-sm text-slate-400">
    Offered during a gauntlet run. Its bonuses apply to every stack in your army for the rest of the
    run. Morale and luck are capped at 3.
  </p>
{:else if entry.kind === 'unitSkill'}
  <h2 class="text-2xl font-black text-violet-300">{entry.name}</h2>
  <p class="mt-2 text-sm leading-snug text-slate-300">{UNIT_SKILLS[entry.id as keyof typeof UNIT_SKILLS].description}</p>
  <p class="mt-3 border-t border-slate-700 pt-3 text-sm text-slate-400">
    Taught to a single stack by a gauntlet skill draft. It becomes a real
    <a href={hrefFor('ability', entry.ability)} class="font-semibold text-amber-300 hover:underline">ability</a>
    on that unit for the rest of the run.
  </p>
{/if}
