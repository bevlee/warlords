import type { BattleState, UnitStack } from '../engine/types.ts';

export interface BattleCasualty {
  unitName: string;
  lost: number;
}

export interface BattleSummary {
  rounds: number;
  playerCasualties: BattleCasualty[];
  enemyCasualties: BattleCasualty[];
}

export function summarizeBattle(initialState: BattleState, finalState: BattleState): BattleSummary {
  return {
    rounds: finalState.round,
    playerCasualties: casualties(initialState.units, finalState.units, 'player'),
    enemyCasualties: casualties(initialState.units, finalState.units, 'enemy'),
  };
}

function casualties(
  initialUnits: UnitStack[],
  finalUnits: UnitStack[],
  side: UnitStack['side']
): BattleCasualty[] {
  const before = countsByName(initialUnits, side);
  const after = countsByName(finalUnits, side);
  return [...before.entries()]
    .map(([unitName, count]) => ({ unitName, lost: Math.max(0, count - (after.get(unitName) ?? 0)) }))
    .filter(row => row.lost > 0)
    .sort((a, b) => a.unitName.localeCompare(b.unitName));
}

function countsByName(units: UnitStack[], side: UnitStack['side']): Map<string, number> {
  const counts = new Map<string, number>();
  for (const unit of units) {
    if (unit.side !== side || unit.isHero) continue;
    counts.set(unit.definition.name, (counts.get(unit.definition.name) ?? 0) + unit.count);
  }
  return counts;
}
