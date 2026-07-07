<script lang="ts">
  import { initBattle, applyAction, SPELLS } from '$lib/engine/battle';
  import { aiTakeTurn } from '$lib/engine/ai';
  import {
    getReachableCells,
    getMeleeApproaches,
    getAttackOrigins,
    canShoot,
    canShootTarget,
    isShootingBlocked,
    damagePreview,
  } from '$lib/engine/selectors';
  import type {
    ArmySlot,
    BattleEvent,
    BattleState,
    Hero,
    Pos,
    SpellId,
    UnitStack,
  } from '$lib/engine/types';
  import BattleGrid from './BattleGrid.svelte';
  import TurnBar from './TurnBar.svelte';
  import BattleLog from './BattleLog.svelte';
  import UnitInfo from './UnitInfo.svelte';
  import Sprite from './Sprite.svelte';

  interface Props {
    playerArmy: ArmySlot[];
    enemyArmy: ArmySlot[];
    hero: Hero;
    onexit?: () => void;
    onresult?: (result: 'player_wins' | 'enemy_wins', finalUnits: UnitStack[]) => void;
    allowRestart?: boolean;
    exitLabel?: string;
  }

  let {
    playerArmy,
    enemyArmy,
    hero,
    onexit,
    onresult,
    allowRestart = true,
    exitLabel = 'Change army',
  }: Props = $props();

  const AI_SPEEDS = { slow: 900, normal: 450, fast: 150 } as const;
  type BattleSpeed = keyof typeof AI_SPEEDS;
  let battleSpeed: BattleSpeed = $state('normal');
  const AI_DELAY_MS = $derived(AI_SPEEDS[battleSpeed]);

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

  const isHeroTurn = $derived(isPlayerTurn && !!activeUnit?.isHero);

  const SPELL_META: Record<SpellId, { glyph: string; label: string }> = {
    lightning: { glyph: '⚡', label: 'Lightning' },
    bloodlust: { glyph: '💪', label: 'Bloodlust' },
    stoneskin: { glyph: '🗿', label: 'Stoneskin' },
  };

  // Spell targeting: pick a spell on the hero's turn, then click a stack.
  let pendingSpell: SpellId | null = $state(null);
  const spellTargetIds = $derived.by(() => {
    if (!pendingSpell || !isHeroTurn) return null;
    const friendly = SPELLS[pendingSpell].friendly;
    return new Set(
      battle.units
        .filter(u => u.count > 0 && !u.isHero && (friendly ? u.side === 'player' : u.side === 'enemy'))
        .map(u => u.id)
    );
  });

  // What the grid highlights: spell targeting overrides attack targeting.
  const gridTargetIds = $derived(spellTargetIds ?? targetIds);
  const gridActionIcons = $derived.by(() => {
    if (!spellTargetIds) return actionIcons;
    const icons = new Map<string, 'melee' | 'shoot' | 'spell'>();
    for (const id of spellTargetIds) icons.set(id, 'spell');
    return icons;
  });

  // Aim-by-cursor melee (LordsWM): every attack origin per target, so the grid
  // can pick the landing tile from the cursor angle.
  const originsByTarget = $derived.by(() => {
    const map = new Map<string, Pos[]>();
    if (!isPlayerTurn || !activeUnit) return map;
    for (const u of battle.units) {
      if (u.side !== 'enemy' || u.count === 0 || u.isHero) continue;
      if (!meleeApproaches.has(u.id)) continue;
      map.set(u.id, getAttackOrigins(battle, activeUnit, u));
    }
    return map;
  });

  // Damage forecast for the aiming tooltip.
  const previews = $derived.by(() => {
    const map = new Map<string, ReturnType<typeof damagePreview>>();
    if (!isPlayerTurn || !activeUnit) return map;
    for (const id of actionIcons.keys()) {
      const target = battle.units.find(u => u.id === id);
      if (target) map.set(id, damagePreview(activeUnit, target, hero.attack));
    }
    return map;
  });

  let hovered: UnitStack | null = $state(null);
  const infoUnit = $derived.by(() => {
    const fresh = hovered ? battle.units.find(u => u.id === hovered!.id && u.count > 0) : undefined;
    return fresh ?? activeUnit;
  });

  // Spell selection is per-turn state: whoever acts next starts clean.
  $effect(() => {
    void battle.currentUnitId;
    pendingSpell = null;
  });

  // Announce each battle's result exactly once (re-armed by restart()).
  let resultAnnounced = false;
  $effect(() => {
    if (battle.result !== 'ongoing' && !resultAnnounced) {
      resultAnnounced = true;
      onresult?.(battle.result, $state.snapshot(battle).units as UnitStack[]);
    }
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
    hovered = null;
  }

  function castAt(unit: UnitStack) {
    if (!pendingSpell) return;
    battle = applyAction(battle, { type: 'cast', spell: pendingSpell, targetId: unit.id });
    pendingSpell = null;
    hovered = null;
  }

  function handleCellClick(pos: Pos) {
    if (!isPlayerTurn) return;
    if (pendingSpell) {
      pendingSpell = null; // clicking empty ground cancels the cast
      return;
    }
    if (!reachableKeys.has(`${pos.col},${pos.row}`)) return;
    battle = applyAction(battle, { type: 'move', to: pos });
  }

  // The grid resolved an aimed melee: move to the chosen tile and strike.
  function handleMeleeAim(targetId: string, origin: Pos) {
    if (!isPlayerTurn || !activeUnit) return;
    attackFrom(targetId, origin);
  }

  function handleUnitClick(unit: UnitStack, _shift = false) {
    if (!isPlayerTurn || !activeUnit) return;

    if (pendingSpell) {
      if (spellTargetIds?.has(unit.id)) castAt(unit);
      else pendingSpell = null;
      return;
    }

    if (unit.side === 'player') return;

    const action = actionIcons.get(unit.id);
    if (action === 'shoot') {
      battle = applyAction(battle, { type: 'shoot', targetId: unit.id });
      hovered = null;
    } else if (action === 'melee') {
      // Fallback for non-mouse activation (keyboard): nearest origin.
      const origins = originsByTarget.get(unit.id);
      if (origins?.length) attackFrom(unit.id, origins[0]);
    }
  }

  function handleWait() {
    if (!isPlayerTurn) return;
    pendingSpell = null;
    battle = applyAction(battle, { type: 'wait' });
  }

  function handleDefend() {
    if (!isPlayerTurn) return;
    pendingSpell = null;
    battle = applyAction(battle, { type: 'defend' });
  }

  function handleForfeit() {
    if (battle.result !== 'ongoing') return;
    pendingSpell = null;
    battle = { ...battle, result: 'enemy_wins', log: [...battle.log, { type: 'battle_end', data: { result: 'enemy_wins', forfeit: true } }] };
  }

  function restart() {
    pendingSpell = null;
    resultAnnounced = false;
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
      case 'cast':
        return d.spell === 'lightning'
          ? `Your hero casts Lightning at ${unitLabel(d.targetId)} for ${d.damage} damage, killing ${d.killed}.`
          : `Your hero casts ${SPELL_META[d.spell as SpellId].label} on ${unitLabel(d.targetId)}.`;
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
      case 'status': {
        const label = unitLabel(d.unitId);
        switch (d.effect) {
          case 'life_drain': return `${label} drain ${d.heal} HP of life.`;
          case 'slow': return `${label} are slowed.`;
          case 'drain_morale': return `${label} morale is drained.`;
          case 'blind': return `${label} are blinded and skip their turn.`;
          case 'burn_apply': return `${label} catch fire.`;
          case 'burn': return `${label} burn for ${d.damage} damage.`;
          case 'bind': return `${label} are bound in place.`;
          case 'bind_block': return `${label} strain against their bindings and cannot move.`;
          default: return `${label} are affected by ${d.effect}.`;
        }
      }
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
    if (pendingSpell) {
      const friendly = SPELLS[pendingSpell].friendly;
      return `Casting ${SPELL_META[pendingSpell].label} — click ${friendly ? 'one of your stacks' : 'an enemy'}, or click elsewhere to cancel.`;
    }
    if (isPlayerTurn && activeUnit.isHero) {
      return 'Your hero\'s turn — click any enemy to strike, or cast a spell.';
    }
    if (isPlayerTurn) {
      const hints = ['highlighted cell to move'];
      if ([...actionIcons.values()].includes('melee')) hints.push('⚔️ enemy to attack (aim picks your tile)');
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
          <Sprite name="Hero" class="h-12 w-10" />
          <span class="text-[10px] font-semibold uppercase tracking-wide text-amber-200">Hero</span>
          <span class="font-mono text-[10px] text-slate-300">⚔{hero.attack} 🛡{hero.defense}</span>
          <span class="font-mono text-[10px] text-sky-300">💧{battle.hero.mana ?? 0}</span>
          <span class="font-mono text-[10px] text-slate-400">Lv {hero.level}</span>
        </button>
      {/if}
      <div class="min-w-0 flex-1">
        <BattleGrid
          state={battle}
          reachableKeys={pendingSpell ? new Set() : reachableKeys}
          targetIds={gridTargetIds}
          activeId={battle.currentUnitId}
          interactive={isPlayerTurn}
          actionIcons={gridActionIcons}
          originsByTarget={pendingSpell ? new Map() : originsByTarget}
          {previews}
          hoveredId={hovered?.id ?? null}
          oncellclick={handleCellClick}
          onunitclick={handleUnitClick}
          onmeleeaim={handleMeleeAim}
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
      <button
        type="button"
        class="rounded bg-red-900 px-3 py-1.5 text-sm font-medium text-red-100
          hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={battle.result !== 'ongoing'}
        onclick={handleForfeit}
      >
        Forfeit
      </button>
      <div class="flex items-center gap-1 rounded bg-slate-800 p-0.5" role="group" aria-label="battle speed">
        {#each Object.keys(AI_SPEEDS) as speed (speed)}
          <button
            type="button"
            class="rounded px-2 py-1 text-xs font-medium capitalize
              {battleSpeed === speed ? 'bg-slate-600 text-slate-100' : 'text-slate-400 hover:text-slate-200'}"
            onclick={() => (battleSpeed = speed as BattleSpeed)}
          >
            {speed}
          </button>
        {/each}
      </div>
      {#if isHeroTurn}
        {#each Object.entries(SPELL_META) as [id, meta] (id)}
          {@const spellId = id as SpellId}
          <button
            type="button"
            class="rounded px-3 py-1.5 text-sm font-medium text-slate-100
              disabled:cursor-not-allowed disabled:opacity-40
              {pendingSpell === spellId ? 'bg-violet-600 ring-2 ring-violet-300' : 'bg-violet-900 hover:bg-violet-700'}"
            disabled={(battle.hero.mana ?? 0) < SPELLS[spellId].cost}
            onclick={() => (pendingSpell = pendingSpell === spellId ? null : spellId)}
          >
            {meta.glyph} {meta.label} ({SPELLS[spellId].cost})
          </button>
        {/each}
      {/if}
      <p class="text-sm text-slate-300">{statusText}</p>
    </div>

    {#if battle.result !== 'ongoing'}
      <div
        class="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 rounded-lg bg-black/70"
      >
        <p class="text-4xl font-bold {battle.result === 'player_wins' ? 'text-amber-300' : 'text-red-400'}">
          {battle.result === 'player_wins' ? 'Victory!' : 'Defeat'}
        </p>
        <div class="flex gap-3">
          {#if allowRestart}
            <button
              type="button"
              class="rounded bg-amber-600 px-4 py-2 font-semibold text-white hover:bg-amber-500"
              onclick={restart}
            >
              New battle
            </button>
          {/if}
          {#if onexit}
            <button
              type="button"
              class="rounded bg-amber-600 px-4 py-2 font-semibold text-white hover:bg-amber-500"
              onclick={onexit}
            >
              {exitLabel}
            </button>
          {/if}
        </div>
      </div>
    {/if}
  </div>

  <div class="flex w-full shrink-0 flex-col gap-4 lg:w-56">
    <UnitInfo unit={infoUnit} />
    <BattleLog lines={logLines} />
  </div>
</div>
