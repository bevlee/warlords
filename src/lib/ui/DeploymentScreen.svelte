<script lang="ts">
  import {
    GRID_W,
    GRID_H,
    MAX_FIELD_STACKS,
    autoDeploy,
    enemyAutoDeploy,
    generateObstacles,
    deploymentZone,
    validateDeployment,
    splitDraft,
    mergeDraft,
    type Deployment,
    type DraftEntry,
  } from '$lib/engine/deploy';
  import { createGrid, placeUnits, setBlocked } from '$lib/engine/grid';
  import type { ArmySlot, BattleState, Hero, Pos, UnitStack } from '$lib/engine/types';
  import BattleGrid from './BattleGrid.svelte';
  import Sprite from './Sprite.svelte';

  interface Props {
    playerArmy: ArmySlot[];
    enemyArmy: ArmySlot[];
    hero: Hero;
    seed: number;
    onconfirm: (deployment: Deployment[]) => void;
    onback: () => void;
  }

  let { playerArmy, enemyArmy, hero, seed, onconfirm, onback }: Props = $props();

  // The battlefield is fixed by the seed; initBattle regenerates the same
  // rocks. Like Battle.svelte, this screen snapshots its inputs at mount.
  // svelte-ignore state_referenced_locally
  const obstacles = generateObstacles(seed);
  // svelte-ignore state_referenced_locally
  const zoneKeys = new Set(deploymentZone(hero).map(p => `${p.col},${p.row}`));
  // svelte-ignore state_referenced_locally
  const enemyLine = enemyAutoDeploy(enemyArmy);

  // svelte-ignore state_referenced_locally
  let draft: DraftEntry[] = $state(autoDeploy(playerArmy, hero).map(d => ({ ...d })));
  let selected: number | null = $state(null);
  let splitCount = $state(1);

  const placedCount = $derived(draft.filter(d => d.pos !== null).length);
  const trayEntries = $derived(draft.map((d, i) => ({ d, i })).filter(({ d }) => d.pos === null));
  const allPlaced = $derived(draft.every(d => d.pos !== null));
  const problem = $derived(
    allPlaced ? validateDeployment(playerArmy, draft as Deployment[], hero) : 'Place every stack to begin.'
  );

  // A read-only BattleState for BattleGrid: rocks + placed stacks + enemy line.
  const preview: BattleState = $derived.by(() => {
    let grid = createGrid(GRID_W, GRID_H);
    for (const pos of obstacles) grid = setBlocked(grid, pos);
    const stack = (id: string, unit: DraftEntry['unit'], count: number, pos: Pos, side: 'player' | 'enemy'): UnitStack => ({
      id, definition: unit, count, hp: unit.hp, pos, side,
      hasRetaliated: false, shotsLeft: unit.shots, morale: 0, luck: 0, atb: 0, isDefending: false,
    });
    const units: UnitStack[] = [
      ...draft.flatMap((d, i) => (d.pos ? [stack(`p${i}`, d.unit, d.count, d.pos, 'player')] : [])),
      ...enemyLine.map((d, i) => stack(`e${i}`, d.unit, d.count, d.pos, 'enemy')),
    ];
    grid = placeUnits(grid, units);
    return {
      grid, units, hero, round: 1, battleTime: 0,
      currentUnitId: null, log: [], result: 'ongoing', seed,
    };
  });

  const selectedEntry = $derived(selected !== null ? (draft[selected] ?? null) : null);
  const canSplit = $derived(
    selectedEntry !== null && selectedEntry.count > 1 && draft.length < MAX_FIELD_STACKS
  );

  function select(i: number | null) {
    selected = i;
    const entry = i !== null ? draft[i] : null;
    splitCount = entry ? Math.max(1, Math.floor(entry.count / 2)) : 1;
  }

  function handleCellClick(pos: Pos) {
    if (selected === null) return;
    if (!zoneKeys.has(`${pos.col},${pos.row}`)) return;
    draft = draft.map((d, i) => (i === selected ? { ...d, pos } : d));
    select(null);
  }

  function handleUnitClick(unit: UnitStack) {
    if (!unit.id.startsWith('p')) return; // enemy line and rocks aren't editable
    const idx = Number(unit.id.slice(1));
    if (selected === idx) {
      select(null);
    } else if (selected !== null && draft[selected].unit.name === draft[idx].unit.name) {
      const merged = mergeDraft(draft, selected, idx);
      if (merged) draft = merged;
      select(null);
    } else {
      select(idx);
    }
  }

  function handleSplit() {
    if (selected === null) return;
    const next = splitDraft(draft, selected, splitCount);
    if (!next) return;
    draft = next;
    select(next.length - 1); // the new tray stack is ready to place
  }

  function handleAuto() {
    draft = autoDeploy(playerArmy, hero).map(d => ({ ...d }));
    select(null);
  }
</script>

<div class="mx-auto max-w-5xl">
  <!-- z-raised: the tilted board's projected far edge overlaps this header
       (negative margins on .board) and would swallow its clicks otherwise. -->
  <div class="relative z-10 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-800 px-4 py-3">
    <div>
      <p class="text-lg font-semibold text-amber-200">Deploy your army</p>
      <p class="text-xs text-slate-400">
        Select a stack, then click a highlighted cell. Click a same-type stack to merge.
        {draft.length} / {MAX_FIELD_STACKS} stacks · {placedCount} placed
      </p>
    </div>
    <div class="flex items-center gap-2">
      <button
        type="button"
        class="rounded bg-slate-600 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-500"
        onclick={handleAuto}
      >Auto-arrange</button>
      <button
        type="button"
        class="rounded bg-slate-600 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-500"
        onclick={onback}
      >← Back</button>
      <button
        type="button"
        class="rounded bg-amber-600 px-5 py-2 font-semibold text-white hover:bg-amber-500
          disabled:cursor-not-allowed disabled:opacity-40"
        disabled={problem !== null}
        title={problem ?? ''}
        onclick={() => onconfirm(draft as Deployment[])}
      >Start battle ⚔️</button>
    </div>
  </div>

  <BattleGrid
    state={preview}
    reachableKeys={selected !== null ? zoneKeys : new Set()}
    rangeKeys={new Set()}
    targetIds={new Set()}
    activeId={selected !== null && draft[selected]?.pos ? `p${selected}` : null}
    interactive={true}
    actionIcons={new Map()}
    originsByTarget={new Map()}
    previews={new Map()}
    hoveredId={null}
    activeSteps={[]}
    dyingIds={new Set()}
    stepMs={0}
    oncellclick={handleCellClick}
    onunitclick={handleUnitClick}
    onmeleeaim={() => {}}
    onunithover={() => {}}
    onunitinspect={() => {}}
  />

  <div class="relative z-10 mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-slate-700 bg-slate-800 px-4 py-3">
    {#if selectedEntry}
      <div class="flex items-center gap-2">
        <Sprite name={selectedEntry.unit.name} class="h-9 w-8" />
        <span class="text-sm font-semibold text-slate-100">{selectedEntry.unit.name} ×{selectedEntry.count}</span>
        {#if selectedEntry.pos === null}
          <span class="text-xs text-amber-300">— click a highlighted cell to place</span>
        {/if}
      </div>
      {#if canSplit}
        <div class="flex items-center gap-1 text-sm text-slate-300">
          <span>Split off</span>
          <input
            type="number"
            min="1"
            max={selectedEntry.count - 1}
            bind:value={splitCount}
            class="w-16 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-center font-mono text-sm text-slate-100"
          />
          <button
            type="button"
            class="rounded bg-slate-600 px-3 py-1 font-semibold text-white hover:bg-slate-500 disabled:opacity-40"
            disabled={splitCount < 1 || splitCount >= selectedEntry.count}
            onclick={handleSplit}
          >Split</button>
        </div>
      {:else if draft.length >= MAX_FIELD_STACKS}
        <span class="text-xs text-slate-500">Stack limit reached — merge stacks to split again.</span>
      {/if}
    {:else}
      <span class="text-sm text-slate-400">Click one of your stacks to move or split it.</span>
    {/if}

    {#if trayEntries.length > 0}
      <div class="ml-auto flex items-center gap-2">
        <span class="text-xs uppercase tracking-wide text-slate-500">Unplaced:</span>
        {#each trayEntries as { d, i } (i)}
          <button
            type="button"
            class="flex items-center gap-1 rounded border px-2 py-1
              {selected === i ? 'border-amber-500 bg-slate-700' : 'border-slate-600 bg-slate-700/40 hover:bg-slate-700'}"
            onclick={() => select(i)}
          >
            <Sprite name={d.unit.name} class="h-8 w-7" />
            <span class="font-mono text-xs text-slate-100">×{d.count}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>
