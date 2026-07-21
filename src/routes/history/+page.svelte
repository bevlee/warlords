<script lang="ts">
  import { onMount } from 'svelte';
  import { ENGINE_VERSION } from '$lib/engine/version';
  import { getBattles, type BattleHistoryRow } from '$lib/net/api';
  import { casualtyText, resultLabel } from '$lib/replay/format';

  let battles: BattleHistoryRow[] = $state([]);
  let loading = $state(true);
  let error = $state('');

  onMount(async () => {
    try {
      battles = await getBattles();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not load battle history';
    } finally {
      loading = false;
    }
  });
</script>

<main class="min-h-screen bg-slate-900 p-4 text-slate-100 sm:p-6">
  <div class="mx-auto max-w-5xl">
    <header class="mb-6 flex flex-wrap items-center gap-4">
      <h1 class="text-3xl font-bold">Battle history</h1>
      <a href="/" class="text-slate-400 hover:text-slate-200">← main game</a>
    </header>

    {#if loading}
      <p class="rounded border border-slate-700 bg-slate-800 p-5 text-slate-300">Loading battles…</p>
    {:else if error}
      <p class="rounded border border-red-700 bg-red-950 p-5 text-red-200">{error}</p>
    {:else if battles.length === 0}
      <p class="rounded border border-slate-700 bg-slate-800 p-5 text-slate-300">No completed battles yet.</p>
    {:else}
      <div class="space-y-3">
        {#each battles as battle (battle.id)}
          {@const compatible = battle.engineVersion === ENGINE_VERSION}
          <article class="grid gap-3 rounded-lg border border-slate-700 bg-slate-800 p-4 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <div class="mb-1 flex flex-wrap items-center gap-2">
                <h2 class="text-lg font-bold {battle.result === 'player_wins' ? 'text-amber-300' : battle.result === 'enemy_wins' ? 'text-red-300' : 'text-slate-300'}">
                  {resultLabel(battle.result)}
                </h2>
                <span class="rounded bg-slate-700 px-2 py-0.5 text-xs uppercase tracking-wide text-slate-300">{battle.mode}</span>
                <time class="text-sm text-slate-400">{new Date(battle.startedAt).toLocaleString()}</time>
              </div>
              {#if battle.summary}
                <p class="text-sm text-slate-300">
                  {battle.summary.rounds} rounds · Lost {casualtyText(battle.summary.playerCasualties)} · Defeated {casualtyText(battle.summary.enemyCasualties)}
                </p>
              {:else}
                <p class="text-sm text-slate-500">No summary available.</p>
              {/if}
            </div>
            {#if compatible}
              <a href="/history/{battle.id}" class="rounded bg-violet-700 px-4 py-2 text-center font-semibold hover:bg-violet-600">Watch replay</a>
            {:else}
              <button disabled class="rounded bg-slate-700 px-4 py-2 text-slate-500" title="Recorded with engine {battle.engineVersion}">Replay unavailable</button>
            {/if}
          </article>
        {/each}
      </div>
    {/if}
  </div>
</main>
