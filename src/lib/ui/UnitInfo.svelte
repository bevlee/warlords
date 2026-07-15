<script lang="ts">
  import type { Hero, UnitStack } from '$lib/engine/types';
  import { maxMana } from '$lib/engine/factionSkills';
  import { abilityInfo } from './abilities';
  import Sprite from './Sprite.svelte';

  interface Props {
    unit: UnitStack | null;
    hero?: Hero | null;
  }

  let { unit, hero = null }: Props = $props();

  // Icon + hover explanation per stat, kept in one place so the meaning of
  // each glyph is discoverable via title tooltip instead of a text label.
  const STAT_META = {
    level: { icon: '⭐', title: 'Level' },
    mana: { icon: '🔷', title: 'Mana — spent casting spells' },
    xp: { icon: '✨', title: 'Experience points' },
    count: { icon: '👥', title: 'Count — creatures remaining in this stack' },
    hp: { icon: '💚', title: 'Hit points — current / max per creature' },
    attack: { icon: '⚔️', title: 'Attack — raises damage dealt' },
    defense: { icon: '🛡️', title: 'Defense — reduces damage taken' },
    damage: { icon: '💥', title: 'Damage — min–max per hit' },
    speed: { icon: '🥾', title: 'Speed — tiles moved per turn' },
    initiative: { icon: '⚡', title: 'Initiative — determines turn order' },
    range: { icon: '🎯', title: 'Range — shooting distance' },
    shots: { icon: '🏹', title: 'Shots — ranged attacks left / max' },
  } as const;

  const stats = $derived.by(() => {
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
      ] as const;
    }
    return [
      { key: 'count', value: `${unit.count}` },
      { key: 'hp', value: `${unit.hp}/${d.hp}` },
      { key: 'attack', value: unit.attackBuff ? `${d.attack + unit.attackBuff}✨` : `${d.attack}` },
      { key: 'defense', value: unit.defenseBuff ? `${d.defense + unit.defenseBuff}✨` : `${d.defense}` },
      { key: 'damage', value: `${d.minDamage}–${d.maxDamage}` },
      { key: 'speed', value: `${d.speed}` },
      { key: 'initiative', value: `${d.initiative}` },
      { key: 'range', value: d.range > 0 ? `${d.range}` : '—' },
      { key: 'shots', value: d.shots > 0 ? `${unit.shotsLeft}/${d.shots}` : '—' },
    ] as const;
  });
</script>

<!-- Fixed height: hovering different units must never change this panel's
     footprint (a growing panel can toggle the page scrollbar and reflow the
     whole width-driven board). Narrow + tall (the 30% right column): stats
     as a grid of icon+value chips, abilities as badges with hover tooltips. -->
<div class="flex h-full flex-col gap-1.5 overflow-hidden rounded-lg border border-slate-700 bg-slate-800 px-3 py-2">
  {#if unit}
    <div class="flex shrink-0 items-center gap-2">
      <Sprite name={unit.definition.name} class="h-11 w-10" />
      <span class="truncate text-sm font-semibold {unit.side === 'player' ? 'text-sky-300' : 'text-red-300'}">
        {unit.isHero ? `Hero — level ${hero?.level ?? '?'}` : unit.definition.name}
      </span>
    </div>
    <div class="grid grid-cols-3 gap-x-3 gap-y-1">
      {#each stats as { key, value } (key)}
        <span
          class="flex cursor-help items-baseline gap-1 text-sm"
          title={STAT_META[key].title}
        >
          <span aria-hidden="true">{STAT_META[key].icon}</span>
          <span class="font-mono text-slate-200">{value}</span>
        </span>
      {/each}
    </div>
    {#if unit.definition.abilities.length > 0}
      <div class="flex flex-wrap content-start items-start gap-1">
        {#each unit.definition.abilities as ability (ability)}
          {@const info = abilityInfo(ability)}
          <span
            class="cursor-help rounded border border-amber-500/40 bg-amber-950/60 px-1.5 py-0.5
              text-[11px] font-medium leading-tight text-amber-300"
            title={info.description}
          >
            {info.label}
          </span>
        {/each}
      </div>
    {/if}
  {:else}
    <p class="text-xs text-slate-500">Hover a unit to inspect it.</p>
  {/if}
</div>
