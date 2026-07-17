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
          sprite: 'h-16 w-14',
          name: 'text-lg',
          count: 'text-sm',
          stat: 'text-sm gap-y-1.5',
          ability: 'text-sm',
        }
      : {
          pad: 'px-3 py-2 gap-1.5',
          sprite: 'h-11 w-10',
          name: 'text-sm',
          count: 'text-xs',
          stat: 'text-xs gap-y-0.5',
          ability: 'text-[11px]',
        }
  );

  // Icon + label + hover explanation per stat, kept in one place so the meaning
  // of each glyph is discoverable via title tooltip as well as its label.
  const STAT_META = {
    level: { icon: '⭐', title: 'Level', label: 'Level' },
    mana: { icon: '🔷', title: 'Mana — spent casting spells', label: 'Mana' },
    xp: { icon: '✨', title: 'Experience points', label: 'Experience' },
    count: { icon: '👥', title: 'Count — creatures remaining in this stack', label: 'Count' },
    hp: { icon: '💚', title: 'Hit points — current / max per creature', label: 'HP' },
    attack: { icon: '⚔️', title: 'Attack — raises damage dealt', label: 'Attack' },
    defense: { icon: '🛡️', title: 'Defense — reduces damage taken', label: 'Defense' },
    damage: { icon: '💥', title: 'Damage — min–max per hit', label: 'Damage' },
    speed: { icon: '🥾', title: 'Speed — tiles moved per turn', label: 'Speed' },
    initiative: { icon: '⚡', title: 'Initiative — determines turn order', label: 'Initiative' },
    range: { icon: '🎯', title: 'Range — shooting distance', label: 'Range' },
    shots: { icon: '🏹', title: 'Shots — ranged attacks left / max', label: 'Shots' },
    morale: { icon: '🎺', title: 'Morale — chance to act again, or freeze if negative', label: 'Morale' },
    luck: { icon: '🍀', title: 'Luck — chance to double damage, or halve it if negative', label: 'Luck' },
  } as const;

  interface Stat {
    key: keyof typeof STAT_META;
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
      { key: 'attack', value: `${d.attack + heroAttack + (unit.attackBuff ?? 0)}`, buff: unit.attackBuff ?? 0 },
      { key: 'defense', value: `${d.defense + (unit.defenseBuff ?? 0)}`, buff: unit.defenseBuff ?? 0 },
      { key: 'damage', value: `${d.minDamage}–${d.maxDamage}` },
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
  class="flex h-full flex-col overflow-y-auto rounded-lg bg-slate-800 {sz.pad}
    {embedded ? '' : `border ${pinned ? 'border-amber-500/60' : 'border-slate-700'}`}"
>
  {#if unit}
    <div class="flex shrink-0 items-center gap-2">
      <Sprite name={unit.definition.name} class={sz.sprite} />
      <span class="flex-1 truncate font-semibold {sz.name} {unit.side === 'player' ? 'text-sky-300' : 'text-red-300'}">
        {unit.isHero ? `Hero — level ${hero?.level ?? '?'}` : unit.definition.name}
        {#if !unit.isHero}<span class="ml-1 font-mono text-slate-400 {sz.count}">×{unit.count}</span>{/if}
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
        <span class="shrink-0 text-[10px] uppercase tracking-wide text-slate-600">right-click to pin</span>
      {/if}
    </div>

    <div class="grid shrink-0 grid-cols-2 gap-x-4 border-t border-slate-700 pt-1.5 {sz.stat}">
      {#each stats as stat (stat.key)}
        <span class="flex cursor-help items-baseline gap-1.5" title={STAT_META[stat.key].title}>
          <span aria-hidden="true">{STAT_META[stat.key].icon}</span>
          <span class="flex-1 truncate text-slate-400">{STAT_META[stat.key].label}</span>
          <span class="font-mono text-slate-100">
            {#if stat.buff}
              <span class="text-emerald-400">(+{stat.buff})</span>{stat.value}
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
          {@const info = abilityInfo(ability)}
          <div>
            <p class="font-semibold leading-tight text-amber-300 {sz.ability}">{info.label}</p>
            <p class="leading-tight text-slate-400 {sz.ability}">{info.description}</p>
          </div>
        {/each}
      </div>
    {/if}
  {:else}
    <p class="text-xs text-slate-500">Hover a unit to inspect it. Right-click to pin.</p>
  {/if}
</div>
