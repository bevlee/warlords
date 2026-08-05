import type { UnitStack } from '$lib/engine/types';

/**
 * The server already drives every non-player stack in online battles. Locally,
 * enemies and summoned allies use the AI by default; auto battle extends that
 * same control to the player's own stacks.
 */
export function shouldAutomateTurn(
  unit: UnitStack,
  autoBattle: boolean,
  online: boolean,
  localControllerId?: string,
): boolean {
  if (online) {
    return autoBattle && !!localControllerId && unit.controllerId === localControllerId;
  }

  return unit.side === 'enemy' || !!unit.isAlly || autoBattle;
}
