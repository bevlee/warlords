<script lang="ts">
  import type { BattleState, UnitStack } from '$lib/engine/types';
  import { predictTurnOrder } from '$lib/engine/turnOrder';
  import Sprite from './Sprite.svelte';

  interface Props {
    state: BattleState;
    hoveredId: string | null;
    onhover: (unit: UnitStack | null) => void;
  }

  // Aliased: a local `state` would shadow the `$state` rune.
  let { state: battleState, hoveredId, onhover }: Props = $props();

  const ENTRIES = 16;

  const entries = $derived(
    predictTurnOrder(battleState.units, ENTRIES)
      .map(id => battleState.units.find(u => u.id === id))
      .filter((u): u is UnitStack => !!u)
  );

  // Arrow scrolling. The arrows are always part of the ribbon's frame; they
  // grey out when the whole order already fits, or at whichever end is reached.
  let scroller = $state<HTMLDivElement>();
  let overflowing = $state(false);
  let atStart = $state(true);
  let atEnd = $state(false);

  function measure() {
    const el = scroller;
    if (!el) return;
    overflowing = el.scrollWidth - el.clientWidth > 1;
    atStart = el.scrollLeft <= 1;
    atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 1;
  }

  /** Scroll by three portraits. Both the portrait width and the gap are read
   *  off the live DOM so the step tracks --fx instead of guessing at it. */
  function scrollByPage(direction: -1 | 1) {
    const el = scroller;
    if (!el) return;
    const step = el.querySelector('.portrait')?.clientWidth ?? 64;
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    el.scrollBy({ left: direction * (step + gap) * 3, behavior: 'smooth' });
  }

  // Re-measure whenever the predicted order changes (units die, wait, act) —
  // the strip can stop overflowing mid-battle — and whenever the ribbon is
  // resized by the viewport-driven --fx scale.
  $effect(() => {
    void entries.length;
    measure();
  });

  $effect(() => {
    const el = scroller;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  });
</script>

<!-- LordsWM-style turns bar: a chevron ribbon holding the round medallion and a
     scrolling strip of framed portraits, count in the corner. Every dimension
     is a multiple of --fx — see "Fitting the screen" in Battle.svelte. -->
<div class="flex justify-center">
  <div class="atb-ribbon flex max-w-full items-center">
    <div class="round-medallion" title="Round {battleState.round}">
      <span class="round-label">RND</span>
      <span class="round-value">{battleState.round}</span>
    </div>

    <button
      type="button"
      class="atb-arrow"
      aria-label="Scroll turn order left"
      disabled={!overflowing || atStart}
      onclick={() => scrollByPage(-1)}
    >◀</button>

    <!-- overflow-x-scroll (not auto): the horizontal scrollbar is always there,
         so entries never shift vertically; overflow-y-hidden + padding keeps the
         hover scale-up from spawning a vertical scrollbar. -->
    <div bind:this={scroller} onscroll={measure} class="turnbar-scroll">
      {#each entries as unit, i (`${unit.id}-${i}`)}
        <button
          type="button"
          class="portrait relative shrink-0 overflow-hidden rounded-sm border-2 transition-transform
            {unit.side === 'player' ? 'border-sky-400 bg-sky-950' : 'border-red-500 bg-red-950'}
            {i === 0 ? 'current ring-2 ring-amber-300' : ''}
            {unit.id === hoveredId ? 'scale-110 brightness-125' : ''}"
          aria-label="turn {i + 1}: {unit.definition.name} ×{unit.count}"
          onmouseenter={() => onhover(unit)}
          onmouseleave={() => onhover(null)}
        >
          <Sprite name={unit.definition.name} class="h-full w-full" />
          <span class="count-plate">{unit.count}</span>
        </button>
        {#if i === 0}
          <div class="cycle-divider" aria-hidden="true"></div>
        {/if}
      {/each}
    </div>

    <button
      type="button"
      class="atb-arrow"
      aria-label="Scroll turn order right"
      disabled={!overflowing || atEnd}
      onclick={() => scrollByPage(1)}
    >▶</button>
  </div>
</div>

<style>
  .atb-ribbon {
    /* Without this the ribbon sits at its min-content width and spills past
       the viewport instead of clamping and letting the strip scroll. */
    min-width: 0;
    gap: calc(8 * var(--fx));
    padding: calc(5 * var(--fx)) calc(22 * var(--fx));
    background: linear-gradient(180deg, #1c2748 0%, #111a33 60%, #0b1121 100%);
    border-top: 1px solid rgb(203 168 92 / 0.45);
    border-bottom: 1px solid rgb(203 168 92 / 0.45);
    box-shadow:
      0 6px 24px rgb(0 0 0 / 0.6),
      inset 0 1px 0 rgb(255 255 255 / 0.05);
    clip-path: polygon(
      calc(20 * var(--fx)) 0,
      calc(100% - 20 * var(--fx)) 0,
      100% 50%,
      calc(100% - 20 * var(--fx)) 100%,
      calc(20 * var(--fx)) 100%,
      0 50%
    );
  }

  .round-medallion {
    display: flex;
    flex: none;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: calc(38 * var(--fx));
    height: calc(38 * var(--fx));
    border-radius: 50%;
    border: 2px solid rgb(203 168 92 / 0.7);
    background: #0d1428;
    box-shadow: inset 0 0 12px rgb(0 0 0 / 0.7);
  }

  .round-label {
    font-family: ui-monospace, monospace;
    font-size: calc(9 * var(--fx));
    font-weight: 700;
    line-height: 1;
    letter-spacing: 0.08em;
    color: rgb(203 168 92 / 0.85);
  }

  .round-value {
    font-family: ui-monospace, monospace;
    font-size: calc(15 * var(--fx));
    font-weight: 700;
    line-height: 1.15;
    color: #f5d98b;
  }

  .atb-arrow {
    flex: none;
    width: calc(24 * var(--fx));
    height: calc(46 * var(--fx));
    border-radius: calc(4 * var(--fx));
    border: 1px solid rgb(148 163 184 / 0.4);
    background: rgb(30 41 59 / 0.9);
    color: #cbd5e1;
    font-size: calc(12 * var(--fx));
    line-height: 1;
  }

  .atb-arrow:hover:not(:disabled) {
    background: rgb(51 65 85 / 0.95);
    border-color: #cbd5e1;
  }

  .atb-arrow:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .turnbar-scroll {
    display: flex;
    min-width: 0;
    align-items: flex-end;
    gap: calc(5 * var(--fx));
    padding: calc(4 * var(--fx)) 0;
    overflow-x: scroll;
    overflow-y: hidden;
  }

  .portrait {
    width: calc(62 * var(--fx));
    height: calc(74 * var(--fx));
  }

  .portrait.current {
    transform: translateY(calc(-4 * var(--fx)));
  }

  .count-plate {
    position: absolute;
    right: 0;
    bottom: 0;
    padding: 0 calc(3 * var(--fx));
    background: rgb(0 0 0 / 0.72);
    font-family: ui-monospace, monospace;
    font-size: calc(12 * var(--fx));
    font-weight: 700;
    line-height: 1.3;
    color: #fcd34d;
  }

  .cycle-divider {
    flex: none;
    width: 1px;
    height: calc(60 * var(--fx));
    background: #475569;
  }

  /* Persistent scrollbar even with macOS overlay scrollbars: custom-styled
     WebKit scrollbars always render. */
  .turnbar-scroll::-webkit-scrollbar {
    height: calc(7 * var(--fx));
  }

  .turnbar-scroll::-webkit-scrollbar-track {
    background: rgb(30 41 59 / 0.8);
    border-radius: 4px;
  }

  .turnbar-scroll::-webkit-scrollbar-thumb {
    background: #475569;
    border-radius: 4px;
  }

  /* No scrollbar-width here: in Chrome the standard property would override
     and disable the ::-webkit-scrollbar styling above (which is what keeps
     the bar permanently visible instead of macOS overlay auto-hiding). */
</style>
