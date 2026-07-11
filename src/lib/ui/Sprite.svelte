<script lang="ts">
  import SpriteVector from './SpriteVector.svelte';
  import { sheetFor, POSE_ROW, type Pose } from './sprites';

  interface Props {
    name: string;
    pose?: Pose;
    class?: string;
  }

  let { name, pose = 'idle', class: cls = '' }: Props = $props();

  const src = $derived(sheetFor(name));
  const POSE_MS: Record<Pose, number> = { idle: 900, attack: 400, hit: 400, death: 500 };
</script>

<!-- Spritesheet standee: 64×80 frames, feet on the bottom edge. Units without
     a sheet fall back to the vector art in SpriteVector.svelte. -->
{#if src}
  {#key pose}
    <div
      class="sprite {cls}"
      class:play-once={pose === 'death'}
      style="background-image:url('{src}'); --row:{POSE_ROW[pose]}; --dur:{POSE_MS[pose]}ms"
      aria-hidden="true"
    ></div>
  {/key}
{:else}
  <SpriteVector {name} class={cls} />
{/if}

<style>
  .sprite {
    aspect-ratio: 64 / 80;
    background-repeat: no-repeat;
    /* 4 frame columns × 4 pose rows (matches FRAMES/POSES in sprites.ts).
       With 400% sizing, background-position percentages address cells at
       thirds: cell n sits at n/3 · 100%. */
    background-size: 400% 400%;
    background-position-y: calc(var(--row) / 3 * 100%);
    animation: sprite-frames var(--dur, 900ms) steps(4, jump-none) infinite;
  }

  .play-once {
    animation-iteration-count: 1;
    animation-fill-mode: forwards;
  }

  @keyframes sprite-frames {
    from {
      background-position-x: 0%;
    }
    to {
      background-position-x: 100%;
    }
  }
</style>
