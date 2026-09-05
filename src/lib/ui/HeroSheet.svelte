<script lang="ts">
  import { stripKeywords } from '$lib/compendium/keywords';
  import type { Hero, UnitStack } from '$lib/engine/types';
  import { maxMana } from '$lib/engine/factionSkills';
  import type { ActiveHeroEffectView } from './heroActionDisplay';
  import Sprite from './Sprite.svelte';
  import { heroSpriteName } from './sprites';

  interface Props {
    unit: UnitStack;
    hero: Hero;
    activeEffect?: ActiveHeroEffectView | null;
    onclose?: () => void;
  }
  let { unit, hero, activeEffect = null, onclose }: Props = $props();
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
</section>

<style>
  .hero-sheet { height: 100%; overflow-y: auto; border-radius: calc(8 * var(--fx)); border: 1px solid rgb(100 116 139 / .55); background: rgb(15 23 42 / .94); padding: calc(10 * var(--fx)); color: #e2e8f0; }
  header { display: flex; align-items: center; gap: calc(8 * var(--fx)); border-bottom: 1px solid #334155; padding-bottom: calc(8 * var(--fx)); }
  header :global(.hero-art) { width: calc(42 * var(--fx)); height: auto; }
  header p, h2 { margin: 0; }
  .eyebrow { font: 700 calc(9 * var(--fx))/1 ui-monospace, monospace; letter-spacing: .13em; text-transform: uppercase; color: #94a3b8; }
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
</style>
