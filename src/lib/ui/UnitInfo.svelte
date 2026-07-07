<script lang="ts">
  import type { Hero, UnitStack } from '$lib/engine/types';
  import { maxMana } from '$lib/engine/factionSkills';
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
     whole width-driven board). Wide + short: stats lay out lengthwise as a
     row of icon+value chips instead of a tall label/value grid. -->
<div class="flex h-16 items-center gap-4 overflow-hidden rounded-lg border border-slate-700 bg-slate-800 px-3">
  {#if unit}
    <div class="flex shrink-0 items-center gap-2">
      <Sprite name={unit.definition.name} class="h-11 w-10" />
      <span class="text-sm font-semibold {unit.side === 'player' ? 'text-sky-300' : 'text-red-300'}">
        {unit.isHero ? `Hero — level ${hero?.level ?? '?'}` : unit.definition.name}
      </span>
    </div>
    <div class="h-9 w-px shrink-0 bg-slate-600" aria-hidden="true"></div>
    <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-0.5">
      {#each stats as { key, value } (key)}
        <span
          class="flex items-baseline gap-1 text-sm"
          title={STAT_META[key].title}
        >
          <span aria-hidden="true">{STAT_META[key].icon}</span>
          <span class="font-mono text-slate-200">{value}</span>
        </span>
      {/each}
    </div>
    {#if unit.definition.abilities.length > 0}
      <p class="ml-auto max-w-xs shrink truncate text-xs text-amber-300/90" title={unit.definition.abilities.join(', ').replaceAll('_', ' ')}>
        {unit.definition.abilities.join(', ').replaceAll('_', ' ')}
      </p>
    {/if}
  {:else}
    <p class="text-xs text-slate-500">Hover a unit to inspect it.</p>
  {/if}
</div>
