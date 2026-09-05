<script lang="ts">
  import KeywordText from '$lib/ui/keyword/KeywordText.svelte';
  import Sprite from '$lib/ui/Sprite.svelte';
  import UnitInfo from '$lib/ui/UnitInfo.svelte';
  import ArtifactCard from './ArtifactCard.svelte';
  import { previewStack } from './previewStack';
  import { scrollCap } from './scrollCap';
  import { TIER_STYLE } from '$lib/ui/tierStyle';
  import { skillIconFor, skillGlyph } from '$lib/ui/skillIcons';
  import { FACTION_UNITS } from '$lib/engine/factions';
  import { isUnique } from '$lib/engine/abilityCatalog';
  import { UNIT_SKILLS, canLearnSkill, type SkillId } from '$lib/gauntlet/skills';
  import { type ItemId } from '$lib/gauntlet/items';
  import { actOf, RUN_LENGTH, type RunState, type UnitCard } from '$lib/gauntlet/run';
  import { ACT_NUMERAL } from './ActBand.svelte';

  interface Props {
    run: RunState;
    onpickunit: (card: UnitCard) => void;
    onpickitem: (id: ItemId) => void;
    onteach: (skill: SkillId, unitName: string) => void;
  }

  let { run, onpickunit, onpickitem, onteach }: Props = $props();

  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

  // Skill draft is two-step: choose the skill, then the unit that learns it.
  let chosenSkill = $state<SkillId | null>(null);

  const battleWon = $derived(run.encounterIndex - 1);
  const armyUnits = $derived(run.army.map(slot => slot.unit.name));
  const unitFor = (name: string) => FACTION_UNITS[run.faction].find(u => u.name === name);

  const steps = $derived([
    { label: 'Reinforcements', pending: !!run.pendingDraft },
    { label: 'Artifact', pending: !!run.pendingItems?.length },
    { label: 'Skill', pending: !!run.pendingSkills?.length },
  ]);

  function canLearn(unitName: string, skill: SkillId): boolean {
    const slot = run.army.find(s => s.unit.name === unitName);
    return !!slot && canLearnSkill(slot, run.unitSkills, skill);
  }

  function teach(unitName: string) {
    if (!chosenSkill || !canLearn(unitName, chosenSkill)) return;
    onteach(chosenSkill, unitName);
    chosenSkill = null;
  }
</script>

<section aria-label="Rewards" class="rounded-lg border-2 border-amber-500/70 bg-amber-950/10 p-4">
  <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
    <h2 class="text-lg font-bold tracking-wide text-amber-200">
      Battle {battleWon} won
      {#if battleWon <= RUN_LENGTH}<span class="text-slate-500">· Act {ACT_NUMERAL[actOf(battleWon)]}</span>{/if}
    </h2>
    <!-- The steps replace the old "pick one of each" footnote: a reward is
         either still owed to you or already taken. -->
    <ol class="flex flex-wrap items-center gap-1.5 text-xs">
      {#each steps as step, i (step.label)}
        <li
          class="rounded px-2 py-0.5 font-semibold
            {step.pending ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-500 line-through'}"
        >
          {i + 1} {step.label}
        </li>
      {/each}
    </ol>
  </div>

  {#if run.pendingDraft}
    <h3 class="mb-2 mt-4 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Choose reinforcements</h3>
    <div class="grid gap-3 sm:grid-cols-3">
      {#each run.pendingDraft as card (card.unitName)}
        {@const unit = unitFor(card.unitName)}
        {@const ts = unit ? TIER_STYLE[unit.tier] : TIER_STYLE[1]}
        <!-- A card is a container, not a button: UnitInfo carries keyword
             buttons and a compendium link, which cannot nest inside one. -->
        <div class="flex flex-col overflow-hidden rounded-lg border-2 bg-slate-800 {ts.border} {ts.glow}">
          <span class="w-full py-1 text-center text-[11px] font-semibold uppercase tracking-wider {ts.text}">
            Tier {unit?.tier ?? '?'} · {ts.label}
          </span>
          {#if unit}
            <!-- A long ability list scrolls inside the card, so three cards
                 stay the same height and the picks stay side by side. -->
            <div class="card-scroll max-h-[26rem]" use:scrollCap>
              <UnitInfo unit={previewStack(unit, card.count)} items={run.items} embedded />
            </div>
          {/if}
          <button
            type="button"
            class="m-2 mt-auto rounded bg-amber-500 px-3 py-1.5 text-sm font-bold text-slate-900 transition hover:bg-amber-400"
            onclick={() => onpickunit(card)}
          >
            Recruit {card.count} × {card.unitName}
          </button>
        </div>
      {/each}
    </div>
  {/if}

  {#if run.pendingItems?.length}
    <h3 class="mb-2 mt-4 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
      Claim an artifact <span class="font-normal normal-case tracking-normal text-slate-500">— yours for the rest of the run</span>
    </h3>
    <div class="grid gap-3 sm:grid-cols-2">
      {#each run.pendingItems as id (id)}
        <ArtifactCard {id} {armyUnits} onpick={() => onpickitem(id)} />
      {/each}
    </div>
  {/if}

  {#if run.pendingSkills?.length}
    <h3 class="mb-2 mt-4 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
      Teach a skill <span class="font-normal normal-case tracking-normal text-slate-500">— pick the skill, then the unit that learns it</span>
    </h3>
    <div class="grid gap-3 sm:grid-cols-3">
      {#each run.pendingSkills as id (id)}
        {@const skill = UNIT_SKILLS[id]}
        <div
          class="flex flex-col items-center gap-1.5 rounded-lg border-2 bg-slate-800 p-3 text-center
            {chosenSkill === id ? 'border-violet-300 ring-2 ring-violet-400/60' : 'border-violet-500/60'}"
        >
          {#if skillIconFor(id)}
            <img src={skillIconFor(id)} alt="" class="h-10 w-10" />
          {:else}
            <span class="text-3xl leading-none" aria-hidden="true">{skillGlyph(id)}</span>
          {/if}
          <span class="text-base font-bold text-violet-200">{skill.name}</span>
          <span class="text-[13px] leading-snug text-slate-300"><KeywordText text={skill.description} /></span>
          <button
            type="button"
            class="mt-auto w-full rounded px-3 py-1.5 text-sm font-bold transition
              {chosenSkill === id
                ? 'bg-violet-300 text-slate-900'
                : 'bg-violet-600 text-white hover:bg-violet-500'}"
            aria-pressed={chosenSkill === id}
            onclick={() => (chosenSkill = chosenSkill === id ? null : id)}
          >
            {chosenSkill === id ? 'Choosing…' : 'Teach this'}
          </button>
        </div>
      {/each}
    </div>

    {#if chosenSkill}
      <p class="mb-2 mt-3 text-sm font-semibold text-violet-200">Teach {UNIT_SKILLS[chosenSkill].name} to:</p>
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
            title={learnable ? '' : 'This unit cannot train this skill again'}
            onclick={() => teach(slot.unit.name)}
          >
            <Sprite name={slot.unit.name} class="h-9 w-8" />
            <span class="text-sm font-semibold text-slate-200">{slot.count} × {slot.unit.name}</span>
            {#if learnable && !isUnique(chosenSkill)}
              <span class="font-mono text-xs text-violet-300">
                → {ROMAN[(run.unitSkills[slot.unit.name]?.[chosenSkill] ?? 0) + 1] ?? ''}
              </span>
            {/if}
          </button>
        {/each}
      </div>
    {/if}
  {/if}
</section>
