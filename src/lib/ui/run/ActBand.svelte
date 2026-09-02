<script lang="ts" module>
  export const ACT_NAMES: Record<1 | 2 | 3, string> = {
    1: 'The Borderlands',
    2: 'The Deep Wilds',
    3: 'The Black Citadel',
  };

  export const ACT_NUMERAL: Record<1 | 2 | 3, string> = { 1: 'I', 2: 'II', 3: 'III' };

  /** What each act changes about the armies you meet, in the player's words.
   *  The ceilings mirror the maxTier ladder in generateGauntletEnemy. */
  const ACT_BLURB: Record<1 | 2 | 3, string> = {
    1: 'Enemies field tier 1–3 units.',
    2: 'Enemies now field up to tier 5.',
    3: 'Enemies field everything, up to tier 7.',
  };
</script>

<script lang="ts">
  import StackChip from './StackChip.svelte';
  import { FACTION_INFO } from '$lib/engine/factions';
  import {
    actOf,
    generateGauntletEnemy,
    enemyBonus,
    BOSS_NODES,
    RUN_LENGTH,
    type RunState,
  } from '$lib/gauntlet/run';

  interface Props {
    run: RunState;
    /** Blocked while draft picks are still pending. */
    canFight: boolean;
    onfight: () => void;
  }

  let { run, canFight, onfight }: Props = $props();

  const node = $derived(run.encounterIndex);
  const endless = $derived(node > RUN_LENGTH);
  const currentAct = $derived(endless ? 3 : actOf(node));
  const encounter = $derived(generateGauntletEnemy(run));

  const nodesOf = (act: 1 | 2 | 3) =>
    Array.from({ length: RUN_LENGTH }, (_, i) => i + 1).filter(n => actOf(n) === act);

  const bossOf = (act: 1 | 2 | 3) => nodesOf(act).find(n => BOSS_NODES.has(n))!;
</script>

<section aria-label="Run progress" class="flex flex-col gap-2">
  {#each [1, 2, 3] as const as act (act)}
    {@const nodes = nodesOf(act)}
    {@const cleared = endless || nodes.every(n => n < node)}
    {@const active = !endless && act === currentAct}

    {#if cleared}
      <!-- One line: the act is history, and the boss is what you remember. -->
      <p class="flex items-baseline gap-2 rounded border border-emerald-900/70 bg-emerald-950/30 px-3 py-1.5 text-sm">
        <span class="font-semibold text-emerald-400">✓ Act {ACT_NUMERAL[act]}</span>
        <span class="text-slate-400">{ACT_NAMES[act]}</span>
        <span class="ml-auto text-xs text-emerald-600">boss {bossOf(act)} felled</span>
      </p>
    {:else if active}
      <div class="rounded-lg border border-amber-500/60 bg-slate-800/80 p-4">
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 class="text-lg font-bold tracking-wide text-amber-200">
            Act {ACT_NUMERAL[act]} — {ACT_NAMES[act]}
          </h2>
          <p class="text-sm text-slate-400">{ACT_BLURB[act]}</p>
        </div>

        <!-- Node pips: the act's shape, ending on its boss. -->
        <ol class="mt-3 flex flex-wrap items-center gap-1.5">
          {#each nodes as n (n)}
            {@const isBoss = BOSS_NODES.has(n)}
            <li
              class="flex h-8 items-center gap-1 rounded px-2.5 text-sm font-semibold
                {n < node
                  ? 'bg-emerald-950/60 text-emerald-500'
                  : n === node
                    ? 'bg-amber-500 text-slate-900'
                    : isBoss
                      ? 'border border-red-900 bg-slate-900 text-red-400'
                      : 'border border-slate-700 bg-slate-900 text-slate-600'}"
              aria-current={n === node ? 'step' : undefined}
            >
              {#if n < node}✓{:else if isBoss}💀{/if}
              <span>{n}</span>
              {#if isBoss}<span class="text-[10px] uppercase tracking-wider">Boss</span>{/if}
            </li>
          {/each}
        </ol>
      </div>
    {:else if !endless}
      <p class="flex items-baseline gap-2 rounded border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-sm text-slate-600">
        <span class="font-semibold">🔒 Act {ACT_NUMERAL[act]}</span>
        <span>{ACT_NAMES[act]}</span>
      </p>
    {/if}
  {/each}

  {#if endless}
    <div class="rounded-lg border border-purple-600/70 bg-purple-950/30 p-4">
      <h2 class="text-lg font-bold tracking-wide text-purple-200">
        ♾ Beyond the Citadel — Depth {run.endlessDepth}
      </h2>
      <p class="text-sm text-slate-400">The gauntlet is cleared. The armies keep coming, and keep growing.</p>
    </div>
  {/if}

  <!-- The next fight: who they are, not how strong a number says they are. -->
  <div class="rounded-lg border-2 {encounter.isBoss ? 'border-red-600/80 bg-red-950/20' : 'border-slate-600 bg-slate-800'} p-4">
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
        Battle {node}{#if encounter.isBoss}<span class="ml-2 text-red-400">Act boss</span>{/if}
      </p>
      <p class="text-sm text-slate-300">
        <span class="font-semibold text-slate-100">{FACTION_INFO[encounter.faction].name}</span>
        · {encounter.army.length} {encounter.army.length === 1 ? 'stack' : 'stacks'}
        {#if encounter.enemyBonus > 0}
          · <span class="text-red-300">enemy bonus +{encounter.enemyBonus} Attack/Defence</span>
        {/if}
      </p>
    </div>

    <div class="mt-3 flex flex-wrap items-end gap-3">
      <div class="flex flex-1 flex-wrap gap-2">
        {#each encounter.army as slot (slot.unit.name)}
          <StackChip unit={slot.unit} count={slot.count} />
        {/each}
      </div>

      <button
        type="button"
        class="rounded px-6 py-2 text-sm font-bold tracking-wide transition
          {canFight
            ? 'bg-amber-500 text-slate-900 hover:bg-amber-400'
            : 'cursor-not-allowed bg-slate-700 text-slate-500'}"
        disabled={!canFight}
        title={canFight ? '' : 'Take your rewards first'}
        onclick={onfight}
      >
        Fight ⚔
      </button>
    </div>
  </div>
</section>
