<script lang="ts">
  import type { Hero, UnitStack } from '$lib/engine/types';
  import { maxMana } from '$lib/engine/factionSkills';
  import { abilityInfo } from './abilities';
  import Sprite from './Sprite.svelte';

  interface Props {
    unit: UnitStack | null;
    hero?: Hero | null;
    pinned?: boolean;
    onunpin?: (() => void) | null;
  }

  let { unit, hero = null, pinned = false, onunpin = null }: Props = $props();

  // Icon + hover explanation per stat, kept in one place so the meaning of
  // each glyph is discoverable via title tooltip instead of a text label.
  const STAT_META = {
    level: { icon: '⭐', title: 'Level', label: 'Level' },
    mana: { icon: '🔷', title: 'Mana — spent casting spells', label: 'Mana' },
    xp: { icon: '✨', title: 'Experience points', label: 'Experience' },
    count: { icon: '👥', title: 'Count — creatures remaining in this stack', label: 'Count' },
    hp: { icon: '💚', title: 'Hit points — current / max per creature', label: 'Hit points' },
    attack: { icon: '⚔️', title: 'Attack — raises damage dealt', label: 'Attack' },
    defense: { icon: '🛡️', title: 'Defense — reduces damage taken', label: 'Defense' },
    damage: { icon: '💥', title: 'Damage — min–max per hit', label: 'Damage' },
    speed: { icon: '🥾', title: 'Speed — tiles moved per turn', label: 'Speed' },
    initiative: { icon: '⚡', title: 'Initiative — determines turn order', label: 'Initiative' },
    range: { icon: '🎯', title: 'Range — shooting distance', label: 'Range' },
    shots: { icon: '🏹', title: 'Shots — ranged attacks left / max', label: 'Shots' },
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
      { key: 'attack', value: unit.attackBuff ? `${d.attack + unit.attackBuff}✨` : `${d.attack}`, buff: unit.attackBuff ?? 0 },
      { key: 'defense', value: unit.defenseBuff ? `${d.defense + unit.defenseBuff}✨` : `${d.defense}`, buff: unit.defenseBuff ?? 0 },
      { key: 'damage', value: `${d.minDamage}–${d.maxDamage}` },
      { key: 'speed', value: `${d.speed}` },
      { key: 'initiative', value: `${d.initiative}` },
      { key: 'range', value: d.range > 0 ? `${d.range}` : '—' },
      { key: 'shots', value: d.shots > 0 ? `${unit.shotsLeft}/${d.shots}` : '—' },
    ] as const;
  });
</script>

<!-- Two modes. Unpinned (hover-following): fixed height — hovering different
     units must never change this panel's footprint (a growing panel can toggle
     the page scrollbar and reflow the whole width-driven board), so stats are
     compact icon+value chips and abilities are badges. Pinned (right-clicked):
     the user asked for this unit, so the panel may grow out of its box to give
     abilities room to breathe — labelled stat rows, ability descriptions
     inline. It scrolls rather than growing without bound. -->
<div
  class="flex flex-col gap-1.5 rounded-lg border bg-slate-800 px-3 py-2
    {pinned
      ? 'absolute bottom-0 right-0 z-20 max-h-[26rem] w-80 overflow-y-auto border-amber-500/60 shadow-xl shadow-black/50'
      : 'h-full overflow-hidden border-slate-700'}"
>
  {#if unit}
    <div class="flex shrink-0 items-center gap-2">
      <Sprite name={unit.definition.name} class="h-11 w-10" />
      <span class="flex-1 truncate text-sm font-semibold {unit.side === 'player' ? 'text-sky-300' : 'text-red-300'}">
        {unit.isHero ? `Hero — level ${hero?.level ?? '?'}` : unit.definition.name}
        {#if !unit.isHero}<span class="ml-1 font-mono text-xs text-slate-400">×{unit.count}</span>{/if}
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
      {/if}
    </div>

    {#if pinned}
      <!-- Labelled two-column rows: room for the stat name, so the glyph is
           decoration rather than the only cue. -->
      <div class="grid grid-cols-2 gap-x-4 gap-y-0.5 border-t border-slate-700 pt-1.5">
        {#each stats as stat (stat.key)}
          <span class="flex items-baseline gap-1.5 text-xs" title={STAT_META[stat.key].title}>
            <span aria-hidden="true">{STAT_META[stat.key].icon}</span>
            <span class="flex-1 truncate text-slate-400">{STAT_META[stat.key].label}</span>
            <span class="font-mono text-slate-100">
              {#if 'buff' in stat && stat.buff}
                <span class="text-emerald-400">(+{stat.buff})</span>{Number(stat.value.replace('✨', ''))}
              {:else}
                {stat.value}
              {/if}
            </span>
          </span>
        {/each}
      </div>
    {:else}
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
    {/if}

    {#if unit.definition.abilities.length > 0}
      {#if pinned}
        <div class="flex flex-col gap-1 border-t border-slate-700 pt-1.5">
          {#each unit.definition.abilities as ability (ability)}
            {@const info = abilityInfo(ability)}
            <div>
              <p class="text-[11px] font-semibold text-amber-300">{info.label}</p>
              <p class="text-[11px] leading-tight text-slate-400">{info.description}</p>
            </div>
          {/each}
        </div>
      {:else}
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
    {/if}
  {:else}
    <p class="text-xs text-slate-500">Hover a unit to inspect it. Right-click to pin.</p>
  {/if}
</div>
