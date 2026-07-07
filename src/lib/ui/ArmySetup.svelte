<script lang="ts">
  import { BARBARIAN_UNITS } from '$lib/engine/barbarian';
  import { UNIT_COSTS, DEFAULT_BUDGET, MAX_STACKS, armyCost } from '$lib/engine/recruit';
  import { glyphFor } from './glyphs';
  import type { ArmySlot } from '$lib/engine/types';

  interface Props {
    onstart: (army: ArmySlot[]) => void;
  }

  let { onstart }: Props = $props();

  let counts: Record<string, number> = $state(
    Object.fromEntries(BARBARIAN_UNITS.map(u => [u.name, 0]))
  );

  const slots = $derived(
    BARBARIAN_UNITS.filter(u => counts[u.name] > 0).map(u => ({ unit: u, count: counts[u.name] }))
  );
  const spent = $derived(armyCost(slots));
  const goldLeft = $derived(DEFAULT_BUDGET - spent);

  function maxAffordable(name: string): number {
    return Math.floor(goldLeft / UNIT_COSTS[name]);
  }

  function canAdd(name: string): boolean {
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
  <div class="mb-4 flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800 px-4 py-3">
    <div class="flex items-center gap-6">
      <span class="text-lg font-semibold text-amber-300">🪙 {goldLeft} <span class="text-sm font-normal text-slate-400">/ {DEFAULT_BUDGET} gold</span></span>
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
    {#each BARBARIAN_UNITS as unit (unit.name)}
      {@const n = counts[unit.name]}
      <div
        class="flex items-center gap-3 border-b border-slate-700/60 bg-slate-800 px-4 py-2 last:border-b-0
          {n > 0 ? 'bg-slate-700/60' : ''}"
      >
        <span class="w-8 text-2xl">{glyphFor(unit.name)}</span>
        <div class="w-32">
          <p class="text-sm font-semibold text-slate-100">{unit.name}</p>
          <p class="font-mono text-[10px] text-amber-300">🪙 {UNIT_COSTS[unit.name]} each</p>
        </div>
        <p class="flex-1 font-mono text-[11px] leading-tight text-slate-400">
          HP {unit.hp} · Atk {unit.attack} · Def {unit.defense} · Dmg {unit.minDamage}–{unit.maxDamage}<br />
          Spd {unit.speed} · Init {unit.initiative}{unit.shots > 0 ? ` · 🏹 ${unit.shots} shots, range ${unit.range}` : ''}
        </p>
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
      </div>
    {/each}
  </div>

  <p class="mt-3 text-sm text-slate-400">
    The enemy warlord fields an army of the same value. Choose up to {MAX_STACKS} stacks.
  </p>
</div>
