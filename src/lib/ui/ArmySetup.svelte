<script lang="ts">
  import { FACTION_UNITS, FACTION_INFO } from '$lib/engine/factions';
  import { UNIT_COSTS, MAX_STACKS, armyCost } from '$lib/engine/recruit';
  import { xpToReach, isTierUnlocked, tierUnlockLevel, maxUnlockedTier } from '$lib/engine/progression';
  import { maxMana } from '$lib/engine/factionSkills';
  import { augmentedDef } from '$lib/engine/augments';
  import Sprite from './Sprite.svelte';
  import AugmentPicker from './AugmentPicker.svelte';
  import type { ArmySlot, FactionClass, Hero } from '$lib/engine/types';

  interface Props {
    hero: Hero;
    budget: number;
    lastBattle: { xp: number; levels: number } | null;
    onstart: (army: ArmySlot[]) => void;
    onreset: () => void;
    onclass: (cls: FactionClass) => void;
    onaugment: (unitName: string, augmentId: string) => void;
  }

  let { hero, budget, lastBattle, onstart, onreset, onclass, onaugment }: Props = $props();

  const xpFloor = $derived(xpToReach(hero.level));
  const xpCeil = $derived(xpToReach(hero.level + 1));
  const xpPct = $derived(Math.round(((hero.xp - xpFloor) / (xpCeil - xpFloor)) * 100));

  // Rows display augmented stats; eligibility checks in the picker use the base def.
  const baseUnits = $derived(FACTION_UNITS[hero.class]);
  const units = $derived(baseUnits.map(u => augmentedDef(u, hero.unitAugments?.[u.name] ?? [])));

  let counts: Record<string, number> = $state({});
  let augmentTarget: string | null = $state(null); // unit name with the picker open

  // Switching faction shows a different roster, and a level change (level-up or
  // hero reset) can change which tiers are recruitable — both invalidate picks.
  $effect(() => {
    void hero.level;
    counts = Object.fromEntries(units.map(u => [u.name, 0]));
  });

  // Level-up note: did the last battle's levels open a new tier?
  const unlockedNewTier = $derived(
    lastBattle && lastBattle.levels > 0
      ? maxUnlockedTier(hero.level) > maxUnlockedTier(hero.level - lastBattle.levels)
      : false
  );

  // Slots carry the *base* defs — startBattle applies augments once, centrally.
  const slots = $derived(
    baseUnits.filter(u => counts[u.name] > 0).map(u => ({ unit: u, count: counts[u.name] }))
  );
  const spent = $derived(armyCost(slots));
  const goldLeft = $derived(budget - spent);

  function maxAffordable(name: string): number {
    return Math.floor(goldLeft / UNIT_COSTS[name]);
  }

  function canAdd(name: string): boolean {
    const unit = units.find(u => u.name === name);
    if (!unit || !isTierUnlocked(hero.level, unit.tier)) return false;
    if (UNIT_COSTS[name] > goldLeft) return false;
    return counts[name] > 0 || slots.length < MAX_STACKS;
  }

  function add(name: string, n: number) {
    if (!canAdd(name)) return;
    counts[name] += Math.min(n, maxAffordable(name));
  }

  function remove(name: string, n: number) {
    counts[name] = Math.max(0, counts[name] - n);
  }
</script>

<div class="mx-auto max-w-3xl">
  <div
    class="mb-4 flex items-center justify-between gap-4 rounded-lg border border-slate-700 bg-slate-800 px-4 py-3"
    aria-label="Hero — level {hero.level}, {hero.xp} XP"
  >
    <div class="flex items-center gap-3">
      <Sprite name="Hero" class="h-12 w-10" />
      <div>
        <p class="text-sm font-semibold text-amber-200">
          Level {hero.level} {FACTION_INFO[hero.class].name}
          <span class="ml-2 font-mono text-xs text-slate-300">⚔{hero.attack} 🛡{hero.defense} 💧{maxMana(hero)}</span>
          {#if (hero.augmentPoints ?? 0) > 0}
            <span class="ml-2 font-mono text-xs text-violet-300">✦ {hero.augmentPoints} augment {hero.augmentPoints === 1 ? 'point' : 'points'}</span>
          {/if}
        </p>
        <div class="mt-1 flex items-center gap-2">
          <div class="h-1.5 w-40 overflow-hidden rounded bg-black/50">
            <div class="h-full bg-violet-400" style="width: {xpPct}%"></div>
          </div>
          <span class="font-mono text-[10px] text-slate-400">{hero.xp} / {xpCeil} XP</span>
        </div>
      </div>
      {#if lastBattle}
        <p class="ml-3 text-sm {lastBattle.xp > 0 ? 'text-emerald-300' : 'text-red-300'}">
          {lastBattle.xp > 0 ? `+${lastBattle.xp} XP` : 'No XP — defeated'}
          {#if lastBattle.levels > 0}<span class="ml-1 font-bold text-amber-300">Level up!</span>{/if}
          {#if unlockedNewTier}<span class="ml-1 font-semibold text-emerald-300">New tier unlocked!</span>{/if}
        </p>
      {/if}
      {#if hero.bonusSkeletons}
        <p class="ml-3 text-sm text-slate-300">💀 +{hero.bonusSkeletons} free Skeletons next battle (Necromancy)</p>
      {/if}
    </div>
    <button
      type="button"
      class="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-700 hover:text-slate-200"
      onclick={onreset}
    >
      Reset hero
    </button>
  </div>

  <div class="mb-4 grid grid-cols-3 gap-3">
    {#each Object.entries(FACTION_INFO) as [cls, info] (cls)}
      <button
        type="button"
        class="rounded-lg border px-3 py-2 text-left transition
          {hero.class === cls ? 'border-amber-500 bg-slate-700' : 'border-slate-700 bg-slate-800 hover:bg-slate-700/60'}"
        onclick={() => onclass(cls as typeof hero.class)}
      >
        <p class="text-sm font-semibold text-slate-100">{info.name}</p>
        <p class="mt-0.5 text-[11px] leading-tight text-slate-400">{info.description}</p>
      </button>
    {/each}
  </div>

  <div class="mb-4 flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800 px-4 py-3">
    <div class="flex items-center gap-6">
      <span class="text-lg font-semibold text-amber-300">🪙 {goldLeft} <span class="text-sm font-normal text-slate-400">/ {budget} gold</span></span>
      <span class="text-sm text-slate-300">{slots.length} / {MAX_STACKS} stacks</span>
    </div>
    <button
      type="button"
      class="rounded bg-amber-600 px-5 py-2 font-semibold text-white hover:bg-amber-500
        disabled:cursor-not-allowed disabled:opacity-40"
      disabled={slots.length === 0}
      onclick={() => onstart(slots)}
    >
      Start battle ⚔️
    </button>
  </div>

  <div class="overflow-hidden rounded-lg border border-slate-700">
    {#each units as unit (unit.name)}
      {@const n = counts[unit.name]}
      {@const locked = !isTierUnlocked(hero.level, unit.tier)}
      <div
        class="flex items-center gap-3 border-b border-slate-700/60 bg-slate-800 px-4 py-2 last:border-b-0
          {n > 0 ? 'bg-slate-700/60' : ''}"
      >
        <div class={locked ? 'opacity-40 grayscale' : ''}>
          <Sprite name={unit.name} class="h-11 w-9 shrink-0" />
        </div>
        <div class="w-32 {locked ? 'opacity-40' : ''}">
          <p class="text-sm font-semibold text-slate-100">{unit.name}</p>
          <p class="font-mono text-[10px] text-amber-300">🪙 {UNIT_COSTS[unit.name]} each</p>
        </div>
        <p class="flex-1 font-mono text-[11px] leading-tight text-slate-400 {locked ? 'opacity-40' : ''}">
          HP {unit.hp} · Atk {unit.attack} · Def {unit.defense} · Dmg {unit.minDamage}–{unit.maxDamage}<br />
          Spd {unit.speed} · Init {unit.initiative}{unit.shots > 0 ? ` · 🏹 ${unit.shots} shots, range ${unit.range}` : ''}
        </p>
        {#if locked}
          <p class="text-xs font-semibold text-slate-500">🔒 Unlocks at level {tierUnlockLevel(unit.tier)}</p>
        {:else}
          {@const owned = hero.unitAugments?.[unit.name] ?? []}
          <button
            type="button"
            class="h-7 shrink-0 rounded px-1.5 font-mono text-xs
              {owned.length > 0 ? 'bg-violet-900/60 text-violet-300' : 'bg-slate-600 text-slate-300'}
              hover:bg-violet-800/60 hover:text-violet-200"
            title="Augments"
            aria-label="augments for {unit.name}"
            onclick={() => (augmentTarget = unit.name)}
          >✦{owned.length > 0 ? owned.length : ''}</button>
          <div class="flex items-center gap-1">
            <button type="button" class="h-7 w-7 rounded bg-slate-600 text-slate-100 hover:bg-slate-500 disabled:opacity-30"
              disabled={n === 0} onclick={() => remove(unit.name, 5)} aria-label="remove 5 {unit.name}">‹5</button>
            <button type="button" class="h-7 w-7 rounded bg-slate-600 text-slate-100 hover:bg-slate-500 disabled:opacity-30"
              disabled={n === 0} onclick={() => remove(unit.name, 1)} aria-label="remove {unit.name}">−</button>
            <span class="w-10 text-center font-mono text-sm text-slate-100">{n}</span>
            <button type="button" class="h-7 w-7 rounded bg-slate-600 text-slate-100 hover:bg-slate-500 disabled:opacity-30"
              disabled={!canAdd(unit.name)} onclick={() => add(unit.name, 1)} aria-label="add {unit.name}">+</button>
            <button type="button" class="h-7 w-7 rounded bg-slate-600 text-slate-100 hover:bg-slate-500 disabled:opacity-30"
              disabled={!canAdd(unit.name)} onclick={() => add(unit.name, 5)} aria-label="add 5 {unit.name}">5›</button>
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <p class="mt-3 text-sm text-slate-400">
    The enemy warlord fields an army of the same value. Choose up to {MAX_STACKS} stacks.
  </p>

  {#if augmentTarget}
    {@const baseUnit = baseUnits.find(u => u.name === augmentTarget)}
    {#if baseUnit}
      <AugmentPicker
        unit={baseUnit}
        owned={hero.unitAugments?.[augmentTarget] ?? []}
        points={hero.augmentPoints ?? 0}
        onpick={(id) => onaugment(augmentTarget!, id)}
        onclose={() => (augmentTarget = null)}
      />
    {/if}
  {/if}
</div>
