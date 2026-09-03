import type { BattleState, TargetMark, UnitStack } from './types.ts';
import { alliedTeamId, hasArtifact } from './artifacts.ts';

export function addMark(target: UnitStack, mark: TargetMark): UnitStack {
  return {
    ...target,
    marks: [
      ...(target.marks ?? []).filter(existing => existing.kind !== mark.kind || (mark.kind !== 'marked_for_death' && existing.ownerTeamId !== mark.ownerTeamId)),
      mark,
    ],
  };
}

export function marksForAttacker(state: BattleState, attacker: UnitStack, target: UnitStack): TargetMark[] {
  const team = alliedTeamId(state, attacker);
  return (target.marks ?? []).filter(mark => mark.kind === 'marked_for_death' || mark.ownerTeamId === team);
}

export function incomingMarkMultiplier(state: BattleState, attacker: UnitStack, target: UnitStack, ranged: boolean): number {
  let value = 1;
  for (const mark of marksForAttacker(state, attacker, target)) {
    if (mark.kind === 'marked_for_death') value *= 1.2;
    if (mark.kind === 'ranged_mark' && ranged) value *= hasArtifact(state, attacker, 'red_fletched_arrows') ? 1.45 : 1.3;
  }
  return value;
}

/** Consume the once-per-combatant Quarry reward for a primary damaging
 * attack. The mark lives on the target, so allied co-op controllers and
 * summons use the same path as the Ranger's own army. */
export function triggerQuarry(state: BattleState, attacker: UnitStack, target: UnitStack): { target: UnitStack; triggered: boolean } {
  const team = alliedTeamId(state, attacker);
  const index = (target.marks ?? []).findIndex(mark => mark.kind === 'quarry' && mark.ownerTeamId === team);
  if (index < 0) return { target, triggered: false };
  const marks = [...(target.marks ?? [])];
  const mark = marks[index];
  if ((mark.triggeredBy ?? []).includes(attacker.id)) return { target, triggered: false };
  marks[index] = { ...mark, triggeredBy: [...(mark.triggeredBy ?? []), attacker.id] };
  return { target: { ...target, marks }, triggered: true };
}
