<script lang="ts">
  import { onMount } from 'svelte';
  import { loadRun } from '$lib/storage';
  import { FACTION_INFO } from '$lib/engine/factions';
  import { RUN_LENGTH, type RunState } from '$lib/gauntlet/run';
  import { loadProfile, saveBattleSpeed, DEFAULT_PROFILE, type BattleSpeed } from '$lib/profile';

  const SPEEDS: BattleSpeed[] = ['slow', 'normal', 'fast'];

  let run = $state<RunState | null>(null);
  let speed = $state<BattleSpeed>(DEFAULT_PROFILE.battleSpeed);
  let settingsOpen = $state(false);

  onMount(async () => {
    speed = loadProfile().battleSpeed;
    run = await loadRun<RunState>();
  });

  // A run is live until it is won or lost; that is the whole difference
  // between starting fresh and picking the run back up.
  const live = $derived(run != null && run.status !== 'won' && run.status !== 'lost');

  function pick(next: BattleSpeed) {
    speed = next;
    saveBattleSpeed(next);
    settingsOpen = false;
  }
</script>

<main class="flex min-h-screen flex-col bg-slate-900 px-6 py-5 text-slate-100">
  <div class="relative flex justify-end">
    <button
      type="button"
      class="rounded-full p-2 text-lg leading-none text-slate-500 transition hover:text-slate-200"
      aria-label="Settings"
      aria-expanded={settingsOpen}
      onclick={() => (settingsOpen = !settingsOpen)}
    >
      ⚙
    </button>

    {#if settingsOpen}
      <!-- Click anywhere else to dismiss. -->
      <button type="button" class="fixed inset-0 z-10 cursor-default" aria-label="Close settings" onclick={() => (settingsOpen = false)}
      ></button>
      <div class="absolute right-0 top-11 z-20 w-48 rounded-lg border border-slate-700 bg-slate-800 p-3 shadow-xl">
        <p class="text-[11px] font-bold uppercase tracking-widest text-slate-500">Battle speed</p>
        <div class="mt-2 flex gap-1" role="group" aria-label="battle speed">
          {#each SPEEDS as option (option)}
            <button
              type="button"
              class="flex-1 rounded px-2 py-1 text-xs font-semibold capitalize {speed === option
                ? 'bg-slate-200 text-slate-900'
                : 'border border-slate-600 text-slate-300 hover:bg-slate-700'}"
              aria-pressed={speed === option}
              onclick={() => pick(option)}
            >
              {option}
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  <div class="flex flex-1 flex-col items-center justify-center gap-8 pb-16">
    <h1 class="text-4xl font-black tracking-[0.2em] text-slate-200 sm:text-5xl">
      WAR<span class="text-amber-400">L</span>ORDS
    </h1>

    <div class="flex flex-col items-center gap-2">
      <a
        href="/gauntlet"
        class="rounded-lg bg-amber-400 px-14 py-3 text-lg font-bold tracking-wide text-slate-900 transition hover:bg-amber-300"
      >
        {live ? 'Resume' : 'Play'}
      </a>
      {#if live && run}
        <span class="text-xs text-slate-500">
          {FACTION_INFO[run.faction].name} · {Math.min(run.encounterIndex, RUN_LENGTH)} of {RUN_LENGTH}
        </span>
      {/if}
    </div>

    <div class="flex gap-6 text-xs font-semibold text-slate-500">
      <a href="/compendium" class="hover:text-slate-300">Compendium</a>
      <a href="/history" class="hover:text-slate-300">History</a>
    </div>
  </div>
</main>
