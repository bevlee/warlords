<script lang="ts">
  import { onMount } from 'svelte';
  import { initBattle, applyAction, spellPreview, SPELLS, isInDeployZone, deployMove, splitStack, beginCombat, heroFor } from '$lib/engine/battle';
  import { getTacticsShift } from '$lib/engine/factionSkills';
  import { aiTakeTurn } from '$lib/engine/ai';
  import {
    getReachableCells,
    getRangeCells,
    getMeleeApproaches,
    getAttackOrigins,
    canShoot,
    canShootTarget,
    isShootingBlocked,
    damagePreview,
  } from '$lib/engine/selectors';
  import type {
    ArmyBonuses,
    ArmySlot,
    BattleAction,
    BattleState,
    Hero,
    Pos,
    SpellId,
    UnitStack,
  } from '$lib/engine/types';
  import { describeEvent, SPELL_META } from './logLines';
  import BattleGrid from './BattleGrid.svelte';
  import TurnBar from './TurnBar.svelte';
  import UnitInfo from './UnitInfo.svelte';
  import ArtifactStrip from './ArtifactStrip.svelte';
  import type { ItemId } from '$lib/gauntlet/items';
  import Sprite from './Sprite.svelte';
  import SpellBook from './SpellBook.svelte';
  import GameLog from './GameLog.svelte';
  import { stepsFromLogEntry, applyLogEntry, deathIdsIn, type AnimStep } from './animSteps';
  import { createSoloBattleRecorder } from '$lib/replay/recording';
  import { postSoloBattle, type SoloController } from '$lib/net/api';

  interface Props {
    playerArmy: ArmySlot[];
    enemyArmy: ArmySlot[];
    hero: Hero;
    onexit?: () => void;
    onresult?: (result: 'player_wins' | 'enemy_wins', finalUnits: UnitStack[]) => void;
    allowRestart?: boolean;
    exitLabel?: string;
    armyBonuses?: ArmyBonuses;
    items?: ItemId[];
    initialState?: BattleState;
    localControllerId?: 'host' | 'guest';
    waitingForPeer?: boolean;
    chatMessages?: Array<{ byController: 'host' | 'guest'; text: string }>;
    replay?: {
      speedFactor: number;
      ready: (controls: {
        applyRemote: (action: BattleAction) => Promise<BattleState>;
        resync: (state: BattleState) => void;
      }) => void;
    };
    online?: {
      deployMove: (unitId: string, to: Pos) => void;
      deploySplit: (unitId: string, amount: number, to: Pos) => void;
      confirmDeploy: () => void;
      action: (action: BattleAction) => void;
      chat: (text: string) => void;
      ready: (controls: {
        applyRemote: (action: BattleAction) => Promise<BattleState>;
        resync: (state: BattleState) => void;
      }) => void;
    };
  }

  let {
    playerArmy,
    enemyArmy,
    hero,
    onexit,
    onresult,
    allowRestart = true,
    exitLabel = 'Change army',
    armyBonuses,
    items = [],
    initialState,
    localControllerId,
    waitingForPeer = false,
    chatMessages = [],
    replay,
    online,
  }: Props = $props();

  const AI_SPEEDS = { slow: 900, normal: 450, fast: 150 } as const;
  type BattleSpeed = keyof typeof AI_SPEEDS;
  let battleSpeed: BattleSpeed = $state('normal');
  const AI_DELAY_MS = $derived(AI_SPEEDS[battleSpeed]);

  // A battle snapshots its armies at start; later prop changes are irrelevant.
  // svelte-ignore state_referenced_locally
  let battle: BattleState = $state(initialState ?? initBattle(playerArmy, enemyArmy, hero, Date.now(), [], armyBonuses));
  // The pristine deploy layout, for the Reset button. Deploy ops are pure
  // (they return new states), so this reference stays untouched. Restart
  // refreshes it.
  // svelte-ignore state_referenced_locally
  let deployBaseline: BattleState = battle;
  let recorder: ReturnType<typeof createSoloBattleRecorder> | null = null;

  // --- Deployment phase ---
  const inDeploy = $derived(battle.phase === 'deploy');
  const deployHero = $derived(
    (online && localControllerId ? battle.heroes?.[localControllerId] : undefined) ?? battle.hero
  );
  const tacticsShift = $derived(getTacticsShift(deployHero));
  let selectedDeployId = $state<string | null>(null);
  let splitArmed = $state(false); // next empty-cell click splits rather than moves
  let splitAmount = $state(1);
  const selectedDeployUnit = $derived(
    selectedDeployId ? (battle.units.find(u => u.id === selectedDeployId) ?? null) : null
  );

  const deployableKeys = $derived.by(() => {
    const keys = new Set<string>();
    if (!inDeploy) return keys;
    for (const row of battle.grid.cells) {
      for (const cell of row) {
        if (!cell.blocked && !cell.occupantId && isInDeployZone({ col: cell.col, row: cell.row }, tacticsShift)) {
          keys.add(`${cell.col},${cell.row}`);
        }
      }
    }
    return keys;
  });

  function selectDeploy(id: string | null) {
    selectedDeployId = id;
    splitArmed = false;
    const u = id ? battle.units.find(s => s.id === id) : null;
    splitAmount = u ? Math.max(1, Math.floor(u.count / 2)) : 1;
  }

  function handleDeployUnit(unit: UnitStack) {
    if (unit.side !== 'player' || unit.isHero || (online ? unit.controllerId !== localControllerId : unit.isAlly)) return;
    if (selectedDeployId === unit.id) return selectDeploy(null); // click again to deselect
    if (selectedDeployId && !splitArmed) {
      battle = deployMove(battle, selectedDeployId, unit.pos); // swap
      return selectDeploy(null);
    }
    selectDeploy(unit.id); // (a stack click cancels an armed split)
  }

  function handleDeployCell(pos: Pos) {
    if (!selectedDeployId) return;
    if (online) {
      if (splitArmed) online.deploySplit(selectedDeployId, splitAmount, pos);
      else online.deployMove(selectedDeployId, pos);
      return selectDeploy(null);
    }
    battle = splitArmed
      ? splitStack(battle, selectedDeployId, splitAmount, pos)
      : deployMove(battle, selectedDeployId, pos);
    selectDeploy(null);
  }

  function beginBattle() {
    if (online) {
      online.confirmDeploy();
      return selectDeploy(null);
    }
    battle = beginCombat(battle);
    recorder = createSoloBattleRecorder($state.snapshot(battle) as BattleState);
    selectDeploy(null);
  }

  function resetDeploy() {
    battle = deployBaseline;
    selectDeploy(null);
  }

  // Incremental reveal: an action's sub-events (hit, retaliate, death) play
  // as separate beats. While a sequence runs, `animating` locks player input
  // and the AI timer. `revealToken` invalidates an in-flight sequence when
  // restart/forfeit replaces the battle out from under it — a resumed await
  // must not clobber the fresh state.
  let animating = $state(false);
  let activeSteps = $state<{ unitId: string; step: AnimStep }[]>([]);
  let dyingIds = $state(new Set<string>());
  // Units that die later in the current reveal batch: kept mounted (alive pose)
  // through their lethal hit so projectiles land on a visible target; dyingIds
  // takes over at the death beat to run the fade.
  let doomedIds = $state(new Set<string>());
  let revealToken = 0;

  const speedFactor = $derived(Math.max(0.25, replay?.speedFactor ?? 1));
  const STEP_DELAY_MS = $derived(Math.round({ slow: 700, normal: 450, fast: 200 }[battleSpeed] / speedFactor));
  const fxFloatMs = $derived(Math.round(900 * STEP_DELAY_MS / 450));
  const deathMs = $derived(Math.round(1100 * STEP_DELAY_MS / 450));

  // Hold after the last beat so its CSS can finish before teardown unmounts
  // everything: floaters self-buffer inside BattleFx now (they survive beat
  // swaps), but teardown clears that buffer and dyingIds, so the hold must
  // cover the longest tail — the 1.1s death fade, or a ranged floater's
  // flight delay (60% of a beat) plus its 0.9s float.
  const fxTailMs = $derived(Math.max(deathMs + 200, fxFloatMs + Math.round(STEP_DELAY_MS * 0.6) + 200));

  async function revealAction(result: BattleState) {
    const token = ++revealToken;
    animating = true;
    const newEntries = result.log.slice(battle.log.length);
    doomedIds = deathIdsIn(newEntries);
    let working = battle;

    for (const entry of newEntries) {
      working = applyLogEntry(working, entry);
      activeSteps = stepsFromLogEntry(entry).map(step => ({ unitId: step.unitId, step }));
      if (entry.type === 'death') {
        dyingIds = new Set([...dyingIds, (entry.data as { unitId: string }).unitId]);
      }
      battle = working;
      await new Promise(r => setTimeout(r, STEP_DELAY_MS));
      if (token !== revealToken) return;
    }

    if (activeSteps.length > 0 || dyingIds.size > 0) {
      await new Promise(r => setTimeout(r, fxTailMs - STEP_DELAY_MS));
      if (token !== revealToken) return;
    }

    activeSteps = [];
    dyingIds = new Set();
    doomedIds = new Set();
    battle = result; // ground-truth correction
    animating = false;
  }

  function takeAction(action: BattleAction, controller: SoloController) {
    if (online) return online.action(action);
    if (replay) return;
    const result = applyAction(battle, action);
    // Invalid casts are rejected by returning the original state. Do not put a
    // rejected cause into the replay journal.
    if (result === battle) return;
    recorder?.record(controller, action);
    void revealAction(result);
  }

  const activeUnit = $derived(battle.units.find(u => u.id === battle.currentUnitId) ?? null);
  const heroUnit = $derived(
    battle.units.find(u => u.isHero && (!online || u.controllerId === localControllerId)) ?? null
  );
  const isPlayerTurn = $derived(
    !replay && battle.result === 'ongoing' && !inDeploy && activeUnit !== null && activeUnit.side === 'player' &&
      (!online || activeUnit.controllerId === localControllerId)
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

  // Damage forecast for the aiming tooltip; far shots preview at half damage.
  // While aiming a spell, forecast the spell itself (buffs show no numbers).
  const previews = $derived.by(() => {
    const map = new Map<string, ReturnType<typeof damagePreview>>();
    if (!isPlayerTurn || !activeUnit) return map;
    if (pendingSpell) {
      for (const id of spellTargetIds ?? []) {
        const target = battle.units.find(u => u.id === id);
        const p = target && activeUnit && spellPreview(heroFor(battle, activeUnit), pendingSpell, target);
        if (p) map.set(id, p);
      }
      return map;
    }
    for (const id of actionIcons.keys()) {
      const target = battle.units.find(u => u.id === id);
      if (target) map.set(id, damagePreview(activeUnit, target, heroFor(battle, activeUnit).attack, actionIcons.get(id) === 'shoot'));
    }
    return map;
  });

  let hovered: UnitStack | null = $state(null);

  // Hovering a stack previews its range: enemies always show movement reach
  // (the threat: where they can get to), own shooters show their full-damage
  // shooting range. The hero strikes board-wide — nothing to show.
  const hoverRangeKeys = $derived.by(() => {
    const fresh = hovered && !hovered.isHero
      ? battle.units.find(u => u.id === hovered!.id && u.count > 0)
      : undefined;
    if (!fresh) return new Set<string>();
    const cells = fresh.side === 'player' && fresh.definition.range > 0
      ? getRangeCells(battle.grid, fresh)
      : getReachableCells(battle.grid, fresh);
    return new Set(cells.map(p => `${p.col},${p.row}`));
  });
  // Right-click pins a unit into the info panel. A pin is an explicit request,
  // so it outranks hover — without it the panel snaps back to the active unit
  // the moment the cursor leaves the standee, putting its ability tooltips out
  // of reach. Pin drops automatically once the stack is dead.
  let selectedId: string | null = $state(null);
  const selectedUnit = $derived(
    selectedId ? (battle.units.find(u => u.id === selectedId && u.count > 0) ?? null) : null
  );
  const infoUnit = $derived.by(() => {
    if (selectedUnit) return selectedUnit;
    const fresh = hovered ? battle.units.find(u => u.id === hovered!.id && u.count > 0) : undefined;
    return fresh ?? activeUnit;
  });

  function inspect(unit: UnitStack | null) {
    // Right-clicking the pinned unit again, or empty ground, unpins.
    selectedId = !unit || unit.id === selectedId ? null : unit.id;
  }

  // Spellbook panel and the settings popover.
  let spellbookOpen = $state(false);
  let settingsOpen = $state(false);

  // Spell selection is per-turn state: whoever acts next starts clean.
  $effect(() => {
    void battle.currentUnitId;
    pendingSpell = null;
    spellbookOpen = false;
  });

  // Announce each battle's result exactly once (re-armed by restart()).
  let resultAnnounced = false;
  $effect(() => {
    if (battle.result !== 'ongoing' && !resultAnnounced) {
      resultAnnounced = true;
      const finalState = $state.snapshot(battle) as BattleState;
      onresult?.(battle.result, finalState.units);
      if (recorder && !online) {
        const completed = recorder;
        recorder = null;
        void postSoloBattle(completed.finish(finalState)).catch(err => {
          console.error('battle recording upload failed:', err);
        });
      }
    }
  });

  // Enemy turns play automatically, one action at a time, so the player can follow.
  $effect(() => {
    if (online || replay || battle.result !== 'ongoing' || animating || inDeploy) return;
    const unit = battle.units.find(u => u.id === battle.currentUnitId);
    if (!unit || unit.side !== 'enemy') return;
    const timer = setTimeout(() => {
      // Re-check at fire time: forfeited or still animating while pending.
      if (battle.result !== 'ongoing' || animating) return;
      takeAction(aiTakeTurn(battle, unit.id), 'ai');
    }, AI_DELAY_MS);
    return () => clearTimeout(timer);
  });

  function attackFrom(targetId: string, origin: Pos) {
    const inPlace = activeUnit && origin.col === activeUnit.pos.col && origin.row === activeUnit.pos.row;
    takeAction(
      inPlace ? { type: 'attack', targetId } : { type: 'attack', targetId, moveTo: origin },
      'host'
    );
    hovered = null;
  }

  function castAt(unit: UnitStack) {
    if (!pendingSpell) return;
    takeAction({ type: 'cast', spell: pendingSpell, targetId: unit.id }, 'host');
    pendingSpell = null;
    hovered = null;
  }

  function handleCellClick(pos: Pos) {
    if (!isPlayerTurn || animating) return;
    if (pendingSpell) {
      pendingSpell = null; // clicking empty ground cancels the cast
      return;
    }
    if (!reachableKeys.has(`${pos.col},${pos.row}`)) return;
    takeAction({ type: 'move', to: pos }, 'host');
  }

  // The grid resolved an aimed melee: move to the chosen tile and strike.
  function handleMeleeAim(targetId: string, origin: Pos) {
    if (!isPlayerTurn || animating || !activeUnit) return;
    attackFrom(targetId, origin);
  }

  function handleUnitClick(unit: UnitStack, _shift = false) {
    if (!isPlayerTurn || animating || !activeUnit) return;

    if (pendingSpell) {
      if (spellTargetIds?.has(unit.id)) castAt(unit);
      else pendingSpell = null;
      return;
    }

    if (unit.side === 'player') return;

    const action = actionIcons.get(unit.id);
    if (action === 'shoot') {
      takeAction({ type: 'shoot', targetId: unit.id }, 'host');
      hovered = null;
    } else if (action === 'melee') {
      // Fallback for non-mouse activation (keyboard): nearest origin.
      const origins = originsByTarget.get(unit.id);
      if (origins?.length) attackFrom(unit.id, origins[0]);
    }
  }

  function handleWait() {
    if (!isPlayerTurn || animating) return;
    pendingSpell = null;
    takeAction({ type: 'wait' }, 'host');
  }

  function handleDefend() {
    if (!isPlayerTurn || animating) return;
    pendingSpell = null;
    takeAction({ type: 'defend' }, 'host');
  }

  function handleForfeit() {
    if (online || replay) return;
    if (battle.result !== 'ongoing') return;
    revealToken++; // abort any in-flight reveal so it can't clobber the forfeit
    animating = false;
    activeSteps = [];
    dyingIds = new Set();
    pendingSpell = null;
    // Forfeit is not an engine BattleAction, so it cannot produce a truthful
    // cause-only replay. Treat it like an abandoned tab and omit the record.
    recorder = null;
    battle = { ...battle, result: 'enemy_wins', log: [...battle.log, { type: 'battle_end', data: { result: 'enemy_wins', forfeit: true } }] };
  }

  let chatText = $state('');

  onMount(() => {
    const ready = online?.ready ?? replay?.ready;
    ready?.({
      async applyRemote(action) {
        const result = applyAction(battle, action);
        await revealAction(result);
        return $state.snapshot(battle) as BattleState;
      },
      resync(state) {
        revealToken++;
        animating = false;
        activeSteps = [];
        dyingIds = new Set();
        doomedIds = new Set();
        battle = state;
      },
    });
  });

  function restart() {
    revealToken++; // abort any in-flight reveal so it can't clobber the new battle
    animating = false;
    activeSteps = [];
    dyingIds = new Set();
    doomedIds = new Set();
    pendingSpell = null;
    resultAnnounced = false;
    recorder = null;
    battle = initBattle(playerArmy, enemyArmy, hero, Date.now(), [], armyBonuses);
    deployBaseline = battle; // restart re-enters deploy with a fresh layout
    selectDeploy(null);
  }

  const logLines = $derived(battle.log.map(ev => describeEvent(ev, battle.units, battle.hero)));

  const statusText = $derived.by(() => {
    if (battle.result === 'player_wins') return 'Victory!';
    if (battle.result === 'enemy_wins') return 'Defeat…';
    if (!activeUnit) return '';
    if (replay) return `Replay — ${activeUnit.definition.name}s are acting…`;
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
  // Escape backs out of the most recent thing first: a spell being aimed, then
  // a pinned unit.
  function handleKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    if (pendingSpell) pendingSpell = null;
    else if (selectedId) selectedId = null;
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="flex items-stretch justify-center gap-3">
  <!-- Cap the board width by viewport height so the whole battle (board +
       turns bar) fits without scrolling on laptop screens. The subtrahend
       reserves the non-board chrome: status strip + the h-60 bottom row. -->
  <div class="w-full min-w-0" style="max-width: calc((100dvh - 430px) * 1.45 + 220px)">
    <!-- Combat indicator: the current status/prompt above the battlefield.
         Full event history lives in the Battle Log column to the right.
         Fixed height: content changes must never reflow the board below. -->
    <!-- z-40: the tilted board viewport's projection overflows upward over this
         strip; without a stacking context its buttons are unclickable. -->
    <div class="relative z-40 mb-1 flex justify-center">
      {#if inDeploy}
        <div
          class="flex h-16 max-w-2xl items-center gap-3 overflow-hidden rounded-lg border
            border-amber-500/50 bg-slate-900/85 px-4 shadow-lg"
        >
          {#if selectedDeployUnit && selectedDeployUnit.count > 1}
            <span class="text-xs text-slate-300">{selectedDeployUnit.definition.name}: split off</span>
            <input
              type="range"
              min="1"
              max={selectedDeployUnit.count - 1}
              bind:value={splitAmount}
              class="w-28 accent-amber-400"
              aria-label="split amount"
            />
            <span class="w-8 font-mono text-sm text-amber-200">{splitAmount}</span>
            <button
              type="button"
              class="rounded px-3 py-1 text-sm font-semibold {splitArmed ? 'bg-amber-500 text-slate-900' : 'bg-slate-700 text-amber-200 hover:bg-slate-600'}"
              onclick={() => (splitArmed = !splitArmed)}
            >
              {splitArmed ? 'Click a cell…' : 'Split'}
            </button>
          {:else}
            <p class="text-sm font-medium text-slate-100">
              Deploy your troops — click a stack, then a highlighted cell{selectedDeployUnit ? ' (or another stack to swap)' : ''}.
            </p>
          {/if}
          {#if !online}
            <button
              type="button"
              class="ml-auto rounded bg-slate-700 px-3 py-1 text-xs font-medium text-slate-300 hover:bg-slate-600"
              onclick={resetDeploy}
            >Reset</button>
          {/if}
          <button
            type="button"
            class="rounded bg-amber-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-amber-500"
            onclick={beginBattle}
          >
            {online ? 'Confirm deployment ✓' : 'Begin battle ⚔️'}
          </button>
        </div>
      {:else}
        <div
          class="flex h-16 max-w-2xl flex-col justify-center overflow-hidden rounded-lg border
            border-slate-600/60 bg-slate-900/85 px-5 text-center shadow-lg"
        >
          <p class="text-sm font-medium text-slate-100">{statusText}</p>
        </div>
      {/if}
    </div>

    <!-- Battlefield stage: everything battle-related overlays this box. -->
    <div class="relative flex items-stretch gap-2">
      {#if heroUnit && heroUnit.count > 0}
        <!-- Hero on the flank: a bare sprite like any other unit; its
             attributes appear in the bottom-right info panel on hover. -->
        <button
          type="button"
          class="hero-standee relative flex w-20 shrink-0 flex-col items-center justify-end self-center pb-2 transition
            {heroUnit.id === hovered?.id ? 'brightness-125' : ''}"
          aria-label="Hero — level {hero.level}"
          onmouseenter={() => (hovered = heroUnit)}
          onmouseleave={() => (hovered = null)}
          oncontextmenu={e => {
            e.preventDefault();
            inspect(heroUnit);
          }}
        >
          <span class="hero-shadow" aria-hidden="true"></span>
          {#if heroUnit.id === battle.currentUnitId}
            <span class="hero-arc" aria-hidden="true"></span>
          {/if}
          <Sprite name="Hero" class="relative h-24 w-20" />
        </button>
      {/if}
      <div class="min-w-0 flex-1">
        <BattleGrid
          state={battle}
          reachableKeys={pendingSpell ? new Set() : reachableKeys}
          rangeKeys={hoverRangeKeys}
          targetIds={gridTargetIds}
          activeId={battle.currentUnitId}
          interactive={isPlayerTurn && !animating}
          deployMode={inDeploy}
          deployableKeys={deployableKeys}
          selectedDeployId={selectedDeployId}
          actionIcons={gridActionIcons}
          originsByTarget={pendingSpell ? new Map() : originsByTarget}
          {previews}
          hoveredId={hovered?.id ?? null}
          {activeSteps}
          {dyingIds}
          {doomedIds}
          stepMs={STEP_DELAY_MS}
          {fxFloatMs}
          {deathMs}
          oncellclick={handleCellClick}
          onunitclick={handleUnitClick}
          onmeleeaim={handleMeleeAim}
          ondeploycell={handleDeployCell}
          ondeployunit={handleDeployUnit}
          onunithover={u => (hovered = u)}
          onunitinspect={inspect}
        />
      </div>

      <!-- Right rail: big action buttons, top-aligned where the board's
           projected far edge is narrow — clear of every tile. -->
      <div class="ml-2 flex w-32 shrink-0 flex-col items-center gap-3 self-start pt-1">
        <button
          type="button"
          class="flex h-28 w-28 flex-col items-center justify-center rounded-full border-2 border-slate-500
            bg-slate-800/90 shadow-lg hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Wait"
          title="Wait — act again in half a cycle"
          disabled={!isPlayerTurn}
          onclick={handleWait}
        >
          <span class="text-5xl leading-none">⏳</span>
          <span class="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-300">Wait</span>
        </button>
        <button
          type="button"
          class="flex h-28 w-28 flex-col items-center justify-center rounded-full border-2 border-slate-500
            bg-slate-800/90 shadow-lg hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Defend"
          title="Defend — +30% defense until your next turn"
          disabled={!isPlayerTurn}
          onclick={handleDefend}
        >
          <span class="text-5xl leading-none">🛡️</span>
          <span class="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-300">Defend</span>
        </button>
        <button
          type="button"
          class="flex h-28 w-28 flex-col items-center justify-center rounded-full border-2 shadow-lg
            disabled:cursor-not-allowed disabled:opacity-40
            {spellbookOpen ? 'border-violet-300 bg-violet-700' : 'border-violet-500/70 bg-violet-950/90 hover:bg-violet-800'}"
          aria-label="Spellbook"
          title="Spellbook — cast on the hero's turn"
          disabled={!isHeroTurn}
          onclick={() => (spellbookOpen = !spellbookOpen)}
        >
          <span class="text-5xl leading-none">📖</span>
          <span class="mt-1 text-xs font-semibold uppercase tracking-wide text-violet-200">Spells</span>
        </button>
      </div>

      <!-- Settings: cog at the top-left, under the page title. -->
      {#if !replay}<div class="absolute left-1 top-1 z-30 flex flex-col items-start gap-1.5">
        <button
          type="button"
          class="flex h-12 w-12 items-center justify-center rounded-full border border-slate-500
            bg-slate-800/90 text-2xl shadow hover:bg-slate-700
            {settingsOpen ? 'bg-slate-600' : ''}"
          aria-label="Settings"
          title="Battle settings"
          onclick={() => (settingsOpen = !settingsOpen)}
        >
          ⚙️
        </button>
        {#if !settingsOpen}
          <!-- Active artifacts: army-wide bonuses in play, tucked under the cog. -->
          <ArtifactStrip {items} />
        {/if}
        {#if settingsOpen}
          <div class="w-48 rounded-lg border border-slate-600 bg-slate-900/95 p-3 shadow-xl">
            <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Combat speed</p>
            <div class="mb-3 flex items-center gap-1 rounded bg-slate-800 p-0.5" role="group" aria-label="battle speed">
              {#each Object.keys(AI_SPEEDS) as speed (speed)}
                <button
                  type="button"
                  class="flex-1 rounded px-2 py-1 text-xs font-medium capitalize
                    {battleSpeed === speed ? 'bg-slate-600 text-slate-100' : 'text-slate-400 hover:text-slate-200'}"
                  onclick={() => (battleSpeed = speed as BattleSpeed)}
                >
                  {speed}
                </button>
              {/each}
            </div>
            <button
              type="button"
              class="w-full rounded bg-red-900 px-3 py-1.5 text-sm font-medium text-red-100
                hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Resign"
              disabled={battle.result !== 'ongoing'}
              onclick={() => {
                settingsOpen = false;
                handleForfeit();
              }}
            >
              🏳️ Resign battle
            </button>
          </div>
        {/if}
      </div>{/if}

    {#if spellbookOpen && isHeroTurn}
      <SpellBook
        hero={activeUnit ? heroFor(battle, activeUnit) : battle.hero}
        onpick={spell => {
          pendingSpell = spell;
          spellbookOpen = false;
        }}
        onclose={() => (spellbookOpen = false)}
      />
    {/if}

    {#if battle.result !== 'ongoing' && !replay}
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

    <!-- Bottom: turns bar on the left (70%), unit info on the right (30%) —
         tall enough for the info panel to fit stats plus ability badges. -->
    <div class="relative z-10 mt-1.5 flex items-stretch gap-3">
      <div class="min-w-0 flex-[7]">
        <TurnBar state={battle} hoveredId={hovered?.id ?? null} onhover={u => (hovered = u)} />
      </div>
      <!-- h-60 fits the tallest unit (stats + a couple of ability blurbs);
           anything longer scrolls inside the panel rather than reflowing. -->
      <div class="h-60 min-w-0 flex-[3]">
        <UnitInfo
          unit={infoUnit}
          hero={infoUnit ? heroFor(battle, infoUnit) : battle.hero}
          pinned={!!selectedUnit}
          onunpin={() => (selectedId = null)}
        />
      </div>
    </div>
  </div>

  <!-- Permanent, scrollable full-game history beside the board. Fixed width;
       the relative/absolute wrapper pins the panel to the board column's
       height so a long log scrolls INSIDE the panel instead of stretching
       the row taller than the viewport. -->
  <div class="relative hidden w-56 shrink-0 lg:block">
    <div class="absolute inset-0">
      <GameLog lines={logLines} />
    </div>
  </div>
</div>

{#if online}
  <div class="mx-auto mt-3 flex max-w-4xl gap-3 rounded border border-slate-700 bg-slate-800 p-3">
    <div class="max-h-24 flex-1 overflow-y-auto text-sm text-slate-300">
      {#each chatMessages as message}
        <p><span class={message.byController === 'host' ? 'text-sky-300' : 'text-emerald-300'}>{message.byController}:</span> {message.text}</p>
      {/each}
    </div>
    <form class="flex gap-2" onsubmit={event => {
      event.preventDefault();
      if (!chatText.trim()) return;
      online.chat(chatText);
      chatText = '';
    }}>
      <input bind:value={chatText} maxlength="300" placeholder="Team chat" class="rounded bg-slate-900 px-3 py-1 text-sm" />
      <button class="rounded bg-emerald-700 px-3 py-1 text-sm">Send</button>
    </form>
  </div>
  {#if waitingForPeer}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <p class="rounded border border-amber-500 bg-slate-900 px-6 py-4 text-lg text-amber-200">Waiting for the other player to reconnect…</p>
    </div>
  {/if}
{/if}

<style>
  .hero-shadow {
    position: absolute;
    bottom: 4px;
    left: 15%;
    right: 15%;
    height: 16px;
    border-radius: 50%;
    background: radial-gradient(ellipse at center, rgb(0 0 0 / 0.55), transparent 70%);
  }

  .hero-arc {
    position: absolute;
    bottom: 0;
    left: 12%;
    right: 12%;
    height: 22px;
    border: 3px solid #facc15;
    border-top-color: transparent;
    border-radius: 50%;
    filter: drop-shadow(0 0 3px rgb(250 204 21 / 0.7));
    pointer-events: none;
  }
</style>
