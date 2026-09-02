<script lang="ts">
  import KeywordText from '$lib/ui/keyword/KeywordText.svelte';
  import { stripKeywords } from '$lib/compendium/keywords';
  import { onMount } from 'svelte';
  import Battle from '$lib/ui/Battle.svelte';
  import Sprite from '$lib/ui/Sprite.svelte';
  import { heroSpriteName } from '$lib/ui/sprites';
  import { FACTION_INFO, FACTION_UNITS } from '$lib/engine/factions';
  import { armyCost } from '$lib/engine/recruit';
  import { ITEMS, itemBonuses, itemEffectText, type ItemId } from '$lib/gauntlet/items';
  import { UNIT_SKILLS, applyUnitSkills, canLearnSkill, migrateUnitSkills, type SkillId } from '$lib/gauntlet/skills';
  import { skillIconFor, skillGlyph } from '$lib/ui/skillIcons';
  import { isUnique } from '$lib/engine/abilityCatalog';
  import { recordSeen } from '$lib/compendium/discovery';
  import { entryHref } from '$lib/compendium/entries';

  const ROMAN_LVL = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];
  import {
    newRun,
    recordBattle,
    applyPick,
    applyItemPick,
    applySkillPick,
    generateGauntletEnemy,
    encounterBudget,
    enemyBonus,
    migrateRunState,
    actOf,
    BOSS_NODES,
    RUN_LENGTH,
    type RunState,
    type UnitCard,
    type GauntletEncounter,
  } from '$lib/gauntlet/run';
  import { loadRun, saveRun, clearRun } from '$lib/storage';
  import { TIER_STYLE } from '$lib/ui/tierStyle';
  import UnitInfo from '$lib/ui/UnitInfo.svelte';
  import ItemIcon from '$lib/ui/ItemIcon.svelte';
  import type { ArmyBonuses, FactionClass, UnitDef, UnitStack } from '$lib/engine/types';

  const ACT_NAMES: Record<1 | 2 | 3, string> = {
    1: 'Act I — The Borderlands',
    2: 'Act II — The Deep Wilds',
    3: 'Act III — The Black Citadel',
  };

  let run: RunState | null = $state(null);
  let inBattle = $state(false);
  let encounter: GauntletEncounter | null = $state(null);
  let battleKey = $state(0);
  let loaded = $state(false);

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

  let loadError = $state(false);

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

  // Skill draft: pick a skill card, then click the unit that learns it.
  let chosenSkill = $state<SkillId | null>(null);

  function canLearn(unitName: string, skill: SkillId): boolean {
    if (!run) return false;
    const slot = run.army.find(s => s.unit.name === unitName);
    if (!slot) return false;
    return canLearnSkill(slot, run.unitSkills, skill);
  }

  function teachSkill(unitName: string) {
    if (!run || !chosenSkill || !canLearn(unitName, chosenSkill)) return;
    run = applySkillPick(run, chosenSkill, unitName);
    chosenSkill = null;
    void saveRun(run);
  }

  const RARITY_STYLE = {
    common: { border: 'border-slate-500', text: 'text-slate-200', label: 'Common' },
    rare: { border: 'border-sky-400', text: 'text-sky-300', label: 'Rare' },
    epic: { border: 'border-purple-400', text: 'text-purple-300', label: 'Epic' },
  } as const;

  async function abandon() {
    run = null;
    inBattle = false;
    await clearRun();
  }

  const unitFor = (name: string) =>
    run ? FACTION_UNITS[run.faction].find(u => u.name === name)! : null;

  /** A pristine full-health stack so the battle UnitInfo panel can present a draft card. */
  function draftStack(unit: UnitDef, count: number): UnitStack {
    return {
      id: `draft-${unit.name}`,
      definition: unit,
      count,
      startCount: count,
      hp: unit.hp,
      pos: { col: 0, row: 0 },
      side: 'player',
      hasRetaliated: false,
      shotsLeft: unit.shots,
      morale: 0,
      luck: 0,
      atb: 0,
      isDefending: false,
    };
  }
</script>

<main class="min-h-screen bg-slate-900 p-4 text-slate-100 sm:p-6">
  <!-- Hidden during a battle: the battle screen wants the height, and its
       settings cog carries the way out instead. -->
  {#if !inBattle}
    <div class="mb-4 flex items-center gap-4">
      <h1 class="text-2xl font-bold">Warlords — Gauntlet</h1>
    </div>
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
      <!-- Kept short: the full rules sit in the section at the foot of the page. -->
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
  {:else if run.status === 'draft'}
    <!-- Draft: pick 1 of 3 -->
    <div class="mx-auto max-w-6xl">
      <h2 class="mb-1 text-2xl font-semibold text-amber-200">
        Victory! {run.pendingDraft ? 'Choose your reinforcements' : run.pendingItems ? 'Claim an artifact' : 'Teach a skill'}
      </h2>
      <p class="mb-5 text-base text-slate-400">
        Battle {run.encounterIndex - 1} won.
        {#if [run.pendingDraft, run.pendingItems, run.pendingSkills].filter(Boolean).length > 1}Pick one of each.{/if}
      </p>
      {#if run.pendingDraft}
      <div class="grid grid-cols-3 gap-3">
        {#each run.pendingDraft as card (card.unitName)}
          {@const unit = unitFor(card.unitName)}
          {@const ts = unit ? TIER_STYLE[unit.tier] : TIER_STYLE[1]}
          <button
            type="button"
            class="flex flex-col overflow-hidden rounded-lg border-2 bg-slate-800 text-left
              hover:brightness-110 {ts.border} {ts.glow}"
            onclick={() => pick(card)}
          >
            <span class="w-full py-1.5 text-center text-xs font-semibold uppercase tracking-wider {ts.text}">
              Tier {unit?.tier ?? '?'} · {ts.label}
            </span>
            {#if unit}
              <UnitInfo unit={draftStack(unit, card.count)} embedded size="large" />
            {/if}
          </button>
        {/each}
      </div>
      {/if}
      {#if run.pendingItems?.length}
        <h3 class="mb-3 mt-6 text-base font-semibold uppercase tracking-wide text-purple-300">
          {run.pendingDraft ? '…and claim an artifact' : 'Claim an artifact'} (buffs your whole army, every battle)
        </h3>
        <div class="grid grid-cols-2 gap-3">
          {#each run.pendingItems as id (id)}
            {@const item = ITEMS[id]}
            {@const rs = RARITY_STYLE[item.rarity]}
            <!-- The card is the pick button, so the compendium link sits beside
                 it rather than inside: an <a> nested in a <button> is invalid. -->
            <div class="relative">
              <button
                type="button"
                class="flex w-full flex-col items-center gap-1.5 rounded-lg border-2 bg-slate-800 p-6
                  hover:bg-slate-700 hover:brightness-110 {rs.border}"
                onclick={() => pickItem(id)}
              >
                <ItemIcon {id} class="h-14 w-14" />
                <span class="text-xl font-bold {rs.text}">{item.name}</span>
                <span class="text-xs font-semibold uppercase tracking-wider {rs.text}">{rs.label}</span>
                <span class="font-mono text-base text-amber-200"><KeywordText text={itemEffectText(item)} /></span>
              </button>
              <a
                href={entryHref('item', id)}
                target="_blank"
                rel="noopener"
                title="Read about {item.name} in the compendium"
                aria-label="Read about {item.name} in the compendium"
                class="absolute right-1.5 top-1.5 rounded px-1.5 py-0.5 text-sm text-slate-500 hover:bg-slate-700 hover:text-amber-300"
              >
                📖
              </a>
            </div>
          {/each}
        </div>
      {/if}
      {#if run.pendingSkills?.length}
        <h3 class="mb-3 mt-6 text-base font-semibold uppercase tracking-wide text-violet-300">
          {run.pendingDraft || run.pendingItems ? '…and teach a unit a skill' : 'Teach a unit a skill'} (permanent for this run)
        </h3>
        <div class="grid grid-cols-3 gap-3">
          {#each run.pendingSkills as id (id)}
            {@const skill = UNIT_SKILLS[id]}
            <div class="relative">
            <button
              type="button"
              class="flex w-full flex-col items-center gap-1.5 rounded-lg border-2 bg-slate-800 p-5
                hover:bg-slate-700 hover:brightness-110
                {chosenSkill === id ? 'border-violet-300 ring-2 ring-violet-400/60' : 'border-violet-500/60'}"
              onclick={() => (chosenSkill = chosenSkill === id ? null : id)}
            >
              {#if skillIconFor(id)}
                <img src={skillIconFor(id)} alt="" class="h-12 w-12" />
              {:else}
                <span class="text-4xl leading-none" aria-hidden="true">{skillGlyph(id)}</span>
              {/if}
              <span class="text-lg font-bold text-violet-300">{skill.name}</span>
              <span class="text-center text-sm leading-snug text-slate-400"><KeywordText text={skill.description} /></span>
            </button>
            <a
              href={entryHref('unitSkill', id)}
              target="_blank"
              rel="noopener"
              title="Read about {skill.name} in the compendium"
              aria-label="Read about {skill.name} in the compendium"
              class="absolute right-1.5 top-1.5 rounded px-1.5 py-0.5 text-sm text-slate-500 hover:bg-slate-700 hover:text-amber-300"
            >
              📖
            </a>
            </div>
          {/each}
        </div>
        {#if chosenSkill}
          <p class="mb-2 mt-4 text-sm font-semibold text-violet-200">
            Teach {UNIT_SKILLS[chosenSkill].name} to:
          </p>
          <div class="flex flex-wrap gap-2">
            {#each run.army as slot (slot.unit.name)}
              {@const learnable = canLearn(slot.unit.name, chosenSkill)}
              <button
                type="button"
                class="flex items-center gap-2 rounded-lg border-2 px-3 py-2
                  {learnable
                    ? 'border-violet-400 bg-slate-800 hover:bg-slate-700'
                    : 'cursor-not-allowed border-slate-700 bg-slate-800/50 opacity-40'}"
                disabled={!learnable}
                title={learnable ? '' : 'Already knows this skill'}
                onclick={() => teachSkill(slot.unit.name)}
              >
                <Sprite name={slot.unit.name} class="h-9 w-8" />
                <span class="text-sm font-semibold text-slate-200">{slot.count} × {slot.unit.name}</span>
                {#if learnable && chosenSkill && !isUnique(chosenSkill)}
                  <span class="font-mono text-xs text-violet-300">
                    → {ROMAN_LVL[(run.unitSkills[slot.unit.name]?.[chosenSkill] ?? 0) + 1] ?? ''}
                  </span>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      {/if}
      <div class="mt-4 rounded border border-slate-700 bg-slate-800 p-2 text-sm text-slate-300">
        Your army: {run.army.map(s => `${s.count}× ${s.unit.name}`).join(' · ')}
      </div>
    </div>
  {:else if run.status === 'won' || run.status === 'lost'}
    <!-- Run summary -->
    <div class="mx-auto max-w-md rounded-lg border border-slate-700 bg-slate-800 p-6 text-center">
      <p class="mb-2 text-4xl font-bold {run.status === 'won' ? 'text-amber-300' : 'text-red-400'}">
        {run.status === 'won' ? '🏆 Gauntlet conquered!' : 'Run over'}
      </p>
      <p class="mb-1 text-slate-300">
        {FACTION_INFO[run.faction].name} ·
        {#if run.endlessDepth > 0}
          gauntlet cleared + {run.endlessDepth} endless {run.endlessDepth === 1 ? 'battle' : 'battles'}
        {:else}
          {run.battlesWon} / {RUN_LENGTH} battles won
        {/if}
      </p>
      <p class="mb-4 text-sm text-slate-400">Hero reached level {run.hero.level}</p>
      <button
        type="button"
        class="rounded bg-amber-600 px-5 py-2 font-semibold text-white hover:bg-amber-500"
        onclick={abandon}
      >
        New run
      </button>
    </div>
  {:else}
    <!-- Run map -->
    <div class="mx-auto flex max-w-3xl gap-6">
      <div class="flex-1">
        {#if run.encounterIndex > RUN_LENGTH}
          <!-- Endless: the 10-node gauntlet is cleared; battles continue with
               ever-escalating enemies. The fixed act list would show all-cleared
               and offer no current node, so drive endless from its own card. -->
          {@const enc = generateGauntletEnemy(run)}
          <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-400">
            🏆 Gauntlet cleared — 10/10
          </p>
          <div class="rounded-lg border-2 border-purple-500 bg-purple-950/30 p-4 shadow-lg">
            <p class="mb-2 text-sm font-semibold uppercase tracking-wide text-purple-300">
              ♾️ Endless — Depth {run.endlessDepth}
            </p>
            <div class="flex items-center gap-3">
              <span class="flex-1 text-sm text-slate-200">
                Rank {run.encounterIndex} · {FACTION_INFO[enc.faction].name} warband — strength ~{encounterBudget(run.encounterIndex)} · Enemy bonus +{enemyBonus(run.encounterIndex)} Attack/Defence
              </span>
              <button
                type="button"
                class="rounded bg-amber-600 px-4 py-1 text-sm font-semibold text-white hover:bg-amber-500"
                onclick={fight}
              >
                Fight ⚔️
              </button>
            </div>
          </div>
        {:else}
        {#each [3, 2, 1] as act (act)}
          <p class="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {ACT_NAMES[act as 1 | 2 | 3]}
          </p>
          {#each Array.from({ length: RUN_LENGTH }, (_, i) => RUN_LENGTH - i).filter(n => actOf(n) === act) as n (n)}
            {@const current = n === run.encounterIndex}
            <div
              class="mb-1 flex items-center gap-3 rounded border px-3 py-1.5
                {current ? 'border-amber-400 bg-slate-700' : n < run.encounterIndex ? 'border-emerald-700 bg-emerald-950/40' : 'border-slate-700 bg-slate-800/60'}"
              aria-label="node {n}{current ? ' — current' : n < run.encounterIndex ? ' — cleared' : ''}"
            >
              <span class="w-6 text-center font-mono text-sm {BOSS_NODES.has(n) ? 'text-red-400' : 'text-slate-400'}">
                {BOSS_NODES.has(n) ? '💀' : n}
              </span>
              {#if current}
                {@const enc = generateGauntletEnemy(run)}
                <span class="flex-1 text-sm text-slate-200">
                  Rank {n} · {FACTION_INFO[enc.faction].name} warband — strength ~{encounterBudget(n)} · Enemy bonus +{enemyBonus(n)} Attack/Defence
                  {#if enc.isBoss}<span class="ml-1 font-semibold text-red-400">BOSS</span>{/if}
                </span>
                <button
                  type="button"
                  class="rounded bg-amber-600 px-4 py-1 text-sm font-semibold text-white hover:bg-amber-500"
                  onclick={fight}
                >
                  Fight ⚔️
                </button>
              {:else}
                <span class="flex-1 text-sm text-slate-500">{n < run.encounterIndex ? 'cleared' : '???'}</span>
              {/if}
            </div>
          {/each}
        {/each}
        {/if}
      </div>

      <div class="w-56 shrink-0">
        <div class="rounded-lg border border-slate-700 bg-slate-800 p-3">
          <p class="mb-1 text-sm font-semibold text-amber-200">
            {FACTION_INFO[run.faction].name} — level {run.hero.level}
          </p>
          <p class="mb-2 font-mono text-xs text-slate-400">⚔{run.hero.attack} 🛡{run.hero.defense}</p>
          <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Skills</p>
{#each run.hero.factionSkills as skill (skill.id)}
  <div class="flex items-center gap-2 py-0.5" title={stripKeywords(skill.description)}>
    <span class="text-xs text-slate-200">{skill.name}</span>
    <span class="font-mono text-[10px] text-amber-300">{skill.level}</span>
  </div>
{/each}
          {#if run.items.length > 0}
            <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Artifacts</p>
            {#each run.items as id (id)}
              {@const item = ITEMS[id]}
              <div class="flex items-center gap-2 py-0.5" title={stripKeywords(itemEffectText(item))}>
                <ItemIcon {id} class="h-5 w-5 shrink-0" />
                <span class="flex-1 text-xs {RARITY_STYLE[item.rarity].text}">{item.name}</span>
                <span class="font-mono text-[10px] text-amber-300">{stripKeywords(itemEffectText(item))}</span>
              </div>
            {/each}
          {/if}
          <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Army ({armyCost(run.army)} power)</p>
          {#each run.army as slot (slot.unit.name)}
            {@const ts = TIER_STYLE[slot.unit.tier]}
            {@const taught = Object.entries(run.unitSkills[slot.unit.name] ?? {}).filter(([, lvl]) => lvl) as [SkillId, number][]}
            <div class="flex items-center gap-2 py-0.5">
              <span class="rounded ring-1 {ts.ring}"><Sprite name={slot.unit.name} class="h-7 w-6" /></span>
              <span class="text-xs {ts.text}">{slot.count} × {slot.unit.name}</span>
            </div>
            {#if taught.length > 0}
              <div class="mb-0.5 ml-8 flex flex-wrap gap-1">
                {#each taught as [sk, lvl] (sk)}
                  <span
                    class="rounded bg-violet-950/60 px-1 text-[10px] font-medium text-violet-300 ring-1 ring-violet-500/40"
                    title={stripKeywords(UNIT_SKILLS[sk].description)}
                  >
                    {skillGlyph(sk)} {UNIT_SKILLS[sk].name}{lvl > 1 ? ` ${lvl}` : ''}
                  </span>
                {/each}
              </div>
            {/if}
          {/each}
        </div>
        <button
          type="button"
          aria-pressed={debugBoost}
          class="mt-3 w-full rounded border border-dashed px-2 py-1 text-xs font-medium transition
            {debugBoost
              ? 'border-lime-400 bg-lime-950/50 text-lime-300'
              : 'border-slate-600 text-slate-500 hover:border-slate-500 hover:text-slate-300'}"
          onclick={() => (debugBoost = !debugBoost)}
        >
          🐛 Debug +{DEBUG_BONUSES.attack} ATK · +{DEBUG_BONUSES.speed} Speed ·
          +{DEBUG_BONUSES.luck} Luck · +{DEBUG_BONUSES.morale} Morale · {debugBoost ? 'ON' : 'OFF'}
        </button>
        <button
          type="button"
          class="mt-1 w-full rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-800 hover:text-slate-300"
          onclick={abandon}
        >
          Abandon run
        </button>
      </div>
    </div>
  {/if}

  {#if !inBattle}
    <!-- The rules, kept off the home screen: this is where someone actually
         wants them, and only between fights. -->
    <section class="mx-auto mt-10 max-w-3xl border-t border-slate-800 pt-6 text-sm text-slate-400">
      <h2 class="text-xs font-semibold uppercase tracking-widest text-slate-500">How the Gauntlet works</h2>
      <dl class="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <dt class="font-semibold text-slate-300">{RUN_LENGTH} battles, one life</dt>
          <dd class="mt-1">
            Pick a faction and fight through {RUN_LENGTH} encounters. Enemy armies grow about a
            quarter stronger each node and pick up veteran attack and defence as the ranks climb;
            nodes {[...BOSS_NODES].join(', ')} are bosses that field more still. A single defeat
            ends the run.
          </dd>
        </div>
        <div>
          <dt class="font-semibold text-slate-300">Your whole army comes back</dt>
          <dd class="mt-1">
            Casualties last only for the battle they happen in. Every stack you own returns at full
            strength for the next encounter, however badly the last one went — there is no attrition
            to nurse, and a costly win costs nothing but the win.
          </dd>
        </div>
        <div>
          <dt class="font-semibold text-slate-300">Every win pays out</dt>
          <dd class="mt-1">
            Victories offer a choice of reinforcements, and every third one adds an artifact for the
            whole army or a new skill for one of your unit types. Your hero gains a level each win,
            which sharpens its own attacks and deepens the faction skills on its own.
          </dd>
        </div>
        <div>
          <dt class="font-semibold text-slate-300">Endless</dt>
          <dd class="mt-1">
            Clearing node {RUN_LENGTH} does not have to end it — Endless keeps generating harder
            armies for as long as you keep winning.
          </dd>
        </div>
      </dl>
    </section>
  {/if}
</main>
