<script lang="ts">
  import { onMount } from 'svelte';
  import Battle from '$lib/ui/Battle.svelte';
  import Sprite from '$lib/ui/Sprite.svelte';
  import { FACTION_INFO, FACTION_UNITS } from '$lib/engine/factions';
  import { armyCost } from '$lib/engine/recruit';
  import { ITEMS, itemBonuses, itemEffectText, type ItemId } from '$lib/gauntlet/items';
  import { UNIT_SKILLS, applyUnitSkills, canLearnSkill, migrateUnitSkills, type SkillId } from '$lib/gauntlet/skills';
  import { skillIconFor, skillGlyph } from '$lib/ui/skillIcons';
  import { isUnique } from '$lib/engine/abilityCatalog';

  const ROMAN_LVL = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];
  import {
    newRun,
    recordBattle,
    applyPick,
    applyItemPick,
    applySkillPick,
    generateGauntletEnemy,
    survivorsFrom,
    encounterBudget,
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
  import type { FactionClass, UnitDef, UnitStack } from '$lib/engine/types';

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

  // Debug: +99 hero attack, which the combat formula adds to every player
  // stack's attack — a quick "win button" for testing. Session-only state,
  // never saved to the run.
  const DEBUG_ATTACK = 99;
  let debugBoost = $state(false);

  onMount(async () => {
    const saved = await loadRun<RunState>();
    // Saves from before the items feature lack these fields.
    run = saved
      ? {
          ...saved,
          items: saved.items ?? [],
          pendingItems: saved.pendingItems ?? null,
          unitSkills: migrateUnitSkills(saved.unitSkills ?? {}),
          pendingSkills: saved.pendingSkills ?? null,
        }
      : null;
    loaded = true;
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

  function handleResult(result: 'player_wins' | 'enemy_wins', finalUnits: UnitStack[]) {
    if (!run) return;
    run = recordBattle(run, result === 'player_wins', survivorsFrom(finalUnits));
    void saveRun(run);
  }

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
  <div class="mb-4 flex items-center gap-4">
    <h1 class="text-2xl font-bold">Warlords — Gauntlet</h1>
    <a href="/" class="text-lg text-slate-400 hover:text-slate-200">← main game</a>
  </div>

  {#if !loaded}
    <p class="text-slate-400">Loading…</p>
  {:else if !run}
    <!-- Run setup: pick a faction -->
    <div class="mx-auto max-w-5xl">
      <h2 class="mb-2 text-3xl font-bold text-amber-200">Choose your faction</h2>
      <p class="mb-8 text-lg text-slate-300">
        Fight 10 escalating battles, then continue forever in Endless. Losses persist —
        draft reinforcements and army-wide artifacts after each victory.
      </p>
      <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {#each Object.entries(FACTION_INFO) as [id, info] (id)}
          {@const t7 = FACTION_UNITS[id as FactionClass].find(u => u.tier === 7)!}
          <button
            type="button"
            class="flex flex-col items-center gap-3 rounded-xl border-2 border-slate-700 bg-slate-800 p-7
              text-center transition hover:-translate-y-0.5 hover:border-amber-400 hover:bg-slate-700"
            onclick={() => begin(id as FactionClass)}
          >
            <Sprite name={t7.name} class="h-28 w-24" />
            <span class="text-xl font-bold text-amber-200">{info.name}</span>
            <span class="text-sm leading-snug text-slate-400">{info.description}</span>
          </button>
        {/each}
      </div>
    </div>
  {:else if inBattle}
    {#key battleKey}
      <Battle
        playerArmy={applyUnitSkills(run.army, run.unitSkills, run.faction)}
        enemyArmy={encounter?.army ?? []}
        hero={debugBoost ? { ...run.hero, attack: run.hero.attack + DEBUG_ATTACK } : run.hero}
        armyBonuses={itemBonuses(run.items)}
        items={run.items}
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
            <button
              type="button"
              class="flex flex-col items-center gap-1.5 rounded-lg border-2 bg-slate-800 p-6
                hover:bg-slate-700 hover:brightness-110 {rs.border}"
              onclick={() => pickItem(id)}
            >
              <ItemIcon {id} class="h-14 w-14" />
              <span class="text-xl font-bold {rs.text}">{item.name}</span>
              <span class="text-xs font-semibold uppercase tracking-wider {rs.text}">{rs.label}</span>
              <span class="font-mono text-base text-amber-200">{itemEffectText(item)}</span>
            </button>
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
            <button
              type="button"
              class="flex flex-col items-center gap-1.5 rounded-lg border-2 bg-slate-800 p-5
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
              <span class="text-center text-sm leading-snug text-slate-400">{skill.description}</span>
            </button>
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
                {FACTION_INFO[enc.faction].name} warband — strength ~{encounterBudget(run.encounterIndex)}
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
                  {FACTION_INFO[enc.faction].name} warband — strength ~{encounterBudget(n)}
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
  <div class="flex items-center gap-2 py-0.5" title={skill.description}>
    <span class="text-xs text-slate-200">{skill.name}</span>
    <span class="font-mono text-[10px] text-amber-300">{skill.level}</span>
  </div>
{/each}
          {#if run.items.length > 0}
            <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Artifacts</p>
            {#each run.items as id (id)}
              {@const item = ITEMS[id]}
              <div class="flex items-center gap-2 py-0.5" title={itemEffectText(item)}>
                <ItemIcon {id} class="h-5 w-5 shrink-0" />
                <span class="flex-1 text-xs {RARITY_STYLE[item.rarity].text}">{item.name}</span>
                <span class="font-mono text-[10px] text-amber-300">{itemEffectText(item)}</span>
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
                    title={UNIT_SKILLS[sk].description}
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
          🐛 Debug +{DEBUG_ATTACK} ATK · {debugBoost ? 'ON' : 'OFF'}
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
</main>
