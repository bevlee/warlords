<script lang="ts">
  import UnitInfo from '$lib/ui/UnitInfo.svelte';
  import { TIER_STYLE } from '$lib/ui/tierStyle';
  import { previewStack } from './previewStack';
  import { applyUnitSkills, type UnitSkills } from '$lib/gauntlet/skills';
  import type { ArmySlot, FactionClass } from '$lib/engine/types';
  import type { ItemId } from '$lib/gauntlet/items';

  interface Props {
    army: ArmySlot[];
    unitSkills: UnitSkills;
    faction: FactionClass;
    /** Passed through so each card names the artifacts that act on it. */
    items?: ItemId[];
  }

  let { army, unitSkills, faction, items = [] }: Props = $props();

  // Taught skills are baked into the unit definition, so the card's ability
  // list shows them exactly as the battle will.
  const stacks = $derived(applyUnitSkills(army, unitSkills, faction));
</script>

<section aria-label="Army">
  <h2 class="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
    Army — <span class="text-slate-300">{army.length} {army.length === 1 ? 'stack' : 'stacks'}</span>
  </h2>

  <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    {#each stacks as slot (slot.unit.name)}
      {@const ts = TIER_STYLE[slot.unit.tier]}
      <div class="overflow-hidden rounded-lg border-2 bg-slate-800 {ts.border} {ts.glow}">
        <p class="py-1 text-center text-[11px] font-semibold uppercase tracking-wider {ts.text}">
          Tier {slot.unit.tier} · {ts.label}
        </p>
        <UnitInfo unit={previewStack(slot.unit, slot.count)} {items} embedded />
      </div>
    {/each}
  </div>
</section>
