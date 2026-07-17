<script lang="ts">
  import { availableAugments, AUGMENTS, MAX_AUGMENTS_PER_UNIT } from '$lib/engine/augments';
  import Sprite from './Sprite.svelte';
  import type { UnitDef } from '$lib/engine/types';

  interface Props {
    unit: UnitDef;      // base (un-augmented) definition — eligibility keys off it
    owned: string[];
    points: number;
    onpick: (augmentId: string) => void;
    onclose: () => void;
  }

  let { unit, owned, points, onpick, onclose }: Props = $props();

  const options = $derived(availableAugments(unit, owned));
</script>

<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
  onclick={(e) => e.target === e.currentTarget && onclose()}
  onkeydown={(e) => e.key === 'Escape' && onclose()}
  role="presentation"
>
  <div
    class="w-full max-w-md rounded-lg border border-slate-600 bg-slate-800 p-4 shadow-xl"
    role="dialog"
    aria-label="Augments for {unit.name}"
    tabindex="-1"
  >
    <div class="mb-3 flex items-center gap-3">
      <Sprite name={unit.name} class="h-11 w-9 shrink-0" />
      <div class="flex-1">
        <p class="text-sm font-semibold text-slate-100">{unit.name} augments</p>
        <p class="text-xs text-slate-400">{owned.length} / {MAX_AUGMENTS_PER_UNIT} slots used · ✦ {points} points left</p>
      </div>
      <button
        type="button"
        class="rounded px-2 py-1 text-sm text-slate-400 hover:bg-slate-700 hover:text-slate-200"
        onclick={onclose}
      >✕</button>
    </div>

    {#if owned.length > 0}
      <div class="mb-3 space-y-1">
        {#each owned as id (id)}
          <p class="rounded bg-slate-700/60 px-3 py-1.5 text-xs text-emerald-300">
            ✦ {AUGMENTS[id]?.name ?? id} <span class="text-slate-400">— {AUGMENTS[id]?.description ?? ''}</span>
          </p>
        {/each}
      </div>
    {/if}

    {#if options.length === 0}
      <p class="py-2 text-center text-sm text-slate-400">
        {owned.length >= MAX_AUGMENTS_PER_UNIT ? 'All augment slots used.' : 'No eligible augments.'}
      </p>
    {:else}
      <div class="space-y-1">
        {#each options as a (a.id)}
          <button
            type="button"
            class="flex w-full items-center justify-between gap-3 rounded border border-slate-700 bg-slate-700/40 px-3 py-2 text-left
              hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={points <= 0}
            onclick={() => onpick(a.id)}
          >
            <span>
              <span class="text-sm font-semibold text-slate-100">{a.name}</span>
              <span class="ml-2 text-xs text-slate-400">{a.description}</span>
            </span>
            <span class="shrink-0 font-mono text-xs text-amber-300">1 ✦</span>
          </button>
        {/each}
      </div>
      {#if points <= 0}
        <p class="mt-2 text-center text-xs text-slate-500">Earn augment points by levelling up.</p>
      {/if}
    {/if}
  </div>
</div>
