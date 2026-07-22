<script lang="ts">
  import { page } from '$app/state';
  import Countdown from '$lib/ui/Countdown.svelte';
  import PartyRoster from '$lib/ui/PartyRoster.svelte';
  import { getEventBySlug } from '$lib/events/season';

  const resolved = $derived(getEventBySlug(page.params.slug ?? ''));

  let allReady = $state(false);
  let filled = $state(1);
  let launching = $state(false);
</script>

<main class="min-h-screen bg-slate-900 px-4 py-5 text-slate-100 sm:px-6 sm:py-6">
  <div class="mx-auto max-w-4xl">
    <div class="flex items-center justify-between gap-4">
      <a href="/" class="text-lg text-slate-400 hover:text-slate-200">← Hub</a>
      <a href="/events" class="text-sm font-bold text-sky-300 hover:text-sky-200">Past events →</a>
    </div>

    {#if resolved && 'current' in resolved}
      {@const ev = resolved.current}
      <div class="mt-5 grid gap-4 md:grid-cols-[1.3fr_1fr] md:items-start">
        <!-- Briefing -->
        <section
          class="relative overflow-hidden rounded-2xl border border-sky-400/25 p-5"
          style="background: radial-gradient(420px 220px at 90% -10%, rgba(125,211,252,0.14), transparent 60%), linear-gradient(180deg, #0e1b2e, #0b1322);"
        >
          <div class="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-widest text-sky-300">
            <span class="inline-block h-2 w-2 rounded-full bg-current motion-safe:animate-pulse"></span>
            Live · Co-op PvE
          </div>
          <h1 class="mt-2 text-2xl font-extrabold tracking-tight text-slate-50">{ev.name}</h1>
          <p class="mt-1 text-sm text-slate-300/90">{ev.description}</p>

          <div class="mt-4"><Countdown endsAt={ev.endsAt} /></div>

          <div class="mt-4 flex flex-wrap gap-1.5">
            {#each ev.modifiers as m (m.label)}
              <span class="rounded-full border border-slate-600/60 bg-slate-700/40 px-2.5 py-0.5 text-[11px] font-semibold text-slate-300">
                {m.icon} {m.label}
              </span>
            {/each}
          </div>

          <div class="mt-4 flex items-center gap-3 rounded-xl border border-slate-600/40 bg-slate-800/40 p-3">
            <span class="grid h-10 w-10 flex-none place-items-center rounded-lg bg-gradient-to-br from-sky-900 to-cyan-700 text-xl">
              {ev.reward.icon}
            </span>
            <span class="leading-tight">
              <b class="block text-sm text-sky-100">{ev.reward.name}</b>
              <span class="text-[11px] text-slate-400">{ev.reward.note}</span>
            </span>
          </div>
        </section>

        <!-- Party composition -->
        <section class="rounded-2xl border border-slate-700/60 bg-slate-800/40 p-5">
          <h2 class="text-sm font-extrabold text-slate-100">Your party · {filled} / {ev.coopMax}</h2>
          <p class="mb-3 mt-0.5 text-xs text-slate-400">
            Fill seats with friends or open matchmaking. Everyone readies before the siege starts.
          </p>

          <PartyRoster coopMax={ev.coopMax} bind:allReady bind:filled />

          <button
            type="button"
            disabled={!allReady || launching}
            onclick={() => (launching = true)}
            class="mt-4 w-full rounded-xl px-4 py-2.5 text-sm font-extrabold transition
              {allReady && !launching
                ? 'bg-gradient-to-r from-sky-300 to-indigo-400 text-slate-900 hover:brightness-110'
                : 'cursor-not-allowed bg-slate-700/50 text-slate-500'}"
          >
            {launching ? 'Preparing siege…' : allReady ? 'Ready — start siege' : 'Waiting for party to ready'}
          </button>
          <button type="button" class="mt-2 w-full rounded-xl border border-slate-600 bg-slate-700/40 px-4 py-2.5 text-sm font-bold text-slate-200 hover:bg-slate-700">
            Find teammates
          </button>

          {#if launching}
            <p class="mt-3 text-center text-xs text-sky-300">
              Matchmaking the siege — co-op battle is coming in a later update.
            </p>
          {/if}
        </section>
      </div>
    {:else if resolved && 'past' in resolved}
      {@const ev = resolved.past}
      <div class="mx-auto mt-10 max-w-md rounded-2xl border border-slate-700/60 bg-slate-800/40 p-6 text-center">
        <span class="mx-auto grid h-14 w-14 place-items-center rounded-xl bg-slate-700/50 text-3xl">{ev.reward.icon}</span>
        <h1 class="mt-3 text-xl font-extrabold text-slate-50">{ev.name}</h1>
        <p class="mt-1 text-sm text-slate-400">This season has ended. Reward: {ev.reward.name} — {ev.claimed ? 'claimed' : 'unclaimed'}.</p>
        <a href="/events" class="mt-5 inline-block rounded-xl border border-slate-600 bg-slate-700/50 px-4 py-2 text-sm font-bold text-slate-100 hover:bg-slate-700">
          Back to events
        </a>
      </div>
    {:else}
      <div class="mx-auto mt-10 max-w-md rounded-2xl border border-slate-700/60 bg-slate-800/40 p-6 text-center">
        <h1 class="text-xl font-extrabold text-slate-50">Event not found</h1>
        <p class="mt-1 text-sm text-slate-400">This event isn't running right now.</p>
        <a href="/events" class="mt-5 inline-block rounded-xl border border-slate-600 bg-slate-700/50 px-4 py-2 text-sm font-bold text-slate-100 hover:bg-slate-700">
          See all events
        </a>
      </div>
    {/if}
  </div>
</main>
