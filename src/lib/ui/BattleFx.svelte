<script lang="ts">
  import type { AnimStep } from './animSteps';
  import type { Pos } from '$lib/engine/types';

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
</script>

<div
  class="fx-layer grid"
  style="grid-template-columns: repeat({gridWidth}, minmax(0, 1fr)); grid-template-rows: repeat({gridHeight}, minmax(0, 1fr)); --flight-ms: {Math.round(stepMs * 0.6)}ms;"
>
  {#each steps as { step, pos, fromPos, art, key } (key)}
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
      {:else if step.kind === 'damage'}
        <span class="fx-text fx-damage" class:fx-delayed={step.delayed}>-{step.value}</span>
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
  }

  .fx-cell {
    position: relative;
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
    font-size: 1.1rem;
    line-height: 1;
  }

  .fx-proj-arrow { color: #fbbf24; text-shadow: 0 1px 2px rgb(0 0 0 / 0.7); }
  .fx-proj-bolt  { color: #c084fc; text-shadow: 0 0 6px rgb(192 132 252 / 0.9); font-size: 1.3rem; }

  @keyframes fx-fly {
    0% {
      transform: translate(calc(var(--from-x) * 100%), calc(var(--from-y) * 100%));
      opacity: 1;
    }
    85% { opacity: 1; }
    100% {
      transform: translate(0, 0);
      opacity: 0;
    }
  }

  /* Text that waits for its projectile/bolt to land. backwards fill holds
     the 0% frame (opacity 0) through the delay. */
  .fx-text.fx-delayed {
    animation-delay: var(--flight-ms, 0ms);
    animation-fill-mode: backwards;
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
    .fx-projectile {
      animation: none;
      opacity: 0; /* no flight — the damage number alone tells the story */
    }
    .fx-text.fx-delayed {
      animation-delay: 0ms;
    }
    @keyframes fade-only {
      0% { opacity: 0; }
      15% { opacity: 1; }
      100% { opacity: 0; }
    }
  }
</style>
