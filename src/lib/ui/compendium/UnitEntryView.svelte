<script lang="ts">
  import KeywordText from '../keyword/KeywordText.svelte';
  import type { EntryKind, UnitEntry } from '$lib/compendium/entries';
  import { FACTION_INFO } from '$lib/engine/factions';
  import { TIER_STYLE } from '../tierStyle';
  import { STAT_META, type StatKey } from '../statMeta';
  import { abilityInfo } from '../abilities';
  import { skillIconFor, skillGlyph } from '../skillIcons';
  import Sprite from '../Sprite.svelte';

  interface Props {
    entry: UnitEntry;
    /** Filter-preserving link builder, supplied by the route. */
    hrefFor: (kind: EntryKind, id: string) => string;
  }

  let { entry, hrefFor }: Props = $props();

  const tier = $derived(TIER_STYLE[entry.tier]);
  const base = $derived(entry.unit.base);

  // Base stats only — no live battle state. Zeroed fields are dropped rather
  // than shown as 0, so a melee unit doesn't advertise "0 shots".
  const stats = $derived.by((): Array<{ key: StatKey; value: string }> => {
    const rows: Array<{ key: StatKey; value: string }> = [
      { key: 'hp', value: `${base.hp}` },
      { key: 'attack', value: `${base.attack}` },
      { key: 'defense', value: `${base.defense}` },
      { key: 'damage', value: `${base.minDamage}–${base.maxDamage}` },
      { key: 'speed', value: `${base.speed}` },
      { key: 'initiative', value: `${base.initiative}` },
    ];
    if (base.shots > 0) {
      rows.push({ key: 'shots', value: `${base.shots}` }, { key: 'range', value: `${base.range}` });
    }
    if (entry.cost !== null) rows.push({ key: 'cost', value: `${entry.cost}` });
    return rows;
  });
</script>

<div class="flex items-center gap-4">
  <Sprite name={entry.name} class="h-24 w-20 shrink-0" />
  <div class="min-w-0">
    <h2 class="text-2xl font-black {tier.text}">{entry.name}</h2>
    <p class="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider">
      <span class="rounded border {tier.border} px-1.5 py-0.5 {tier.text}">Tier {entry.tier} · {tier.label}</span>
      <a
        href={hrefFor('faction', entry.faction)}
        class="rounded border border-slate-600 px-1.5 py-0.5 text-slate-300 hover:border-amber-500 hover:text-amber-300"
      >
        {FACTION_INFO[entry.faction].name}
      </a>
      {#if entry.unit.isLarge}
        <span class="rounded border border-slate-600 px-1.5 py-0.5 text-slate-300">Large</span>
      {/if}
    </p>
  </div>
</div>

<div class="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 border-t border-slate-700 pt-3 text-sm">
  {#each stats as stat (stat.key)}
    <span class="flex cursor-help items-center gap-2" title={STAT_META[stat.key].title}>
      <img
        src={STAT_META[stat.key].icon}
        alt=""
        class="h-5 w-5 shrink-0 object-contain [image-rendering:pixelated]"
      />
      <span class="flex-1 truncate text-slate-400">{STAT_META[stat.key].label}</span>
      <span class="font-mono text-slate-100">{stat.value}</span>
    </span>
  {/each}
</div>

{#if entry.abilities.length > 0}
  <div class="mt-4 border-t border-slate-700 pt-3">
    <h3 class="mb-2 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Abilities</h3>
    <div class="flex flex-col gap-2">
      {#each entry.abilities as ability (ability.id)}
        {@const info = abilityInfo(ability.id, ability.level)}
        <div>
          <a
            href={hrefFor('ability', ability.id)}
            class="flex items-center gap-1.5 text-sm font-semibold text-amber-300 hover:underline"
          >
            {#if skillIconFor(ability.id)}
              <img src={skillIconFor(ability.id)} alt="" class="h-4 w-4" />
            {:else}
              <span aria-hidden="true">{skillGlyph(ability.id)}</span>
            {/if}
            {info.label}
          </a>
          <p class="text-sm leading-tight text-slate-400"><KeywordText text={info.description} /></p>
        </div>
      {/each}
    </div>
  </div>
{:else}
  <p class="mt-4 border-t border-slate-700 pt-3 text-sm text-slate-500">No special abilities.</p>
{/if}
