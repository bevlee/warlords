<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import type { AnimStep } from './animSteps';
  import { damageTier, type DamageTier } from './logLines';
  import type { Pos } from '$lib/engine/types';

  // Floater grows with the hit — same tiers as the log.
  const DMG_SIZE: Record<DamageTier, string> = {
    0: 'fx-dmg-0',
    1: 'fx-dmg-1',
    2: 'fx-dmg-2',
    3: 'fx-dmg-3',
  };

  interface Props {
    gridWidth: number;
    gridHeight: number;
    /** Beat length — flight/flash durations and text delays derive from it. */
    stepMs: number;
    steps: {
      step: AnimStep;
      pos: Pos;               // anchor cell (target for projectiles)
      fromPos?: Pos;          // projectile launch cell (may be off-grid: hero col -2)
      art?: 'arrow' | 'bolt'; // projectile look: archer arrow vs hero bolt
      key: string;
    }[];
  }

  let { gridWidth, gridHeight, stepMs, steps }: Props = $props();

  // One-shot FX must outlive the beat that spawned them: Battle.svelte
  // replaces `steps` every beat, but a floater runs 0.9s (plus flight delay)
  // against a 200–700ms beat — un-buffered, a kill's damage number vanished
  // the instant the death beat arrived. Buffer incoming steps (keys are
  // unique per beat) and prune each after its full run. An emptied `steps`
  // means sequence teardown or restart — drop everything with it.
  type FxItem = Props['steps'][number];
  let live = $state<FxItem[]>([]);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  $effect(() => {
    if (steps.length === 0) {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      live = [];
      return;
    }
    const have = new Set(untrack(() => live).map(i => i.key));
    const incoming = steps.filter(i => !have.has(i.key));
    if (incoming.length === 0) return;
    live = [...untrack(() => live), ...incoming];
    // Longest run: flight delay (60% of a beat) + 0.9s float + slack.
    const ttl = Math.round(stepMs * 0.6) + 900 + 200;
    for (const item of incoming) {
      timers.set(
        item.key,
        setTimeout(() => {
          timers.delete(item.key);
          live = live.filter(i => i.key !== item.key);
        }, ttl)
      );
    }
  });

  onDestroy(() => {
    for (const t of timers.values()) clearTimeout(t);
  });
</script>

<div
  class="fx-layer grid"
  style="grid-template-columns: repeat({gridWidth}, minmax(0, 1fr)); grid-template-rows: repeat({gridHeight}, minmax(0, 1fr)); --flight-ms: {Math.round(stepMs * 0.6)}ms;"
>
  {#each live as { step, pos, fromPos, art, key } (key)}
    <div class="fx-cell" style="grid-column: {pos.col + 1}; grid-row: {pos.row + 1};">
      {#if step.kind === 'projectile' && fromPos}
        {@const angle = (Math.atan2(pos.row - fromPos.row, pos.col - fromPos.col) * 180) / Math.PI}
        <span
          class="fx-projectile {art === 'bolt' ? 'fx-proj-bolt' : 'fx-proj-arrow'}"
          style="--from-x: {fromPos.col - pos.col}; --from-y: {fromPos.row - pos.row};"
          aria-hidden="true"
        >
          <span class="fx-proj-glyph" style="transform: rotate({angle}deg)">{art === 'bolt' ? '✦' : '➤'}</span>
        </span>
        <span class="fx-impact" aria-hidden="true"></span>
      {:else if step.kind === 'spell_fx'}
        {#if step.spell === 'lightning'}
          <!-- Bolt stands up out of the board like a standee and strikes downward. -->
          <span class="fx-bolt-strike" aria-hidden="true">⚡</span>
        {:else}
          <span
            class="fx-glow {step.spell === 'bloodlust' ? 'fx-glow-attack' : 'fx-glow-defense'}"
            aria-hidden="true"
          ></span>
        {/if}
      {:else if step.kind === 'damage'}
        <span class="fx-text fx-damage {DMG_SIZE[damageTier(step.value)]}" class:fx-delayed={step.delayed}>-{step.value}</span>
        {#if step.kills}
          <span class="fx-text fx-kills" class:fx-delayed={step.delayed}>-{step.kills} 💀</span>
        {/if}
      {:else if step.kind === 'buff'}
        <span class="fx-text fx-buff" class:fx-delayed={step.delayed}>+{step.value} {step.label}</span>
      {:else if step.kind === 'status'}
        <span class="fx-text fx-status">{step.icon}</span>
      {/if}
    </div>
  {/each}
</div>

<style>
  .fx-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
    transform-style: preserve-3d;
  }

  .fx-cell {
    position: relative;
    transform-style: preserve-3d;
  }

  .fx-text {
    position: absolute;
    left: 50%;
    top: 30%;
    transform: translateX(-50%);
    font-weight: 700;
    font-size: 1rem;
    text-shadow: 0 1px 3px rgb(0 0 0 / 0.8);
    white-space: nowrap;
    animation: float-up 0.9s ease-out forwards;
  }

  .fx-damage {
    color: #f87171;
  }

  .fx-buff {
    color: #4ade80;
  }

  .fx-status {
    font-size: 1.1rem;
  }

  /* Damage floater size tiers, matching the log's damageTier(). */
  .fx-dmg-0 { font-size: 1rem; }
  .fx-dmg-1 { font-size: 1.25rem; }
  .fx-dmg-2 { font-size: 1.5rem; }
  .fx-dmg-3 { font-size: 1.9rem; }

  /* Kill tally floats up beneath the damage number, on a slight lag so the
     two read as separate beats of the same hit. When the damage is itself
     delayed (ranged/spell — waits for the projectile to land), the lag stacks
     on top of the flight time. */
  .fx-kills {
    top: 55%;
    color: #e2e8f0;
    font-size: 0.85rem;
    animation-delay: 150ms;
    animation-fill-mode: backwards;
  }
  .fx-kills.fx-delayed {
    animation-delay: calc(var(--flight-ms, 0ms) + 150ms);
  }

  /* Projectile wrapper is exactly cell-sized (inset: 0), so translate
     percentages are cell multiples: --from-x/-y are (source − target) in
     cells. Flight runs source → rest position (the target cell), fading in
     the last 15% as the delayed damage text takes over. Board-plane flight:
     the layer lives inside the tilted .board, so cell math needs no
     foreshortening correction. */
  .fx-projectile {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fx-fly var(--flight-ms, 300ms) linear forwards;
    pointer-events: none;
  }

  .fx-proj-glyph {
    font-size: 1.7rem;
    line-height: 1;
  }

  .fx-proj-arrow { color: #fbbf24; text-shadow: 0 1px 2px rgb(0 0 0 / 0.8), 0 0 8px rgb(251 191 36 / 0.6); }
  .fx-proj-bolt  { color: #c084fc; text-shadow: 0 0 12px rgb(192 132 252 / 1); font-size: 2.1rem; }

  /* Flight holds full size/opacity until just before landing, then bursts —
     scales up ~1.5× while vanishing — so arrival reads as an impact, not a
     fade. The 92% frame pins translate/scale so the pop lives only in the
     final stretch. */
  @keyframes fx-fly {
    0% {
      transform: translate(calc(var(--from-x) * 100%), calc(var(--from-y) * 100%)) scale(1);
      opacity: 1;
    }
    92% {
      transform: translate(calc(var(--from-x) * 8%), calc(var(--from-y) * 8%)) scale(1);
      opacity: 1;
    }
    100% {
      transform: translate(0, 0) scale(1.55);
      opacity: 0;
    }
  }

  /* White-hot burst at the target cell the instant the projectile lands.
     `both` fill: invisible through the flight delay, holds faded-out end. */
  .fx-impact {
    position: absolute;
    inset: 18%;
    border-radius: 50%;
    background: radial-gradient(ellipse at center, rgb(255 255 255 / 0.9), rgb(251 191 36 / 0.5) 45%, transparent 70%);
    animation: fx-impact-pop 250ms ease-out;
    animation-delay: var(--flight-ms, 300ms);
    animation-fill-mode: both;
    pointer-events: none;
  }

  @keyframes fx-impact-pop {
    0% {
      opacity: 0;
      transform: scale(0.3);
    }
    25% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: scale(1.4);
    }
  }

  /* Text that waits for its projectile/bolt to land. backwards fill holds
     the 0% frame (opacity 0) through the delay. */
  .fx-text.fx-delayed {
    animation-delay: var(--flight-ms, 0ms);
    animation-fill-mode: backwards;
  }

  /* Lightning: stood up out of the board plane (inverse of the board tilt,
     hinged at the cell's bottom edge — same trick as .token-standing).
     --tilt inherits from .board's style attribute. Requires preserve-3d all
     the way down and NO filter/overflow on .fx-layer or .fx-cell (either
     flattens the 3D subtree — see the .preview comment in BattleGrid). */
  .fx-bolt-strike {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    font-size: 2.4rem;
    line-height: 1;
    text-shadow: 0 0 10px rgb(250 204 21 / 0.9);
    transform-origin: 50% 100%;
    animation: fx-bolt var(--flight-ms, 300ms) ease-in forwards;
    pointer-events: none;
  }

  @keyframes fx-bolt {
    0% {
      opacity: 0;
      transform: rotateX(calc(-1 * var(--tilt))) translateY(-170%) scaleY(1.7);
    }
    30% {
      opacity: 1;
      transform: rotateX(calc(-1 * var(--tilt))) translateY(0) scaleY(1);
    }
    75% { opacity: 1; }
    100% {
      opacity: 0;
      transform: rotateX(calc(-1 * var(--tilt))) translateY(0) scaleY(1);
    }
  }

  /* Buff glow: a pulse in the board plane under the target's feet. */
  .fx-glow {
    position: absolute;
    inset: 6%;
    border-radius: 50%;
    animation: fx-glow-pulse 0.9s ease-out forwards;
    pointer-events: none;
  }

  .fx-glow-attack  { background: radial-gradient(ellipse at center, rgb(248 113 113 / 0.65), transparent 70%); }
  .fx-glow-defense { background: radial-gradient(ellipse at center, rgb(148 163 184 / 0.7), transparent 70%); }

  @keyframes fx-glow-pulse {
    0%   { opacity: 0; transform: scale(0.4); }
    35%  { opacity: 1; transform: scale(1); }
    100% { opacity: 0; transform: scale(1.15); }
  }

  @keyframes float-up {
    0% {
      opacity: 0;
      transform: translate(-50%, 0);
    }
    15% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translate(-50%, -140%);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .fx-text {
      animation: fade-only 0.9s ease-out forwards;
    }
    .fx-projectile,
    .fx-impact {
      animation: none;
      opacity: 0; /* no flight/burst — the damage number alone tells the story */
    }
    .fx-text.fx-delayed,
    .fx-kills,
    .fx-kills.fx-delayed {
      animation-delay: 0ms;
    }
    .fx-bolt-strike,
    .fx-glow {
      animation: fade-only 0.9s ease-out forwards;
    }
    @keyframes fade-only {
      0% { opacity: 0; }
      15% { opacity: 1; }
      100% { opacity: 0; }
    }
  }
</style>
