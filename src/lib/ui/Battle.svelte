<script lang="ts">
  import { initBattle, applyAction } from '$lib/engine/battle';
  import { aiTakeTurn } from '$lib/engine/ai';
  import { getReachableCells, getMeleeTargets, canShoot } from '$lib/engine/selectors';
  import type {
    ArmySlot,
    BattleEvent,
    BattleState,
    Hero,
    Pos,
    UnitStack,
  } from '$lib/engine/types';
  import BattleGrid from './BattleGrid.svelte';
  import TurnBar from './TurnBar.svelte';
  import BattleLog from './BattleLog.svelte';

  interface Props {
    playerArmy: ArmySlot[];
    enemyArmy: ArmySlot[];
    hero: Hero;
  }

  let { playerArmy, enemyArmy, hero }: Props = $props();

  const AI_DELAY_MS = 450;

  // A battle snapshots its armies at start; later prop changes are irrelevant.
  // svelte-ignore state_referenced_locally
  let state: BattleState = $state(initBattle(playerArmy, enemyArmy, hero));

  const activeUnit = $derived(state.units.find(u => u.id === state.currentUnitId) ?? null);
  const isPlayerTurn = $derived(
    state.result === 'ongoing' && activeUnit !== null && activeUnit.side === 'player'
  );

  const reachableKeys = $derived(
    isPlayerTurn && activeUnit
      ? new Set(getReachableCells(state.grid, activeUnit).map(p => `${p.col},${p.row}`))
      : new Set<string>()
  );

  const meleeTargetIds = $derived(
    isPlayerTurn && activeUnit
      ? new Set(getMeleeTargets(state, activeUnit).map(u => u.id))
      : new Set<string>()
  );

  const targetIds = $derived.by(() => {
    if (!isPlayerTurn || !activeUnit) return new Set<string>();
    const ids = new Set(meleeTargetIds);
    if (canShoot(activeUnit)) {
      for (const u of state.units) {
        if (u.side === 'enemy' && u.count > 0) ids.add(u.id);
      }
    }
    return ids;
  });

  // Enemy turns play automatically, one action at a time, so the player can follow.
  $effect(() => {
    if (state.result !== 'ongoing') return;
    const unit = state.units.find(u => u.id === state.currentUnitId);
    if (!unit || unit.side !== 'enemy') return;
    const timer = setTimeout(() => {
      state = applyAction(state, aiTakeTurn(state, unit.id));
    }, AI_DELAY_MS);
    return () => clearTimeout(timer);
  });

  function handleCellClick(pos: Pos) {
    if (!isPlayerTurn) return;
    if (!reachableKeys.has(`${pos.col},${pos.row}`)) return;
    state = applyAction(state, { type: 'move', to: pos });
  }

  function handleUnitClick(unit: UnitStack) {
    if (!isPlayerTurn || !activeUnit || unit.side === 'player') return;
    if (meleeTargetIds.has(unit.id)) {
      state = applyAction(state, { type: 'attack', targetId: unit.id });
    } else if (canShoot(activeUnit)) {
      state = applyAction(state, { type: 'shoot', targetId: unit.id });
    }
  }

  function handleWait() {
    if (!isPlayerTurn) return;
    state = applyAction(state, { type: 'wait' });
  }

  function restart() {
    state = initBattle(playerArmy, enemyArmy, hero, Date.now());
  }

  function unitLabel(id: unknown): string {
    const u = state.units.find(u => u.id === id);
    if (!u) return 'a unit';
    return `${u.side === 'enemy' ? 'enemy ' : ''}${u.definition.name}s`;
  }

  function describe(ev: BattleEvent): string {
    const d = ev.data;
    switch (ev.type) {
      case 'round_start':
        return `— Round ${d.round} —`;
      case 'move':
        return `${unitLabel(d.unitId)} move to (${(d.to as Pos).col}, ${(d.to as Pos).row}).`;
      case 'attack':
        return `${unitLabel(d.attackerId)} strike ${unitLabel(d.targetId)} for ${d.damage} damage, killing ${d.killed}.`;
      case 'retaliate':
        return `${unitLabel(d.attackerId)} retaliate against ${unitLabel(d.targetId)} for ${d.damage} damage, killing ${d.killed}.`;
      case 'shoot':
        return `${unitLabel(d.attackerId)} shoot ${unitLabel(d.targetId)} for ${d.damage} damage, killing ${d.killed}.`;
      case 'death':
        return `${unitLabel(d.unitId)} are wiped out!`;
      case 'morale_boost':
        return `High morale! ${unitLabel(d.unitId)} act again.`;
      case 'morale_freeze':
        return `Low morale — ${unitLabel(d.unitId)} freeze and skip their turn.`;
      case 'battle_end':
        return 'The battle is over.';
      default:
        return ev.type;
    }
  }

  const logLines = $derived(state.log.map(describe));

  const statusText = $derived.by(() => {
    if (state.result === 'player_wins') return 'Victory!';
    if (state.result === 'enemy_wins') return 'Defeat…';
    if (!activeUnit) return '';
    if (isPlayerTurn) {
      const hints = ['click a green cell to move'];
      if (meleeTargetIds.size > 0) hints.push('click an adjacent enemy to attack');
      if (canShoot(activeUnit)) hints.push(`click any enemy to shoot (${activeUnit.shotsLeft} left)`);
      return `Your ${activeUnit.definition.name}s' turn — ${hints.join(', ')}.`;
    }
    return `Enemy ${activeUnit.definition.name}s are acting…`;
  });
</script>

<div class="flex flex-col gap-4 lg:flex-row">
  <div class="relative min-w-0 flex-1">
    <BattleGrid
      {state}
      {reachableKeys}
      {targetIds}
      activeId={state.currentUnitId}
      interactive={isPlayerTurn}
      oncellclick={handleCellClick}
      onunitclick={handleUnitClick}
    />

    <div class="mt-2 flex items-center gap-3">
      <button
        type="button"
        class="rounded bg-slate-700 px-3 py-1.5 text-sm font-medium text-slate-100
          hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={!isPlayerTurn}
        onclick={handleWait}
      >
        Wait
      </button>
      <p class="text-sm text-slate-300">{statusText}</p>
    </div>

    {#if state.result !== 'ongoing'}
      <div
        class="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-lg bg-black/70"
      >
        <p class="text-4xl font-bold {state.result === 'player_wins' ? 'text-amber-300' : 'text-red-400'}">
          {state.result === 'player_wins' ? 'Victory!' : 'Defeat'}
        </p>
        <button
          type="button"
          class="rounded bg-amber-600 px-4 py-2 font-semibold text-white hover:bg-amber-500"
          onclick={restart}
        >
          New battle
        </button>
      </div>
    {/if}
  </div>

  <div class="flex w-full shrink-0 flex-col gap-4 lg:w-56">
    <TurnBar {state} />
    <BattleLog lines={logLines} />
  </div>
</div>
