import type { BattleEvent, BattleState, Pos } from '$lib/engine/types';
import { applyDamage } from '$lib/engine/combat';
import { setOccupant } from '$lib/engine/grid';

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
  | { unitId: string; kind: 'status'; icon: string }
  | { unitId: string; kind: 'move'; from: Pos; to: Pos }
  // Melee lunge: the attacker bumps into the target and springs back.
  // Future combat animations (projectiles, cast flashes, sprite sheets)
  // should follow this pattern: a new kind here, resolved visually in
  // BattleGrid/BattleFx by unit id at beat time.
  | { unitId: string; kind: 'strike'; targetId: string };

/** Translates one battle log entry into the visual steps it should play. */
export function stepsFromLogEntry(entry: BattleEvent): AnimStep[] {
  switch (entry.type) {
    case 'attack':
    case 'retaliate': {
      const { attackerId, targetId, damage } = entry.data as { attackerId: string; targetId: string; damage: number };
      return [
        { unitId: attackerId, kind: 'strike', targetId },
        { unitId: targetId, kind: 'damage', value: damage },
      ];
    }
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
    case 'move': {
      const { unitId, from, to } = entry.data as { unitId: string; from?: Pos; to: Pos };
      return from ? [{ unitId, kind: 'move', from, to }] : [];
    }
    default:
      return [];
  }
}

/** Patches only what an animation step needs to read (count/hp/buffs) from
 *  one log entry. Not a full engine replica — Battle.svelte always
 *  overwrites with the engine's real result after the last entry. */
export function applyLogEntry(state: BattleState, entry: BattleEvent): BattleState {
  const patchUnit = (unitId: string, patch: (u: BattleState['units'][number]) => BattleState['units'][number]) => ({
    ...state,
    units: state.units.map(u => (u.id === unitId ? patch(u) : u)),
  });

  switch (entry.type) {
    case 'attack':
    case 'retaliate':
    case 'shoot': {
      const { targetId, damage } = entry.data as { targetId: string; damage: number };
      return patchUnit(targetId, u => applyDamage(u, damage).remaining);
    }
    case 'death': {
      const { unitId } = entry.data as { unitId: string };
      return patchUnit(unitId, u => ({ ...u, count: 0 }));
    }
    case 'move': {
      const { unitId, to } = entry.data as { unitId: string; to: Pos };
      const mover = state.units.find(u => u.id === unitId);
      if (!mover) return state;
      const moved = patchUnit(unitId, u => ({ ...u, pos: to }));
      return { ...moved, grid: setOccupant(setOccupant(moved.grid, mover.pos, null), to, unitId) };
    }
    case 'cast': {
      const { targetId, damage, spell } = entry.data as {
        targetId: string;
        damage?: number;
        spell: 'lightning' | 'bloodlust' | 'stoneskin';
      };
      if (damage !== undefined) return patchUnit(targetId, u => applyDamage(u, damage).remaining);
      if (spell === 'bloodlust') return patchUnit(targetId, u => ({ ...u, attackBuff: (u.attackBuff ?? 0) + 4 }));
      if (spell === 'stoneskin') return patchUnit(targetId, u => ({ ...u, defenseBuff: (u.defenseBuff ?? 0) + 4 }));
      return state;
    }
    default:
      return state;
  }
}
