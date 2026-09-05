<script lang="ts">
  import UnitInfo from '$lib/ui/UnitInfo.svelte';
  import { TIER_STYLE } from '$lib/ui/tierStyle';
  import StackChip from './StackChip.svelte';
  import { previewStack } from './previewStack';
  import { scrollCap } from './scrollCap';
  import { applyUnitSkills, UNIT_SKILLS, type SkillId, type UnitSkills } from '$lib/gauntlet/skills';
  import { isUnique } from '$lib/engine/abilityCatalog';
  import { ITEMS, type ItemId } from '$lib/gauntlet/items';
  import type { ArmySlot, FactionClass } from '$lib/engine/types';

  interface Props {
    army: ArmySlot[];
    unitSkills: UnitSkills;
    faction: FactionClass;
    /** Passed through so an opened card names the artifacts that act on it. */
    items?: ItemId[];
  }

  let { army, unitSkills, faction, items = [] }: Props = $props();

  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

  // Taught skills are baked into the unit definition, so an opened card's
  // ability list shows them exactly as the battle will.
  const stacks = $derived(applyUnitSkills(army, unitSkills, faction, items));

  let openUnit = $state<string | null>(null);

  /** What makes a stack more than the stock unit: the skills you taught it and
   *  the artifacts that name it. The detail lives in the card; this is the flag. */
  function notesFor(unitName: string): string[] {
    const taught = (Object.entries(unitSkills[unitName] ?? {}) as [SkillId, number][])
      .filter(([, level]) => level)
      .map(([id, level]) => (isUnique(id) ? UNIT_SKILLS[id].name : `${UNIT_SKILLS[id].name} ${ROMAN[level] ?? level}`));
    const artifacts = items
      .filter(id => ITEMS[id]?.requiresUnit?.includes(unitName))
      .map(id => ITEMS[id].name);
    return [...taught, ...artifacts];
  }
</script>

<section aria-label="Army">
  <h2 class="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
    Army — <span class="text-slate-300">{army.length} {army.length === 1 ? 'stack' : 'stacks'}</span>
    <span class="ml-1 font-normal normal-case tracking-normal text-slate-600">· open a stack for its full card</span>
  </h2>

  <!-- The chip the encounter uses for enemy stacks, so both sides of the next
       fight read the same way. Yours carry what you have changed about them. -->
  <div class="flex flex-wrap gap-2">
    {#each stacks as slot (slot.unit.name)}
      <StackChip
        unit={slot.unit}
        count={slot.count}
        notes={notesFor(slot.unit.name)}
        open={openUnit === slot.unit.name}
        ontoggle={() => (openUnit = openUnit === slot.unit.name ? null : slot.unit.name)}
      />
    {/each}
  </div>

  {#each stacks as slot (slot.unit.name)}
    {#if openUnit === slot.unit.name}
      {@const ts = TIER_STYLE[slot.unit.tier]}
      <div class="mt-3 max-w-md overflow-hidden rounded-lg border-2 bg-slate-800 {ts.border} {ts.glow}">
        <p class="py-1 text-center text-[11px] font-semibold uppercase tracking-wider {ts.text}">
          Tier {slot.unit.tier} · {ts.label}
        </p>
        <!-- A long ability list scrolls inside the card rather than pushing the
             rest of the page down. -->
        <div class="card-scroll max-h-[28rem]" use:scrollCap>
          <UnitInfo unit={previewStack(slot.unit, slot.count)} {items} embedded />
        </div>
      </div>
    {/if}
  {/each}
</section>
