import { describe, it, expect } from 'vitest';
import { controllerOf, CONTROLLER_STYLE } from '../controllers';
import type { UnitStack } from '$lib/engine/types';

describe('controllerOf', () => {
  it('maps your own stacks to player', () => {
    expect(controllerOf({ side: 'player' } as UnitStack)).toBe('player');
  });

  it('maps your hero to player', () => {
    expect(controllerOf({ side: 'player', isHero: true } as UnitStack)).toBe('player');
  });

  it('maps summoned allies to ally', () => {
    expect(controllerOf({ side: 'player', isAlly: true } as UnitStack)).toBe('ally');
  });

  it('maps enemy stacks to enemy', () => {
    expect(controllerOf({ side: 'enemy' } as UnitStack)).toBe('enemy');
  });
});

describe('CONTROLLER_STYLE', () => {
  it('has log and badge classes for every controller', () => {
    for (const id of ['player', 'ally', 'enemy'] as const) {
      expect(CONTROLLER_STYLE[id].log).toBeTruthy();
      expect(CONTROLLER_STYLE[id].badge).toBeTruthy();
    }
  });
});
