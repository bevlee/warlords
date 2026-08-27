import type { UnitModifierSource, UnitStack } from './types.ts';

/** Add one application of a named modifier, merging repeated applications so
 * Curse Shot and Infecting Strike stay readable as a single stacked line. */
export function addModifierSource(
  unit: UnitStack,
  source: Omit<UnitModifierSource, 'stacks'>,
): UnitStack {
  const sources = unit.modifierSources ?? [];
  const existing = sources.find(entry => entry.id === source.id);
  const updated: UnitModifierSource = existing
    ? {
        ...existing,
        stats: Object.fromEntries(
          [...new Set([...Object.keys(existing.stats), ...Object.keys(source.stats)])]
            .map(stat => [
              stat,
              (existing.stats[stat as keyof typeof existing.stats] ?? 0)
                + (source.stats[stat as keyof typeof source.stats] ?? 0),
            ])
        ),
        stacks: existing.stacks + 1,
      }
    : { ...source, stacks: 1 };

  return {
    ...unit,
    modifierSources: existing
      ? sources.map(entry => (entry.id === source.id ? updated : entry))
      : [...sources, updated],
  };
}

/** Replace a named source with an authoritative total. Used by animation
 * replay events that carry the final accumulated value. */
export function setModifierSource(unit: UnitStack, source: UnitModifierSource): UnitStack {
  const sources = unit.modifierSources ?? [];
  return {
    ...unit,
    modifierSources: sources.some(entry => entry.id === source.id)
      ? sources.map(entry => (entry.id === source.id ? source : entry))
      : [...sources, source],
  };
}

export function removeModifierSource(unit: UnitStack, id: string): UnitStack {
  if (!unit.modifierSources?.some(entry => entry.id === id)) return unit;
  const modifierSources = unit.modifierSources.filter(entry => entry.id !== id);
  return { ...unit, modifierSources: modifierSources.length > 0 ? modifierSources : undefined };
}
