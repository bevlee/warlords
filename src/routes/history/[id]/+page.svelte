<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import Battle from '$lib/ui/Battle.svelte';
  import { ENGINE_VERSION } from '$lib/engine/version';
  import { getBattle, type BattleDetail } from '$lib/net/api';
  import { ReplayController, type ReplaySnapshot, type ReplaySink } from '$lib/replay/controller';
  import { buildReplayTimeline, type ReplayTimeline } from '$lib/replay/timeline';

  const SPEEDS = [0.5, 1, 2, 4] as const;
  let detail: BattleDetail | null = $state(null);
  let timeline: ReplayTimeline | null = $state(null);
  let controller: ReplayController | null = null;
  let speed: number = $state(1);
  let snapshot: ReplaySnapshot = $state({ cursor: 0, total: 0, paused: true, running: false, done: false, chat: [] });
  let loading = $state(true);
  let error = $state('');

  onMount(async () => {
    try {
      const id = page.params.id;
      if (!id) throw new Error('Replay id is missing');
      const loaded = await getBattle(id);
      detail = loaded;
      if (loaded.engineVersion !== ENGINE_VERSION) {
        error = `This replay uses engine ${loaded.engineVersion}; this build uses ${ENGINE_VERSION}.`;
        return;
      }
      timeline = buildReplayTimeline(loaded);
      controller = new ReplayController(timeline, { onChange: next => (snapshot = next) });
      controller.setSpeed(speed);
      snapshot = controller.snapshot();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not load replay';
    } finally {
      loading = false;
    }
  });

  function ready(controls: { applyRemote: ReplaySink['apply']; resync: ReplaySink['resync'] }) {
    controller?.attach({ apply: controls.applyRemote, resync: controls.resync });
  }

  function togglePlayback() {
    if (!controller) return;
    if (snapshot.running && !snapshot.paused) controller.pause();
    else void controller.play();
  }

  function setSpeed(next: number) {
    speed = next;
    controller?.setSpeed(next);
  }
</script>

<main class="min-h-screen bg-slate-900 p-3 text-slate-100 sm:p-5">
  <header class="mx-auto mb-3 flex max-w-6xl flex-wrap items-center gap-4">
    <h1 class="text-2xl font-bold">Battle replay</h1>
    <a href="/history" class="text-slate-400 hover:text-slate-200">← history</a>
    {#if detail}<span class="text-sm uppercase tracking-wide text-slate-500">{detail.mode}</span>{/if}
  </header>

  {#if loading}
    <p class="mx-auto max-w-3xl rounded border border-slate-700 bg-slate-800 p-5">Loading replay…</p>
  {:else if error}
    <p class="mx-auto max-w-3xl rounded border border-red-700 bg-red-950 p-5 text-red-200">{error}</p>
  {:else if detail && timeline}
    <div class="mx-auto mb-3 flex max-w-4xl flex-wrap items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 p-3">
      <button onclick={togglePlayback} disabled={snapshot.done} class="rounded bg-violet-700 px-4 py-2 font-semibold hover:bg-violet-600 disabled:opacity-40">
        {snapshot.running && !snapshot.paused ? 'Pause' : snapshot.done ? 'Finished' : 'Play'}
      </button>
      <button onclick={() => controller?.restart()} class="rounded bg-slate-700 px-4 py-2 hover:bg-slate-600">Restart</button>
      <span class="mx-2 font-mono text-sm text-slate-300">Action {snapshot.cursor} / {snapshot.total}</span>
      <div class="flex rounded bg-slate-900 p-1" role="group" aria-label="replay speed">
        {#each SPEEDS as value}
          <button onclick={() => setSpeed(value)} class="rounded px-3 py-1 text-sm {speed === value ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-slate-200'}">{value}×</button>
        {/each}
      </div>
    </div>

    <Battle
      playerArmy={[]}
      enemyArmy={[]}
      hero={timeline.initialState.hero}
      initialState={timeline.initialState}
      allowRestart={false}
      replay={{ speedFactor: speed, ready }}
    />

    {#if detail.mode === 'coop'}
      <section class="mx-auto mt-3 max-w-4xl rounded border border-slate-700 bg-slate-800 p-3">
        <h2 class="mb-2 font-semibold text-slate-200">Battle chat</h2>
        {#if snapshot.chat.length === 0}
          <p class="text-sm text-slate-500">No messages at this point in the replay.</p>
        {:else}
          <div class="max-h-32 overflow-y-auto text-sm">
            {#each snapshot.chat as message}
              <p><span class={message.controller === 'host' ? 'text-sky-300' : 'text-emerald-300'}>{message.controller}:</span> {message.text}</p>
            {/each}
          </div>
        {/if}
      </section>
    {/if}
  {/if}
</main>
