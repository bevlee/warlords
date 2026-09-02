<script lang="ts">
  import KeywordText from '$lib/ui/keyword/KeywordText.svelte';
  import type { BattleState, Hero, UnitStack } from '$lib/engine/types';
  import { maxMana } from '$lib/engine/factionSkills';
  import {
    effectiveAttack,
    effectiveAttackInBattle,
    effectiveDefense,
    effectiveDefenseInBattle,
  } from '$lib/engine/combat';
  import { effectiveSpeed } from '$lib/engine/selectors';
  import { abilityInfo } from './abilities';
  import { abilityLevel } from '$lib/engine/abilityCatalog';
  import { skillIconFor, skillGlyph } from './skillIcons';
  import { STAT_META, type StatKey } from './statMeta';
  import { unitSlug } from './sprites';
  import { entryHref } from '$lib/compendium/entries';
  import Sprite from './Sprite.svelte';
  import { activeEffects } from './unitEffects';
  import { artifactInteractionsFor } from './artifactDisplay';
  import type { ItemId } from '$lib/gauntlet/items';

  interface Props {
    unit: UnitStack | null;
    hero?: Hero | null;
    /** Live battle context resolves artifact-upgraded effect values. */
    battle?: BattleState | null;
    /** Army artifacts; related items are explanatory and never treated as equipped. */
    items?: ItemId[];
    pinned?: boolean;
    onunpin?: (() => void) | null;
    /** Render inside another surface (e.g. a draft card): no own border, no pin hint. */
    embedded?: boolean;
    /** 'compact' fits a sidebar, 'large' a roomy screen like the draft, and
     *  'rail' the battle screen's narrow creature-info column — the last one
     *  drops to a single stat column and scales off the --fx unit. */
    size?: 'compact' | 'large' | 'rail';
  }

  let { unit, hero = null, battle = null, items = [], pinned = false, onunpin = null, embedded = false, size = 'compact' }: Props = $props();

  const isRail = $derived(size === 'rail');

  const sz = $derived(
    size === 'large'
      ? {
          pad: 'px-4 py-3 gap-2.5',
          sprite: 'h-24 w-20',
          name: 'text-[27px]',
          stat: 'text-[21px] gap-y-2',
          statGrid: 'grid-cols-2',
          ability: 'text-[21px]',
          statIcon: 'h-9 w-9',
          abilityIcon: 'h-6 w-6',
        }
      : size === 'rail'
        ? // 'rail-*' values are hooks for the :global() rules in the .rail
          // block below; '' means "sized entirely by .rail". Everything there
          // tracks --fx (see "Fitting the screen" in Battle.svelte).
          {
            pad: '',
            sprite: 'rail-sprite',
            name: '',
            stat: '',
            statGrid: 'grid-cols-1',
            ability: '',
            statIcon: 'rail-stat-icon',
            abilityIcon: 'rail-ability-icon',
          }
        : {
            pad: 'px-3 py-2 gap-1.5',
            sprite: 'h-16 w-14',
            name: 'text-[21px]',
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
        { key: 'morale', value: `${unit.morale}` },
        { key: 'luck', value: `${unit.luck}` },
        { key: 'range', value: '∞' },
      ];
    }
    // Every row is the final effective value used by combat. The named source
    // breakdown lives exclusively in Active effects below, avoiding a second
    // partial modifier display beside these totals.
    const heroAttack = !unit.isHero && unit.side === 'player' && hero ? hero.attack : 0;
    return [
      { key: 'count', value: `${unit.count} / ${unit.startCount}` },
      { key: 'hp', value: `${unit.hp}/${d.hp}` },
      // Straight from the damage formula's own helpers, so an infected stack
      // shown at 0 attack is exactly what it fights at.
      {
        key: 'attack',
        value: `${battle ? effectiveAttackInBattle(battle, unit) : effectiveAttack(unit, heroAttack)}`,
      },
      {
        key: 'defense',
        value: `${battle ? effectiveDefenseInBattle(battle, unit) : effectiveDefense(unit)}`,
      },
      {
        key: 'damage',
        value: `${d.minDamage + (unit.damageBonus ?? 0)}–${d.maxDamage + (unit.damageBonus ?? 0)}`,
      },
      {
        key: 'speed',
        value: `${effectiveSpeed(unit)}`,
      },
      { key: 'initiative', value: `${d.initiative + (unit.initiativeBonus ?? 0)}` },
      { key: 'morale', value: `${unit.morale}` },
      { key: 'luck', value: `${unit.luck}` },
      { key: 'range', value: d.range > 0 ? `${d.range}` : '—' },
      { key: 'shots', value: d.shots > 0 ? `${unit.shotsLeft}/${d.shots}` : '—' },
    ];
  });

  const effects = $derived(unit ? activeEffects(unit, hero, battle) : []);
  const artifactInteractions = $derived(unit ? artifactInteractionsFor(unit, items) : []);
</script>

<!-- One layout for both states: right-clicking pins the panel to whatever it is
     already showing, so the only difference is persistence (plus the amber
     border and unpin button that mark it). Fixed size regardless — hovering
     different units must never change this panel's footprint, since a growing
     panel can toggle the page scrollbar and reflow the width-driven board. A
     unit with many abilities scrolls rather than growing. -->
<div
  class="flex h-full flex-col overflow-x-hidden rounded-lg {isRail ? 'rail overflow-hidden bg-slate-900/90' : 'overflow-y-auto bg-slate-800'} {sz.pad}
    {embedded ? '' : `border ${pinned ? 'border-amber-500/60' : 'border-slate-700'}`}"
>
  {#if isRail}
    <div class="rail-header">
      <h2 class="rail-title">Creature info</h2>
      {#if pinned}
        <button
          type="button"
          class="rail-unpin"
          title="Unpin (Esc)"
          aria-label="Unpin unit info"
          onclick={() => onunpin?.()}
        >×</button>
      {:else}
        <span class="rail-hint">RMB to pin</span>
      {/if}
    </div>
  {/if}

  <!-- info-name, stat-grid, ability-list, ability-label,
       ability-desc and empty-hint are style hooks for the .rail rules at the
       bottom of this file — renaming one silently unsizes the rail variant. -->
  <div class="{isRail ? 'rail-body' : 'contents'}">
    {#if unit}
      <div class="flex shrink-0 items-center gap-2">
        <Sprite name={unit.definition.name} class={sz.sprite} />
        <span class="info-name flex-1 truncate font-semibold {sz.name} {unit.side === 'player' ? 'text-sky-300' : 'text-red-300'}">
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
          {/if}
        </span>
        {#if pinned && !isRail}
          <button
            type="button"
            class="shrink-0 rounded px-1.5 text-lg leading-none text-slate-400 hover:bg-slate-700 hover:text-slate-100"
            title="Unpin (Esc)"
            aria-label="Unpin unit info"
            onclick={() => onunpin?.()}
          >
            ×
          </button>
        {:else if !embedded && !isRail}
          <span class="min-w-0 truncate text-[10px] uppercase tracking-wide text-slate-600">right-click to pin</span>
        {/if}
      </div>

      <div class="stat-grid grid shrink-0 gap-x-4 border-t border-slate-700 pt-1.5 {sz.statGrid} {sz.stat}">
        {#each stats as stat (stat.key)}
          <span class="flex cursor-help items-center gap-1.5" title={STAT_META[stat.key].title}>
            <img
              src={STAT_META[stat.key].icon}
              alt=""
              class="shrink-0 object-contain [image-rendering:pixelated] {sz.statIcon}"
            />
            <span class="flex-1 truncate text-slate-400">{STAT_META[stat.key].label}</span>
            <span class="font-mono text-slate-100">{stat.value}</span>
          </span>
        {/each}
      </div>

      {#if effects.length > 0}
        <section class="effects-section border-t border-slate-700 pt-1.5" aria-label="Active effects">
          <h3 class="effects-title">Active effects</h3>
          <div class="effects-list">
            {#each effects as effect (effect.id)}
              <div class="effect-row {effect.tone}">
                <div class="effect-heading">
                  <span class="effect-label">{effect.label}</span>
                  {#if effect.value}<span class="effect-value">{effect.value}</span>{/if}
                </div>
                {#if effect.detail}<p class="effect-detail">{effect.detail}</p>{/if}
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#if unit.definition.abilities.length > 0}
        <div class="ability-list flex flex-col gap-1 border-t border-slate-700 pt-1.5">
          {#each unit.definition.abilities as ability (ability)}
            {@const info = abilityInfo(ability, abilityLevel(unit.definition, ability))}
            {@const taught = unit.definition.grantedAbilities?.includes(ability) ?? false}
            <div>
              {#if taught}
                <!-- Run-taught skill: violet, with its icon (PNG when art exists,
                     glyph until then) — visually distinct from base abilities. -->
                <p class="ability-label flex items-center gap-1 font-semibold leading-tight text-violet-300 {sz.ability}">
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
                <p class="ability-label font-semibold leading-tight text-amber-300 {sz.ability}">
                  <a href={entryHref('ability', ability)} target="_blank" rel="noopener" class="hover:underline">{info.label}</a>
                </p>
              {/if}
              <p class="ability-desc leading-tight text-slate-400 {sz.ability}"><KeywordText text={info.description} /></p>
            </div>
          {/each}
        </div>
      {/if}

      {#if artifactInteractions.length > 0}
        <section class="artifact-interactions border-t border-slate-700 pt-1.5" aria-label="Artifact interactions">
          <h3>Artifact interactions</h3>
          {#each artifactInteractions as interaction (interaction.id)}
            <div class="artifact-interaction">
              <div><strong>{interaction.name}</strong><p><KeywordText text={interaction.description} /></p></div>
            </div>
          {/each}
          <p class="artifact-scope">Army-owned synergy; not equipped by this unit.</p>
        </section>
      {/if}
    {:else}
      <p class="empty-hint text-lg text-slate-500">Hover a unit to inspect it. Right-click to pin.</p>
    {/if}
  </div>
</div>

<style>
  /* ── rail variant ───────────────────────────────────────────────
     The battle screen's narrow creature-info column. Every dimension is a
     multiple of --fx (the viewport-derived scaled pixel Battle publishes), so
     the panel keeps its proportions from a laptop to a 4K display. */

  .rail {
    box-shadow: 0 8px 28px rgb(0 0 0 / 0.45);
  }

  .rail-header {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: space-between;
    gap: calc(6 * var(--fx));
    padding: calc(6 * var(--fx)) calc(9 * var(--fx));
    border-bottom: 1px solid rgb(100 116 139 / 0.4);
    background: rgb(2 6 23 / 0.5);
  }

  .rail-title {
    margin: 0;
    font-size: calc(10 * var(--fx));
    font-weight: 700;
    line-height: 1;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #cbd5e1;
  }

  .rail-hint {
    font-family: ui-monospace, monospace;
    font-size: calc(8 * var(--fx));
    font-weight: 600;
    letter-spacing: 0.08em;
    color: #475569;
  }

  .rail-unpin {
    border-radius: calc(4 * var(--fx));
    padding: 0 calc(5 * var(--fx));
    font-size: calc(14 * var(--fx));
    line-height: 1.2;
    color: #94a3b8;
  }

  .rail-unpin:hover {
    background: rgb(51 65 85 / 0.9);
    color: #f1f5f9;
  }

  .rail-body {
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    gap: calc(6 * var(--fx));
    padding: calc(7 * var(--fx)) calc(9 * var(--fx)) calc(9 * var(--fx));
    overflow-y: auto;
  }

  .rail :global(.rail-sprite) {
    width: calc(44 * var(--fx));
    height: auto;
    flex: none;
  }

  .rail .info-name {
    font-size: calc(16 * var(--fx));
  }

  .rail .stat-grid {
    row-gap: calc(4 * var(--fx));
    padding-top: calc(6 * var(--fx));
    font-size: calc(12.5 * var(--fx));
  }

  .rail :global(.rail-stat-icon) {
    width: calc(17 * var(--fx));
    height: calc(17 * var(--fx));
  }

  .rail :global(.rail-ability-icon) {
    width: calc(15 * var(--fx));
    height: calc(15 * var(--fx));
  }

  .rail .ability-list {
    padding-top: calc(6 * var(--fx));
    gap: calc(5 * var(--fx));
  }

  .effects-section {
    flex: none;
  }

  .effects-title {
    margin: 0 0 0.35rem;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #94a3b8;
  }

  .effects-list {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .effect-row {
    border-left: 2px solid #64748b;
    border-radius: 0.25rem;
    padding: 0.3rem 0.4rem;
    background: rgb(15 23 42 / 0.65);
  }

  .effect-row.buff { border-color: #34d399; }
  .effect-row.debuff { border-color: #f87171; }

  .effect-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: 0.75rem;
    font-weight: 650;
    line-height: 1.15;
  }

  .effect-label { color: #e2e8f0; }
  .effect-value {
    flex: none;
    font-family: ui-monospace, monospace;
  }
  .effect-row.buff .effect-value { color: #34d399; }
  .effect-row.debuff .effect-value { color: #f87171; }

  .effect-detail {
    margin: 0.18rem 0 0;
    font-size: 0.68rem;
    line-height: 1.25;
    color: #94a3b8;
  }

  .rail .effects-section {
    padding-top: calc(6 * var(--fx));
  }

  .rail .effects-title {
    margin-bottom: calc(4 * var(--fx));
    font-size: calc(9 * var(--fx));
  }

  .rail .effects-list {
    gap: calc(4 * var(--fx));
  }

  .rail .effect-row {
    border-radius: calc(4 * var(--fx));
    padding: calc(4 * var(--fx)) calc(5 * var(--fx));
  }

  .rail .effect-heading {
    font-size: calc(11 * var(--fx));
  }

  .rail .effect-detail {
    margin-top: calc(2 * var(--fx));
    font-size: calc(9.5 * var(--fx));
  }

  .rail .ability-label {
    font-size: calc(12.5 * var(--fx));
  }

  .rail .ability-desc {
    font-size: calc(11 * var(--fx));
    text-wrap: pretty;
  }

  .artifact-interactions h3 {
    margin: 0 0 0.35rem;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #fbbf24;
  }

  .artifact-interaction {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    margin-top: 0.35rem;
  }

  .artifact-interaction strong { display: block; font-size: 0.72rem; color: #fde68a; }
  .artifact-interaction p { margin: 0.1rem 0 0; font-size: 0.66rem; line-height: 1.25; color: #94a3b8; }
  .artifact-scope { margin: 0.4rem 0 0; font-size: 0.6rem; font-style: italic; color: #64748b; }

  .rail .artifact-interactions h3 { font-size: calc(9 * var(--fx)); }
  .rail .artifact-interaction { gap: calc(5 * var(--fx)); margin-top: calc(4 * var(--fx)); }
  .rail .artifact-interaction strong { font-size: calc(10.5 * var(--fx)); }
  .rail .artifact-interaction p { font-size: calc(9.5 * var(--fx)); }
  .rail .artifact-scope { font-size: calc(8.5 * var(--fx)); }

  .rail .empty-hint {
    font-size: calc(12.5 * var(--fx));
  }

  .rail-body::-webkit-scrollbar {
    width: calc(7 * var(--fx));
  }

  .rail-body::-webkit-scrollbar-track {
    background: rgb(30 41 59 / 0.8);
    border-radius: 4px;
  }

  .rail-body::-webkit-scrollbar-thumb {
    background: #475569;
    border-radius: 4px;
  }
</style>
