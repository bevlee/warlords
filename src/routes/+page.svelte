<script lang="ts">
  import { onMount } from 'svelte';
  import Battle from '$lib/ui/Battle.svelte';
  import ArmySetup from '$lib/ui/ArmySetup.svelte';
  import CampaignMap from '$lib/ui/CampaignMap.svelte';
  import { generateEnemyArmy, armyCost, filterToUnlockedTiers } from '$lib/engine/recruit';
  import { budgetForLevel, applyXp, maxUnlockedTier } from '$lib/engine/progression';
  import { applyAugmentsToArmy, MAX_AUGMENTS_PER_UNIT } from '$lib/engine/augments';
  import { updateFactionSkills, necromancyBonusSkeletons } from '$lib/engine/factionSkills';
  import { SKELETON } from '$lib/engine/necromancer';
  import { mulberry32 } from '$lib/engine/rng';
  import { loadHero, saveHero, resetHero } from '$lib/storage';
  import {
    loadCampaign,
    saveCampaign,
    resetCampaign,
    newCampaign,
    advanceCampaign,
    type CampaignState,
  } from '$lib/campaign/campaignStore';
  import { generateEnemyArmy as generateCampaignArmy, type Encounter } from '$lib/campaign/encounters';
  import type { ArmySlot, FactionClass, Hero } from '$lib/engine/types';

  const DEFAULT_HERO: Hero = updateFactionSkills({
    class: 'barbarian', level: 1, xp: 0, attack: 2, defense: 1, statPoints: 0, factionSkills: [],
    augmentPoints: 0, unitAugments: {},
  });

  let hero: Hero = $state({ ...DEFAULT_HERO });
  let lastBattle: { xp: number; levels: number } | null = $state(null);
  let screen: 'setup' | 'campaign' | 'battle' | 'result' = $state('setup');
  let campaign: CampaignState | null = $state(null);
  let activeEncounter: Encounter | null = $state(null);
  let lastReward: { xp: number; gold: number } | null = $state(null);
  let lastOutcome: 'player_wins' | 'enemy_wins' | null = $state(null);
  let playerArmy: ArmySlot[] = $state([]);
  let enemyArmy: ArmySlot[] = $state([]);
  let battleKey = $state(0);

  const budget = $derived(budgetForLevel(hero.level));

  onMount(async () => {
    const saved = await loadHero();
    // Migrate heroes persisted before faction skills / augments existed.
    // Augment points are backfilled as one per level-up, minus any spent.
    if (saved) {
      const spent = Object.values(saved.unitAugments ?? {}).reduce((n, ids) => n + ids.length, 0);
      hero = updateFactionSkills({
        ...saved,
        factionSkills: saved.factionSkills ?? [],
        unitAugments: saved.unitAugments ?? {},
        augmentPoints: saved.augmentPoints ?? Math.max(0, saved.level - 1 - spent),
      });
      // Returning player: resume (or backfill) their campaign and skip straight to the map.
      campaign = (await loadCampaign()) ?? newCampaign();
      void saveCampaign(campaign);
      screen = 'campaign';
    }
  });

  function selectEncounter(encounter: Encounter) {
    activeEncounter = encounter;
    screen = 'setup';
  }

  function startBattle(army: ArmySlot[]) {
    // Defense in depth: the setup UI already locks these rows.
    const unlocked = filterToUnlockedTiers(army, hero.level);
    const withSkeletons = hero.bonusSkeletons
      ? [...unlocked, { unit: SKELETON, count: hero.bonusSkeletons }]
      : unlocked;
    playerArmy = applyAugmentsToArmy(withSkeletons, hero);
    if (hero.bonusSkeletons) {
      hero = { ...hero, bonusSkeletons: 0 };
      void saveHero(hero);
    }
    enemyArmy = activeEncounter
      ? generateCampaignArmy(activeEncounter, hero.level)
      : generateEnemyArmy(budget, mulberry32(Date.now() % 2 ** 31), maxUnlockedTier(hero.level));
    battleKey += 1;
    lastBattle = null;
    lastReward = null;
    lastOutcome = null;
    screen = 'battle';
  }

  function handleResult(result: 'player_wins' | 'enemy_wins') {
    lastOutcome = result;
    if (result === 'player_wins') {
      const gained = activeEncounter ? activeEncounter.xpReward : armyCost(enemyArmy);
      const { hero: next, levels } = applyXp(hero, gained);
      const bonusSkeletons = (hero.bonusSkeletons ?? 0) + necromancyBonusSkeletons(hero, enemyArmy);
      hero = updateFactionSkills({ ...next, bonusSkeletons });
      lastBattle = { xp: gained, levels };
      void saveHero(hero);

      if (activeEncounter && campaign) {
        lastReward = { xp: gained, gold: activeEncounter.goldReward };
        campaign = advanceCampaign(campaign);
        void saveCampaign(campaign);
      }
    } else {
      lastBattle = { xp: 0, levels: 0 };
    }
  }

  // Leaving a battle lands on the result screen, which owns the choice of where
  // to go next. Forfeiting mid-battle has no outcome to show, so it skips ahead.
  function exitBattle() {
    if (lastOutcome) {
      screen = 'result';
      return;
    }
    activeEncounter = null;
    screen = 'setup';
  }

  // Both result exits clear activeEncounter: it marks "a fight is in flight", and
  // by here the encounter is resolved (advanceCampaign already ran in handleResult).
  function resultToSetup() {
    activeEncounter = null;
    lastOutcome = null;
    screen = 'setup';
  }

  function resultToCampaign() {
    activeEncounter = null;
    lastOutcome = null;
    screen = 'campaign';
  }

  function handleClass(cls: FactionClass) {
    hero = updateFactionSkills({ ...hero, class: cls });
    void saveHero(hero);
    // First-ever faction pick kicks off the campaign; later switches just change the roster.
    if (!campaign) {
      campaign = newCampaign();
      void saveCampaign(campaign);
      screen = 'campaign';
    }
  }

  // Spend an augment point on a unit type. The picker already filters to legal
  // options; this re-checks the invariants that matter (points, cap, dup).
  function handleAugment(unitName: string, augmentId: string) {
    const owned = hero.unitAugments?.[unitName] ?? [];
    if ((hero.augmentPoints ?? 0) <= 0) return;
    if (owned.length >= MAX_AUGMENTS_PER_UNIT || owned.includes(augmentId)) return;
    hero = {
      ...hero,
      augmentPoints: (hero.augmentPoints ?? 0) - 1,
      unitAugments: { ...(hero.unitAugments ?? {}), [unitName]: [...owned, augmentId] },
    };
    void saveHero(hero);
  }

  async function handleReset() {
    hero = { ...DEFAULT_HERO };
    lastBattle = null;
    lastReward = null;
    lastOutcome = null;
    campaign = null;
    activeEncounter = null;
    screen = 'setup';
    await resetHero();
    await resetCampaign();
  }

  function backToSetup() {
    activeEncounter = null;
    screen = 'setup';
  }
</script>

<main class="min-h-screen bg-slate-900 p-4 text-slate-100 sm:p-6">
  <div class="mb-4 flex items-center gap-4">
    <h1 class="text-2xl font-bold">Warlords</h1>
    <a href="/gauntlet" class="text-lg text-amber-400 hover:text-amber-300">🏰 Gauntlet mode →</a>
  </div>
  {#if screen === 'setup'}
    <ArmySetup {hero} {budget} {lastBattle} onstart={startBattle} onreset={handleReset} onclass={handleClass} onaugment={handleAugment} />
  {:else if screen === 'campaign' && campaign}
    <CampaignMap {hero} {campaign} onselect={selectEncounter} onback={backToSetup} />
  {:else if screen === 'result'}
    <div class="mx-auto mt-10 max-w-md rounded-lg border border-slate-700 bg-slate-800/60 p-6 text-center">
      <p class="text-3xl font-bold {lastOutcome === 'player_wins' ? 'text-amber-300' : 'text-red-400'}">
        {lastOutcome === 'player_wins' ? 'Victory!' : 'Defeat'}
      </p>
      {#if lastReward}
        <p class="mt-3 text-sm text-emerald-300">+{lastReward.gold} gold, +{lastReward.xp} XP</p>
      {:else if lastBattle && lastBattle.xp > 0}
        <p class="mt-3 text-sm text-emerald-300">+{lastBattle.xp} XP</p>
      {/if}
      {#if lastBattle && lastBattle.levels > 0}
        <p class="mt-1 text-sm font-semibold text-amber-300">
          Level up! Now level {hero.level}
        </p>
      {/if}
      <div class="mt-6 flex justify-center gap-3">
        <button
          type="button"
          class="rounded bg-slate-600 px-4 py-2 font-semibold text-white hover:bg-slate-500"
          onclick={resultToSetup}
        >
          Change army
        </button>
        {#if campaign}
          <button
            type="button"
            class="rounded bg-amber-600 px-4 py-2 font-semibold text-white hover:bg-amber-500"
            onclick={resultToCampaign}
          >
            Continue
          </button>
        {/if}
      </div>
    </div>
  {:else}
    {#key battleKey}
      <Battle
        {playerArmy}
        {enemyArmy}
        {hero}
        onexit={exitBattle}
        onresult={handleResult}
        allowRestart={!activeEncounter}
        exitLabel="Continue"
      />
    {/key}
  {/if}
</main>
