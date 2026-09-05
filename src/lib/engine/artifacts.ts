import type { BattleState, UnitStack } from './types.ts';

export function controllerOfUnit(unit: UnitStack): string {
  return unit.controllerId ?? (unit.side === 'enemy' ? 'enemy' : unit.isAlly ? 'ally' : 'player');
}

export function artifactIdsFor(state: BattleState, owner: UnitStack | string): string[] {
  const controller = typeof owner === 'string' ? owner : controllerOfUnit(owner);
  return state.artifacts?.[controller] ?? [];
}

export function hasArtifact(state: BattleState, owner: UnitStack | string, artifactId: string): boolean {
  return artifactIdsFor(state, owner).includes(artifactId);
}

export function protectedByPython(state: BattleState, unit: UnitStack): boolean {
  return unit.definition.name === 'Black Knight' && hasArtifact(state, unit, 'montys_python') &&
    state.units.some(other => other.id !== unit.id && other.count > 0 && !other.isHero && controllerOfUnit(other) === controllerOfUnit(unit));
}

export function alliedTeamId(state: BattleState, unit: UnitStack): string {
  const controller = controllerOfUnit(unit);
  return state.controllerTeams?.[controller] ?? unit.side;
}

/** One query for tunable catalog magnitudes and artifact replacements. */
export function mechanicParam(
  state: BattleState,
  owner: UnitStack | string,
  definitionId: string,
  key: string,
  base: number,
): number {
  const ids = artifactIdsFor(state, owner);
  const replacements: Record<string, Record<string, Record<string, number>>> = {
    militia: { perCreatures: { muster_bell: 8 } },
    area_shot: { damage: { blackpowder_fletching: 0.65 } },
    ride_by_attack: { cooldown: { silver_spurs: 1 } },
    weakness_aura: { multiplier: { hexfield_core: 3 } },
    caustic_breath: { range: { pressurised_bile_sac: 5 } },
    banner_of_the_first_raid: {
      speed: { map_of_the_first_raid: 4 },
      damage: { banner_of_no_return: 1.5 },
    },
    burn: { multiplier: { blackened_wick: 2 } },
  };
  let value = base;
  for (const id of [...ids].sort()) value = replacements[definitionId]?.[key]?.[id] ?? value;
  return value;
}
