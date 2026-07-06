<script lang="ts">
  import Battle from '$lib/ui/Battle.svelte';
  import { GOBLIN, WOLF_RIDER, ORC, OGRE } from '$lib/engine/barbarian';
  import type { ArmySlot, Hero } from '$lib/engine/types';

  const hero: Hero = { class: 'barbarian', level: 1, xp: 0, attack: 2, defense: 1, statPoints: 0 };

  const playerArmy: ArmySlot[] = [
    { unit: GOBLIN, count: 20 },
    { unit: WOLF_RIDER, count: 10 },
    { unit: ORC, count: 8 },
    { unit: OGRE, count: 3 },
  ];

  const enemyArmy: ArmySlot[] = [
    { unit: GOBLIN, count: 30 },
    { unit: WOLF_RIDER, count: 8 },
    { unit: ORC, count: 6 },
  ];
</script>

<main class="min-h-screen bg-slate-900 p-4 text-slate-100 sm:p-6">
  <h1 class="mb-4 text-2xl font-bold">Warlords</h1>
  <Battle {playerArmy} {enemyArmy} {hero} />
</main>
