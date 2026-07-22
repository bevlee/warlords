<script lang="ts">
  import { FACTION_INFO } from '$lib/engine/factions';
  import Sprite from './Sprite.svelte';
  import { heroSpriteName } from './sprites';
  import { encountersInChapter, nodeStatus, totalChapters, type CampaignState, type NodeStatus } from '$lib/campaign/campaignStore';
  import { CHAPTER_TITLES, type Encounter } from '$lib/campaign/encounters';
  import type { Hero } from '$lib/engine/types';

  interface Props {
    hero: Hero;
    campaign: CampaignState;
    onselect: (encounter: Encounter) => void;
    onback: () => void;
  }

  let { hero, campaign, onselect, onback }: Props = $props();

  const chapters = $derived(Array.from({ length: totalChapters() }, (_, i) => i + 1));

  function nodeClasses(status: NodeStatus): string {
    if (status === 'completed') return 'border-emerald-500 bg-emerald-900/40 text-emerald-300';
    if (status === 'available') return 'border-amber-400 bg-amber-900/30 text-amber-100 animate-pulse';
    return 'border-slate-700 bg-slate-800 text-slate-500';
  }
</script>

<div class="mx-auto max-w-4xl">
  <div class="mb-4 flex items-center justify-between gap-4 rounded-lg border border-slate-700 bg-slate-800 px-4 py-3">
    <div class="flex items-center gap-3">
      <Sprite name={heroSpriteName(hero.class)} class="h-12 w-10" />
      <div>
        <p class="text-sm font-semibold text-amber-200">Level {hero.level} {FACTION_INFO[hero.class].name}</p>
        <p class="text-xs text-slate-400">
          {campaign.completed ? 'Campaign complete!' : `Chapter ${campaign.chapter} — ${CHAPTER_TITLES[campaign.chapter]}`}
        </p>
      </div>
    </div>
    <button
      type="button"
      class="rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
      onclick={onback}
    >
      ← Back to Army Setup
    </button>
  </div>

  <div class="space-y-5">
    {#each chapters as chapter (chapter)}
      {@const encounters = encountersInChapter(chapter)}
      <div class="rounded-lg border border-slate-700 bg-slate-800/60 p-4">
        <h2 class="mb-3 text-sm font-bold uppercase tracking-wide text-slate-300">
          Chapter {chapter} — {CHAPTER_TITLES[chapter]}
        </h2>
        <div class="flex flex-wrap items-stretch gap-3">
          {#each encounters as encounter, i (encounter.id)}
            {@const status = nodeStatus(campaign, chapter, i)}
            <button
              type="button"
              class="flex w-28 flex-col items-center gap-1 rounded-lg border-2 p-2 text-center transition disabled:cursor-not-allowed {nodeClasses(status)}"
              disabled={status !== 'available'}
              onclick={() => onselect(encounter)}
              aria-label="{encounter.name} — {status}"
            >
              <span
                class="flex h-10 w-10 items-center justify-center rounded-full border-2 text-base font-bold {nodeClasses(status)}"
              >
                {status === 'completed' ? '✓' : i + 1}
              </span>
              <span class="text-xs font-semibold leading-tight">{encounter.name}</span>
              <span class="font-mono text-[10px] text-slate-400">🪙{encounter.goldReward} · {encounter.xpReward}xp</span>
              {#if encounter.special}
                <span class="text-[10px] italic text-amber-400">{encounter.special}</span>
              {/if}
            </button>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>
