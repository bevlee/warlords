<script lang="ts">
  import { onMount } from 'svelte';
  import Battle from '$lib/ui/Battle.svelte';
  import ArmySetup from '$lib/ui/ArmySetup.svelte';
  import CampaignMap from '$lib/ui/CampaignMap.svelte';
  import { generateEnemyArmy, armyCost } from '$lib/engine/recruit';
  import { budgetForLevel, applyXp } from '$lib/engine/progression';
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
  });

  let hero: Hero = $state({ ...DEFAULT_HERO });
  let lastBattle: { xp: number; levels: number } | null = $state(null);
  let screen: 'setup' | 'campaign' | 'battle' = $state('setup');
  let campaign: CampaignState | null = $state(null);
  let activeEncounter: Encounter | null = $state(null);
  let lastReward: { xp: number; gold: number } | null = $state(null);
  let playerArmy: ArmySlot[] = $state([]);
  let enemyArmy: ArmySlot[] = $state([]);
  let battleKey = $state(0);

  const budget = $derived(budgetForLevel(hero.level));

  onMount(async () => {
    const saved = await loadHero();
    // Migrate heroes persisted before faction skills existed.
    if (saved) {
      hero = updateFactionSkills({ ...saved, factionSkills: saved.factionSkills ?? [] });
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
    playerArmy = hero.bonusSkeletons
      ? [...army, { unit: SKELETON, count: hero.bonusSkeletons }]
      : army;
    if (hero.bonusSkeletons) {
      hero = { ...hero, bonusSkeletons: 0 };
      void saveHero(hero);
    }
    enemyArmy = activeEncounter
      ? generateCampaignArmy(activeEncounter, hero.level)
      : generateEnemyArmy(budget, mulberry32(Date.now() % 2 ** 31));
    battleKey += 1;
    lastBattle = null;
    lastReward = null;
    screen = 'battle';
  }

  function handleResult(result: 'player_wins' | 'enemy_wins') {
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

  function exitBattle() {
    screen = activeEncounter ? 'campaign' : 'setup';
    activeEncounter = null;
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

  async function handleReset() {
    hero = { ...DEFAULT_HERO };
    lastBattle = null;
    lastReward = null;
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
  <h1 class="mb-4 text-2xl font-bold">Warlords</h1>
  {#if screen === 'setup'}
    <ArmySetup {hero} {budget} {lastBattle} onstart={startBattle} onreset={handleReset} onclass={handleClass} />
  {:else if screen === 'campaign' && campaign}
    <CampaignMap {hero} {campaign} onselect={selectEncounter} onback={backToSetup} />
    {#if lastReward}
      <p class="mx-auto mt-3 max-w-4xl text-center text-sm text-emerald-300">
        Victory! +{lastReward.gold} gold, +{lastReward.xp} XP
      </p>
    {/if}
  {:else}
    {#key battleKey}
      <Battle
        {playerArmy}
        {enemyArmy}
        {hero}
        onexit={exitBattle}
        onresult={handleResult}
      />
    {/key}
  {/if}
</main>
