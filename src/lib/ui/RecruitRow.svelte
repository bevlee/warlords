<script lang="ts">
  import { UNIT_COSTS, MAX_STACKS, type RecruitLimit } from '$lib/engine/recruit';
  import { abilityInfo } from './abilities';
  import Sprite from './Sprite.svelte';
  import { unitSlug } from './sprites';
  import { entryHref } from '$lib/compendium/entries';
  import type { UnitDef } from '$lib/engine/types';

  interface Props {
    unit: UnitDef;
    count: number;
    limit: RecruitLimit;
    onchange: (count: number) => void;
  }

  let { unit, count, limit, onchange }: Props = $props();

  const cost = $derived(UNIT_COSTS[unit.name] ?? 0);
  const spent = $derived(count * cost);
  const disabled = $derived(limit.blocked !== null);
</script>

<!-- Wraps on narrow screens: name beside the sprite, then stats, then the
     slider on its own full-width row. One line from `sm` up. -->
<div
  class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-700/60 bg-slate-800 px-4 py-2 last:border-b-0
    {count > 0 ? 'bg-slate-700/60' : ''} {limit.blocked === 'locked' ? 'opacity-50' : ''}"
>
  <Sprite name={unit.name} class="h-11 w-9 shrink-0 {limit.blocked === 'locked' ? 'grayscale' : ''}" />
  <div class="w-32 shrink-0">
    <!-- Opens in a new tab: recruiting state is mid-edit here. -->
    <a
      href={entryHref('unit', unitSlug(unit.name))}
      target="_blank"
      rel="noopener"
      title="Read about {unit.name} in the compendium"
      class="text-sm font-semibold text-slate-100 hover:text-amber-300 hover:underline"
    >{unit.name}</a>
    {#if limit.blocked === 'locked'}
      <p class="font-mono text-[10px] text-slate-400">🔒 Unlocks at level {unit.tier - 1}</p>
    {:else}
      <p class="font-mono text-[10px] text-amber-300">🪙 {cost} each</p>
    {/if}
  </div>

  <div class="min-w-0 basis-full sm:flex-1 sm:basis-0">
    <p class="font-mono text-[11px] leading-tight text-slate-400">
      HP {unit.hp} · Atk {unit.attack} · Def {unit.defense} · Dmg {unit.minDamage}–{unit.maxDamage}<br />
      Spd {unit.speed} · Init {unit.initiative}{unit.shots > 0 ? ` · 🏹 ${unit.shots} shots, range ${unit.range}` : ''}
    </p>
    {#if unit.abilities.length > 0}
      <div class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
        {#each unit.abilities as ability (ability)}
          {@const info = abilityInfo(ability)}
          <span class="text-[11px] leading-tight" title={info.description}>
            <span class="font-semibold text-amber-300">{info.label}</span>
            <span class="text-slate-400"> — {info.description}</span>
          </span>
        {/each}
      </div>
    {/if}
  </div>

  <div class="w-full sm:w-56 sm:shrink-0">
    {#if limit.blocked === 'locked'}
      <p class="text-right text-lg" aria-label="{unit.name} locked">🔒</p>
    {:else if limit.blocked === 'stacks'}
      <p class="text-right font-mono text-[11px] text-slate-500">{MAX_STACKS}/{MAX_STACKS} stacks — clear one first</p>
    {:else}
      <div class="flex items-center gap-1.5">
        <button
          type="button"
          class="h-6 w-6 shrink-0 rounded bg-slate-600 text-sm leading-none text-slate-100 hover:bg-slate-500 disabled:opacity-30"
          disabled={count === 0}
          onclick={() => onchange(count - 1)}
          aria-label="one fewer {unit.name}"
        >‹</button>
        <input
          type="range"
          class="min-w-0 flex-1 accent-amber-500 disabled:opacity-30"
          min="0"
          max={limit.max}
          value={count}
          disabled={disabled || limit.max === 0}
          aria-label="{unit.name} count"
          aria-valuetext="{count} {unit.name}, {spent} gold"
          oninput={e => onchange(+e.currentTarget.value)}
        />
        <button
          type="button"
          class="h-6 w-6 shrink-0 rounded bg-slate-600 text-sm leading-none text-slate-100 hover:bg-slate-500 disabled:opacity-30"
          disabled={count >= limit.max}
          onclick={() => onchange(count + 1)}
          aria-label="one more {unit.name}"
        >›</button>
      </div>
      <div class="mt-0.5 flex items-baseline justify-between font-mono text-[10px] text-slate-500">
        <span class="text-sm font-semibold text-slate-100">{count}</span>
        <span class={spent > 0 ? 'text-amber-300' : ''}>🪙 {spent}</span>
        <span>max {limit.max}</span>
      </div>
    {/if}
  </div>
</div>
