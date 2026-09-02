<script lang="ts">
  import { stripKeywords } from '$lib/compendium/keywords';
  import type { Hero, UnitStack } from '$lib/engine/types';
  import { maxMana } from '$lib/engine/factionSkills';
  import type { ActiveHeroEffectView, HeroActionView } from './heroActionDisplay';
  import Sprite from './Sprite.svelte';
  import { heroSpriteName } from './sprites';

  interface Props {
    unit: UnitStack;
    hero: Hero;
    actions: HeroActionView[];
    activeEffect?: ActiveHeroEffectView | null;
    onselect: (id: string) => void;
    onclose?: () => void;
  }
  let { unit, hero, actions, activeEffect = null, onselect, onclose }: Props = $props();
</script>

<section class="hero-sheet" aria-label="Hero sheet">
  <header>
    <Sprite name={heroSpriteName(hero.class)} class="hero-art" />
    <div class="min-w-0 flex-1"><p class="eyebrow">Hero sheet</p><h2>{hero.class}</h2><p>Level {hero.level}</p></div>
    {#if onclose}<button type="button" aria-label="Close hero sheet" onclick={onclose}>×</button>{/if}
  </header>
  <div class="stats">
    <span><b>{hero.attack}</b> Attack</span><span><b>{hero.defense}</b> Defence</span>
    <span><b>{hero.mana ?? 0}/{maxMana(hero)}</b> Mana</span>
    <span><b>{unit.morale}</b> Morale</span><span><b>{unit.luck}</b> Luck</span>
  </div>
  {#if activeEffect}
    <div class="active"><p>Active {activeEffect.label}</p><strong>{stripKeywords(activeEffect.summary)}</strong><small>{activeEffect.affectedLabel} · {activeEffect.duration}</small></div>
  {/if}
  <h3>Hero actions</h3>
  <div class="action-list">
    {#each actions as action (action.id)}
      <button type="button" onclick={() => onselect(action.id)}>
        <span class="icon" aria-hidden="true">{action.icon}</span>
        <span><strong>{action.label}</strong><small>{stripKeywords(action.summary)}</small>{#if action.usesLabel}<em>{action.usesLabel}</em>{/if}</span>
      </button>
    {:else}<p class="empty">This hero has no faction actions.</p>{/each}
  </div>
</section>

<style>
  .hero-sheet { height: 100%; overflow-y: auto; border-radius: calc(8 * var(--fx)); border: 1px solid rgb(100 116 139 / .55); background: rgb(15 23 42 / .94); padding: calc(10 * var(--fx)); color: #e2e8f0; }
  header { display: flex; align-items: center; gap: calc(8 * var(--fx)); border-bottom: 1px solid #334155; padding-bottom: calc(8 * var(--fx)); }
  header :global(.hero-art) { width: calc(42 * var(--fx)); height: auto; }
  header p, h2, h3 { margin: 0; }
  .eyebrow, h3 { font: 700 calc(9 * var(--fx))/1 ui-monospace, monospace; letter-spacing: .13em; text-transform: uppercase; color: #94a3b8; }
  h2 { margin-top: calc(2 * var(--fx)); font-size: calc(17 * var(--fx)); text-transform: capitalize; color: #fde68a; }
  header p:last-child { font-size: calc(10 * var(--fx)); color: #94a3b8; }
  header button { align-self: flex-start; font-size: calc(18 * var(--fx)); color: #94a3b8; }
  .stats { display: grid; grid-template-columns: 1fr 1fr; gap: calc(5 * var(--fx)); margin-top: calc(8 * var(--fx)); font-size: calc(10 * var(--fx)); color: #94a3b8; }
  .stats span { border-radius: .25rem; background: rgb(30 41 59 / .8); padding: calc(5 * var(--fx)); }
  .stats b { color: #f8fafc; }
  .active { margin-top: calc(8 * var(--fx)); border-left: 3px solid #34d399; border-radius: .3rem; background: rgb(6 78 59 / .2); padding: calc(7 * var(--fx)); }
  .active p { margin: 0; font-size: calc(9 * var(--fx)); font-weight: 700; text-transform: uppercase; color: #6ee7b7; }
  .active strong, .active small { display: block; margin-top: calc(3 * var(--fx)); font-size: calc(10 * var(--fx)); }
  .active small { color: #94a3b8; }
  h3 { margin-top: calc(10 * var(--fx)); }
  .action-list { display: grid; gap: calc(5 * var(--fx)); margin-top: calc(6 * var(--fx)); }
  .action-list button { display: flex; gap: calc(7 * var(--fx)); border-radius: .35rem; border: 1px solid #334155; background: rgb(30 41 59 / .72); padding: calc(7 * var(--fx)); text-align: left; }
  .action-list button:hover { border-color: #f59e0b; background: #334155; }
  .icon { font-size: calc(20 * var(--fx)); }
  .action-list strong, .action-list small, .action-list em { display: block; }
  .action-list strong { font-size: calc(11 * var(--fx)); color: #fde68a; }
  .action-list small { margin-top: calc(2 * var(--fx)); font-size: calc(9.5 * var(--fx)); color: #cbd5e1; }
  .action-list em { margin-top: calc(2 * var(--fx)); font-size: calc(8.5 * var(--fx)); font-style: normal; color: #6ee7b7; }
  .empty { font-size: calc(10 * var(--fx)); color: #64748b; }
</style>
