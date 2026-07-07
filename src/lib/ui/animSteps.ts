import type { BattleEvent } from '$lib/engine/types';

const STATUS_ICON: Partial<Record<string, string>> = {
  burn_apply: '🔥',
  blind: '😵',
  bind: '⛓',
  bind_block: '⛓',
  slow: '🐌',
  drain_morale: '💔',
  life_drain: '🩸',
  gating: '✨',
};

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
      const { targetId, damage, spell } = entry.data as {
        targetId: string;
        damage?: number;
        spell: 'lightning' | 'bloodlust' | 'stoneskin';
      };
      if (damage !== undefined) {
        return [{ unitId: targetId, kind: 'damage', value: damage }];
      }
      if (spell === 'bloodlust') return [{ unitId: targetId, kind: 'buff', value: 4, label: 'ATK' }];
      if (spell === 'stoneskin') return [{ unitId: targetId, kind: 'buff', value: 4, label: 'DEF' }];
      return [];
    }
    case 'death': {
      const { unitId } = entry.data as { unitId: string };
      return [{ unitId, kind: 'death' }];
    }
    case 'status': {
      const { unitId, effect } = entry.data as { unitId: string; effect: string };
      const icon = STATUS_ICON[effect];
      return icon ? [{ unitId, kind: 'status', icon }] : [];
    }
    default:
      return [];
  }
}
