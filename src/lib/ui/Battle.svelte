<script lang="ts">
  import { initBattle, applyAction } from '$lib/engine/battle';
  import { aiTakeTurn } from '$lib/engine/ai';
  import {
    getReachableCells,
    getMeleeApproaches,
    getAttackOrigins,
    canShoot,
    canShootTarget,
    isShootingBlocked,
  } from '$lib/engine/selectors';
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
  import UnitInfo from './UnitInfo.svelte';

  interface Props {
    playerArmy: ArmySlot[];
    enemyArmy: ArmySlot[];
    hero: Hero;
  }

  let { playerArmy, enemyArmy, hero }: Props = $props();

  const AI_DELAY_MS = 450;

  // A battle snapshots its armies at start; later prop changes are irrelevant.
  // svelte-ignore state_referenced_locally
  let battle: BattleState = $state(initBattle(playerArmy, enemyArmy, hero));

  const activeUnit = $derived(battle.units.find(u => u.id === battle.currentUnitId) ?? null);
  const heroUnit = $derived(battle.units.find(u => u.isHero) ?? null);
  const isPlayerTurn = $derived(
    battle.result === 'ongoing' && activeUnit !== null && activeUnit.side === 'player'
  );

  const reachableKeys = $derived(
    isPlayerTurn && activeUnit
      ? new Set(getReachableCells(battle.grid, activeUnit).map(p => `${p.col},${p.row}`))
      : new Set<string>()
  );

  const meleeApproaches = $derived(
    isPlayerTurn && activeUnit ? getMeleeApproaches(battle, activeUnit) : new Map<string, null>()
  );

  const shootingBlocked = $derived(
    isPlayerTurn && activeUnit ? canShoot(activeUnit) && isShootingBlocked(battle, activeUnit) : false
  );

  // What clicking each enemy does: adjacent melee > shoot in range > move+attack.
  // An adjacent enemy disables shooting entirely (LordsWM rule).
  const actionIcons = $derived.by(() => {
    const icons = new Map<string, 'melee' | 'shoot'>();
    if (!isPlayerTurn || !activeUnit) return icons;
    for (const u of battle.units) {
      if (u.side !== 'enemy' || u.count === 0) continue;
      if (meleeApproaches.get(u.id) === null) icons.set(u.id, 'melee');
      else if (!shootingBlocked && canShootTarget(activeUnit, u)) icons.set(u.id, 'shoot');
      else if (meleeApproaches.has(u.id)) icons.set(u.id, 'melee');
    }
    return icons;
  });

  const targetIds = $derived(new Set(actionIcons.keys()));

  // Two-step melee: click an enemy, then choose which tile to attack from.
  let meleeTarget: UnitStack | null = $state(null);
  const pendingTarget = $derived(
    meleeTarget && isPlayerTurn
      ? (battle.units.find(u => u.id === meleeTarget!.id && u.count > 0) ?? null)
      : null
  );
  const attackOrigins = $derived(
    pendingTarget && activeUnit ? getAttackOrigins(battle, activeUnit, pendingTarget) : []
  );
  const attackFromKeys = $derived(new Set(attackOrigins.map(p => `${p.col},${p.row}`)));

  let hovered: UnitStack | null = $state(null);
  const infoUnit = $derived.by(() => {
    const fresh = hovered ? battle.units.find(u => u.id === hovered!.id && u.count > 0) : undefined;
    return fresh ?? activeUnit;
  });

  // Targeting is per-turn state: whoever acts next starts without a selection.
  // Without this, a stale selection turns clicks on that enemy into no-ops
  // for actors that can't melee it (empty attack origins short-circuit).
  $effect(() => {
    void battle.currentUnitId;
    meleeTarget = null;
  });

  // Enemy turns play automatically, one action at a time, so the player can follow.
  $effect(() => {
    if (battle.result !== 'ongoing') return;
    const unit = battle.units.find(u => u.id === battle.currentUnitId);
    if (!unit || unit.side !== 'enemy') return;
    const timer = setTimeout(() => {
      battle = applyAction(battle, aiTakeTurn(battle, unit.id));
    }, AI_DELAY_MS);
    return () => clearTimeout(timer);
  });

  function attackFrom(targetId: string, origin: Pos) {
    const inPlace = activeUnit && origin.col === activeUnit.pos.col && origin.row === activeUnit.pos.row;
    battle = applyAction(
      battle,
      inPlace ? { type: 'attack', targetId } : { type: 'attack', targetId, moveTo: origin }
    );
    meleeTarget = null;
    hovered = null;
  }

  function handleCellClick(pos: Pos) {
    if (!isPlayerTurn) return;
    if (pendingTarget) {
      if (attackFromKeys.has(`${pos.col},${pos.row}`)) attackFrom(pendingTarget.id, pos);
      else meleeTarget = null; // clicking elsewhere cancels targeting
      return;
    }
    if (!reachableKeys.has(`${pos.col},${pos.row}`)) return;
    battle = applyAction(battle, { type: 'move', to: pos });
  }

  function handleUnitClick(unit: UnitStack, shift = false) {
    if (!isPlayerTurn || !activeUnit) return;

    if (unit.side === 'player') {
      // Clicking your own active stack while targeting = attack in place.
      if (pendingTarget && unit.id === activeUnit.id && attackFromKeys.has(`${unit.pos.col},${unit.pos.row}`)) {
        attackFrom(pendingTarget.id, unit.pos);
      }
      return;
    }

    // Second click on the selected enemy = quick attack from the nearest tile.
    if (pendingTarget?.id === unit.id) {
      if (attackOrigins.length > 0) {
        attackFrom(unit.id, attackOrigins[0]);
        return;
      }
      meleeTarget = null; // unreachable selection: drop it and fall through
    }

    // Shift forces melee targeting even when a shot is available (LordsWM parity).
    if (shift && meleeApproaches.has(unit.id)) {
      meleeTarget = unit;
      return;
    }

    const action = actionIcons.get(unit.id);
    if (action === 'shoot') {
      battle = applyAction(battle, { type: 'shoot', targetId: unit.id });
      meleeTarget = null;
      hovered = null;
    } else if (action === 'melee') {
      meleeTarget = unit; // enter targeting: choose the tile to attack from
    } else {
      meleeTarget = null;
    }
  }

  function handleWait() {
    if (!isPlayerTurn) return;
    meleeTarget = null;
    battle = applyAction(battle, { type: 'wait' });
  }

  function handleDefend() {
    if (!isPlayerTurn) return;
    meleeTarget = null;
    battle = applyAction(battle, { type: 'defend' });
  }

  function restart() {
    meleeTarget = null;
    battle = initBattle(playerArmy, enemyArmy, hero, Date.now());
  }

  function unitLabel(id: unknown): string {
    const u = battle.units.find(u => u.id === id);
    if (!u) return 'a unit';
    if (u.isHero) return u.side === 'enemy' ? 'the enemy hero' : 'your hero';
    return `${u.side === 'enemy' ? 'enemy ' : ''}${u.definition.name}s`;
  }

  function describe(ev: BattleEvent): string {
    const d = ev.data;
    switch (ev.type) {
      case 'round_start':
        return `— Round ${d.round} —`;
      case 'move':
        return `${unitLabel(d.unitId)} move to (${(d.to as Pos).col}, ${(d.to as Pos).row}).`;
      case 'defend':
        return `${unitLabel(d.unitId)} brace for defense.`;
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

  const logLines = $derived(battle.log.map(describe));

  const statusText = $derived.by(() => {
    if (battle.result === 'player_wins') return 'Victory!';
    if (battle.result === 'enemy_wins') return 'Defeat…';
    if (!activeUnit) return '';
    if (pendingTarget) {
      return `Attacking enemy ${pendingTarget.definition.name}s — click a ⚔️ tile to attack from, or click elsewhere to cancel.`;
    }
    if (isPlayerTurn && activeUnit.isHero) {
      return 'Your hero\'s turn — click any enemy to strike, or Wait.';
    }
    if (isPlayerTurn) {
      const hints = ['green cell to move'];
      if ([...actionIcons.values()].includes('melee')) hints.push('⚔️ enemy to attack');
      if (canShoot(activeUnit) && !shootingBlocked) {
        hints.push(`🏹 enemy to shoot (${activeUnit.shotsLeft} left)`);
      }
      const blockedNote = shootingBlocked ? ' Shooting blocked — enemy adjacent!' : '';
      return `Your ${activeUnit.definition.name}s' turn — click a ${hints.join(', ')}.${blockedNote}`;
    }
    return `Enemy ${activeUnit.definition.name}s are acting…`;
  });
</script>

<div class="flex flex-col gap-4 lg:flex-row">
  <div class="relative min-w-0 flex-1">
    <div class="flex items-stretch gap-2">
      {#if heroUnit && heroUnit.count > 0}
        <button
          type="button"
          class="flex w-16 shrink-0 flex-col items-center justify-center gap-1 self-center rounded-lg
            border border-slate-700 bg-slate-800 py-3 transition
            {heroUnit.id === battle.currentUnitId ? 'ring-2 ring-amber-300 shadow-lg shadow-amber-400/50' : ''}
            {heroUnit.id === hovered?.id ? 'brightness-125' : ''}"
          aria-label="Hero — level {hero.level}"
          onmouseenter={() => (hovered = heroUnit)}
          onmouseleave={() => (hovered = null)}
        >
          <span class="text-3xl leading-none">👑</span>
          <span class="text-[10px] font-semibold uppercase tracking-wide text-amber-200">Hero</span>
          <span class="font-mono text-[10px] text-slate-300">⚔{hero.attack} 🛡{hero.defense}</span>
          <span class="font-mono text-[10px] text-slate-400">Lv {hero.level}</span>
        </button>
      {/if}
      <div class="min-w-0 flex-1">
        <BattleGrid
          state={battle}
          reachableKeys={pendingTarget ? new Set() : reachableKeys}
          {targetIds}
          activeId={battle.currentUnitId}
          interactive={isPlayerTurn}
          {actionIcons}
          {attackFromKeys}
          pendingTargetId={pendingTarget?.id ?? null}
          hoveredId={hovered?.id ?? null}
          oncellclick={handleCellClick}
          onunitclick={handleUnitClick}
          onunithover={u => (hovered = u)}
        />
      </div>
    </div>

    <div class="relative z-10 mt-2">
      <TurnBar state={battle} hoveredId={hovered?.id ?? null} onhover={u => (hovered = u)} />
    </div>

    <div class="relative z-10 mt-2 flex items-center gap-3">
      <button
        type="button"
        class="rounded bg-slate-700 px-3 py-1.5 text-sm font-medium text-slate-100
          hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={!isPlayerTurn}
        onclick={handleWait}
      >
        Wait
      </button>
      <button
        type="button"
        class="rounded bg-slate-700 px-3 py-1.5 text-sm font-medium text-slate-100
          hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={!isPlayerTurn}
        onclick={handleDefend}
      >
        Defend
      </button>
      <p class="text-sm text-slate-300">{statusText}</p>
    </div>

    {#if battle.result !== 'ongoing'}
      <div
        class="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 rounded-lg bg-black/70"
      >
        <p class="text-4xl font-bold {battle.result === 'player_wins' ? 'text-amber-300' : 'text-red-400'}">
          {battle.result === 'player_wins' ? 'Victory!' : 'Defeat'}
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
    <UnitInfo unit={infoUnit} />
    <BattleLog lines={logLines} />
  </div>
</div>
