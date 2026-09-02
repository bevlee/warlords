<script lang="ts">
  import { stripKeywords } from '$lib/compendium/keywords';
  import type { ActiveHeroEffectView } from './heroActionDisplay';
  interface Props { effect: ActiveHeroEffectView; oninspect?: () => void; }
  let { effect, oninspect }: Props = $props();
</script>

<button type="button" class="banner" onclick={() => oninspect?.()} aria-label="Inspect active hero effect">
  <span class="copy"><strong>{effect.label} — {effect.affectedLabel}</strong><small>{stripKeywords(effect.summary)} · {effect.duration}</small></span>
</button>

<style>
  .banner { display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; gap: calc(8 * var(--fx)); border-radius: calc(7 * var(--fx)); border: 1px solid rgb(52 211 153 / .4); background: linear-gradient(90deg, rgb(6 78 59 / .72), rgb(15 23 42 / .9)); padding: 0 calc(14 * var(--fx)); text-align: left; box-shadow: 0 5px 16px rgb(0 0 0 / .35); }
  .banner:hover { border-color: #6ee7b7; }
  .copy strong, .copy small { display: block; }
  .copy strong { font-size: calc(11.5 * var(--fx)); color: #d1fae5; }
  .copy small { margin-top: calc(2 * var(--fx)); font-size: calc(9.5 * var(--fx)); color: #a7f3d0; }
</style>
