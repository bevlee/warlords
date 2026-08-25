<script lang="ts">
  import type { Hero, UnitStack } from '$lib/engine/types';
  import { maxMana } from '$lib/engine/factionSkills';
  import { effectiveAttack, effectiveDefense } from '$lib/engine/combat';
  import { abilityInfo } from './abilities';
  import { abilityLevel } from '$lib/engine/abilityCatalog';
  import { skillIconFor, skillGlyph } from './skillIcons';
  import { STAT_META, type StatKey } from './statMeta';
  import { unitSlug } from './sprites';
  import { entryHref } from '$lib/compendium/entries';
  import Sprite from './Sprite.svelte';

  interface Props {
    unit: UnitStack | null;
    hero?: Hero | null;
    pinned?: boolean;
    onunpin?: (() => void) | null;
    /** Render inside another surface (e.g. a draft card): no own border, no pin hint. */
    embedded?: boolean;
    /** 'compact' fits the battle sidebar; 'large' is for roomy screens like the draft. */
    size?: 'compact' | 'large';
  }

  let { unit, hero = null, pinned = false, onunpin = null, embedded = false, size = 'compact' }: Props = $props();

  const sz = $derived(
    size === 'large'
      ? {
          pad: 'px-4 py-3 gap-2.5',
          sprite: 'h-24 w-20',
          name: 'text-[27px]',
          count: 'text-[21px]',
          stat: 'text-[21px] gap-y-2',
          statGrid: 'grid-cols-2',
          ability: 'text-[21px]',
          statIcon: 'h-9 w-9',
          abilityIcon: 'h-6 w-6',
        }
      : {
          pad: 'px-3 py-2 gap-1.5',
          sprite: 'h-16 w-14',
          name: 'text-[21px]',
          count: 'text-lg',
          stat: 'text-lg gap-y-1.5',
          statGrid: 'grid-cols-2',
          ability: 'text-[16.5px]',
          statIcon: 'h-6 w-6',
          abilityIcon: 'h-6 w-6',
        }
  );

  interface Stat {
    key: StatKey;
    value: string;
    buff?: number;
  }

  const stats = $derived.by((): Stat[] => {
    if (!unit) return [];
    const d = unit.definition;
    if (unit.isHero && hero) {
      return [
        { key: 'level', value: `${hero.level}` },
        { key: 'mana', value: `${hero.mana ?? 0}/${maxMana(hero)}` },
        { key: 'attack', value: `${hero.attack}` },
        { key: 'defense', value: `${hero.defense}` },
        { key: 'damage', value: `${d.minDamage}–${d.maxDamage}` },
        { key: 'initiative', value: `${d.initiative}` },
        { key: 'range', value: '∞' },
        { key: 'xp', value: `${hero.xp}` },
      ];
    }
    // The hero's attack is added to every player stack in the damage formula,
    // so fold it into the unit's shown attack — it's their real base. Spell
    // buffs stay separate as the green (+N).
    const heroAttack = !unit.isHero && unit.side === 'player' && hero ? hero.attack : 0;
    return [
      { key: 'count', value: `${unit.count}` },
      { key: 'hp', value: `${unit.hp}/${d.hp}` },
      // Straight from the damage formula's own helpers, so an infected stack
      // shown at 0 attack is exactly what it fights at.
      { key: 'attack', value: `${effectiveAttack(unit, heroAttack)}`, buff: unit.attackBuff ?? 0 },
      { key: 'defense', value: `${effectiveDefense(unit)}`, buff: unit.defenseBuff ?? 0 },
      {
        key: 'damage',
        value: `${d.minDamage + (unit.damageBonus ?? 0)}–${d.maxDamage + (unit.damageBonus ?? 0)}`,
        buff: unit.damageBonus ?? 0,
      },
      { key: 'speed', value: `${d.speed}` },
      { key: 'initiative', value: `${d.initiative + (unit.initiativeBonus ?? 0)}`, buff: unit.initiativeBonus ?? 0 },
      { key: 'morale', value: `${unit.morale}` },
      { key: 'luck', value: `${unit.luck}` },
      { key: 'range', value: d.range > 0 ? `${d.range}` : '—' },
      { key: 'shots', value: d.shots > 0 ? `${unit.shotsLeft}/${d.shots}` : '—' },
    ];
  });
</script>

<!-- One layout for both states: right-clicking pins the panel to whatever it is
     already showing, so the only difference is persistence (plus the amber
     border and unpin button that mark it). Fixed size regardless — hovering
     different units must never change this panel's footprint, since a growing
     panel can toggle the page scrollbar and reflow the width-driven board. A
     unit with many abilities scrolls rather than growing. -->
<div
  class="flex h-full flex-col overflow-x-hidden overflow-y-auto rounded-lg bg-slate-800 {sz.pad}
    {embedded ? '' : `border ${pinned ? 'border-amber-500/60' : 'border-slate-700'}`}"
>
  {#if unit}
    <div class="flex shrink-0 items-center gap-2">
      <Sprite name={unit.definition.name} class={sz.sprite} />
      <span class="flex-1 truncate font-semibold {sz.name} {unit.side === 'player' ? 'text-sky-300' : 'text-red-300'}">
        {#if unit.isHero}
          Hero — level {hero?.level ?? '?'}
        {:else}
          <!-- New tab on purpose: this panel is often shown mid-battle, and
               navigating away would end it. -->
          <a
            href={entryHref('unit', unitSlug(unit.definition.name))}
            target="_blank"
            rel="noopener"
            title="Read about {unit.definition.name} in the compendium"
            class="hover:underline">{unit.definition.name}</a
          >
          <span class="ml-1 font-mono text-slate-400 {sz.count}">×{unit.count}</span>
        {/if}
      </span>
      {#if pinned}
        <button
          type="button"
          class="shrink-0 rounded px-1.5 text-lg leading-none text-slate-400 hover:bg-slate-700 hover:text-slate-100"
          title="Unpin (Esc)"
          aria-label="Unpin unit info"
          onclick={() => onunpin?.()}
        >
          ×
        </button>
      {:else if !embedded}
        <span class="min-w-0 truncate text-[10px] uppercase tracking-wide text-slate-600">right-click to pin</span>
      {/if}
    </div>

    <div class="grid shrink-0 gap-x-4 border-t border-slate-700 pt-1.5 {sz.statGrid} {sz.stat}">
      {#each stats as stat (stat.key)}
        <span class="flex cursor-help items-center gap-1.5" title={STAT_META[stat.key].title}>
          <img
            src={STAT_META[stat.key].icon}
            alt=""
            class="shrink-0 object-contain [image-rendering:pixelated] {sz.statIcon}"
          />
          <span class="flex-1 truncate text-slate-400">{STAT_META[stat.key].label}</span>
          <span class="font-mono text-slate-100">
            {#if stat.buff}
              <!-- Buffs can be negative (Zombie infecting strike), so the sign
                   and the color both follow the value. -->
              <span class={stat.buff > 0 ? 'text-emerald-400' : 'text-rose-400'}
                >({stat.buff > 0 ? '+' : '−'}{Math.abs(stat.buff)})</span
              >{stat.value}
            {:else}
              {stat.value}
            {/if}
          </span>
        </span>
      {/each}
    </div>

    {#if unit.definition.abilities.length > 0}
      <div class="flex flex-col gap-1 border-t border-slate-700 pt-1.5">
        {#each unit.definition.abilities as ability (ability)}
          {@const info = abilityInfo(ability, abilityLevel(unit.definition, ability))}
          {@const taught = unit.definition.grantedAbilities?.includes(ability) ?? false}
          <div>
            {#if taught}
              <!-- Run-taught skill: violet, with its icon (PNG when art exists,
                   glyph until then) — visually distinct from base abilities. -->
              <p class="flex items-center gap-1 font-semibold leading-tight text-violet-300 {sz.ability}">
                {#if skillIconFor(ability)}
                  <img
                    src={skillIconFor(ability)}
                    alt=""
                    class="shrink-0 object-contain [image-rendering:pixelated] {sz.abilityIcon}"
                  />
                {:else}
                  <span aria-hidden="true">{skillGlyph(ability)}</span>
                {/if}
                <a href={entryHref('ability', ability)} target="_blank" rel="noopener" class="hover:underline">{info.label}</a>
                <span class="text-[9px] font-normal uppercase tracking-wider text-violet-400/80">taught</span>
              </p>
            {:else}
              <p class="font-semibold leading-tight text-amber-300 {sz.ability}">
                <a href={entryHref('ability', ability)} target="_blank" rel="noopener" class="hover:underline">{info.label}</a>
              </p>
            {/if}
            <p class="leading-tight text-slate-400 {sz.ability}">{info.description}</p>
          </div>
        {/each}
      </div>
    {/if}
  {:else}
    <p class="text-lg text-slate-500">Hover a unit to inspect it. Right-click to pin.</p>
  {/if}
</div>
