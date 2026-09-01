<script lang="ts">
  import { onMount } from 'svelte';
  import Battle from '$lib/ui/Battle.svelte';
  import EncounterSetup from '$lib/ui/EncounterSetup.svelte';
  import FactionSelect from '$lib/ui/FactionSelect.svelte';
  import CampaignMap from '$lib/ui/CampaignMap.svelte';
  import { recruitBudget, applyVictory } from '$lib/engine/progression';
  import { updateFactionSkills, necromancyBonusSkeletons } from '$lib/engine/factionSkills';
  import { SKELETON } from '$lib/engine/necromancer';
  import { loadHero, saveHero, resetHero, loadArmy, saveArmy, clearArmy, type SavedArmy } from '$lib/storage';
  import {
    loadCampaign,
    saveCampaign,
    resetCampaign,
    newCampaign,
    advanceCampaign,
    type CampaignState,
  } from '$lib/campaign/campaignStore';
  import { generateEnemyArmy as generateCampaignArmy, type Encounter } from '$lib/campaign/encounters';
  import { resetDiscovery } from '$lib/compendium/discovery';
  import type { ArmySlot, FactionClass, Hero } from '$lib/engine/types';

  const DEFAULT_HERO: Hero = updateFactionSkills({
    class: 'barbarian', level: 1, xp: 0, attack: 2, defense: 1, statPoints: 0, factionSkills: [], gold: 0,
  });

  let hero: Hero = $state({ ...DEFAULT_HERO });
  let lastBattle: { xp: number; levels: number } | null = $state(null);
  // The map is home; every other screen is a step out of it and back.
  let screen: 'faction' | 'map' | 'encounter' | 'battle' | 'result' = $state('faction');
  let campaign: CampaignState | null = $state(null);
  let activeEncounter: Encounter | null = $state(null);
  let lastReward: { xp: number; gold: number } | null = $state(null);
  let lastOutcome: 'player_wins' | 'enemy_wins' | null = $state(null);
  let playerArmy: ArmySlot[] = $state([]);
  let enemyArmy: ArmySlot[] = $state([]);
  let savedCounts: SavedArmy | null = $state(null);
  let battleKey = $state(0);

  const budget = $derived(recruitBudget(hero));

  onMount(async () => {
    const saved = await loadHero();
    // Migrate heroes persisted before faction skills / gold existed.
    if (saved) {
      hero = updateFactionSkills({ ...saved, factionSkills: saved.factionSkills ?? [], gold: saved.gold ?? 0 });
      savedCounts = await loadArmy();
      // Returning player: resume (or backfill) their campaign, locked to the
      // faction they are already playing, and go straight to the map.
      campaign = (await loadCampaign(hero.class)) ?? newCampaign(hero.class);
      hero = updateFactionSkills({ ...hero, class: campaign.faction });
      void saveCampaign(campaign);
      screen = 'map';
    }
  });

  // The one and only faction choice: it starts the campaign and is then fixed
  // for its lifetime. Changing it means resetting the hero.
  function chooseFaction(cls: FactionClass) {
    hero = updateFactionSkills({ ...DEFAULT_HERO, class: cls });
    void saveHero(hero);
    campaign = newCampaign(cls);
    void saveCampaign(campaign);
    screen = 'map';
  }

  function selectEncounter(encounter: Encounter) {
    activeEncounter = encounter;
    // Generated once here so the army previewed while recruiting is the very
    // one the battle fields.
    enemyArmy = generateCampaignArmy(encounter, hero.level);
    lastBattle = null;
    screen = 'encounter';
  }

  function startBattle(army: ArmySlot[]) {
    // Remember the picks so the next encounter's recruiting starts from them.
    savedCounts = Object.fromEntries(army.map(s => [s.unit.name, s.count]));
    void saveArmy(savedCounts);
    playerArmy = hero.bonusSkeletons
      ? [...army, { unit: SKELETON, count: hero.bonusSkeletons }]
      : army;
    if (hero.bonusSkeletons) {
      hero = { ...hero, bonusSkeletons: 0 };
      void saveHero(hero);
    }
    battleKey += 1;
    lastBattle = null;
    lastReward = null;
    lastOutcome = null;
    screen = 'battle';
  }

  function handleResult(result: 'player_wins' | 'enemy_wins') {
    lastOutcome = result;
    if (result === 'player_wins' && activeEncounter) {
      const gained = activeEncounter.xpReward;
      const { hero: next, levels } = applyVictory(hero, gained, activeEncounter.goldReward);
      const bonusSkeletons = (hero.bonusSkeletons ?? 0) + necromancyBonusSkeletons(hero, enemyArmy);
      hero = updateFactionSkills({ ...next, bonusSkeletons });
      lastBattle = { xp: gained, levels };
      lastReward = { xp: gained, gold: activeEncounter.goldReward };
      void saveHero(hero);

      if (campaign) {
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
    screen = 'map';
  }

  // A defeat leaves the node available, so the map is the retry route too: walk
  // back in and recruit again.
  function resultToMap() {
    activeEncounter = null;
    lastOutcome = null;
    screen = 'map';
  }

  async function handleReset() {
    hero = { ...DEFAULT_HERO };
    lastBattle = null;
    lastReward = null;
    lastOutcome = null;
    campaign = null;
    activeEncounter = null;
    savedCounts = null;
    screen = 'faction';
    await resetHero();
    await resetCampaign();
    await clearArmy();
    await resetDiscovery();
  }

  function handleArmyClear() {
    savedCounts = null;
    void clearArmy();
  }

  function backToMap() {
    activeEncounter = null;
    screen = 'map';
  }
</script>

<main class="min-h-screen bg-slate-900 p-4 text-slate-100 sm:p-6">
  <div class="mb-4 flex items-center gap-4">
    <a href="/legacy" class="text-lg text-slate-400 hover:text-slate-200">← Hub</a>
    <h1 class="text-2xl font-bold">Campaign</h1>
    <a href="/history" class="text-lg text-violet-400 hover:text-violet-300">🎬 Battle history →</a>
  </div>
  {#if screen === 'faction'}
    <FactionSelect onchoose={chooseFaction} />
  {:else if screen === 'map' && campaign}
    <CampaignMap {hero} {campaign} onselect={selectEncounter} onreset={handleReset} />
  {:else if screen === 'encounter' && activeEncounter}
    <EncounterSetup
      {hero}
      {budget}
      {enemyArmy}
      encounter={activeEncounter}
      initialCounts={savedCounts}
      onstart={startBattle}
      onback={backToMap}
      onclear={handleArmyClear}
    />
  {:else if screen === 'result'}
    <div class="mx-auto mt-10 max-w-md rounded-lg border border-slate-700 bg-slate-800/60 p-6 text-center">
      <p class="text-3xl font-bold {lastOutcome === 'player_wins' ? 'text-amber-300' : 'text-red-400'}">
        {lastOutcome === 'player_wins' ? 'Victory!' : 'Defeat'}
      </p>
      {#if lastReward}
        <p class="mt-3 text-sm text-emerald-300">+{lastReward.gold} gold, +{lastReward.xp} XP</p>
      {/if}
      {#if lastBattle && lastBattle.levels > 0}
        <p class="mt-1 text-sm font-semibold text-amber-300">
          Level up! Now level {hero.level}
        </p>
      {/if}
      {#if lastOutcome === 'enemy_wins'}
        <p class="mt-3 text-sm text-slate-400">The encounter still stands — regroup and march on it again.</p>
      {/if}
      <div class="mt-6 flex justify-center">
        <button
          type="button"
          class="rounded bg-amber-600 px-5 py-2 font-semibold text-white hover:bg-amber-500"
          onclick={resultToMap}
        >
          Continue
        </button>
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
        allowRestart={false}
        exitLabel="Continue"
      />
    {/key}
  {/if}
</main>
