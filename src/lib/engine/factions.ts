import type { FactionClass, UnitDef } from './types';
import { BARBARIAN_UNITS } from './barbarian';
import { KNIGHT_UNITS } from './knight';
import { WIZARD_UNITS } from './wizard';
import { NECROMANCER_UNITS } from './necromancer';
import { RANGER_UNITS } from './ranger';
import { DEMON_UNITS } from './demon';

export const FACTION_UNITS: Record<FactionClass, UnitDef[]> = {
  barbarian: BARBARIAN_UNITS,
  knight: KNIGHT_UNITS,
  wizard: WIZARD_UNITS,
  necromancer: NECROMANCER_UNITS,
  ranger: RANGER_UNITS,
  demon: DEMON_UNITS,
};

export const FACTION_INFO: Record<FactionClass, { name: string; description: string }> = {
  barbarian: { name: 'Barbarian', description: 'Aggressive melee horde with cheap shock troops.' },
  knight: { name: 'Knight', description: 'Defensive, balanced units — strong against undead.' },
  wizard: { name: 'Wizard', description: 'Fragile but powerful ranged and magic units.' },
  necromancer: { name: 'Necromancer', description: 'Fragile undead horde that raises fallen enemies.' },
  ranger: { name: 'Ranger', description: 'Fast, mobile nature-bonded skirmishers and archers.' },
  demon: { name: 'Demon', description: 'Reckless, high-damage raiders from the burning wastes.' },
};
