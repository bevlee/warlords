<script lang="ts">
  import { onMount } from 'svelte';
  import { CATALOG, type CatalogUnit } from '$lib/engine/catalog';
  import { FACTION_INFO } from '$lib/engine/factions';
  import { ABILITY_CATALOG, abilityLevel } from '$lib/engine/abilityCatalog';
  import { DEBUG_ABILITY_IDS, templateFromStack } from '$lib/engine/debugBattle';
  import type { BattleState, DebugStackTemplate, FactionClass, UnitStack } from '$lib/engine/types';
  import { abilityInfo } from './abilities';
  import Sprite from './Sprite.svelte';

  interface Props {
    state: BattleState;
    selectedId: string | null;
    placementLabel: string | null;
    canUndo: boolean;
    onclose: () => void;
    onselect: (unitId: string | null) => void;
    onrequestadd: (unit: CatalogUnit, side: UnitStack['side'], count: number) => void;
    onrequestduplicate: (unit: UnitStack) => void;
    onupdate: (unitId: string, stack: DebugStackTemplate) => void;
    ondelete: (unit: UnitStack) => void;
    onkill: (unit: UnitStack) => void;
    onheal: (unit: UnitStack) => void;
    onswitchside: (unit: UnitStack) => void;
    onundo: () => void;
    onreset: () => void;
  }

  let {
    state: battleState,
    selectedId,
    placementLabel,
    canUndo,
    onclose,
    onselect,
    onrequestadd,
    onrequestduplicate,
    onupdate,
    ondelete,
    onkill,
    onheal,
    onswitchside,
    onundo,
    onreset,
  }: Props = $props();

  const PREFS_KEY = 'warlords:battle-debug-drawer';
  const factions = Object.keys(FACTION_INFO) as FactionClass[];
  const stacks = $derived(battleState.units.filter(unit => unit.count > 0 && !unit.isHero));
  const selected = $derived(stacks.find(unit => unit.id === selectedId) ?? null);

  let search = $state('');
  let side: UnitStack['side'] = $state('player');
  let addCount = $state(10);
  let pickedSlug = $state(CATALOG[0]?.slug ?? '');
  let addOpen = $state(true);
  let editOpen = $state(true);
  let abilitiesOpen = $state(true);
  let sessionLoaded = $state(false);

  const filteredUnits = $derived(
    CATALOG.filter(unit => unit.name.toLowerCase().includes(search.trim().toLowerCase()))
      .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name))
  );
  const picked = $derived(CATALOG.find(unit => unit.slug === pickedSlug) ?? filteredUnits[0] ?? CATALOG[0]);

  onMount(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(PREFS_KEY) ?? '{}') as Record<string, unknown>;
      if (saved.side === 'player' || saved.side === 'enemy') side = saved.side;
      if (typeof saved.count === 'number' && saved.count >= 1) addCount = Math.floor(saved.count);
      if (typeof saved.slug === 'string' && CATALOG.some(unit => unit.slug === saved.slug)) pickedSlug = saved.slug;
      if (typeof saved.addOpen === 'boolean') addOpen = saved.addOpen;
      if (typeof saved.editOpen === 'boolean') editOpen = saved.editOpen;
      if (typeof saved.abilitiesOpen === 'boolean') abilitiesOpen = saved.abilitiesOpen;
    } catch {
      // Corrupt session preferences are disposable debug-only state.
    }
    sessionLoaded = true;
  });

  $effect(() => {
    if (!sessionLoaded) return;
    sessionStorage.setItem(PREFS_KEY, JSON.stringify({ side, count: addCount, slug: pickedSlug, addOpen, editOpen, abilitiesOpen }));
  });

  let count = $state(1);
  let currentHp = $state(1);
  let maxHp = $state(1);
  let attack = $state(0);
  let defense = $state(0);
  let minDamage = $state(0);
  let maxDamage = $state(0);
  let speed = $state(0);
  let initiative = $state(0);
  let shots = $state(0);
  let shotsLeft = $state(0);
  let range = $state(0);
  let morale = $state(0);
  let luck = $state(0);
  let atb = $state(0);
  let enabledAbilities: Record<string, boolean> = $state({});
  let abilityLevels: Record<string, number> = $state({});
  let loadedKey = '';
  let error = $state('');

  $effect(() => {
    const unit = selected;
    const key = unit ? `${unit.id}:${battleState.log.length}` : '';
    if (!unit || key === loadedKey) return;
    loadedKey = key;
    const d = unit.definition;
    count = unit.count;
    currentHp = unit.hp;
    maxHp = d.hp;
    attack = d.attack;
    defense = d.defense;
    minDamage = d.minDamage;
    maxDamage = d.maxDamage;
    speed = d.speed;
    initiative = d.initiative;
    shots = d.shots;
    shotsLeft = unit.shotsLeft;
    range = d.range;
    morale = unit.morale;
    luck = unit.luck;
    atb = unit.atb;
    enabledAbilities = Object.fromEntries(DEBUG_ABILITY_IDS.map(id => [id, d.abilities.includes(id)]));
    abilityLevels = Object.fromEntries(
      DEBUG_ABILITY_IDS.map(id => [id, abilityLevel(d, id) || ABILITY_CATALOG[id]?.defaultLevel || 1])
    );
    error = '';
  });

  function safeInt(value: number): number {
    return Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  }

  function applyEdits() {
    if (!selected) return;
    const nextCount = Math.max(1, safeInt(count));
    const nextMaxHp = Math.max(1, safeInt(maxHp));
    const nextMin = safeInt(minDamage);
    const nextMax = safeInt(maxDamage);
    if (nextMin > nextMax) {
      error = 'Minimum damage cannot exceed maximum damage.';
      return;
    }
    const editableAbilities = DEBUG_ABILITY_IDS.filter(id => enabledAbilities[id]);
    // Definition-only placeholders are not offered as debug choices, but a
    // stat edit must never silently strip them from a native unit.
    const preservedAbilities = templateFromStack(selected).definition.abilities.filter(
      id => !DEBUG_ABILITY_IDS.includes(id as typeof DEBUG_ABILITY_IDS[number])
    );
    const abilities = [...preservedAbilities, ...editableAbilities];
    const levels = Object.fromEntries([
      ...Object.entries(selected.definition.abilityLevels ?? {}).filter(([id]) => preservedAbilities.includes(id)),
      ...editableAbilities
        .filter(id => ABILITY_CATALOG[id]?.kind === 'leveled')
        .map(id => [id, Math.max(1, Math.min(ABILITY_CATALOG[id].maxLevel, safeInt(abilityLevels[id])))])
    ]);
    const template = templateFromStack(selected);
    const stack: DebugStackTemplate = {
      ...template,
      definition: {
        ...template.definition,
        hp: nextMaxHp,
        attack: safeInt(attack),
        defense: safeInt(defense),
        minDamage: nextMin,
        maxDamage: nextMax,
        speed: safeInt(speed),
        initiative: safeInt(initiative),
        shots: safeInt(shots),
        range: safeInt(range),
        abilities,
        grantedAbilities: template.definition.grantedAbilities?.filter(id => abilities.includes(id as typeof abilities[number])),
        abilityLevels: Object.keys(levels).length ? levels : undefined,
      },
      count: nextCount,
      startCount: nextCount,
      hp: Math.max(1, Math.min(nextMaxHp, safeInt(currentHp))),
      shotsLeft: Math.min(safeInt(shots), safeInt(shotsLeft)),
      morale: Math.max(-3, Math.min(3, Math.trunc(morale))),
      luck: Math.max(-3, Math.min(3, Math.trunc(luck))),
      atb: Math.max(0, Math.min(1, Number.isFinite(atb) ? atb : 0)),
    };
    error = '';
    onupdate(selected.id, stack);
  }

  function requestAdd() {
    if (!picked) return;
    onrequestadd(picked, side, Math.max(1, safeInt(addCount)));
  }
</script>

<div class="debug-drawer" role="dialog" aria-label="Battle debug tools">
  <header class="drawer-header">
    <div>
      <p class="eyebrow">Development only</p>
      <h2>Battle debugger</h2>
    </div>
    <button type="button" class="icon-button" aria-label="Close debug drawer" title="Close (D or Esc)" onclick={onclose}>×</button>
  </header>

  {#if placementLabel}
    <div class="placement-banner">
      <strong>Placement armed</strong>
      <span>{placementLabel}</span>
      <small>Click any highlighted empty battlefield cell.</small>
    </div>
  {/if}

  <div class="toolbar">
    <button type="button" disabled={!canUndo} onclick={onundo}>↶ Undo</button>
    <button
      type="button"
      class="danger-ghost"
      onclick={() => window.confirm('Reset all combat and debug changes to the original deployment?') && onreset()}
    >Reset battle</button>
  </div>

  <div class="drawer-scroll">
    <details bind:open={addOpen}>
      <summary>Add stack</summary>
      <div class="section-body">
        <div class="side-pills" role="group" aria-label="Stack side">
          <button type="button" class:active={side === 'player'} onclick={() => (side = 'player')}>Your side</button>
          <button type="button" class:active={side === 'enemy'} onclick={() => (side = 'enemy')}>Opponent</button>
        </div>
        <input class="wide-input" bind:value={search} placeholder="Search units…" aria-label="Search units" />
        <div class="unit-picker">
          {#each factions as faction}
            {@const factionUnits = filteredUnits.filter(unit => unit.faction === faction)}
            {#if factionUnits.length}
              <p class="group-heading">{FACTION_INFO[faction].name}</p>
              {#each factionUnits as unit (unit.slug)}
                <button type="button" class="unit-option" class:selected={pickedSlug === unit.slug} onclick={() => (pickedSlug = unit.slug)}>
                  <Sprite name={unit.name} class="unit-sprite" />
                  <span><strong>{unit.name}</strong><small>Tier {unit.tier} · HP {unit.hp} · {unit.minDamage}–{unit.maxDamage} dmg</small></span>
                </button>
              {/each}
            {/if}
          {/each}
          {#if filteredUnits.length === 0}<p class="empty">No units match.</p>{/if}
        </div>
        <label class="field single"><span>Count</span><input type="number" min="1" step="1" bind:value={addCount} /></label>
        <button type="button" class="primary" disabled={!picked || !!placementLabel} onclick={requestAdd}>
          {placementLabel ? 'Finish current placement first' : `Place ${picked?.name ?? 'unit'}…`}
        </button>
      </div>
    </details>

    <details bind:open={editOpen}>
      <summary>Edit stack</summary>
      <div class="section-body">
        <label class="select-label">
          <span>Selected stack</span>
          <select value={selectedId ?? ''} onchange={event => onselect(event.currentTarget.value || null)}>
            <option value="">Choose a stack…</option>
            {#each stacks as unit (unit.id)}
              <option value={unit.id}>{unit.side === 'player' ? 'You' : 'Opponent'} · {unit.definition.name} ×{unit.count}</option>
            {/each}
          </select>
        </label>

        {#if selected}
          <div class="selected-heading">
            <Sprite name={selected.definition.name} class="selected-sprite" />
            <div><strong>{selected.definition.name}</strong><small>{selected.side === 'player' ? 'Your side' : 'Opponent'} · {selected.id}</small></div>
          </div>
          <div class="field-grid">
            <label class="field"><span>Count / max</span><input type="number" min="1" step="1" bind:value={count} /></label>
            <label class="field"><span>Current HP</span><input type="number" min="1" step="1" bind:value={currentHp} /></label>
            <label class="field"><span>Max HP</span><input type="number" min="1" step="1" bind:value={maxHp} /></label>
            <label class="field"><span>Attack</span><input type="number" min="0" step="1" bind:value={attack} /></label>
            <label class="field"><span>Defense</span><input type="number" min="0" step="1" bind:value={defense} /></label>
            <label class="field"><span>Min damage</span><input type="number" min="0" step="1" bind:value={minDamage} /></label>
            <label class="field"><span>Max damage</span><input type="number" min="0" step="1" bind:value={maxDamage} /></label>
            <label class="field"><span>Speed</span><input type="number" min="0" step="1" bind:value={speed} /></label>
            <label class="field"><span>Initiative</span><input type="number" min="0" step="1" bind:value={initiative} /></label>
            <label class="field"><span>Total shots</span><input type="number" min="0" step="1" bind:value={shots} /></label>
            <label class="field"><span>Shots left</span><input type="number" min="0" step="1" bind:value={shotsLeft} /></label>
            <label class="field"><span>Range</span><input type="number" min="0" step="1" bind:value={range} /></label>
            <label class="field"><span>Morale</span><input type="number" min="-3" max="3" step="1" bind:value={morale} /></label>
            <label class="field"><span>Luck</span><input type="number" min="-3" max="3" step="1" bind:value={luck} /></label>
            <label class="field"><span>ATB (0–1)</span><input type="number" min="0" max="1" step="0.05" bind:value={atb} /></label>
          </div>

          <details class="abilities" bind:open={abilitiesOpen}>
            <summary>Abilities</summary>
            <div class="ability-list">
              {#each DEBUG_ABILITY_IDS as id}
                {@const meta = abilityInfo(id, abilityLevels[id])}
                <label class="ability-row">
                  <input
                    type="checkbox"
                    checked={enabledAbilities[id] ?? false}
                    onchange={event => (enabledAbilities = { ...enabledAbilities, [id]: event.currentTarget.checked })}
                  />
                  <span><strong>{meta.label}</strong><small>{meta.description}</small></span>
                  {#if enabledAbilities[id] && ABILITY_CATALOG[id]?.kind === 'leveled'}
                    <input
                      class="level-input"
                      aria-label="{meta.label} level"
                      type="number"
                      min="1"
                      max={ABILITY_CATALOG[id].maxLevel}
                      step="1"
                      value={abilityLevels[id]}
                      onchange={event => (abilityLevels = { ...abilityLevels, [id]: event.currentTarget.valueAsNumber })}
                    />
                  {/if}
                </label>
              {/each}
            </div>
          </details>

          {#if error}<p class="error">{error}</p>{/if}
          <button type="button" class="primary" onclick={applyEdits}>Apply to stack</button>
          <div class="stack-actions">
            <button type="button" disabled={!!placementLabel} onclick={() => onrequestduplicate(selected)}>Duplicate…</button>
            <button type="button" onclick={() => onheal(selected)}>Fully heal</button>
            <button type="button" onclick={() => onswitchside(selected)}>Switch side</button>
            <button type="button" class="danger-ghost" onclick={() => onkill(selected)}>Kill</button>
            <button type="button" class="danger-ghost" onclick={() => ondelete(selected)}>Delete</button>
          </div>
        {/if}
      </div>
    </details>
  </div>
</div>

<style>
  .debug-drawer {
    position: fixed;
    top: 0;
    right: 0;
    z-index: 100;
    display: flex;
    width: min(430px, 94vw);
    height: 100dvh;
    flex-direction: column;
    border-left: 1px solid #a16207;
    background: rgb(2 6 23 / 0.985);
    color: #e2e8f0;
    box-shadow: -18px 0 60px rgb(0 0 0 / 0.65);
  }
  .drawer-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px; border-bottom: 1px solid #334155; }
  .drawer-header h2 { margin: 1px 0 0; font-size: 21px; font-weight: 750; }
  .eyebrow { margin: 0; color: #fbbf24; font-size: 10px; font-weight: 800; letter-spacing: .17em; text-transform: uppercase; }
  .icon-button { width: 34px; height: 34px; border-radius: 6px; background: #1e293b; font-size: 24px; line-height: 1; }
  .placement-banner { display: flex; flex-direction: column; gap: 2px; padding: 10px 18px; border-bottom: 1px solid #a16207; background: #78350f; color: #fef3c7; }
  .placement-banner small { color: #fde68a; }
  .toolbar { display: flex; gap: 8px; padding: 10px 18px; border-bottom: 1px solid #1e293b; }
  button { border-radius: 6px; padding: 7px 10px; background: #334155; font-size: 12px; font-weight: 650; }
  button:hover:not(:disabled) { background: #475569; }
  button:disabled { cursor: not-allowed; opacity: .42; }
  .toolbar button { flex: 1; }
  .danger-ghost { border: 1px solid #7f1d1d; background: #450a0a99; color: #fecaca; }
  .danger-ghost:hover:not(:disabled) { background: #7f1d1d; }
  .drawer-scroll { min-height: 0; flex: 1; overflow-y: auto; padding: 12px 14px 28px; }
  details { margin-bottom: 10px; overflow: hidden; border: 1px solid #334155; border-radius: 8px; background: #0f172a; }
  summary { cursor: pointer; padding: 11px 13px; font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: #fcd34d; }
  .section-body { display: flex; flex-direction: column; gap: 10px; padding: 0 12px 13px; }
  .side-pills { display: flex; padding: 3px; border-radius: 7px; background: #020617; }
  .side-pills button { flex: 1; background: transparent; color: #94a3b8; }
  .side-pills button.active { background: #1d4ed8; color: white; }
  .side-pills button:last-child.active { background: #b91c1c; }
  input, select { min-width: 0; border: 1px solid #475569; border-radius: 5px; background: #020617; color: #f8fafc; }
  .wide-input, select { width: 100%; padding: 8px 9px; font-size: 13px; }
  .unit-picker { max-height: 210px; overflow-y: auto; border: 1px solid #1e293b; border-radius: 6px; background: #020617; }
  .group-heading { position: sticky; top: 0; z-index: 1; margin: 0; padding: 5px 8px; background: #1e293b; color: #94a3b8; font-size: 9px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
  .unit-option { display: flex; width: 100%; align-items: center; gap: 8px; border-radius: 0; padding: 5px 8px; background: transparent; text-align: left; }
  .unit-option.selected { background: #854d0e; }
  .unit-option :global(.unit-sprite) { width: 34px; height: 38px; flex: none; object-fit: contain; }
  .unit-option span, .selected-heading div, .ability-row span { display: flex; min-width: 0; flex: 1; flex-direction: column; }
  .unit-option strong { font-size: 12px; }
  small { color: #94a3b8; font-size: 10px; font-weight: 450; }
  .empty { padding: 14px; color: #64748b; text-align: center; }
  .field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
  .field { display: flex; min-width: 0; flex-direction: column; gap: 3px; color: #94a3b8; font-size: 10px; }
  .field input { width: 100%; padding: 6px 7px; font-family: ui-monospace, monospace; font-size: 12px; }
  .field.single { width: 130px; }
  .select-label { display: flex; flex-direction: column; gap: 4px; color: #94a3b8; font-size: 10px; }
  .selected-heading { display: flex; align-items: center; gap: 9px; border-radius: 7px; background: #1e293b; padding: 8px; }
  .selected-heading :global(.selected-sprite) { width: 44px; height: 48px; object-fit: contain; }
  .abilities { margin: 2px 0 0; background: #020617; }
  .abilities summary { padding: 8px 10px; color: #cbd5e1; font-size: 10px; }
  .ability-list { max-height: 260px; overflow-y: auto; padding: 0 8px 8px; }
  .ability-row { display: flex; align-items: flex-start; gap: 7px; padding: 6px 2px; border-top: 1px solid #1e293b; }
  .ability-row > input[type='checkbox'] { width: 15px; height: 15px; flex: none; margin-top: 2px; accent-color: #d97706; }
  .ability-row strong { color: #fcd34d; font-size: 11px; }
  .level-input { width: 48px; flex: none; padding: 4px; font-size: 11px; }
  .primary { width: 100%; background: #b45309; color: white; }
  .primary:hover:not(:disabled) { background: #d97706; }
  .stack-actions { display: grid; grid-template-columns: repeat(2, 1fr); gap: 7px; }
  .error { margin: 0; border-radius: 5px; background: #450a0a; padding: 7px; color: #fecaca; font-size: 11px; }
</style>
