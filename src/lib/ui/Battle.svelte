<script lang="ts">
  import { onMount } from 'svelte';
  import { initBattle, applyAction, spellPreview, SPELLS, isInDeployZone, deployMove, beginCombat, heroFor } from '$lib/engine/battle';
  import { getTacticsShift } from '$lib/engine/factionSkills';
  import { aiTakeTurn } from '$lib/engine/ai';
  import {
    getReachableCells,
    getDartingRetreatCells,
    getRangeCells,
    getMeleeApproaches,
    getAttackOrigins,
    canShoot,
    canShootTarget,
    isBeyondRange,
    isShootingBlocked,
    damagePreviewInBattle,
  } from '$lib/engine/selectors';
  import type {
    ArmyBonuses,
    ArmySlot,
    BattleAction,
    BattleState,
    DebugBattleOperation,
    DebugStackTemplate,
    Hero,
    Pos,
    SpellId,
    UnitDef,
    UnitStack,
  } from '$lib/engine/types';
  import { UNIT_ABILITIES, activatedAbilitiesOf, canActivate } from '$lib/engine/unitAbilities';
  import { abilityReady, displayedCooldown } from '$lib/engine/cooldowns';
  import { abilityInfo } from './abilities';
  import { describeEvent, SPELL_META } from './logLines';
  import BattleGrid from './BattleGrid.svelte';
  import TurnBar from './TurnBar.svelte';
  import UnitInfo from './UnitInfo.svelte';
  import ArtifactStrip from './ArtifactStrip.svelte';
  import { ITEMS, type ItemId } from '$lib/gauntlet/items';
  import Sprite from './Sprite.svelte';
  import { heroSpriteName, unitSlug } from './sprites';
  import { recordSeen } from '$lib/compendium/discovery';
  import SpellBook from './SpellBook.svelte';
  import GameLog from './GameLog.svelte';
  import ActionDock from './ActionDock.svelte';
  import { shouldAutomateTurn } from './battleAutomation';
  import { stepsFromLogEntry, applyLogEntry, deathIdsIn, type AnimStep } from './animSteps';
  import { createSoloBattleRecorder } from '$lib/replay/recording';
  import { postSoloBattle, type SoloController } from '$lib/net/api';
  import { createDebugStackTemplate, debugSnapshot, templateFromStack } from '$lib/engine/debugBattle';
  import BattleDebugDrawer from './BattleDebugDrawer.svelte';
  import { formationFromBattle, type SavedFormation } from '$lib/engine/deployment';
  import { validateAction } from '$lib/engine/actions';

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
    gauntletRound?: number;
    enemyVeterancy?: number;
    savedFormation?: SavedFormation;
    onformation?: (formation: SavedFormation) => void;
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
    gauntletRound = 1,
    enemyVeterancy = 0,
    savedFormation,
    onformation,
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
  let autoBattle = $state(false);
  const AI_DELAY_MS = $derived(AI_SPEEDS[battleSpeed]);

  // A battle snapshots its armies at start; later prop changes are irrelevant.
  // svelte-ignore state_referenced_locally
  const modifierSources = items.map(id => ({
    id: `item:${id}`,
    label: ITEMS[id].name,
    stats: { ...ITEMS[id].effects },
    stacks: 1,
  }));
  // svelte-ignore state_referenced_locally
  const training = Object.fromEntries(playerArmy.flatMap(slot => {
    const grants = new Set(slot.unit.grantedAbilities ?? []);
    if (!grants.has('weapon_training') && !grants.has('armour_training')) return [];
    return [[slot.unit.name, { weapon: grants.has('weapon_training'), armour: grants.has('armour_training') }]];
  }));
  // svelte-ignore state_referenced_locally
  let battle: BattleState = $state(
    initialState ?? initBattle(playerArmy, enemyArmy, hero, Date.now(), [], armyBonuses, {
      modifierSources,
      gauntletRound,
      enemyVeterancy,
      savedFormation,
      artifacts: { player: items },
      training: { player: training },
    })
  );
  // The pristine deploy layout, for the Reset button. Deploy ops are pure
  // (they return new states), so this reference stays untouched. Restart
  // refreshes it.
  // svelte-ignore state_referenced_locally
  let deployBaseline: BattleState = battle;
  // Debug Reset is intentionally stronger than deployment Reset: it rewinds
  // the entire battle to this untouched initial deployment snapshot.
  // svelte-ignore state_referenced_locally
  let originalDeployBaseline: BattleState = structuredClone($state.snapshot(battle) as BattleState);
  let recorder: ReturnType<typeof createSoloBattleRecorder> | null = null;

  // The compiler removes the drawer from production builds. Online battles
  // and replays remain read-only even when viewed through a development build.
  // svelte-ignore state_referenced_locally
  const debugAvailable = import.meta.env.DEV && !online && !replay;
  let debugOpen = $state(false);
  let debugSelectedId = $state<string | null>(null);
  let debugPlacement = $state<{ stack: DebugStackTemplate; label: string } | null>(null);
  let debugUndo = $state<{ state: BattleState; label: string } | null>(null);
  let deploymentDebugNotes: string[] = [];

  // --- Deployment phase ---
  const inDeploy = $derived(battle.phase === 'deploy');
  const deployHero = $derived(
    (online && localControllerId ? battle.heroes?.[localControllerId] : undefined) ?? battle.hero
  );
  const tacticsShift = $derived(getTacticsShift(deployHero));
  let selectedDeployId = $state<string | null>(null);
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

  const debugPlaceableKeys = $derived.by(() => {
    const keys = new Set<string>();
    if (!debugOpen || !debugPlacement || battle.result !== 'ongoing') return keys;
    for (const row of battle.grid.cells) {
      for (const cell of row) {
        if (!cell.blocked && !cell.occupantId) keys.add(`${cell.col},${cell.row}`);
      }
    }
    return keys;
  });

  function selectDeploy(id: string | null) {
    selectedDeployId = id;
  }

  function handleDeployUnit(unit: UnitStack) {
    if (unit.side !== 'player' || unit.isHero || (online ? unit.controllerId !== localControllerId : unit.isAlly)) return;
    if (selectedDeployId === unit.id) return selectDeploy(null); // click again to deselect
    if (selectedDeployId) {
      battle = deployMove(battle, selectedDeployId, unit.pos); // swap
      return selectDeploy(null);
    }
    selectDeploy(unit.id);
  }

  function handleDeployCell(pos: Pos) {
    if (!selectedDeployId) return;
    if (online) {
      online.deployMove(selectedDeployId, pos);
      return selectDeploy(null);
    }
    battle = deployMove(battle, selectedDeployId, pos);
    selectDeploy(null);
  }

  function beginBattle() {
    if (online) {
      online.confirmDeploy();
      return selectDeploy(null);
    }
    onformation?.(formationFromBattle($state.snapshot(battle) as BattleState));
    battle = beginCombat(battle);
    recorder = createSoloBattleRecorder($state.snapshot(battle) as BattleState);
    // Deployment mutations are already baked into the recorder's initial
    // state. Replay them as descriptive no-op actions so history still tells
    // the viewer how that unusual starting army was assembled.
    for (const label of deploymentDebugNotes) {
      const action: BattleAction = { type: 'debug', operation: { kind: 'note', label } };
      battle = applyAction(battle, action);
      recorder.record('host', action);
    }
    deploymentDebugNotes = [];
    debugUndo = null;
    selectDeploy(null);
  }

  function resetDeploy() {
    battle = deployBaseline;
    selectDeploy(null);
  }

  function closeDebug() {
    debugOpen = false;
    debugPlacement = null;
  }

  function commitDebug(operation: DebugBattleOperation) {
    if (!debugAvailable || battle.result !== 'ongoing' || animating) return;
    const before = structuredClone($state.snapshot(battle) as BattleState);
    const action: BattleAction = { type: 'debug', operation };
    const result = applyAction(battle, action);
    if (result === battle) return;
    if (battle.phase === 'deploy') deploymentDebugNotes = [...deploymentDebugNotes, operation.label];
    else recorder?.record('host', action);
    battle = result;
    debugUndo = { state: before, label: operation.label };
    hovered = null;
    if (selectedDeployId && !battle.units.some(unit => unit.id === selectedDeployId && unit.count > 0)) {
      selectDeploy(null);
    }
    if (debugSelectedId && !battle.units.some(unit => unit.id === debugSelectedId && unit.count > 0)) {
      debugSelectedId = null;
    }
  }

  function requestDebugAdd(definition: UnitDef, side: UnitStack['side'], count: number) {
    const stack = createDebugStackTemplate(definition, side, count, battle.hero, armyBonuses);
    debugPlacement = {
      stack,
      label: `added ${count} ${definition.name}${count === 1 ? '' : 's'} for ${side === 'player' ? 'your side' : 'the opponent'}`,
    };
  }

  function requestDebugDuplicate(unit: UnitStack) {
    debugPlacement = {
      stack: templateFromStack(unit),
      label: `duplicated ${unit.definition.name}s for ${unit.side === 'player' ? 'your side' : 'the opponent'}`,
    };
  }

  function handleDebugPlacement(to: Pos) {
    if (!debugPlacement) return;
    const pending = debugPlacement;
    commitDebug({ kind: 'add', stack: pending.stack, to, label: pending.label });
    const createdId = `u${battle.nextId - 1}`;
    if (battle.units.some(unit => unit.id === createdId && unit.count > 0)) debugSelectedId = createdId;
    debugPlacement = null;
    void recordSeen({ units: [unitSlug(pending.stack.definition.name)], factions: [] });
  }

  function updateDebugStack(unitId: string, stack: DebugStackTemplate) {
    const unit = battle.units.find(row => row.id === unitId);
    if (!unit) return;
    commitDebug({ kind: 'update', unitId, stack, label: `changed ${unit.definition.name} stats and abilities` });
  }

  function undoDebug() {
    if (!debugUndo || battle.result !== 'ongoing') return;
    const checkpoint = debugUndo;
    const action: BattleAction = {
      type: 'debug',
      operation: {
        kind: 'restore',
        snapshot: debugSnapshot(checkpoint.state),
        label: `undid ${checkpoint.label}`,
      },
    };
    if (battle.phase === 'deploy') deploymentDebugNotes = [...deploymentDebugNotes, action.operation.label];
    else recorder?.record('host', action);
    battle = applyAction(battle, action);
    debugUndo = null;
    debugPlacement = null;
    debugSelectedId = null;
    hovered = null;
  }

  function resetDebugBattle() {
    revealToken++;
    animating = false;
    activeSteps = [];
    dyingIds = new Set();
    doomedIds = new Set();
    pendingSpell = null;
    resultAnnounced = false;
    recorder = null;
    battle = structuredClone(originalDeployBaseline);
    deployBaseline = battle;
    deploymentDebugNotes = [];
    debugUndo = null;
    debugPlacement = null;
    debugSelectedId = null;
    selectedId = null;
    hovered = null;
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
    if (replay) return;
    if (online) {
      // The authoritative animation starts when the server echoes the action,
      // but clear local hover immediately so it cannot follow a moved stack.
      hovered = null;
      return online.action(action);
    }
    const result = applyAction(battle, action);
    // Invalid casts are rejected by returning the original state. Do not put a
    // rejected cause into the replay journal.
    if (result === battle) return;
    // One-step debug undo is intentionally local to the clean analysis point
    // where the edit happened. A real turn commits it.
    debugUndo = null;
    recorder?.record(controller, action);
    // A hovered stack can move away while the pointer remains over its old
    // cell. Clear it as soon as an action begins so its old/new range does not
    // linger through or after the movement animation.
    hovered = null;
    void revealAction(result);
  }

  const activeUnit = $derived(battle.units.find(u => u.id === battle.currentUnitId) ?? null);
  const heroUnit = $derived(
    battle.units.find(u => u.isHero && (!online || u.controllerId === localControllerId)) ?? null
  );
  const isPlayerTurn = $derived(
    !replay && !debugOpen && !autoBattle && battle.result === 'ongoing' && !inDeploy && activeUnit !== null && activeUnit.side === 'player' &&
      (!online || activeUnit.controllerId === localControllerId)
  );

  const reachableKeys = $derived(
    isPlayerTurn && activeUnit && !animating
      ? new Set(getReachableCells(battle.grid, activeUnit, battle).map(p => `${p.col},${p.row}`))
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

  // Shooters may fire anywhere, but targets beyond their listed range take
  // half damage. Keep that penalty explicit in the grid rather than making
  // the player infer it from the forecast numbers.
  const penalizedShotIds = $derived.by(() => {
    const ids = new Set<string>();
    if (!activeUnit) return ids;
    for (const [id, icon] of actionIcons) {
      const target = battle.units.find(u => u.id === id);
      if (icon === 'shoot' && target && isBeyondRange(activeUnit, target)) ids.add(id);
    }
    return ids;
  });

  const isHeroTurn = $derived(isPlayerTurn && !!activeUnit?.isHero);

  const HERO_ACTIONS: Record<Hero['class'], Array<{ id: string; label: string; description: string }>> = {
    knight: [
      { id: 'hold_the_line', label: 'Hold the Line', description: 'Units that finish a turn without moving become Braced.' },
      { id: 'ready_the_counterattack', label: 'Counterattack', description: 'Each unit’s first retaliation deals 50% more damage and advances it 10% ATB.' },
      { id: 'advance_by_ranks', label: 'Advance by Ranks', description: 'Long move-only actions beside an ally return at 50% ATB.' },
    ],
    ranger: [
      { id: 'name_the_quarry', label: 'Name the Quarry', description: 'Choose an enemy; each ally’s first primary hit advances it 10% ATB.' },
      { id: 'set_the_ambush', label: 'Set the Ambush', description: 'Choose a 3×3 area for stronger, safer opening attacks.' },
      { id: 'open_an_escape_route', label: 'Escape Route', description: 'Choose a 3×3 area where move-only actions return at 75% ATB.' },
    ],
    barbarian: [
      { id: 'charge', label: 'Charge!', description: 'Empower every friendly melee unit for its next turn.' },
      { id: 'loose', label: 'Loose!', description: 'Empower each shooter’s next attack and save its ammunition.' },
      { id: 'blood_for_blood', label: 'Blood for Blood!', description: 'Friendly units deal and take 50% more damage until the hero’s next turn.' },
    ],
    demon: [
      { id: 'blood_offering', label: 'Blood Offering', description: 'Sacrifice 10% of a friendly stack to advance the rest of the army.' },
      { id: 'feed_the_fire', label: 'Feed the Fire', description: 'Consume a Burn tick now and spread Burn to adjacent units.' },
      { id: 'demonic_bargain', label: 'Demonic Bargain', description: 'Sacrifice HP to double a friendly stack’s next attack.' },
    ],
    necromancer: [
      { id: 'reknit_the_dead', label: 'Reknit the Dead', description: 'Consume Skeletons to heal a wounded undead stack.' },
      { id: 'grasping_dead', label: 'Grasping Dead', description: 'Consume five Skeletons to pin an enemy for its next turn.' },
      { id: 'death_march', label: 'Death March', description: 'Consume ten Skeletons to advance every other undead stack.' },
    ],
    wizard: [],
  };

  // Spell targeting: pick a spell on the hero's turn, then click a stack.
  let pendingSpell: SpellId | null = $state(null);
  let pendingActivated: { id: string; hero: boolean } | null = $state(null);
  let pendingDarting: { targetId: string; moveTo: Pos; cells: Pos[] } | null = $state(null);
  const dartingRetreatKeys = $derived.by(() => {
    const pending = pendingDarting as { targetId: string; moveTo: Pos; cells: Pos[] } | null;
    return new Set<string>((pending?.cells ?? []).map((pos: Pos) => `${pos.col},${pos.row}`));
  });
  const spellTargetIds = $derived.by(() => {
    if (!pendingSpell || !isHeroTurn) return null;
    const friendly = SPELLS[pendingSpell].friendly;
    return new Set(
      battle.units
        .filter(u => u.count > 0 && !u.isHero && (friendly ? u.side === 'player' : u.side === 'enemy'))
        .map(u => u.id)
    );
  });

  const activatedTargetIds = $derived.by(() => {
    if (!pendingActivated || !activeUnit || !isPlayerTurn) return null;
    const id = pendingActivated.id;
    const ids = new Set<string>();
    for (const unit of battle.units) {
      if (unit.isHero || (unit.count <= 0 && id !== 'repair')) continue;
      if (pendingActivated.hero) {
        if (validateAction(battle, { type: 'hero_action', actionId: id, targetId: unit.id })) ids.add(unit.id);
      } else if (id === 'cleanse' || id === 'repair') {
        if (UNIT_ABILITIES[id].canUse(battle, activeUnit, unit.id)) ids.add(unit.id);
      } else if (id === 'ride_by_attack') {
        if (getAttackOrigins(battle, activeUnit, unit).some(to => UNIT_ABILITIES[id].canUse(battle, activeUnit, unit.id, to))) ids.add(unit.id);
      } else if (id === 'caustic_breath' && Math.max(Math.abs(unit.pos.col - activeUnit.pos.col), Math.abs(unit.pos.row - activeUnit.pos.row)) === 1) {
        ids.add(unit.id);
      }
    }
    return ids;
  });

  const activatedCellKeys = $derived.by(() => {
    const keys = new Set<string>();
    if (!pendingActivated || !activeUnit || !isPlayerTurn) return keys;
    if (!pendingActivated.hero && pendingActivated.id === 'gate') {
      for (const row of battle.grid.cells) for (const cell of row) {
        const to = { col: cell.col, row: cell.row };
        if (UNIT_ABILITIES.gate.canUse(battle, activeUnit, undefined, to)) keys.add(`${cell.col},${cell.row}`);
      }
    } else if (!pendingActivated.hero && pendingActivated.id === 'caustic_breath') {
      for (const row of battle.grid.cells) for (const cell of row) {
        if (Math.max(Math.abs(cell.col - activeUnit.pos.col), Math.abs(cell.row - activeUnit.pos.row)) === 1) keys.add(`${cell.col},${cell.row}`);
      }
    } else if (pendingActivated.hero && (pendingActivated.id === 'set_the_ambush' || pendingActivated.id === 'open_an_escape_route')) {
      for (let row = 1; row < battle.grid.height - 1; row++) for (let col = 1; col < battle.grid.width - 1; col++) keys.add(`${col},${row}`);
    }
    return keys;
  });

  // What the grid highlights: spell targeting overrides attack targeting.
  const gridTargetIds = $derived(pendingDarting ? new Set<string>() : spellTargetIds ?? activatedTargetIds ?? targetIds);
  const gridActionIcons = $derived.by(() => {
    if (pendingDarting) return new Map<string, 'melee' | 'shoot' | 'spell'>();
    if (activatedTargetIds) {
      const icons = new Map<string, 'melee' | 'shoot' | 'spell'>();
      for (const id of activatedTargetIds) icons.set(id, pendingActivated?.id === 'ride_by_attack' ? 'melee' : 'spell');
      return icons;
    }
    if (!spellTargetIds) return actionIcons;
    const icons = new Map<string, 'melee' | 'shoot' | 'spell'>();
    for (const id of spellTargetIds) icons.set(id, 'spell');
    return icons;
  });

  // Aim-by-cursor melee (LordsWM): every attack origin per target, so the grid
  // can pick the landing tile from the cursor angle.
  const originsByTarget = $derived.by(() => {
    const map = new Map<string, Pos[]>();
    if (!isPlayerTurn || !activeUnit || pendingDarting) return map;
    if (pendingActivated?.id === 'ride_by_attack') {
      for (const id of activatedTargetIds ?? []) {
        const target = battle.units.find(unit => unit.id === id)!;
        map.set(id, getAttackOrigins(battle, activeUnit, target).filter(to => UNIT_ABILITIES.ride_by_attack.canUse(battle, activeUnit, id, to)));
      }
      return map;
    }
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
    const map = new Map<string, ReturnType<typeof damagePreviewInBattle>>();
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
      if (target) map.set(id, damagePreviewInBattle(battle, activeUnit, target, actionIcons.get(id) === 'shoot'));
    }
    return map;
  });

  let hovered: UnitStack | null = $state(null);

  // The dock action the player is hovering, projected onto the turns bar. Held
  // here rather than in the dock because the bar is the thing that renders it.
  // Cleared whenever the turn moves on: the mouse can still be sitting on the
  // button after the click that ended the turn, and the projection it asked
  // for is about a stack that is no longer acting.
  let previewAction: 'wait' | 'defend' | null = $state(null);
  $effect(() => {
    void battle.currentUnitId;
    previewAction = null;
  });

  // Hover always shows movement reach. Ranged units additionally paint their
  // full-damage shooting radius in a second color, so neither stat hides the
  // other. Suppress both while an action is animating so a moving unit cannot
  // paint stale ranges from either its old or new position.
  const hoverMovementKeys = $derived.by(() => {
    if (animating) return new Set<string>();
    const fresh = hovered && !hovered.isHero
      ? battle.units.find(u => u.id === hovered!.id && u.count > 0)
      : undefined;
    if (!fresh) return new Set<string>();
    return new Set(getReachableCells(battle.grid, fresh, battle).map(p => `${p.col},${p.row}`));
  });
  const hoverShootingKeys = $derived.by(() => {
    if (animating) return new Set<string>();
    const fresh = hovered && !hovered.isHero
      ? battle.units.find(u => u.id === hovered!.id && u.count > 0)
      : undefined;
    if (!fresh || fresh.definition.range <= 0) return new Set<string>();
    return new Set(getRangeCells(battle.grid, fresh).map(p => `${p.col},${p.row}`));
  });
  // Right-click pins a unit into the info panel. A pin is an explicit request,
  // so it outranks hover — without it the panel would empty the moment the
  // cursor left the standee, putting its ability tooltips out of reach. Pin
  // drops automatically once the stack is dead.
  let selectedId: string | null = $state(null);
  const selectedUnit = $derived(
    selectedId ? (battle.units.find(u => u.id === selectedId && u.count > 0) ?? null) : null
  );
  // Pinned, else hovered, else nothing. Deliberately no fall back to the active
  // unit: the dock already describes that stack, and showing it here too meant
  // the same ability list rendered twice whenever the cursor was at rest.
  const infoUnit = $derived.by(() => {
    if (selectedUnit) return selectedUnit;
    return (hovered ? battle.units.find(u => u.id === hovered!.id && u.count > 0) : null) ?? null;
  });

  function inspect(unit: UnitStack | null) {
    // Right-clicking the pinned unit again, or empty ground, unpins.
    selectedId = !unit || unit.id === selectedId ? null : unit.id;
  }

  // Spellbook panel, the settings popover, and the expanded battle log.
  let spellbookOpen = $state(false);
  let settingsOpen = $state(false);
  let logOpen = $state(false);

  // --- Fitting the screen ---
  // The battle screen claims whatever vertical space is left below whichever
  // page header hosts it, and every dimension inside is a multiple of `--fx`,
  // a scaled pixel derived from that space. One measurement therefore keeps the
  // whole layout — ribbon, rails, dock, type — in proportion from a small
  // laptop to a 4K display, instead of pinning it to a design-canvas size.
  // TurnBar, ActionDock, UnitInfo's rail variant and GameLog's dense variant
  // all consume `--fx` and point back here.
  //
  // The design these sizes were authored against. `--fx` is the ratio between
  // that and the space we actually got, so a `calc(38 * var(--fx))` medallion
  // is 38px at design size and scales from there.
  const DESIGN_H = 900;
  const DESIGN_W = 1560;
  // Clamp ends: below 0.7 the dock's type stops being legible (the board
  // absorbs the squeeze instead, since .battle-middle is flex:1/min-height:0);
  // above 1.4 the chrome would keep growing on a huge display when the
  // battlefield is the thing that should be taking the extra room.
  const FX_MIN = 0.7;
  const FX_MAX = 1.4;
  // Enough to keep all three bands on screen at FX_MIN.
  const MIN_SCREEN_H = 460;

  let screenEl = $state<HTMLDivElement>();
  // First paint uses design scale; the effect below corrects it on mount, so
  // SSR output is proportioned rather than collapsed.
  let availableH = $state(720);
  let fx = $state(1);

  function measureFit() {
    const el = screenEl;
    if (!el) return;
    // Document-space top on purpose: what we want is "how much room is there
    // with the page at rest", which must not change when the page is scrolled.
    // Safe against feedback despite writing a height back onto `el`: every
    // hosting <main> is plain block flow, so our own height cannot move our
    // own top.
    const top = el.getBoundingClientRect().top + window.scrollY;
    // Leave the hosting page's own bottom padding intact, or the screen would
    // overshoot the viewport by exactly that much and add a scrollbar. Every
    // host (campaign, gauntlet, coop, history/[id]) wraps us in a padded
    // <main>; the fallback just means we claim a little less room.
    const page = el.closest('main') ?? el.parentElement;
    const bottomPad = page ? parseFloat(getComputedStyle(page).paddingBottom) || 0 : 0;
    // Computed into locals first: assigning `availableH` and then reading it
    // back would make it a dependency of the effect that writes it.
    const height = Math.max(MIN_SCREEN_H, window.innerHeight - top - bottomPad);
    const width = el.clientWidth || window.innerWidth;
    availableH = height;
    fx = Math.max(FX_MIN, Math.min(FX_MAX, Math.min(height / DESIGN_H, width / DESIGN_W)));
  }

  $effect(() => {
    measureFit();
    // Fonts and images can settle a frame late and shift our offset.
    const raf = requestAnimationFrame(measureFit);
    return () => cancelAnimationFrame(raf);
  });

  // Co-op actions are authoritative on the server: sending an action does not
  // immediately advance our local battle state. Until the server echoes that
  // action, this component still sees the same current unit and its reactive
  // auto-battle effect may run again (for example after another UI state
  // change). Remember which unit already has an automated action in flight so
  // we submit at most one action for that turn. Solo actions update `battle`
  // immediately and do not need this guard.
  let pendingAutoActionUnitId: string | null = null;

  function toggleAutoBattle() {
    autoBattle = !autoBattle;
    if (autoBattle) {
      pendingSpell = null;
      spellbookOpen = false;
      hovered = null;
    }
  }

  // Spell selection is per-turn state: whoever acts next starts clean.
  $effect(() => {
    void battle.currentUnitId;
    pendingSpell = null;
    pendingActivated = null;
    spellbookOpen = false;
  });

  // Announce each battle's result exactly once (re-armed by restart()).
  let resultAnnounced = false;
  $effect(() => {
    if (battle.result !== 'ongoing' && !resultAnnounced) {
      resultAnnounced = true;
      debugOpen = false;
      debugPlacement = null;
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

  // Automated turns play one action at a time, using the same pacing and AI
  // for enemies, summoned allies, and (when enabled) the player's own stacks.
  $effect(() => {
    if (replay || debugOpen || battle.result !== 'ongoing' || animating || inDeploy) return;
    const unit = battle.units.find(u => u.id === battle.currentUnitId);
    if (!unit || !shouldAutomateTurn(unit, autoBattle, !!online, localControllerId)) return;
    // The server has not confirmed this unit's previously submitted choice yet.
    if (online && pendingAutoActionUnitId === unit.id) return;
    const timer = setTimeout(() => {
      // Re-check at fire time: the toggle, turn, or battle may have changed.
      const current = battle.units.find(u => u.id === battle.currentUnitId);
      if (
        battle.result !== 'ongoing' ||
        debugOpen ||
        animating ||
        !current ||
        current.id !== unit.id ||
        !shouldAutomateTurn(current, autoBattle, !!online, localControllerId)
      ) return;
      // Set this before sending because `takeAction` deliberately leaves the
      // local state unchanged in online mode while it awaits the server echo.
      if (online) pendingAutoActionUnitId = current.id;
      const controller: SoloController = current.side === 'enemy' || current.isAlly ? 'ai' : 'host';
      takeAction(aiTakeTurn(battle, current.id), controller);
    }, AI_DELAY_MS);
    return () => clearTimeout(timer);
  });

  function attackFrom(targetId: string, origin: Pos) {
    const inPlace = activeUnit && origin.col === activeUnit.pos.col && origin.row === activeUnit.pos.row;
    if (activeUnit && !inPlace) {
      const cells = getDartingRetreatCells(battle, activeUnit, origin);
      if (cells.length > 0) {
        pendingDarting = { targetId, moveTo: origin, cells };
        hovered = null;
        return;
      }
    }
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
    if (pendingDarting) {
      if (dartingRetreatKeys.has(`${pos.col},${pos.row}`)) {
        takeAction({ type: 'attack', targetId: pendingDarting.targetId, moveTo: pendingDarting.moveTo, retreatTo: pos }, 'host');
        pendingDarting = null;
      }
      return;
    }
    if (pendingSpell) {
      pendingSpell = null; // clicking empty ground cancels the cast
      return;
    }
    if (pendingActivated) {
      if (!activatedCellKeys.has(`${pos.col},${pos.row}`)) {
        pendingActivated = null;
        return;
      }
      if (pendingActivated.hero) {
        const area: Pos[] = [];
        for (let row = pos.row - 1; row <= pos.row + 1; row++) for (let col = pos.col - 1; col <= pos.col + 1; col++) area.push({ col, row });
        takeAction({ type: 'hero_action', actionId: pendingActivated.id, area }, 'host');
      } else {
        takeAction({ type: 'ability', abilityId: pendingActivated.id, to: pos }, 'host');
      }
      pendingActivated = null;
      return;
    }
    if (!reachableKeys.has(`${pos.col},${pos.row}`)) return;
    takeAction({ type: 'move', to: pos }, 'host');
  }

  // The grid resolved an aimed melee: move to the chosen tile and strike.
  function handleMeleeAim(targetId: string, origin: Pos) {
    if (!isPlayerTurn || animating || !activeUnit) return;
    if (pendingActivated?.id === 'ride_by_attack') {
      takeAction({ type: 'ability', abilityId: 'ride_by_attack', targetId, to: origin }, 'host');
      pendingActivated = null;
      return;
    }
    attackFrom(targetId, origin);
  }

  function handleUnitClick(unit: UnitStack, _shift = false) {
    if (!isPlayerTurn || animating || !activeUnit) return;
    if (pendingDarting) return;

    if (pendingSpell) {
      if (spellTargetIds?.has(unit.id)) castAt(unit);
      else pendingSpell = null;
      return;
    }

    if (pendingActivated) {
      if (!activatedTargetIds?.has(unit.id)) {
        pendingActivated = null;
        return;
      }
      if (pendingActivated.id === 'ride_by_attack') {
        const origin = originsByTarget.get(unit.id)?.[0];
        if (origin) takeAction({ type: 'ability', abilityId: pendingActivated.id, targetId: unit.id, to: origin }, 'host');
      } else if (pendingActivated.id === 'caustic_breath') {
        takeAction({ type: 'ability', abilityId: pendingActivated.id, to: unit.pos }, 'host');
      } else if (pendingActivated.hero) {
        takeAction({ type: 'hero_action', actionId: pendingActivated.id, targetId: unit.id }, 'host');
      } else {
        takeAction({ type: 'ability', abilityId: pendingActivated.id, targetId: unit.id }, 'host');
      }
      pendingActivated = null;
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

  // Activated unit abilities (Bone Dragon absorb): one button per ability the
  // acting stack owns, greyed by the engine's own canUse so the button and the
  // rule can never disagree.
  const unitAbilities = $derived.by(() => {
    if (!activeUnit) return [];
    if (activeUnit.isHero) return HERO_ACTIONS[heroFor(battle, activeUnit).class].map(action => {
      const targeted = ['name_the_quarry', 'blood_offering', 'feed_the_fire', 'demonic_bargain', 'reknit_the_dead', 'grasping_dead'].includes(action.id);
      const area = ['set_the_ambush', 'open_an_escape_route'].includes(action.id);
      const legal = area || (targeted
        ? battle.units.some(unit => validateAction(battle, { type: 'hero_action', actionId: action.id, targetId: unit.id }))
        : validateAction(battle, { type: 'hero_action', actionId: action.id }));
      return {
        id: action.id,
        info: { label: action.label, description: action.description },
        enabled: isPlayerTurn && !animating && legal,
      };
    });
    return activatedAbilitiesOf(activeUnit).map(id => ({
      id,
      info: {
        ...abilityInfo(id),
        label: displayedCooldown(activeUnit, id) > 0 ? `${abilityInfo(id).label} (${displayedCooldown(activeUnit, id)})` : abilityInfo(id).label,
      },
      enabled: isPlayerTurn && !animating && (
        ['cleanse', 'repair', 'ride_by_attack', 'caustic_breath', 'gate'].includes(id)
          ? abilityReady(activeUnit, id)
          : canActivate(battle, activeUnit, id)
      ),
    }));
  });

  function handleAbility(abilityId: string) {
    if (!isPlayerTurn || animating) return;
    pendingSpell = null;
    const heroAction = !!activeUnit?.isHero;
    const targeted = heroAction
      ? ['name_the_quarry', 'set_the_ambush', 'open_an_escape_route', 'blood_offering', 'feed_the_fire', 'demonic_bargain', 'reknit_the_dead', 'grasping_dead'].includes(abilityId)
      : ['cleanse', 'repair', 'ride_by_attack', 'caustic_breath', 'gate'].includes(abilityId);
    if (targeted) {
      pendingActivated = { id: abilityId, hero: heroAction };
      return;
    }
    takeAction(heroAction ? { type: 'hero_action', actionId: abilityId } : { type: 'ability', abilityId }, 'host');
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
        // The authoritative action has arrived and the next turn may now be
        // automated, even if morale gives the same unit another action.
        pendingAutoActionUnitId = null;
        return $state.snapshot(battle) as BattleState;
      },
      resync(state) {
        revealToken++;
        animating = false;
        activeSteps = [];
        dyingIds = new Set();
        doomedIds = new Set();
        // A resync supersedes any local request that was awaiting confirmation.
        pendingAutoActionUnitId = null;
        battle = state;
      },
    });

    // Compendium discovery, recorded on sight: every stack on the field counts,
    // win or lose. `battle` is already resolved here whether it came from
    // initBattle or an initialState, so campaign, gauntlet, events, and co-op
    // are all covered by this one call. Replays discover nothing — re-watching
    // history isn't meeting anything new. Fire-and-forget: recordSeen swallows
    // its own failures, and a missing badge must never disturb a battle.
    if (!replay) {
      void recordSeen({
        units: battle.units.filter(u => !u.isHero).map(u => unitSlug(u.definition.name)),
        factions: [hero.class],
      });
    }
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
    battle = initBattle(playerArmy, enemyArmy, hero, Date.now(), [], armyBonuses, {
      modifierSources,
      gauntletRound,
      enemyVeterancy,
      savedFormation,
      artifacts: { player: items },
      training: { player: training },
    });
    deployBaseline = battle; // restart re-enters deploy with a fresh layout
    originalDeployBaseline = structuredClone($state.snapshot(battle) as BattleState);
    deploymentDebugNotes = [];
    debugUndo = null;
    debugPlacement = null;
    debugOpen = false;
    debugSelectedId = null;
    selectDeploy(null);
  }

  const logLines = $derived(battle.log.map(ev => describeEvent(ev, battle.units, battle.hero)));
  let meleeTargeting = $state<'choose' | 'drag' | null>(null);

  const statusText = $derived.by(() => {
    if (battle.result === 'player_wins') return 'Victory!';
    if (battle.result === 'enemy_wins') return 'Defeat…';
    if (!activeUnit) return '';
    if (replay) return `Replay — ${activeUnit.definition.name}s are acting…`;
    if (debugOpen && debugPlacement) return `Debug placement — click a highlighted empty cell for ${debugPlacement.stack.definition.name}.`;
    if (debugOpen) return 'Battle paused while the debugger is open.';
    if (autoBattle && shouldAutomateTurn(activeUnit, true, !!online, localControllerId)) {
      return `Auto battle — ${activeUnit.definition.name}s are acting…`;
    }
    if (pendingDarting) {
      return 'Blinkwing Mantle — choose a highlighted retreat cell, or press Esc to return to the starting cell.';
    }
    if (pendingSpell) {
      const friendly = SPELLS[pendingSpell].friendly;
      return `Casting ${SPELL_META[pendingSpell].label} — click ${friendly ? 'one of your stacks' : 'an enemy'}, or click elsewhere to cancel.`;
    }
    if (pendingActivated) {
      if (pendingActivated.id === 'set_the_ambush' || pendingActivated.id === 'open_an_escape_route') return 'Choose the centre of a highlighted 3×3 area, or press Esc to cancel.';
      if (pendingActivated.id === 'gate') return 'Choose a highlighted adjacent empty tile for the summoned Imps.';
      if (pendingActivated.id === 'caustic_breath') return 'Choose one of the eight highlighted directions for Caustic Breath.';
      if (pendingActivated.id === 'ride_by_attack') return 'Choose an enemy and a highlighted charge position for Ride-By Attack.';
      return `Choose a highlighted target for ${pendingActivated.id.replaceAll('_', ' ')}.`;
    }
    if (meleeTargeting === 'drag') {
      return 'Release over a highlighted tile to attack — drag back over the enemy to cancel.';
    }
    if (meleeTargeting === 'choose') {
      return 'Choose attack position — click or tap a highlighted tile. Click the enemy again, press Esc, or right-click to cancel.';
    }
    if (isPlayerTurn && activeUnit.isHero) {
      return 'Your hero\'s turn — click any enemy to strike, or cast a spell.';
    }
    if (isPlayerTurn) {
      const hints = ['highlighted cell to move'];
      if ([...actionIcons.values()].includes('melee')) hints.push('⚔️ enemy, then an attack position (or drag)');
      if (canShoot(activeUnit) && !shootingBlocked) {
        hints.push(`🏹 enemy to shoot (${activeUnit.shotsLeft} left)`);
      }
      const blockedNote = shootingBlocked ? ' Shooting blocked — enemy adjacent!' : '';
      return `Your ${activeUnit.definition.name}s' turn — click a ${hints.join(', ')}.${blockedNote}`;
    }
    return `Enemy ${activeUnit.definition.name}s are acting…`;
  });
  // D toggles the development drawer unless a form control owns the keystroke.
  // Escape backs out of the most recent modal/targeting state first.
  function handleKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    const typing = target?.matches('input, textarea, select, [contenteditable="true"]') ?? false;
    if (debugAvailable && e.key.toLowerCase() === 'd' && !typing && battle.result === 'ongoing' && !animating) {
      e.preventDefault();
      if (debugOpen) closeDebug();
      else {
        settingsOpen = false;
        debugOpen = true;
        debugSelectedId = activeUnit && !activeUnit.isHero ? activeUnit.id : debugSelectedId;
      }
      return;
    }
    if (e.key !== 'Escape') return;
    if (logOpen) logOpen = false;
    else if (debugPlacement) debugPlacement = null;
    else if (debugOpen) closeDebug();
    else if (pendingDarting) {
      takeAction({ type: 'attack', targetId: pendingDarting.targetId, moveTo: pendingDarting.moveTo }, 'host');
      pendingDarting = null;
    }
    else if (pendingSpell) pendingSpell = null;
    else if (pendingActivated) pendingActivated = null;
    else if (selectedId) selectedId = null;
  }
</script>

<svelte:window onkeydown={handleKeydown} onresize={measureFit} />

<!-- Horizontal bands, each answering one question: whose turn is it (ATB
     ribbon), what should I do now (status strip), where is everyone (flank ·
     battlefield · creature rail), and what can the acting stack do (action
     dock · battle log). The screen claims the space left below whichever page
     header hosts it, and everything inside is sized in multiples of --fx so
     the proportions hold at any resolution. -->
<div bind:this={screenEl} class="battle-screen" style="--fx: {fx}px; height: {availableH}px">
  <!-- ══ Band 1: ATB turn ribbon ══ -->
  <div class="atb-band">
    <TurnBar
      state={battle}
      hoveredId={hovered?.id ?? null}
      {previewAction}
      onhover={u => (hovered = u)}
    />
  </div>

  <!-- ══ Band 2: status strip ══ -->
  <!-- The current prompt, spanning the full width so the flank and the board
       share one box below it — that is what lets the hero standee sit on the
       board's centreline without a magic offset. Fixed height: content changes
       must never reflow the board. z-40 because the tilted board's projection
       overflows upward over this strip, and without a stacking context its
       buttons would be unclickable. -->
  <div class="status-band">
    {#if inDeploy}
      <div class="status-card deploy">
        <p class="status-text text-sm font-medium text-slate-100">
          Rank {gauntletRound} · Enemy Veterancy +{enemyVeterancy} Attack/Defence — reposition whole stacks by clicking a stack, then a highlighted cell{selectedDeployUnit ? ' (or another stack to swap)' : ''}.
        </p>
        {#if !online}
          <button type="button" class="status-button ml-auto" disabled={debugOpen} onclick={resetDeploy}>Reset</button>
        {/if}
        <button type="button" class="status-button primary" disabled={debugOpen} onclick={beginBattle}>
          {online ? 'Confirm deployment ✓' : 'Begin battle ⚔️'}
        </button>
      </div>
    {:else}
      <div class="status-card">
        <p class="status-text text-sm font-medium text-slate-100">{statusText}</p>
      </div>
    {/if}
  </div>

  <!-- ══ Band 3: flank · battlefield · creature info ══ -->
  <div class="battle-middle">
    <!-- Left flank: battle controls at the top, hero standee centred on the
         battlefield beside it. -->
    <div class="flank">
      {#if !replay}
        <div class="flank-top">
          <div class="flank-buttons">
            <button
              type="button"
              class="flank-button {settingsOpen ? 'active' : ''}"
              aria-label="Settings"
              title="Battle settings"
              disabled={debugOpen}
              onclick={() => (settingsOpen = !settingsOpen)}
            >⚙️</button>
            {#if debugAvailable}
              <button
                type="button"
                class="flank-button debug {debugOpen ? 'active' : ''}"
                aria-label="Battle debugger"
                title="Battle debugger (D)"
                disabled={battle.result !== 'ongoing' || animating}
                onclick={() => {
                  settingsOpen = false;
                  debugOpen = !debugOpen;
                  if (!debugOpen) debugPlacement = null;
                  else debugSelectedId = activeUnit && !activeUnit.isHero ? activeUnit.id : debugSelectedId;
                }}
              >🛠️</button>
            {/if}
            {#if !debugAvailable}
              <button
                type="button"
                class="flank-button"
                aria-label="Auto battle"
                title="Auto battle — not wired up yet"
                disabled
              >⏩</button>
            {/if}
          </div>

          {#if settingsOpen}
            <div class="settings-popover">
              <p class="settings-heading">Combat speed</p>
              <div class="settings-pills" role="group" aria-label="battle speed">
                {#each Object.keys(AI_SPEEDS) as speed (speed)}
                  <button
                    type="button"
                    class="settings-pill {battleSpeed === speed ? 'on' : ''}"
                    onclick={() => (battleSpeed = speed as BattleSpeed)}
                  >
                    {speed}
                  </button>
                {/each}
              </div>
              <button
                type="button"
                class="settings-resign"
                aria-label="Resign"
                disabled={battle.result !== 'ongoing'}
                onclick={() => {
                  settingsOpen = false;
                  handleForfeit();
                }}
              >
                🏳️ Resign battle
              </button>
              <!-- The way out of the battle screen, which no longer has a page
                   header above it. A link, not a button: the run keeps its
                   server-side save, so this is plain navigation. Resign above
                   is still how you deliberately lose the fight. -->
              <a href="/" class="settings-leave">← Main game</a>
            </div>
          {:else}
            <!-- Active artifacts: army-wide bonuses in play, tucked under the cog. -->
            <ArtifactStrip {items} />
          {/if}
        </div>
      {/if}

      {#if heroUnit && heroUnit.count > 0}
        <!-- Hero on the flank: a bare sprite like any other unit; its
             attributes appear in the creature-info rail on hover. -->
        <button
          type="button"
          class="hero-standee {heroUnit.id === hovered?.id ? 'brightness-125' : ''}"
          aria-label="Hero — level {deployHero.level}"
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
          <Sprite name={heroSpriteName(deployHero.class)} class="hero-sprite" />
        </button>
      {/if}
    </div>

    <!-- Battlefield stage: the board plus every overlay that covers it. -->
    <div class="board-column">
      <!-- The board is width-driven (a 12×9 grid of square cells projected to
           ~0.68 × its width). Giving the wrapper that aspect ratio at full
           height lets the board grow to fill whatever the bands leave over —
           no viewport-height arithmetic, no fixed maximum. -->
      <div class="board-fit">
        <BattleGrid
          state={battle}
          reachableKeys={pendingDarting ? dartingRetreatKeys : pendingSpell ? new Set() : pendingActivated ? activatedCellKeys : reachableKeys}
          movementRangeKeys={hoverMovementKeys}
          shootingRangeKeys={hoverShootingKeys}
          targetIds={gridTargetIds}
          activeId={battle.currentUnitId}
          interactive={isPlayerTurn && !animating}
          deployMode={inDeploy && !debugOpen}
          deployableKeys={deployableKeys}
          selectedDeployId={selectedDeployId}
          debugPlacementMode={debugOpen && !!debugPlacement}
          {debugPlaceableKeys}
          actionIcons={gridActionIcons}
          penalizedShotIds={pendingDarting || pendingSpell || animating ? new Set() : penalizedShotIds}
          originsByTarget={pendingDarting || pendingSpell ? new Map() : originsByTarget}
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
          ontargetingchange={mode => (meleeTargeting = mode)}
          ondeploycell={handleDeployCell}
          ondeployunit={handleDeployUnit}
          ondebugcell={handleDebugPlacement}
          onunithover={u => (hovered = u)}
          onunitinspect={inspect}
        />
      </div>

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
        <div class="result-overlay">
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

    <!-- Right rail: whatever is hovered or pinned, at full height. The panel
         itself only exists while there is something to show, but its gutter is
         always reserved — the board is sized by height, so it cannot grow into
         reclaimed width and would instead re-centre, sliding out from under the
         cursor that triggered the hover. -->
    <div class="info-rail">
      {#if infoUnit}
        <UnitInfo
          unit={infoUnit}
          hero={heroFor(battle, infoUnit)}
          pinned={!!selectedUnit}
          onunpin={() => (selectedId = null)}
          size="rail"
        />
      {/if}
    </div>
  </div>

  <!-- ══ Band 4: action dock + battle log ══ -->
  <div class="dock-band">
    <div class="dock-slot">
      <ActionDock
        unit={activeUnit}
        disabled={!isPlayerTurn || animating}
        {isHeroTurn}
        {spellbookOpen}
        abilities={unitAbilities}
        onwait={handleWait}
        ondefend={handleDefend}
        onpreview={action => (previewAction = action)}
        onspellbook={() => (spellbookOpen = !spellbookOpen)}
        onability={handleAbility}
      />
    </div>
    <div class="log-slot">
      <GameLog lines={logLines} dense onexpand={() => (logOpen = true)} />
    </div>
  </div>

  {#if logOpen}
    <!-- Full history, same component at full size. -->
    <div
      class="log-modal-backdrop"
      role="presentation"
      onclick={e => {
        if (e.target === e.currentTarget) logOpen = false;
      }}
    >
      <div class="log-modal" role="dialog" aria-label="Battle log">
        <GameLog lines={logLines} />
        <button
          type="button"
          class="log-modal-close"
          aria-label="Close battle log"
          title="Close"
          onclick={() => (logOpen = false)}
        >×</button>
      </div>
    </div>
  {/if}
</div>

{#if debugAvailable && debugOpen && battle.result === 'ongoing'}
  <BattleDebugDrawer
    state={battle}
    selectedId={debugSelectedId}
    placementLabel={debugPlacement?.label ?? null}
    canUndo={!!debugUndo}
    onclose={closeDebug}
    onselect={unitId => (debugSelectedId = unitId)}
    onrequestadd={requestDebugAdd}
    onrequestduplicate={requestDebugDuplicate}
    onupdate={updateDebugStack}
    ondelete={unit => commitDebug({
      kind: 'delete',
      unitId: unit.id,
      label: `deleted ${unit.definition.name}s from ${unit.side === 'player' ? 'your side' : 'the opponent'}`,
    })}
    onkill={unit => commitDebug({
      kind: 'kill',
      unitId: unit.id,
      label: `killed ${unit.definition.name}s on ${unit.side === 'player' ? 'your side' : 'the opponent'}`,
    })}
    onheal={unit => commitDebug({
      kind: 'heal',
      unitId: unit.id,
      label: `fully healed ${unit.definition.name}s`,
    })}
    onswitchside={unit => commitDebug({
      kind: 'switch_side',
      unitId: unit.id,
      label: `switched ${unit.definition.name}s to ${unit.side === 'player' ? 'the opponent' : 'your side'}`,
    })}
    onundo={undoDebug}
    onreset={resetDebugBattle}
  />
{/if}

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
  /* --fx is the scaled pixel: one design pixel at the current viewport. Every
     length below (and in TurnBar, ActionDock, UnitInfo's rail variant and
     GameLog's dense variant) is a multiple of it, so the whole screen keeps its
     proportions rather than being pinned to a canvas size. */
  .battle-screen {
    display: flex;
    min-height: 0;
    flex-direction: column;
    gap: calc(8 * var(--fx));
  }

  .atb-band {
    flex: none;
    position: relative;
    z-index: 40;
  }

  .battle-middle {
    display: flex;
    min-height: 0;
    flex: 1;
    align-items: stretch;
    gap: calc(12 * var(--fx));
  }

  /* ── left flank ─────────────────────────────────────────────────── */

  .flank {
    position: relative;
    z-index: 30;
    display: flex;
    width: calc(90 * var(--fx));
    flex: none;
    flex-direction: column;
    align-items: center;
  }

  .flank-top {
    position: relative;
    display: flex;
    width: 100%;
    flex-direction: column;
    align-items: center;
    gap: calc(7 * var(--fx));
  }

  .flank-buttons {
    display: flex;
    align-items: center;
    gap: calc(6 * var(--fx));
  }

  .flank-button {
    display: flex;
    width: calc(40 * var(--fx));
    height: calc(40 * var(--fx));
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: 1px solid rgb(148 163 184 / 0.55);
    background: rgb(30 41 59 / 0.9);
    font-size: calc(18 * var(--fx));
    line-height: 1;
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.4);
  }

  .flank-button:hover:not(:disabled) {
    background: rgb(51 65 85 / 0.95);
  }

  .flank-button.active {
    background: rgb(71 85 105 / 0.95);
  }

  .flank-button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .settings-popover {
    position: absolute;
    top: calc(46 * var(--fx));
    left: 0;
    z-index: 50;
    width: calc(186 * var(--fx));
    padding: calc(11 * var(--fx));
    border-radius: calc(8 * var(--fx));
    border: 1px solid #475569;
    background: rgb(15 23 42 / 0.97);
    box-shadow: 0 12px 32px rgb(0 0 0 / 0.6);
  }

  .settings-heading {
    margin: 0 0 calc(5 * var(--fx));
    font-size: calc(11 * var(--fx));
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #94a3b8;
  }

  .settings-pills {
    display: flex;
    align-items: center;
    gap: calc(2 * var(--fx));
    margin-bottom: calc(11 * var(--fx));
    padding: calc(2 * var(--fx));
    border-radius: calc(5 * var(--fx));
    background: #1e293b;
  }

  .settings-pill {
    flex: 1;
    border-radius: calc(4 * var(--fx));
    padding: calc(4 * var(--fx)) calc(6 * var(--fx));
    font-size: calc(11 * var(--fx));
    font-weight: 500;
    text-transform: capitalize;
    color: #94a3b8;
  }

  .settings-pill:hover {
    color: #e2e8f0;
  }

  .settings-pill.on {
    background: #475569;
    color: #f1f5f9;
  }

  .settings-resign {
    width: 100%;
    border-radius: calc(5 * var(--fx));
    padding: calc(6 * var(--fx)) calc(11 * var(--fx));
    background: #7f1d1d;
    font-size: calc(12.5 * var(--fx));
    font-weight: 500;
    color: #fee2e2;
  }

  .settings-resign:hover:not(:disabled) {
    background: #991b1b;
  }

  .settings-resign:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .settings-leave {
    display: block;
    margin-top: calc(7 * var(--fx));
    text-align: center;
    font-size: calc(12 * var(--fx));
    color: #94a3b8;
  }

  .settings-leave:hover {
    color: #e2e8f0;
    text-decoration: underline;
  }

  /* Centred on the flank, which shares its box with the battlefield now that
     the status strip is its own band — so this lands on the board's own
     centreline. Absolute so a long artifact strip can't push the hero down. */
  .hero-standee {
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    /* Room for the shadow and the active-turn arc, which hang below the feet. */
    padding-bottom: calc(18 * var(--fx));
    transition: filter 0.15s ease;
  }

  .hero-standee :global(.hero-sprite) {
    position: relative;
    width: calc(76 * var(--fx));
    height: auto;
  }

  .hero-shadow {
    position: absolute;
    bottom: calc(14 * var(--fx));
    left: 15%;
    right: 15%;
    height: calc(16 * var(--fx));
    border-radius: 50%;
    background: radial-gradient(ellipse at center, rgb(0 0 0 / 0.55), transparent 70%);
  }

  .hero-arc {
    position: absolute;
    bottom: calc(10 * var(--fx));
    left: 12%;
    right: 12%;
    height: calc(22 * var(--fx));
    border: 3px solid #facc15;
    border-top-color: transparent;
    border-radius: 50%;
    filter: drop-shadow(0 0 3px rgb(250 204 21 / 0.7));
    pointer-events: none;
  }

  /* ── battlefield column ─────────────────────────────────────────── */

  .board-column {
    position: relative;
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
  }

  .status-band {
    position: relative;
    z-index: 40;
    display: flex;
    flex: none;
    justify-content: center;
  }

  .status-card {
    display: flex;
    height: calc(58 * var(--fx));
    max-width: calc(660 * var(--fx));
    flex-direction: column;
    justify-content: center;
    overflow: hidden;
    border-radius: calc(7 * var(--fx));
    border: 1px solid rgb(100 116 139 / 0.6);
    background: rgb(15 23 42 / 0.85);
    padding: 0 calc(18 * var(--fx));
    text-align: center;
    box-shadow: 0 6px 18px rgb(0 0 0 / 0.4);
  }

  .status-card.deploy {
    flex-direction: row;
    align-items: center;
    gap: calc(11 * var(--fx));
    border-color: rgb(245 158 11 / 0.5);
    text-align: left;
  }

  .status-text {
    margin: 0;
    font-size: calc(13.5 * var(--fx));
    line-height: 1.3;
    text-wrap: pretty;
  }

  .status-button {
    flex: none;
    border-radius: calc(4 * var(--fx));
    padding: calc(5 * var(--fx)) calc(12 * var(--fx));
    background: #334155;
    font-size: calc(12.5 * var(--fx));
    font-weight: 600;
    color: #fde68a;
  }

  .status-button:hover {
    background: #475569;
  }

  .status-button.primary {
    background: #d97706;
    color: #fff;
  }

  .status-button.primary:hover {
    background: #f59e0b;
  }

  .board-fit {
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    justify-content: center;
    /* The projected board is ~0.68 × its own width. */
    aspect-ratio: 100 / 68;
    max-width: 100%;
    margin-inline: auto;
  }

  .result-overlay {
    position: absolute;
    inset: 0;
    z-index: 50;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    border-radius: calc(8 * var(--fx));
    background: rgb(0 0 0 / 0.7);
  }

  /* ── creature-info rail ─────────────────────────────────────────── */

  .info-rail {
    width: calc(238 * var(--fx));
    flex: none;
  }

  /* ── dock band ──────────────────────────────────────────────────── */

  /* The dock's height is the one number that decides how much vertical space
     is left for the board, so tune it here rather than padding the segments:
     84 portrait + caption + padding is the floor before the passive list
     stops showing a full entry. */
  .dock-band {
    position: relative;
    z-index: 20;
    display: flex;
    flex: none;
    height: calc(148 * var(--fx));
    align-items: stretch;
    gap: calc(12 * var(--fx));
  }

  .dock-slot {
    min-width: 0;
    flex: 1;
  }

  .log-slot {
    width: calc(330 * var(--fx));
    flex: none;
  }

  /* ── expanded battle log ────────────────────────────────────────── */

  .log-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgb(2 6 23 / 0.72);
  }

  .log-modal {
    position: relative;
    width: min(90vw, calc(720 * var(--fx)));
    height: min(80vh, calc(640 * var(--fx)));
  }

  .log-modal-close {
    position: absolute;
    top: calc(6 * var(--fx));
    right: calc(8 * var(--fx));
    display: flex;
    width: calc(26 * var(--fx));
    height: calc(26 * var(--fx));
    align-items: center;
    justify-content: center;
    border-radius: calc(5 * var(--fx));
    border: 1px solid rgb(148 163 184 / 0.4);
    background: rgb(30 41 59 / 0.9);
    font-size: calc(15 * var(--fx));
    line-height: 1;
    color: #cbd5e1;
  }

  .log-modal-close:hover {
    background: rgb(51 65 85 / 0.95);
    border-color: #cbd5e1;
  }

  /* Narrow screens: something has to give, and the log is the piece the dock's
     status line and the creature rail can least replace — same call the old
     layout made. Mobile stays cramped by design; the battle screen is built for
     a desktop-sized viewport. */
  @media (max-width: 63.9375rem) {
    .log-slot {
      display: none;
    }
  }
</style>
