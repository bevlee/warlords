import type { BattleEvent, BattleState, JsonValue } from './types.ts';
import type { Rng } from './rng.ts';

export type TriggerPhase =
  | 'turnStart'
  | 'beforeAction'
  | 'beforeHit'
  | 'afterHit'
  | 'afterMove'
  | 'afterDeath'
  | 'afterAction'
  | 'turnEnd';

export interface TriggerContext {
  phase: TriggerPhase;
  actionId: string;
  actorId: string;
  sourceId?: string;
  targetId?: string;
  payload?: Record<string, JsonValue>;
}

export interface TriggerResult {
  state: BattleState;
  events?: BattleEvent[];
}

export interface CombatTrigger {
  id: string;
  phase: TriggerPhase;
  /** Lower priority resolves first; id is the stable tie-breaker. */
  priority?: number;
  when(state: BattleState, context: TriggerContext): boolean;
  resolve(state: BattleState, context: TriggerContext, rng: Rng): TriggerResult;
}

/** Explicit registries avoid module-load-order behavior. Definitions are
 * sorted at dispatch, so replay/co-op resolution is identical in every JS
 * runtime even if feature modules supplied them in a different order. */
export class TriggerRegistry {
  readonly definitions: readonly CombatTrigger[];

  constructor(definitions: readonly CombatTrigger[] = []) {
    const ids = new Set<string>();
    for (const definition of definitions) {
      if (ids.has(definition.id)) throw new Error(`Duplicate combat trigger: ${definition.id}`);
      ids.add(definition.id);
    }
    this.definitions = [...definitions];
  }

  dispatch(state: BattleState, context: TriggerContext, rngForTrigger: (definitionId: string) => Rng): TriggerResult {
    let next = state;
    const events: BattleEvent[] = [];
    const queue = this.definitions
      .filter(definition => definition.phase === context.phase)
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0) || a.id.localeCompare(b.id));
    for (const definition of queue) {
      if (!definition.when(next, context)) continue;
      const resolved = definition.resolve(next, context, rngForTrigger(definition.id));
      next = resolved.state;
      if (resolved.events) events.push(...resolved.events);
    }
    return { state: next, events };
  }
}
