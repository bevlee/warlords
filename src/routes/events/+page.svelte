<script lang="ts">
  import { getCurrentSeason, getPastEvents } from '$lib/events/season';

  const season = getCurrentSeason();
  const past = getPastEvents();

  function when(ms: number): string {
    const days = Math.round((Date.now() - ms) / 86_400_000);
    return days <= 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`;
  }
</script>

<main class="min-h-screen bg-slate-900 px-4 py-5 text-slate-100 sm:px-6 sm:py-6">
  <div class="mx-auto max-w-3xl">
    <div class="flex items-center gap-4">
      <a href="/" class="text-lg text-slate-400 hover:text-slate-200">← Hub</a>
      <h1 class="text-2xl font-bold">Seasonal Events</h1>
    </div>

    {#if season}
      <p class="mb-2 mt-6 text-[11px] font-extrabold uppercase tracking-widest text-sky-300">Live now</p>
      <a
        href="/events/{season.slug}"
        class="relative block overflow-hidden rounded-2xl border border-sky-400/25 bg-slate-800/50 p-5 hover:bg-slate-800/70"
      >
        <span class="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-sky-300 to-violet-400"></span>
        <div class="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-widest text-sky-300">
          <span class="inline-block h-2 w-2 rounded-full bg-current motion-safe:animate-pulse"></span>
          Co-op PvE
        </div>
        <h2 class="mt-2 text-xl font-extrabold text-slate-50">{season.name}</h2>
        <p class="mt-1 text-sm text-slate-400">{season.description}</p>
        <span class="mt-4 inline-block rounded-xl bg-gradient-to-r from-sky-300 to-indigo-400 px-4 py-2 text-sm font-extrabold text-slate-900">
          Enter event →
        </span>
      </a>
    {/if}

    <p class="mb-2 mt-8 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Past events</p>
    <ul class="flex flex-col gap-2">
      {#each past as ev (ev.slug)}
        <li class="flex items-center gap-3 rounded-xl border border-slate-700/60 bg-slate-800/40 px-4 py-3">
          <span class="grid h-9 w-9 flex-none place-items-center rounded-lg bg-slate-700/50 text-lg">{ev.reward.icon}</span>
          <span class="min-w-0 flex-1 leading-tight">
            <b class="block truncate text-sm font-bold text-slate-100">{ev.name}</b>
            <span class="text-[11px] text-slate-400">Ended {when(ev.endedAt)} · {ev.reward.name}</span>
          </span>
          <span
            class="whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold {ev.claimed
              ? 'bg-emerald-500/15 text-emerald-300'
              : 'bg-slate-700/50 text-slate-400'}"
          >
            {ev.claimed ? 'Claimed' : 'Unclaimed'}
          </span>
        </li>
      {/each}
    </ul>
  </div>
</main>
