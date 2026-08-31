import type { UnitStack } from './types.ts';

/** Cooldowns tick at the start of this stack's turns. A cooldown of 2 used on
 * turn one is therefore at 1 on turn two and ready on turn three. */
export function startCooldown(stack: UnitStack, abilityId: string, cooldown: number): UnitStack {
  return { ...stack, cooldowns: { ...(stack.cooldowns ?? {}), [abilityId]: cooldown } };
}

export function decreaseCooldowns(stack: UnitStack): UnitStack {
  if (!stack.cooldowns) return stack;
  const cooldowns = Object.fromEntries(Object.entries(stack.cooldowns).map(([id, value]) => [id, Math.max(0, value - 1)]));
  return { ...stack, cooldowns };
}

export const abilityReady = (stack: UnitStack, abilityId: string): boolean =>
  (stack.cooldowns?.[abilityId] ?? 0) <= 0;

export const displayedCooldown = (stack: UnitStack, abilityId: string): number =>
  Math.max(0, stack.cooldowns?.[abilityId] ?? 0);
