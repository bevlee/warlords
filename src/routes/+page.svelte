<script lang="ts">
  import { onMount } from 'svelte';
  import Battle from '$lib/ui/Battle.svelte';
  import ArmySetup from '$lib/ui/ArmySetup.svelte';
  import { generateEnemyArmy, armyCost } from '$lib/engine/recruit';
  import { budgetForLevel, applyXp } from '$lib/engine/progression';
  import { mulberry32 } from '$lib/engine/rng';
  import { loadHero, saveHero, resetHero } from '$lib/storage';
  import type { ArmySlot, Hero } from '$lib/engine/types';

  const DEFAULT_HERO: Hero = { class: 'barbarian', level: 1, xp: 0, attack: 2, defense: 1, statPoints: 0 };

  let hero: Hero = $state({ ...DEFAULT_HERO });
  let lastBattle: { xp: number; levels: number } | null = $state(null);
  let screen: 'setup' | 'battle' = $state('setup');
  let playerArmy: ArmySlot[] = $state([]);
  let enemyArmy: ArmySlot[] = $state([]);
  let battleKey = $state(0);

  const budget = $derived(budgetForLevel(hero.level));

  onMount(async () => {
    const saved = await loadHero();
    if (saved) hero = saved;
  });

  function startBattle(army: ArmySlot[]) {
    playerArmy = army;
    enemyArmy = generateEnemyArmy(budget, mulberry32(Date.now() % 2 ** 31));
    battleKey += 1;
    lastBattle = null;
    screen = 'battle';
  }

  function handleResult(result: 'player_wins' | 'enemy_wins') {
    if (result === 'player_wins') {
      const gained = armyCost(enemyArmy);
      const { hero: next, levels } = applyXp(hero, gained);
      hero = next;
      lastBattle = { xp: gained, levels };
      void saveHero(hero);
    } else {
      lastBattle = { xp: 0, levels: 0 };
    }
  }

  async function handleReset() {
    hero = { ...DEFAULT_HERO };
    lastBattle = null;
    await resetHero();
  }
</script>

<main class="min-h-screen bg-slate-900 p-4 text-slate-100 sm:p-6">
  <h1 class="mb-4 text-2xl font-bold">Warlords</h1>
  {#if screen === 'setup'}
    <ArmySetup {hero} {budget} {lastBattle} onstart={startBattle} onreset={handleReset} />
  {:else}
    {#key battleKey}
      <Battle
        {playerArmy}
        {enemyArmy}
        {hero}
        onexit={() => (screen = 'setup')}
        onresult={handleResult}
      />
    {/key}
  {/if}
</main>
