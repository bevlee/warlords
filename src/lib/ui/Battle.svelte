<script lang="ts">
  import { initBattle, applyAction, spellPreview, SPELLS } from '$lib/engine/battle';
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
    ArmySlot,
    BattleEvent,
    BattleState,
    Hero,
    Pos,
    SpellId,
    UnitStack,
  } from '$lib/engine/types';
  import type { Deployment } from '$lib/engine/deploy';
  import BattleGrid from './BattleGrid.svelte';
  import TurnBar from './TurnBar.svelte';
  import UnitInfo from './UnitInfo.svelte';
  import Sprite from './Sprite.svelte';
  import SpellBook from './SpellBook.svelte';
  import { stepsFromLogEntry, applyLogEntry, type AnimStep } from './animSteps';

  interface Props {
    playerArmy: ArmySlot[];
    enemyArmy: ArmySlot[];
    hero: Hero;
    onexit?: () => void;
    onresult?: (result: 'player_wins' | 'enemy_wins', finalUnits: UnitStack[]) => void;
    allowRestart?: boolean;
    exitLabel?: string;
    seed?: number;              // share the battlefield with a deployment preview
    deployment?: Deployment[];  // player-chosen stack placement (auto layout when absent)
  }

  let {
    playerArmy,
    enemyArmy,
    hero,
    onexit,
    onresult,
    allowRestart = true,
    exitLabel = 'Change army',
    seed,
    deployment,
  }: Props = $props();

  const AI_SPEEDS = { slow: 900, normal: 450, fast: 150 } as const;
  type BattleSpeed = keyof typeof AI_SPEEDS;
  let battleSpeed: BattleSpeed = $state('normal');
  const AI_DELAY_MS = $derived(AI_SPEEDS[battleSpeed]);

  // A battle snapshots its armies at start; later prop changes are irrelevant.
  // svelte-ignore state_referenced_locally
  let battle: BattleState = $state(initBattle(playerArmy, enemyArmy, hero, seed ?? Date.now(), deployment));

  // Incremental reveal: an action's sub-events (hit, retaliate, death) play
  // as separate beats. While a sequence runs, `animating` locks player input
  // and the AI timer. `revealToken` invalidates an in-flight sequence when
  // restart/forfeit replaces the battle out from under it — a resumed await
  // must not clobber the fresh state.
  let animating = $state(false);
  let activeSteps = $state<{ unitId: string; step: AnimStep }[]>([]);
  let dyingIds = $state(new Set<string>());
  let revealToken = 0;

  const STEP_DELAY_MS = $derived({ slow: 700, normal: 450, fast: 200 }[battleSpeed]);

  // A beat's CSS outlives its beat: the floating damage/status text runs 0.9s
  // and the death fade 0.6s, against a 200–700ms beat. Mid-sequence that's
  // fine — the next beat's delay gives it room to finish. The last beat has no
  // next, so clearing straight after it cuts the animation off mid-flight;
  // retaliations and deaths land last most often, which is why they were the
  // ones that looked like they had no animation at all. Hold for the longest
  // CSS before tearing the layer down. Not speed-scaled: the point is to let a
  // fixed-duration animation finish.
  const FX_TAIL_MS = 900;

  async function revealAction(result: BattleState) {
    const token = ++revealToken;
    animating = true;
    const newEntries = result.log.slice(battle.log.length);
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
      await new Promise(r => setTimeout(r, FX_TAIL_MS - STEP_DELAY_MS));
      if (token !== revealToken) return;
    }

    activeSteps = [];
    dyingIds = new Set();
    battle = result; // ground-truth correction
    animating = false;
  }

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

  // Damage forecast for the aiming tooltip; far shots preview at half damage.
  // While aiming a spell, forecast the spell itself (buffs show no numbers).
  const previews = $derived.by(() => {
    const map = new Map<string, ReturnType<typeof damagePreview>>();
    if (!isPlayerTurn || !activeUnit) return map;
    if (pendingSpell) {
      for (const id of spellTargetIds ?? []) {
        const target = battle.units.find(u => u.id === id);
        const p = target && spellPreview(battle.hero, pendingSpell, target);
        if (p) map.set(id, p);
      }
      return map;
    }
    for (const id of actionIcons.keys()) {
      const target = battle.units.find(u => u.id === id);
      if (target) map.set(id, damagePreview(activeUnit, target, hero.attack, actionIcons.get(id) === 'shoot'));
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
      onresult?.(battle.result, $state.snapshot(battle).units as UnitStack[]);
    }
  });

  // Enemy turns play automatically, one action at a time, so the player can follow.
  $effect(() => {
    if (battle.result !== 'ongoing' || animating) return;
    const unit = battle.units.find(u => u.id === battle.currentUnitId);
    if (!unit || unit.side !== 'enemy') return;
    const timer = setTimeout(() => {
      // Re-check at fire time: forfeited or still animating while pending.
      if (battle.result !== 'ongoing' || animating) return;
      revealAction(applyAction(battle, aiTakeTurn(battle, unit.id)));
    }, AI_DELAY_MS);
    return () => clearTimeout(timer);
  });

  function attackFrom(targetId: string, origin: Pos) {
    const inPlace = activeUnit && origin.col === activeUnit.pos.col && origin.row === activeUnit.pos.row;
    revealAction(
      applyAction(
        battle,
        inPlace ? { type: 'attack', targetId } : { type: 'attack', targetId, moveTo: origin }
      )
    );
    hovered = null;
  }

  function castAt(unit: UnitStack) {
    if (!pendingSpell) return;
    revealAction(applyAction(battle, { type: 'cast', spell: pendingSpell, targetId: unit.id }));
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
    revealAction(applyAction(battle, { type: 'move', to: pos }));
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
      revealAction(applyAction(battle, { type: 'shoot', targetId: unit.id }));
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
    revealAction(applyAction(battle, { type: 'wait' }));
  }

  function handleDefend() {
    if (!isPlayerTurn || animating) return;
    pendingSpell = null;
    revealAction(applyAction(battle, { type: 'defend' }));
  }

  function handleForfeit() {
    if (battle.result !== 'ongoing') return;
    revealToken++; // abort any in-flight reveal so it can't clobber the forfeit
    animating = false;
    activeSteps = [];
    dyingIds = new Set();
    pendingSpell = null;
    battle = { ...battle, result: 'enemy_wins', log: [...battle.log, { type: 'battle_end', data: { result: 'enemy_wins', forfeit: true } }] };
  }

  function restart() {
    revealToken++; // abort any in-flight reveal so it can't clobber the new battle
    animating = false;
    activeSteps = [];
    dyingIds = new Set();
    pendingSpell = null;
    resultAnnounced = false;
    // Rocks never spawn inside the deployment zone, so a kept layout stays
    // valid under the fresh seed's battlefield.
    battle = initBattle(playerArmy, enemyArmy, hero, Date.now(), deployment);
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
        return `${unitLabel(d.attackerId)} shoot ${unitLabel(d.targetId)} for ${d.damage} damage${d.farShot ? ' (long shot — half damage)' : ''}, killing ${d.killed}.`;
      case 'death':
        return `${unitLabel(d.unitId)} are wiped out!`;
      case 'morale_boost':
        return `High morale! ${unitLabel(d.unitId)} act again.`;
      case 'morale_freeze':
        return `Low morale — ${unitLabel(d.unitId)} freeze and skip their turn.`;
      case 'luck':
        return d.kind === 'good'
          ? `Lucky strike! ${unitLabel(d.unitId)} land a double-damage blow.`
          : `Bad luck — ${unitLabel(d.unitId)} fumble for half damage.`;
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
  const logTail = $derived(logLines.filter(l => l.trim()).slice(-2));

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
  // Escape backs out of the most recent thing first: a spell being aimed, then
  // a pinned unit.
  function handleKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    if (pendingSpell) pendingSpell = null;
    else if (selectedId) selectedId = null;
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="flex justify-center">
  <!-- Cap the board width by viewport height so the whole battle (board +
       turns bar) fits without scrolling on laptop screens. The subtrahend
       reserves the non-board chrome: status strip + the h-60 bottom row. -->
  <div class="w-full min-w-0" style="max-width: calc((100dvh - 430px) * 1.45 + 220px)">
    <!-- Combat indicator: status + last log lines, above the battlefield.
         Fixed height: content changes must never reflow the board below. -->
    <div class="mb-1 flex justify-center">
      <div
        class="flex h-16 max-w-2xl flex-col justify-center overflow-hidden rounded-lg border
          border-slate-600/60 bg-slate-900/85 px-5 text-center shadow-lg"
      >
        <p class="text-sm font-medium text-slate-100">{statusText}</p>
        {#each logTail as line, i (i)}
          <p class="truncate font-mono text-[11px] leading-snug text-slate-400">{line}</p>
        {/each}
      </div>
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
          actionIcons={gridActionIcons}
          originsByTarget={pendingSpell ? new Map() : originsByTarget}
          {previews}
          hoveredId={hovered?.id ?? null}
          {activeSteps}
          {dyingIds}
          stepMs={STEP_DELAY_MS}
          oncellclick={handleCellClick}
          onunitclick={handleUnitClick}
          onmeleeaim={handleMeleeAim}
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
      <div class="absolute left-1 top-1 z-30 flex flex-col items-start gap-1.5">
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
      </div>

    {#if spellbookOpen && isHeroTurn}
      <SpellBook
        hero={battle.hero}
        onpick={spell => {
          pendingSpell = spell;
          spellbookOpen = false;
        }}
        onclose={() => (spellbookOpen = false)}
      />
    {/if}

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
          hero={battle.hero}
          pinned={!!selectedUnit}
          onunpin={() => (selectedId = null)}
        />
      </div>
    </div>
  </div>
</div>

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
