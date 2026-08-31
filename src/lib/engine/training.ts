import type { BattleState, UnitStack } from './types.ts';
import { controllerOfUnit } from './artifacts.ts';

export function trainingBonus(state: BattleState, unit: UnitStack): { attack: number; defense: number } {
  const learned = state.training?.[controllerOfUnit(unit)]?.[unit.definition.name];
  const rank = Math.max(1, state.gauntletRound ?? 1);
  return {
    attack: learned?.weapon ? rank : 0,
    defense: learned?.armour ? rank : 0,
  };
}
