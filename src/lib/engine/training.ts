import type { BattleState, UnitStack } from './types.ts';
import { controllerOfUnit } from './artifacts.ts';

export function trainingBonus(state: BattleState, unit: UnitStack): { attack: number; defense: number } {
  const learned = state.training?.[controllerOfUnit(unit)]?.[unit.definition.name];
  const battlesWon = Math.max(0, (state.gauntletRound ?? 1) - 1);
  return {
    attack: learned?.weapon ? battlesWon : 0,
    defense: learned?.armour ? battlesWon : 0,
  };
}
