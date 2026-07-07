import type { BattleEvent } from '$lib/engine/types';

export type AnimStep =
  | { unitId: string; kind: 'damage'; value: number }
  | { unitId: string; kind: 'buff'; value: number; label: string }
  | { unitId: string; kind: 'death' }
  | { unitId: string; kind: 'status'; icon: string };

/** Translates one battle log entry into the visual steps it should play. */
export function stepsFromLogEntry(entry: BattleEvent): AnimStep[] {
  switch (entry.type) {
    case 'attack':
    case 'retaliate':
    case 'shoot': {
      const { targetId, damage } = entry.data as { targetId: string; damage: number };
      return [{ unitId: targetId, kind: 'damage', value: damage }];
    }
    case 'cast': {
      const { targetId, damage } = entry.data as { targetId: string; damage?: number };
      if (damage !== undefined) {
        return [{ unitId: targetId, kind: 'damage', value: damage }];
      }
      return [];
    }
    default:
      return [];
  }
}
