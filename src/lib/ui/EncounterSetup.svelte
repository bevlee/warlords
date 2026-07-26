<script lang="ts">
  import { FACTION_UNITS, FACTION_INFO } from '$lib/engine/factions';
  import { UNIT_COSTS, MAX_STACKS, armyCost, recruitLimit } from '$lib/engine/recruit';
  import { xpToReach, maxRecruitTier } from '$lib/engine/progression';
  import { maxMana } from '$lib/engine/factionSkills';
  import Sprite from './Sprite.svelte';
  import RecruitRow from './RecruitRow.svelte';
  import { heroSpriteName } from './sprites';
  import { entryHref } from '$lib/compendium/entries';
  import type { Encounter } from '$lib/campaign/encounters';
  import type { SavedArmy } from '$lib/storage';
  import type { ArmySlot, Hero } from '$lib/engine/types';

  interface Props {
    hero: Hero;
    budget: number;
    encounter: Encounter;
    /** The army this encounter will actually field — deterministic, so it doubles as the preview. */
    enemyArmy: ArmySlot[];
    initialCounts?: SavedArmy | null;
    onstart: (army: ArmySlot[]) => void;
    onback: () => void;
    onclear?: () => void;
  }

  let { hero, budget, encounter, enemyArmy, initialCounts = null, onstart, onback, onclear }: Props = $props();

  const xpFloor = $derived(xpToReach(hero.level));
  const xpCeil = $derived(xpToReach(hero.level + 1));
  const xpPct = $derived(Math.round(((hero.xp - xpFloor) / (xpCeil - xpFloor)) * 100));

  const units = $derived(FACTION_UNITS[hero.class]);
  const maxTier = $derived(maxRecruitTier(hero.level));

  // Seed from the saved selection, dropping anything the hero can no longer
  // field: locked tiers, counts beyond the budget.
  function seedCounts(): Record<string, number> {
    const seeded = Object.fromEntries(units.map(u => [u.name, 0]));
    if (!initialCounts) return seeded;
    let left = budget;
    for (const u of units) {
      if (u.tier > maxTier) continue;
      const n = Math.min(initialCounts[u.name] ?? 0, Math.floor(left / UNIT_COSTS[u.name]));
      if (n > 0) {
        seeded[u.name] = n;
        left -= n * UNIT_COSTS[u.name];
      }
    }
    return seeded;
  }

  let counts: Record<string, number> = $state(seedCounts());

  const slots = $derived(
    units.filter(u => counts[u.name] > 0).map(u => ({ unit: u, count: counts[u.name] }))
  );
  const spent = $derived(armyCost(slots));
  const goldLeft = $derived(budget - spent);
  const spentPct = $derived(budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0);
  const enemyValue = $derived(armyCost(enemyArmy));

  function limitFor(unit: (typeof units)[number]) {
    return recruitLimit({
      cost: UNIT_COSTS[unit.name] ?? 0,
      count: counts[unit.name],
      goldLeft,
      locked: unit.tier > maxTier,
      atStackCap: slots.length >= MAX_STACKS,
    });
  }

  function setCount(name: string, n: number) {
    const limit = limitFor(units.find(u => u.name === name)!);
    counts[name] = Math.max(0, Math.min(n, limit.max));
  }

  function clearAll() {
    counts = Object.fromEntries(units.map(u => [u.name, 0]));
    onclear?.();
  }
</script>

<div class="mx-auto max-w-3xl">
  <!-- Encounter brief -->
  <div class="mb-3 rounded-lg border border-slate-700 bg-slate-800 px-4 py-3">
    <div class="flex items-start justify-between gap-4">
      <div>
        <p class="text-[11px] font-bold uppercase tracking-widest text-slate-500">Chapter {encounter.chapter}</p>
        <h2 class="text-lg font-bold text-amber-200">{encounter.name}</h2>
        <p class="mt-0.5 max-w-lg text-sm text-slate-400">{encounter.description}</p>
        {#if encounter.special}
          <p class="mt-1 text-xs italic text-amber-400">{encounter.special}</p>
        {/if}
      </div>
      <div class="shrink-0 text-right">
        <button
          type="button"
          class="rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
          onclick={onback}
        >
          ← Map
        </button>
        <p class="mt-1 font-mono text-xs text-emerald-300">🪙{encounter.goldReward} · {encounter.xpReward}xp</p>
      </div>
    </div>
  </div>

  <!-- Who you are, and who you are fighting -->
  <div class="mb-3 grid gap-3 sm:grid-cols-2">
    <div class="rounded-lg border border-slate-700 bg-slate-800 px-4 py-3">
      <div class="flex items-center gap-3">
        <Sprite name={heroSpriteName(hero.class)} class="h-12 w-10 shrink-0" />
        <div class="min-w-0">
          <p class="text-sm font-semibold text-amber-200">
            Level {hero.level} {FACTION_INFO[hero.class].name}
            <a
              href={entryHref('faction', hero.class)}
              target="_blank"
              rel="noopener"
              title="Read about the {FACTION_INFO[hero.class].name} faction in the compendium"
              class="ml-1 text-xs text-slate-500 hover:text-amber-300"
            >📖</a>
          </p>
          <p class="font-mono text-xs text-slate-300">⚔{hero.attack} 🛡{hero.defense} 💧{maxMana(hero)}</p>
          <div class="mt-1 flex items-center gap-2">
            <div class="h-1.5 w-28 overflow-hidden rounded bg-black/50">
              <div class="h-full bg-violet-400" style="width: {xpPct}%"></div>
            </div>
            <span class="font-mono text-[10px] text-slate-400">{hero.xp} / {xpCeil} XP</span>
          </div>
        </div>
      </div>
      {#if hero.bonusSkeletons}
        <p class="mt-2 text-xs text-slate-300">💀 +{hero.bonusSkeletons} free Skeletons this battle (Necromancy)</p>
      {/if}
    </div>

    <div class="rounded-lg border border-red-900/60 bg-slate-800 px-4 py-3">
      <div class="flex items-baseline justify-between">
        <p class="text-sm font-semibold text-red-300">
          Enemy — {FACTION_INFO[encounter.enemyFaction].name}
        </p>
        <span class="font-mono text-[10px] text-slate-400">worth 🪙{enemyValue}</span>
      </div>
      <div class="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {#each enemyArmy as slot (slot.unit.name)}
          <span class="flex items-center gap-1" title="{slot.count} × {slot.unit.name}">
            <Sprite name={slot.unit.name} class="h-9 w-8 shrink-0" />
            <span class="font-mono text-[11px] leading-tight text-slate-300">
              {slot.count}<br /><span class="text-slate-500">{slot.unit.name}</span>
            </span>
          </span>
        {/each}
      </div>
    </div>
  </div>

  <!-- Budget + launch -->
  <div class="mb-3 rounded-lg border border-slate-700 bg-slate-800 px-4 py-3">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-baseline gap-x-3">
          <span
            class="whitespace-nowrap text-lg font-semibold text-amber-300"
            title={hero.gold ? `${budget - hero.gold} level budget + ${hero.gold} gold won` : undefined}
          >
            🪙 {goldLeft}
            <span class="text-sm font-normal text-slate-400">/ {budget} gold left</span>
          </span>
          <span class="whitespace-nowrap text-sm text-slate-300">{slots.length} / {MAX_STACKS} stacks</span>
        </div>
        <div class="mt-1.5 h-2 overflow-hidden rounded bg-black/50" aria-hidden="true">
          <div class="h-full bg-amber-500 transition-all" style="width: {spentPct}%"></div>
        </div>
      </div>
      <div class="flex shrink-0 items-center justify-end gap-2">
        <button
          type="button"
          class="rounded px-3 py-2 text-sm text-slate-400 hover:bg-slate-700 hover:text-slate-200
            disabled:cursor-not-allowed disabled:opacity-40"
          disabled={slots.length === 0}
          onclick={clearAll}
        >
          Clear
        </button>
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
    </div>
  </div>

  <div class="overflow-hidden rounded-lg border border-slate-700">
    {#each units as unit (unit.name)}
      <RecruitRow
        {unit}
        count={counts[unit.name]}
        limit={limitFor(unit)}
        onchange={n => setCount(unit.name, n)}
      />
    {/each}
  </div>

  <p class="mt-3 text-sm text-slate-400">
    Drag to recruit — every stack draws on the same purse. Choose up to {MAX_STACKS} stacks.
  </p>
</div>
