import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../db.ts';
import { RoomError, RoomRegistry, ROOM_RECOVERY_MS } from '../rooms.ts';
import { beginCombat, initBattle } from '../../src/lib/engine/battle.ts';
import { aiTakeTurn } from '../../src/lib/engine/ai.ts';
import { GOBLIN } from '../../src/lib/engine/barbarian.ts';
import type { Hero } from '../../src/lib/engine/types.ts';

const dirs: string[] = [];
const HERO: Hero = { class: 'barbarian', level: 1, xp: 0, attack: 1, defense: 1, statPoints: 0, factionSkills: [] };

function setup(now = 1_000_000) {
  const dir = mkdtempSync(join(tmpdir(), 'warlords-rooms-'));
  dirs.push(dir);
  const path = join(dir, 'test.db');
  const db = openDb(path);
  for (const id of ['p1', 'p2', 'p3']) {
    db.prepare('INSERT INTO players (id, token, created_at) VALUES (?, ?, ?)').run(id, `t-${id}`, now);
  }
  return { db, path, rooms: new RoomRegistry(db, () => now) };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('RoomRegistry', () => {
  it('creates a five-letter room, joins one guest, and rejects a third player', () => {
    const { db, rooms } = setup();
    const room = rooms.create('p1', { army: 'host' });
    expect(room.code).toMatch(/^[A-Z]{5}$/);
    expect(rooms.join(room.code.toLowerCase(), 'p2', { army: 'guest' }).guest?.playerId).toBe('p2');
    expect(() => rooms.join(room.code, 'p3', {})).toThrowError(RoomError);
    expect(rooms.findForPlayer('p2')?.code).toBe(room.code);
    db.close();
  });

  it('journals actions and reconstructs the exact state after reopening', () => {
    const { db, path, rooms } = setup();
    const room = rooms.create('p1', {});
    rooms.join(room.code, 'p2', {});
    const initial = beginCombat(initBattle(
      [{ unit: GOBLIN, count: 8 }], [{ unit: GOBLIN, count: 7 }], HERO, 77
    ));
    rooms.startBattle(room.code, initial);
    const action = aiTakeTurn(initial, initial.currentUnitId!);
    rooms.appendAction(room.code, initial.units.find(u => u.id === initial.currentUnitId)!.side === 'player' ? 'host' : 'ai', action);
    const expected = rooms.get(room.code)!.state;
    db.close();

    const reopened = openDb(path);
    const recovered = new RoomRegistry(reopened, () => 1_000_000).get(room.code)!;
    expect(recovered.actions).toHaveLength(1);
    expect(recovered.state).toEqual(expected);
    reopened.close();
  });

  it('abandons expired live battles and discards unjournalled lobbies on boot', () => {
    const { db, rooms } = setup();
    const lobby = rooms.create('p3', {});
    const room = rooms.create('p1', {});
    rooms.join(room.code, 'p2', {});
    const initial = beginCombat(initBattle(
      [{ unit: GOBLIN, count: 2 }], [{ unit: GOBLIN, count: 2 }], HERO, 9
    ));
    rooms.startBattle(room.code, initial);

    const boot = new RoomRegistry(db, () => 1_000_000 + ROOM_RECOVERY_MS + 1);
    expect(boot.get(lobby.code)).toBeUndefined();
    expect(boot.get(room.code)).toBeUndefined();
    expect((db.prepare('SELECT result FROM battles WHERE id = ?').get(room.battleId) as any).result).toBe('abandoned');
    db.close();
  });
});
