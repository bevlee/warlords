import type { UnitStack } from '$lib/engine/types';
import { ITEMS, itemEffectText, type ItemId } from '$lib/gauntlet/items';

export interface ArtifactInteraction {
  id: ItemId;
  name: string;
  description: string;
}

/** Only real numeric army bonuses belong in every unit's modifier-source
 * ledger. Conditional artifacts are represented when their effect is live. */
export function artifactModifierSources(itemIds: ItemId[]) {
  return itemIds.flatMap(id => {
    const item = ITEMS[id];
    const stats = Object.fromEntries(Object.entries(item?.effects ?? {}).filter(([, value]) => value !== 0));
    if (!item || Object.keys(stats).length === 0) return [];
    return [{ id: `item:${id}`, label: item.name, stats, stacks: 1 }];
  });
}

/** Artifact relationships are explanatory, not ownership. The selected unit
 * does not carry these items; its abilities or identity make their army-wide
 * rules relevant. `requiresUnit` is deliberately included because it is the
 * draft-time expression of that relationship. */
export function artifactInteractionsFor(unit: UnitStack, itemIds: ItemId[]): ArtifactInteraction[] {
  if (unit.isHero) return [];
  return itemIds.flatMap(id => {
    const item = ITEMS[id];
    if (!item || !item.requiresUnit?.includes(unit.definition.name)) return [];
    return [{ id, name: item.name, description: itemEffectText(item) }];
  });
}
