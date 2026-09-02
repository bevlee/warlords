<script lang="ts">
  import KeywordText from '$lib/ui/keyword/KeywordText.svelte';
  import { onMount } from 'svelte';
  import Battle from '$lib/ui/Battle.svelte';
  import Sprite from '$lib/ui/Sprite.svelte';
  import { heroSpriteName } from '$lib/ui/sprites';
  import { FACTION_INFO } from '$lib/engine/factions';
  import { type ItemId, itemBonuses } from '$lib/gauntlet/items';
  import { applyUnitSkills, migrateUnitSkills, type SkillId } from '$lib/gauntlet/skills';
  import { recordSeen } from '$lib/compendium/discovery';
  import ActBand from '$lib/ui/run/ActBand.svelte';
  import ArmyBand from '$lib/ui/run/ArmyBand.svelte';
  import ArtifactCard from '$lib/ui/run/ArtifactCard.svelte';
  import DraftBand from '$lib/ui/run/DraftBand.svelte';
  import HeroBand from '$lib/ui/run/HeroBand.svelte';
  import {
    newRun,
    recordBattle,
    applyPick,
    applyItemPick,
    applySkillPick,
    generateGauntletEnemy,
    migrateRunState,
    BOSS_NODES,
    RUN_LENGTH,
    type RunState,
    type UnitCard,
    type GauntletEncounter,
  } from '$lib/gauntlet/run';
  import { loadRun, saveRun, clearRun } from '$lib/storage';
  import type { ArmyBonuses, FactionClass, UnitStack } from '$lib/engine/types';

  let run: RunState | null = $state(null);
  let inBattle = $state(false);
  let encounter: GauntletEncounter | null = $state(null);
  let battleKey = $state(0);
  let loaded = $state(false);
  let loadError = $state(false);
  let rulesOpen = $state(false);

  // A session-only "win button" for testing. These bonuses are applied to
  // every player stack when a battle starts and are never saved to the run.
  const DEBUG_BONUSES: ArmyBonuses = {
    attack: 99,
    defense: 0,
    initiative: 0,
    speed: 99,
    luck: 3,
    morale: 3,
  };
  let debugBoost = $state(false);

  function battleBonuses(itemIds: ItemId[]): ArmyBonuses {
    const bonuses = itemBonuses(itemIds);
    if (!debugBoost) return bonuses;
    return {
      attack: bonuses.attack + DEBUG_BONUSES.attack,
      defense: bonuses.defense + DEBUG_BONUSES.defense,
      initiative: bonuses.initiative + DEBUG_BONUSES.initiative,
      speed: bonuses.speed + DEBUG_BONUSES.speed,
      luck: bonuses.luck + DEBUG_BONUSES.luck,
      morale: bonuses.morale + DEBUG_BONUSES.morale,
    };
  }

  onMount(async () => {
    try {
      // Race the save fetch against a ceiling so a hung/unreachable service
      // can't leave the page pinned on "Loading…" forever.
      const saved = await Promise.race([
        loadRun<RunState>(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('load timed out')), 15000)),
      ]);
      // Saves from before the items feature lack these fields.
      const migrated = migrateRunState(saved);
      run = migrated ? { ...migrated, unitSkills: migrateUnitSkills(migrated.unitSkills) } : null;
    } catch (err) {
      // A save-service hiccup must not wedge the page on "Loading…" forever.
      // Surface a retry instead of an infinite spinner; the run is untouched
      // on the server, so a reload picks it back up once the service recovers.
      console.error('Failed to load gauntlet run', err);
      loadError = true;
    } finally {
      loaded = true;
    }
  });

  function begin(faction: FactionClass) {
    run = newRun(faction);
    void saveRun(run);
  }

  function fight() {
    if (!run) return;
    encounter = generateGauntletEnemy(run);
    battleKey += 1;
    inBattle = true;
  }

  function handleResult(result: 'player_wins' | 'enemy_wins', _finalUnits: UnitStack[]) {
    if (!run) return;
    run = recordBattle(run, result === 'player_wins');
    void saveRun(run);
  }

  function saveFormation(formation: import('$lib/engine/deployment').SavedFormation) {
    if (!run) return;
    run = { ...run, savedFormation: formation };
    void saveRun(run);
  }

  // Compendium discovery: an *offered* item or skill counts as met, so a card
  // the player passed over stays readable afterwards. An effect rather than a
  // call in handleResult, so a run resumed mid-draft records its offers too.
  // recordSeen writes only when something is genuinely new.
  $effect(() => {
    const items = run?.pendingItems ?? [];
    const unitSkills = run?.pendingSkills ?? [];
    if (items.length > 0 || unitSkills.length > 0) void recordSeen({ items, unitSkills });
  });

  function pick(card: UnitCard) {
    if (!run) return;
    run = applyPick(run, card);
    void saveRun(run);
  }

  function pickItem(id: ItemId) {
    if (!run) return;
    run = applyItemPick(run, id);
    void saveRun(run);
  }

  function teachSkill(skill: SkillId, unitName: string) {
    if (!run) return;
    run = applySkillPick(run, skill, unitName);
    void saveRun(run);
  }

  async function abandon() {
    run = null;
    inBattle = false;
    await clearRun();
  }

  /** Unit names in the army, for artifact "dormant" states. */
  const unitNamesOf = (state: RunState) => state.army.map(slot => slot.unit.name);
</script>

<main class="min-h-screen bg-slate-900 p-4 text-slate-100 sm:p-6">
  {#if !inBattle}
    <!-- Hidden during a battle: the battle screen wants the height, and its
         settings cog carries the way out instead. -->
    <header class="mx-auto mb-4 flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1">
      <h1 class="text-xl font-black tracking-[0.2em] text-slate-200">
        WAR<span class="text-amber-400">L</span>ORDS
      </h1>
      {#if run && run.status !== 'won' && run.status !== 'lost'}
        <p class="text-sm text-slate-500">
          {FACTION_INFO[run.faction].name} ·
          {run.encounterIndex > RUN_LENGTH
            ? `endless depth ${run.endlessDepth}`
            : `battle ${run.encounterIndex} of ${RUN_LENGTH}`}
        </p>
      {/if}
      <div class="ml-auto flex items-center gap-1">
        <button
          type="button"
          class="rounded px-2 py-1 text-sm text-slate-500 hover:bg-slate-800 hover:text-slate-200"
          aria-expanded={rulesOpen}
          onclick={() => (rulesOpen = !rulesOpen)}
        >
          ? Rules
        </button>
        {#if run}
          <button
            type="button"
            class="rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-800 hover:text-slate-300"
            onclick={abandon}
          >
            Abandon
          </button>
        {/if}
      </div>
    </header>

    {#if rulesOpen}
      <!-- The rules live behind the header rather than under every screen:
           this is where someone wants them, and only between fights. -->
      <section class="mx-auto mb-5 max-w-6xl rounded-lg border border-slate-700 bg-slate-800/60 p-4 text-sm text-slate-400">
        <dl class="grid gap-4 sm:grid-cols-2">
          <div>
            <dt class="font-semibold text-slate-300">{RUN_LENGTH} battles, one life</dt>
            <dd class="mt-1">
              Fight through {RUN_LENGTH} encounters in three acts. Each act fields higher-tier
              enemies than the last, and every army grows sharper as the ranks climb; battles
              {[...BOSS_NODES].join(', ')} end their act with a boss. A single defeat ends the run.
            </dd>
          </div>
          <div>
            <dt class="font-semibold text-slate-300">Your whole army comes back</dt>
            <dd class="mt-1">
              Casualties last only for the battle they happen in. Every stack you own returns at full
              strength for the next encounter, however badly the last one went.
            </dd>
          </div>
          <div>
            <dt class="font-semibold text-slate-300">Every win pays out</dt>
            <dd class="mt-1">
              Victories offer a choice of reinforcements, and every third one adds an artifact for the
              whole army or a new skill for one of your unit types.
            </dd>
          </div>
          <div>
            <dt class="font-semibold text-slate-300">Endless</dt>
            <dd class="mt-1">
              Clearing battle {RUN_LENGTH} does not have to end it — Endless keeps generating harder
              armies for as long as you keep winning.
            </dd>
          </div>
        </dl>
      </section>
    {/if}
  {/if}

  {#if !loaded}
    <p class="text-slate-400">Loading…</p>
  {:else if loadError}
    <div class="mx-auto mt-10 max-w-md rounded-lg border border-slate-700 bg-slate-800/60 p-6 text-center">
      <p class="text-lg font-semibold text-red-300">Couldn't reach your saved run</p>
      <p class="mt-2 text-sm text-slate-400">
        The save service didn't respond. Your run is safe on the server — try again in a moment.
      </p>
      <button
        type="button"
        class="mt-5 rounded bg-amber-600 px-4 py-2 font-semibold text-white hover:bg-amber-500"
        onclick={() => location.reload()}
      >
        Retry
      </button>
    </div>
  {:else if !run}
    <!-- Run setup: pick a faction -->
    <div class="mx-auto max-w-5xl">
      <h2 class="mb-2 text-3xl font-bold text-amber-200">Choose your faction</h2>
      <p class="mb-8 text-lg text-slate-300">Your faction decides your roster for the whole run.</p>
      <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {#each Object.entries(FACTION_INFO) as [id, info] (id)}
          <button
            type="button"
            class="flex flex-col items-center gap-3 rounded-xl border-2 border-slate-700 bg-slate-800 p-7
              text-center transition hover:-translate-y-0.5 hover:border-amber-400 hover:bg-slate-700"
            onclick={() => begin(id as FactionClass)}
          >
            <Sprite name={heroSpriteName(id as FactionClass)} animate class="h-28 w-24" />
            <span class="text-xl font-bold text-amber-200">{info.name}</span>
            <span class="text-sm leading-snug text-slate-400"><KeywordText text={info.description} /></span>
          </button>
        {/each}
      </div>
    </div>
  {:else if inBattle}
    {#key battleKey}
      <Battle
        playerArmy={applyUnitSkills(run.army, run.unitSkills, run.faction)}
        enemyArmy={encounter?.army ?? []}
        hero={run.hero}
        armyBonuses={battleBonuses(run.items)}
        items={run.items}
        gauntletRound={run.battlesWon + 1}
        enemyBonus={encounter?.enemyBonus ?? 0}
        savedFormation={run.savedFormation}
        onformation={saveFormation}
        allowRestart={false}
        exitLabel="Continue"
        onexit={() => (inBattle = false)}
        onresult={handleResult}
      />
    {/key}
  {:else if run.status === 'won' || run.status === 'lost'}
    <!-- Run summary -->
    <div class="mx-auto max-w-md rounded-lg border border-slate-700 bg-slate-800 p-6 text-center">
      <p class="mb-2 text-4xl font-bold {run.status === 'won' ? 'text-amber-300' : 'text-red-400'}">
        {run.status === 'won' ? '🏆 Gauntlet conquered!' : 'Run over'}
      </p>
      <p class="mb-4 text-slate-300">
        {FACTION_INFO[run.faction].name} ·
        {#if run.endlessDepth > 0}
          cleared + {run.endlessDepth} endless {run.endlessDepth === 1 ? 'battle' : 'battles'}
        {:else}
          {run.battlesWon} / {RUN_LENGTH} battles won
        {/if}
      </p>
      <button
        type="button"
        class="rounded bg-amber-600 px-5 py-2 font-semibold text-white hover:bg-amber-500"
        onclick={abandon}
      >
        New run
      </button>
    </div>
  {:else}
    <!-- The run screen. Drafts mount above the rest rather than replacing it,
         so the army and artifacts being drafted into stay on screen. -->
    {@const drafting = run.status === 'draft'}
    {@const armyUnits = unitNamesOf(run)}
    <div class="mx-auto flex max-w-6xl flex-col gap-6">
      {#if drafting}
        <DraftBand {run} onpickunit={pick} onpickitem={pickItem} onteach={teachSkill} />
      {/if}

      <ActBand {run} canFight={!drafting} onfight={fight} />

      <HeroBand hero={run.hero} items={run.items} runDepth={run.battlesWon + 1} />

      {#if run.items.length > 0}
        <section aria-label="Artifacts">
          <h2 class="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
            Artifacts — <span class="text-slate-300">{run.items.length}</span>
          </h2>
          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {#each run.items as id (id)}
              <ArtifactCard {id} {armyUnits} />
            {/each}
          </div>
        </section>
      {/if}

      <ArmyBand army={run.army} unitSkills={run.unitSkills} faction={run.faction} items={run.items} />

      <button
        type="button"
        aria-pressed={debugBoost}
        class="self-start rounded border border-dashed px-2 py-1 text-xs font-medium transition
          {debugBoost
            ? 'border-lime-400 bg-lime-950/50 text-lime-300'
            : 'border-slate-700 text-slate-600 hover:border-slate-500 hover:text-slate-400'}"
        onclick={() => (debugBoost = !debugBoost)}
      >
        🐛 Debug +{DEBUG_BONUSES.attack} ATK · +{DEBUG_BONUSES.speed} Speed ·
        +{DEBUG_BONUSES.luck} Luck · +{DEBUG_BONUSES.morale} Morale · {debugBoost ? 'ON' : 'OFF'}
      </button>
    </div>
  {/if}
</main>
