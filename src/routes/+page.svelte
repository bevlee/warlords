<script lang="ts">
  import { onMount } from 'svelte';
  import { initBattle, applyAction, checkBattleEnd } from '$lib/engine/battle';
  import { aiTakeTurn } from '$lib/engine/ai';
  import { GOBLIN, WOLF_RIDER, ORC } from '$lib/engine/barbarian';
  import type { Hero, BattleState } from '$lib/engine/types';

  let log: string[] = $state([]);

  onMount(() => {
    const hero: Hero = { class: 'barbarian', level: 1, xp: 0, attack: 8, defense: 4, statPoints: 0 };
    let state: BattleState = initBattle(
      [{ unit: WOLF_RIDER, count: 10 }, { unit: ORC, count: 5 }],
      [{ unit: GOBLIN, count: 30 }, { unit: WOLF_RIDER, count: 8 }],
      hero,
      12345
    );

    log = ['Battle started!'];
    let turns = 0;

    while (state.result === 'ongoing' && turns < 500) {
      const unitId = state.currentUnitId;
      if (!unitId) break;
      const unit = state.units.find(u => u.id === unitId);
      if (!unit) break;

      const action = aiTakeTurn(state, unitId);
      state = applyAction(state, action);
      turns++;
    }

    log = [...log, `Battle ended after ${turns} turns: ${state.result}`];
    log = [...log, ...state.log.slice(-10).map(e => `${e.type}: ${JSON.stringify(e.data)}`)];
    console.log('Battle result:', state.result, state.log);
  });
</script>

<main class="p-8">
  <h1 class="text-3xl font-bold mb-4">Warlords — Engine Demo</h1>
  {#each log as line}
    <p class="font-mono text-sm">{line}</p>
  {/each}
</main>
