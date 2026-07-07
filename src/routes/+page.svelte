<script lang="ts">
  import Battle from '$lib/ui/Battle.svelte';
  import ArmySetup from '$lib/ui/ArmySetup.svelte';
  import { generateEnemyArmy, DEFAULT_BUDGET } from '$lib/engine/recruit';
  import { mulberry32 } from '$lib/engine/rng';
  import type { ArmySlot, Hero } from '$lib/engine/types';

  const hero: Hero = { class: 'barbarian', level: 1, xp: 0, attack: 2, defense: 1, statPoints: 0 };

  let screen: 'setup' | 'battle' = $state('setup');
  let playerArmy: ArmySlot[] = $state([]);
  let enemyArmy: ArmySlot[] = $state([]);
  let battleKey = $state(0);

  function startBattle(army: ArmySlot[]) {
    playerArmy = army;
    enemyArmy = generateEnemyArmy(DEFAULT_BUDGET, mulberry32(Date.now() % 2 ** 31));
    battleKey += 1;
    screen = 'battle';
  }
</script>

<main class="min-h-screen bg-slate-900 p-4 text-slate-100 sm:p-6">
  <h1 class="mb-4 text-2xl font-bold">Warlords</h1>
  {#if screen === 'setup'}
    <ArmySetup onstart={startBattle} />
  {:else}
    {#key battleKey}
      <Battle {playerArmy} {enemyArmy} {hero} onexit={() => (screen = 'setup')} />
    {/key}
  {/if}
</main>
