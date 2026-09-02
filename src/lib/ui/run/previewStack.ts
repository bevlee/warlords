import type { UnitDef, UnitStack } from '$lib/engine/types';

/** A pristine, full-health stack so battle panels (UnitInfo) can present a
 *  unit outside a battle — draft cards and the run screen's army band. */
export function previewStack(unit: UnitDef, count: number, id = `preview-${unit.name}`): UnitStack {
  return {
    id,
    definition: unit,
    count,
    startCount: count,
    hp: unit.hp,
    pos: { col: 0, row: 0 },
    side: 'player',
    hasRetaliated: false,
    shotsLeft: unit.shots,
    morale: 0,
    luck: 0,
    atb: 0,
    isDefending: false,
  };
}
