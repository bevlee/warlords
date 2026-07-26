import { attributeIconFor } from './attributeIcons';
import { statusIconFor } from './statusIcons';

const SPELL_ICONS: Record<string, string> = {
  lightning: attributeIconFor('initiative'),
  bloodlust: statusIconFor('bloodlust'),
  stoneskin: statusIconFor('stoneskin'),
};

/** Themed icon URL for a spell, or undefined for a future spell without art. */
export function spellIconFor(id: string): string | undefined {
  return SPELL_ICONS[id];
}
