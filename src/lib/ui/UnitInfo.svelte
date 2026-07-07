<script lang="ts">
  import type { Hero, UnitStack } from '$lib/engine/types';
  import { maxMana } from '$lib/engine/factionSkills';
  import Sprite from './Sprite.svelte';

  interface Props {
    unit: UnitStack | null;
    hero?: Hero | null;
  }

  let { unit, hero = null }: Props = $props();

  const rows = $derived.by(() => {
    if (!unit) return [];
    const d = unit.definition;
    if (unit.isHero && hero) {
      return [
        ['Level', `${hero.level}`],
        ['Mana', `${hero.mana ?? 0} / ${maxMana(hero)}`],
        ['Attack', `${hero.attack}`],
        ['Defense', `${hero.defense}`],
        ['Damage', `${d.minDamage}–${d.maxDamage}`],
        ['Initiative', `${d.initiative}`],
        ['Range', '∞'],
        ['XP', `${hero.xp}`],
      ];
    }
    return [
      ['Count', `${unit.count}`],
      ['HP', `${unit.hp} / ${d.hp}`],
      ['Attack', unit.attackBuff ? `${d.attack + unit.attackBuff} ✨` : `${d.attack}`],
      ['Defense', unit.defenseBuff ? `${d.defense + unit.defenseBuff} ✨` : `${d.defense}`],
      ['Damage', `${d.minDamage}–${d.maxDamage}`],
      ['Speed', `${d.speed}`],
      ['Initiative', `${d.initiative}`],
      ['Range', d.range > 0 ? `${d.range}` : '—'],
      ['Shots', d.shots > 0 ? `${unit.shotsLeft} / ${d.shots}` : '—'],
    ];
  });
</script>

<!-- Fixed height: hovering different units must never change this panel's
     footprint (a growing panel can toggle the page scrollbar and reflow the
     whole width-driven board). -->
<div class="h-48 overflow-hidden rounded-lg border border-slate-700 bg-slate-800 p-2">
  {#if unit}
    <div class="mb-1 flex items-center gap-2">
      <Sprite name={unit.definition.name} class="h-9 w-8" />
      <span class="text-sm font-semibold {unit.side === 'player' ? 'text-sky-300' : 'text-red-300'}">
        {unit.isHero ? `Hero — level ${hero?.level ?? '?'}` : unit.definition.name}
      </span>
    </div>
    <dl class="grid grid-cols-2 gap-x-3 text-xs leading-relaxed">
      {#each rows as [label, value] (label)}
        <div class="flex justify-between gap-2">
          <dt class="text-slate-400">{label}</dt>
          <dd class="font-mono text-slate-200">{value}</dd>
        </div>
      {/each}
    </dl>
    {#if unit.definition.abilities.length > 0}
      <p class="mt-1 text-xs text-amber-300/90">
        {unit.definition.abilities.join(', ').replaceAll('_', ' ')}
      </p>
    {/if}
  {:else}
    <p class="text-xs text-slate-500">Hover a unit to inspect it.</p>
  {/if}
</div>
