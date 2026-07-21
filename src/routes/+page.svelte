<script lang="ts">
  import { onMount } from 'svelte';
  import HubTopBar from '$lib/ui/HubTopBar.svelte';
  import ModeCard from '$lib/ui/ModeCard.svelte';
  import Countdown from '$lib/ui/Countdown.svelte';
  import { loadHero, loadRun } from '$lib/storage';
  import { loadCampaign, totalChapters, type CampaignState } from '$lib/campaign/campaignStore';
  import { getCurrentSeason } from '$lib/events/season';
  import { actOf, RUN_LENGTH, type RunState } from '$lib/gauntlet/run';
  import type { Hero } from '$lib/engine/types';

  const ROMAN = ['', 'I', 'II', 'III'];
  const CHAPTERS = totalChapters();

  let hero = $state<Hero | null>(null);
  let run = $state<RunState | null>(null);
  let campaign = $state<CampaignState | null>(null);
  const season = getCurrentSeason();

  onMount(async () => {
    hero = await loadHero();
    run = await loadRun<RunState>();
    campaign = await loadCampaign();
  });

  const gold = $derived(hero?.gold ?? 0);

  // Campaign card — reads the saved campaign so the CTA is the right next step.
  const started = $derived(hero != null);
  const campaignDesc = $derived(
    !started
      ? 'Choose a faction and march through five chapters of conquest.'
      : campaign?.completed
        ? `Every chapter cleared. Level ${hero?.level} warlord — replay any time.`
        : `Chapter ${campaign?.chapter ?? 1} of ${CHAPTERS} · encounter ${(campaign?.encounter ?? 0) + 1}. Pick up where you left off.`,
  );
  const campaignCta = $derived(!started ? 'Begin campaign →' : campaign?.completed ? 'Replay campaign' : 'Continue campaign');

  // Gauntlet card — reads the run for Resume vs New.
  const runLive = $derived(run != null && run.status !== 'won' && run.status !== 'lost');
  const gauntletDesc = $derived(
    runLive && run
      ? `Act ${ROMAN[actOf(run.encounterIndex)]} — node ${run.encounterIndex} of ${RUN_LENGTH}. Survivors carry over.`
      : 'Draft a warband and climb ten encounters. One life, escalating stakes.',
  );
</script>

<main class="min-h-screen bg-slate-900 px-4 py-5 text-slate-100 sm:px-6 sm:py-6">
  <div class="mx-auto max-w-5xl">
    <HubTopBar {gold} />

    <p class="mb-3 mt-6 px-0.5 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Choose your battle</p>

    <div class="grid gap-4 sm:grid-cols-[1.55fr_1fr]">
      <!-- Events — the spotlight: it expires, so it earns the tall cell -->
      {#if season}
        <ModeCard
          accent="frost"
          tall
          live
          kicker="Seasonal Event · Co-op PvE"
          title={season.name}
          desc={season.description}
          href="/events/{season.slug}"
          cta="Enter event →"
        >
          {#snippet extra()}
            <Countdown endsAt={season.endsAt} />
            <div class="mt-4 flex flex-wrap gap-1.5">
              <span class="rounded-full border border-slate-600/60 bg-slate-700/40 px-2.5 py-0.5 text-[11px] font-semibold text-slate-300">
                🤝 Co-op · up to {season.coopMax}
              </span>
              {#each season.modifiers.slice(0, 1) as m (m.label)}
                <span class="rounded-full border border-slate-600/60 bg-slate-700/40 px-2.5 py-0.5 text-[11px] font-semibold text-slate-300">
                  {m.icon} {m.label}
                </span>
              {/each}
              <span class="rounded-full border border-slate-600/60 bg-slate-700/40 px-2.5 py-0.5 text-[11px] font-semibold text-slate-300">
                ⭐ Reward: {season.reward.name}
              </span>
            </div>
            <div class="mt-3">
              <a href="/events" class="text-[11px] font-bold tracking-wide text-sky-300 hover:text-sky-200">Past events →</a>
            </div>
          {/snippet}
        </ModeCard>
      {:else}
        <ModeCard
          accent="frost"
          tall
          kicker="Seasonal Event"
          title="Between seasons"
          desc="The next co-op event is on its way. Check back soon — or browse what you missed."
          href="/events"
          cta="Past events →"
        />
      {/if}

      <!-- Gauntlet — always on, reads your run -->
      <ModeCard
        accent="amber"
        kicker="🏰 Gauntlet · Solo run"
        title="The Gauntlet"
        desc={gauntletDesc}
        href="/gauntlet"
        cta={runLive ? 'Resume run' : 'New run'}
        badge={runLive ? 'Run in progress' : undefined}
      />

      <!-- Campaign — the core progression, reads your saved chapter -->
      <ModeCard
        accent="emerald"
        kicker="🗺️ Campaign"
        title="Conquest"
        desc={campaignDesc}
        href="/campaign"
        cta={campaignCta}
        badge={started ? `Lv ${hero?.level}` : undefined}
      />
    </div>
  </div>

  <!-- Mobile-only bottom nav in the thumb zone -->
  <nav class="fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t border-slate-700/60 bg-slate-900/90 py-2 backdrop-blur sm:hidden">
    <a href="/" class="grid justify-items-center gap-0.5 text-[10px] font-bold text-amber-300">
      <span class="text-lg">🏰</span>Home
    </a>
    <a href="/campaign" class="grid justify-items-center gap-0.5 text-[10px] font-bold text-slate-400">
      <span class="text-lg">🗺️</span>Campaign
    </a>
    <a href="/events" class="grid justify-items-center gap-0.5 text-[10px] font-bold text-slate-400">
      <span class="text-lg">❄️</span>Events
    </a>
    <a href="/settings" class="grid justify-items-center gap-0.5 text-[10px] font-bold text-slate-400">
      <span class="text-lg">👤</span>Profile
    </a>
  </nav>
  <div class="h-16 sm:hidden"></div>
</main>
