import type { Pos } from './types';
import { mulberry32, mixSeed } from './rng';
import { GRID_H } from './deploy';

export type StructureKind =
  | 'shrine_attack'   // army-wide +2 attackBuff for the claiming side
  | 'shrine_defense'  // army-wide +2 defenseBuff
  | 'fountain_luck'   // army-wide +1 luck
  | 'idol_morale'     // army-wide +1 morale
  | 'mana_crystal'    // +4 hero mana (player claims only; inert for the enemy)
  | 'war_chest';      // +25 bonus XP paid out on victory (player claims only)

export interface Structure {
  id: string;
  kind: StructureKind;
  pos: Pos;
  claimedBy: 'player' | 'enemy' | null;
}

export const STRUCTURE_META: Record<StructureKind, { emoji: string; name: string; blurb: string }> = {
  shrine_attack: { emoji: '⚔️', name: 'War Shrine', blurb: '+2 attack to the claiming army' },
  shrine_defense: { emoji: '🛡️', name: 'Bulwark Shrine', blurb: '+2 defense to the claiming army' },
  fountain_luck: { emoji: '🍀', name: 'Fountain of Fortune', blurb: '+1 luck to the claiming army' },
  idol_morale: { emoji: '🗿', name: 'Idol of Courage', blurb: '+1 morale to the claiming army' },
  mana_crystal: { emoji: '💠', name: 'Mana Crystal', blurb: '+4 mana for your hero' },
  war_chest: { emoji: '🧰', name: 'War Chest', blurb: '+25 bonus XP on victory' },
};

export const WAR_CHEST_XP = 25;

const STRUCTURE_SALT = 0x5720c7;
// Between the deployment zone (max col 4 is zone at expert Tactics… zone tops
// out at col 4, structures start at col 4 so a forward knight can grab one on
// deployment) and the enemy line at col 10.
const MIN_COL = 4;
const MAX_COL = 7;
const KINDS: StructureKind[] = [
  'shrine_attack', 'shrine_defense', 'fountain_luck', 'idol_morale', 'mana_crystal', 'war_chest',
];

/**
 * 0–2 structures for a battlefield seed, on its own RNG stream (mixSeed) so
 * layouts are independent of army composition, and never on a rock.
 */
export function generateStructures(seed: number, obstacles: Pos[]): Structure[] {
  const rng = mulberry32(mixSeed(seed, STRUCTURE_SALT));
  const blocked = new Set(obstacles.map(p => `${p.col},${p.row}`));
  const count = Math.floor(rng() * 3); // 0, 1, or 2
  const structures: Structure[] = [];
  for (let guard = 0; structures.length < count && guard < 50; guard++) {
    const col = MIN_COL + Math.floor(rng() * (MAX_COL - MIN_COL + 1));
    const row = Math.floor(rng() * GRID_H);
    const key = `${col},${row}`;
    if (blocked.has(key) || structures.some(s => s.pos.col === col && s.pos.row === row)) continue;
    structures.push({
      id: `structure-${structures.length}`,
      kind: KINDS[Math.floor(rng() * KINDS.length)],
      pos: { col, row },
      claimedBy: null,
    });
  }
  return structures;
}
