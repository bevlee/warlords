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
  style="grid-template-columns: repeat({gridWidth}, minmax(0, 1fr)); grid-template-rows: repeat({gridHeight}, minmax(0, 1fr));"
>
  {#each steps as { step, pos, key } (key)}
    <div class="fx-cell" style="grid-column: {pos.col + 1}; grid-row: {pos.row + 1};">
      {#if step.kind === 'damage'}
        <span class="fx-text fx-damage">-{step.value}</span>
      {:else if step.kind === 'buff'}
        <span class="fx-text fx-buff">+{step.value} {step.label}</span>
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
    @keyframes fade-only {
      0% { opacity: 0; }
      15% { opacity: 1; }
      100% { opacity: 0; }
    }
  }
</style>
