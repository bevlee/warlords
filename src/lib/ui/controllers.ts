import type { UnitStack } from '$lib/engine/types';

/** Who commands a stack. Derived from side/isAlly today; when real
 *  multiplayer arrives, stamp a controller id on UnitStack in initBattle
 *  and this becomes a field read — every consumer already goes through here. */
export type ControllerId = 'player' | 'ally' | 'enemy';

export function controllerOf(u: UnitStack): ControllerId {
  if (u.side === 'enemy') return 'enemy';
  return u.isAlly ? 'ally' : 'player';
}

/** Tailwind classes per controller. Literal strings on purpose — the
 *  Tailwind scanner reads .ts files and can't see computed names.
 *  `log` colors unit names in the battle log; `badge` colors the count
 *  plate on battlefield tokens. Add entries here for future players. */
export const CONTROLLER_STYLE: Record<ControllerId, { log: string; badge: string }> = {
  player: { log: 'text-sky-300', badge: 'border-sky-300 bg-sky-700' },
  ally: { log: 'text-emerald-300', badge: 'border-emerald-300 bg-emerald-700' },
  enemy: { log: 'text-red-300', badge: 'border-red-300 bg-red-700' },
};
