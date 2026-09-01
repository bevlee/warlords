<script lang="ts">
  import { onMount } from 'svelte';
  import HubTopBar from '$lib/ui/HubTopBar.svelte';
  import ModeCard from '$lib/ui/ModeCard.svelte';
  import { loadHero, loadRun } from '$lib/storage';
  import { FACTION_INFO } from '$lib/engine/factions';
  import { actOf, RUN_LENGTH, BOSS_NODES, type RunState } from '$lib/gauntlet/run';
  import type { Hero } from '$lib/engine/types';

  const ROMAN = ['', 'I', 'II', 'III'];
  const ACT_NAMES: Record<1 | 2 | 3, string> = {
    1: 'The Borderlands',
    2: 'The Deep Wilds',
    3: 'The Black Citadel',
  };
  const NODES = Array.from({ length: RUN_LENGTH }, (_, i) => i + 1);

  let hero = $state<Hero | null>(null);
  let run = $state<RunState | null>(null);

  onMount(async () => {
    hero = await loadHero();
    run = await loadRun<RunState>();
  });

  const gold = $derived(hero?.gold ?? 0);

  // A run is live until it is won or lost; that decides Resume vs New.
  const runLive = $derived(run != null && run.status !== 'won' && run.status !== 'lost');
  const act = $derived(run ? actOf(Math.min(run.encounterIndex, RUN_LENGTH)) : 1);
  const desc = $derived(
    runLive && run
      ? `Act ${ROMAN[act]} — ${ACT_NAMES[act]}. Node ${Math.min(run.encounterIndex, RUN_LENGTH)} of ${RUN_LENGTH}, ` +
        `${run.battlesWon} won. Survivors carry over.`
      : 'Draft a warband and climb ten escalating encounters, then push on into Endless. One life, no retreat.',
  );
</script>

<main class="min-h-screen bg-slate-900 px-4 py-5 text-slate-100 sm:px-6 sm:py-6">
  <div class="mx-auto max-w-3xl">
    <HubTopBar {gold} />

    <p class="mb-3 mt-6 px-0.5 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Choose your battle</p>

    <ModeCard
      accent="amber"
      tall
      live={runLive}
      kicker="🏰 Gauntlet · Solo run"
      title="The Gauntlet"
      desc={desc}
      href="/gauntlet"
      cta={runLive ? 'Resume run →' : 'New run →'}
      badge={runLive && run ? `${FACTION_INFO[run.faction].name} · Lv ${run.hero.level}` : undefined}
    >
      {#snippet extra()}
        <!-- Ten nodes, bosses marked: the run's whole shape at a glance. -->
        <div class="flex flex-wrap items-center gap-1.5" aria-hidden="true">
          {#each NODES as n (n)}
            {@const cleared = runLive && run ? n < run.encounterIndex : false}
            {@const current = runLive && run ? n === run.encounterIndex : false}
            <span
              class="grid h-6 w-6 place-items-center rounded-md border text-[10px] font-bold
                {current
                ? 'border-amber-300 bg-amber-300 text-amber-950'
                : cleared
                  ? 'border-amber-500/60 bg-amber-500/20 text-amber-200'
                  : 'border-slate-600/60 bg-slate-700/30 text-slate-500'}"
            >
              {BOSS_NODES.has(n) ? '☠' : n}
            </span>
          {/each}
        </div>
        {#if runLive && run && run.endlessDepth > 0}
          <p class="mt-3 text-[11px] font-bold uppercase tracking-widest text-amber-300">
            Endless · depth {run.endlessDepth}
          </p>
        {/if}
        <p class="mt-3 text-[11px] text-slate-500">
          Full army recovery between battles · reinforcements, artifacts, and unit skills on every win.
        </p>
      {/snippet}
    </ModeCard>

    <p class="mb-3 mt-6 px-0.5 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">More</p>

    <div class="grid gap-2">
      <a
        href="/history"
        class="flex items-center gap-3 rounded-xl border border-slate-700/60 bg-slate-800/60 px-4 py-3 transition hover:border-slate-600 hover:bg-slate-800"
      >
        <span class="text-2xl">📜</span>
        <span class="min-w-0 flex-1">
          <b class="block text-sm font-extrabold text-slate-100">Battle history</b>
          <span class="block truncate text-[11px] text-slate-400">Every fight you have finished, with animated replays.</span>
        </span>
        <span class="shrink-0 text-xs font-bold text-slate-400">Open →</span>
      </a>

      <a
        href="/legacy"
        class="flex items-center gap-3 rounded-xl border border-slate-700/60 bg-slate-800/40 px-4 py-3 transition hover:border-slate-600 hover:bg-slate-800"
      >
        <span class="text-2xl">🗝️</span>
        <span class="min-w-0 flex-1">
          <b class="block text-sm font-extrabold text-slate-100">Legacy hub</b>
          <span class="block truncate text-[11px] text-slate-400">The old home page — campaign, seasonal events, and the compendium.</span>
        </span>
        <span class="shrink-0 text-xs font-bold text-slate-400">Browse →</span>
      </a>
    </div>
  </div>

  <!-- Mobile-only bottom nav in the thumb zone -->
  <nav class="fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t border-slate-700/60 bg-slate-900/90 py-2 backdrop-blur sm:hidden">
    <a href="/" class="grid justify-items-center gap-0.5 text-[10px] font-bold text-amber-300">
      <span class="text-lg">🏰</span>Home
    </a>
    <a href="/gauntlet" class="grid justify-items-center gap-0.5 text-[10px] font-bold text-slate-400">
      <span class="text-lg">⚔️</span>Gauntlet
    </a>
    <a href="/history" class="grid justify-items-center gap-0.5 text-[10px] font-bold text-slate-400">
      <span class="text-lg">📜</span>History
    </a>
    <a href="/settings" class="grid justify-items-center gap-0.5 text-[10px] font-bold text-slate-400">
      <span class="text-lg">👤</span>Profile
    </a>
  </nav>
  <div class="h-16 sm:hidden"></div>
</main>
