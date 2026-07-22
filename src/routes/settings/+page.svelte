<script lang="ts">
  import { onMount } from 'svelte';
  import { resetHero, clearArmy, clearRun } from '$lib/storage';
  import { loadProfile, saveProfile, clearProfile, DEFAULT_PROFILE, type Profile } from '$lib/profile';
  import { resetCampaign } from '$lib/campaign/campaignStore';

  let profile = $state<Profile>({ ...DEFAULT_PROFILE });
  let loaded = $state(false);
  let confirming = $state(false);

  onMount(() => {
    profile = loadProfile();
    loaded = true;
  });

  // Persist after the load has seeded state, so the initial mount doesn't
  // write defaults over a real save.
  $effect(() => {
    const snapshot = { name: profile.name, audio: profile.audio, reducedMotion: profile.reducedMotion };
    if (loaded) saveProfile(snapshot);
  });

  async function resetEverything() {
    await Promise.all([resetHero(), clearArmy(), clearRun(), resetCampaign()]);
    clearProfile();
    profile = { ...DEFAULT_PROFILE };
    confirming = false;
  }
</script>

<main class="min-h-screen bg-slate-900 px-4 py-5 text-slate-100 sm:px-6 sm:py-6">
  <div class="mx-auto max-w-xl">
    <div class="flex items-center gap-4">
      <a href="/" class="text-lg text-slate-400 hover:text-slate-200">← Hub</a>
      <h1 class="text-2xl font-bold">Profile & Settings</h1>
    </div>

    <section class="mt-6 rounded-2xl border border-slate-700/60 bg-slate-800/40 p-5">
      <h2 class="text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Profile</h2>
      <label class="mt-3 block">
        <span class="text-sm font-semibold text-slate-300">Display name</span>
        <input
          type="text"
          bind:value={profile.name}
          maxlength="24"
          class="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-400"
        />
      </label>
    </section>

    <section class="mt-4 rounded-2xl border border-slate-700/60 bg-slate-800/40 p-5">
      <h2 class="text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Game settings</h2>
      <label class="mt-3 flex items-center justify-between gap-3">
        <span class="text-sm text-slate-300">Sound effects</span>
        <input type="checkbox" bind:checked={profile.audio} class="h-5 w-5 accent-sky-400" />
      </label>
      <label class="mt-3 flex items-center justify-between gap-3">
        <span class="text-sm text-slate-300">Reduce motion</span>
        <input type="checkbox" bind:checked={profile.reducedMotion} class="h-5 w-5 accent-sky-400" />
      </label>
    </section>

    <section class="mt-4 rounded-2xl border border-red-500/30 bg-red-500/5 p-5">
      <h2 class="text-[11px] font-extrabold uppercase tracking-widest text-red-300">Danger zone</h2>
      <p class="mt-2 text-sm text-slate-400">
        Reset wipes your hero, campaign, Gauntlet run, and settings. This can't be undone.
      </p>
      {#if confirming}
        <div class="mt-3 flex gap-2">
          <button type="button" onclick={resetEverything} class="rounded-lg bg-red-600 px-4 py-2 text-sm font-extrabold text-white hover:bg-red-500">
            Yes, reset everything
          </button>
          <button type="button" onclick={() => (confirming = false)} class="rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-slate-700">
            Cancel
          </button>
        </div>
      {:else}
        <button type="button" onclick={() => (confirming = true)} class="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-bold text-red-300 hover:bg-red-500/20">
          Reset progress
        </button>
      {/if}
    </section>
  </div>
</main>
