import type WebSocket from 'ws';
import { aiTakeTurn } from '../src/lib/engine/ai.ts';
import { beginCombat, deployMove, initBattle, splitStack } from '../src/lib/engine/battle.ts';
import { FACTION_UNITS } from '../src/lib/engine/factions.ts';
import { updateFactionSkills } from '../src/lib/engine/factionSkills.ts';
import { budgetForLevel, xpToReach } from '../src/lib/engine/progression.ts';
import { armyCost, MAX_STACKS, mergeArmySlots } from '../src/lib/engine/recruit.ts';
import { canShootTarget, getAttackOrigins, getReachableCells, isShootingBlocked } from '../src/lib/engine/selectors.ts';
import type { BattleAction, BattleState } from '../src/lib/engine/types.ts';
import type {
  AuthenticatedClientMessage,
  CoopLoadout,
  RoomPlayer,
  ServerMessage,
} from './protocol.ts';
import { RoomError, RoomRegistry, type Room, type RoomActionEntry } from './rooms.ts';

export interface RoomOrchestratorOptions {
  maxReplayGap?: number;
  disconnectGraceMs?: number;
  deployTimeoutMs?: number;
}

export interface RoomTransport {
  isConnected(playerId: string): boolean;
  send(socket: WebSocket, message: ServerMessage): void;
  sendTo(playerId: string, message: ServerMessage, except?: WebSocket): void;
}

interface DeployTimer {
  remaining: number;
  startedAt: number;
  timer?: ReturnType<typeof setTimeout>;
}

/** Owns authenticated room, deployment, battle, AI, chat, and reconnect behavior. */
export class RoomOrchestrator {
  private readonly maxReplayGap: number;
  private readonly disconnectGraceMs: number;
  private readonly deployTimeoutMs: number;
  private readonly disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly deployTimers = new Map<string, DeployTimer>();

  constructor(
    private readonly rooms: RoomRegistry,
    private readonly transport: RoomTransport,
    options: RoomOrchestratorOptions = {}
  ) {
    this.maxReplayGap = options.maxReplayGap ?? 200;
    this.disconnectGraceMs = options.disconnectGraceMs ?? 10 * 60 * 1000;
    this.deployTimeoutMs = options.deployTimeoutMs ?? 60_000;
  }

  handleAuthenticated(socket: WebSocket, playerId: string, lastSeq?: number): void {
    const disconnectTimer = this.disconnectTimers.get(playerId);
    if (disconnectTimer) clearTimeout(disconnectTimer);
    this.disconnectTimers.delete(playerId);

    const room = this.rooms.findForPlayer(playerId);
    if (!room) {
      if (lastSeq !== undefined) {
        this.transport.send(socket, { type: 'error', code: 'room_gone', msg: 'room no longer exists' });
      }
      return;
    }
    this.sendRoomState(room);
    this.broadcast(room, { type: 'room.peer', event: 'reconnected', playerId }, socket);
    this.broadcast(room, { type: 'room.waiting', waiting: false });
    if (this.allConnected(room)) this.resumeDeployTimer(room);
    if (room.phase === 'deploy' && room.deployState) {
      this.transport.send(socket, { type: 'deploy.state', state: room.deployState, confirmed: [...room.confirmed] });
    }
    if (!room.state) return;

    // lastSeq is the client's applied journal position. Small gaps replay only
    // the missing tail; invalid or large gaps get one canonical snapshot. The
    // per-action state hash is a canary, not the source of truth: mismatch asks
    // for this same full resync path rather than mutating sequence state locally.
    if (
      lastSeq !== undefined &&
      Number.isInteger(lastSeq) &&
      lastSeq >= 0 &&
      lastSeq <= room.actions.length &&
      room.actions.length - lastSeq <= this.maxReplayGap
    ) {
      for (const entry of room.actions.slice(lastSeq)) this.sendApplied(socket, entry);
    } else {
      this.transport.send(socket, { type: 'battle.resync', state: room.state, lastSeq: room.actions.length });
    }
    for (const chat of this.rooms.chat(room.code)) {
      this.transport.send(socket, {
        type: 'chat.message',
        afterSeq: chat.afterSeq,
        byController: chat.controller,
        text: chat.text,
        ts: chat.ts,
      });
    }
  }

  handleMessage(socket: WebSocket, playerId: string, message: AuthenticatedClientMessage): void {
    try {
      switch (message.type) {
        case 'room.create': {
          const room = this.rooms.create(playerId, requireLoadout(message.loadout));
          this.sendRoomState(room);
          break;
        }
        case 'room.join': {
          const room = this.rooms.join(message.code, playerId, requireLoadout(message.loadout));
          this.broadcast(room, { type: 'room.peer', event: 'joined', playerId }, socket);
          this.sendRoomState(room);
          this.prepareDeploy(room);
          break;
        }
        case 'deploy.move':
        case 'deploy.split': {
          const room = this.requiredRoom(playerId, 'deploy');
          const controller = this.controllerFor(room, playerId);
          const next = message.type === 'deploy.move'
            ? deployMove(room.deployState!, message.unitId, message.to, controller)
            : splitStack(room.deployState!, message.unitId, message.amount, message.to, controller);
          if (next === room.deployState) throw new RoomError('invalid_deploy', 'deployment operation rejected');
          this.rooms.updateDeploy(room.code, next);
          this.broadcastDeploy(room);
          break;
        }
        case 'deploy.confirm': {
          const room = this.requiredRoom(playerId, 'deploy');
          room.confirmed.add(this.controllerFor(room, playerId));
          this.broadcastDeploy(room);
          if (room.confirmed.size === 2) this.finishDeploy(room);
          break;
        }
        case 'battle.action': {
          const room = this.requiredRoom(playerId, 'battle');
          if (!this.allConnected(room)) throw new RoomError('waiting_for_peer', 'battle is paused for reconnect');
          if (message.lastSeq !== room.actions.length) throw new RoomError('stale_seq', 'action sequence is stale');
          const controller = this.controllerFor(room, playerId);
          const actor = room.state!.units.find(unit => unit.id === room.state!.currentUnitId);
          if (!actor || actor.controllerId !== controller) {
            throw new RoomError('not_your_turn', 'current unit belongs to another controller');
          }
          if (!isLegalAction(room.state!, message.action)) throw new RoomError('invalid_action', 'action is not legal');
          this.broadcastApplied(room, this.rooms.appendAction(room.code, controller, message.action));
          this.driveAi(room);
          break;
        }
        case 'chat.send': {
          const room = this.requiredRoom(playerId, 'battle');
          const controller = this.controllerFor(room, playerId);
          const saved = this.rooms.appendChat(room.code, controller, message.text);
          this.broadcast(room, {
            type: 'chat.message',
            afterSeq: saved.afterSeq,
            byController: controller,
            text: saved.text,
            ts: saved.ts,
          });
          break;
        }
        case 'resync.request': {
          const room = this.rooms.findForPlayer(playerId);
          if (!room?.state) throw new RoomError('room_gone', 'no live room found');
          this.transport.send(socket, { type: 'battle.resync', state: room.state, lastSeq: room.actions.length });
          break;
        }
      }
    } catch (error) {
      if (error instanceof RoomError) {
        this.transport.send(socket, { type: 'error', code: error.code, msg: error.message });
      } else {
        console.error('ws game message error:', error);
        this.transport.send(socket, { type: 'error', code: 'internal', msg: 'internal server error' });
      }
    }
  }

  handleDisconnected(playerId: string): void {
    const room = this.rooms.findForPlayer(playerId);
    if (!room) return;
    this.freezeDeployTimer(room);
    this.broadcast(room, { type: 'room.peer', event: 'left', playerId });
    this.broadcast(room, { type: 'room.waiting', waiting: true });
    const timer = setTimeout(() => {
      if (this.transport.isConnected(playerId)) return;
      this.broadcast(room, { type: 'battle.end', result: 'abandoned' });
      this.clearRoomTimers(room);
      this.rooms.abandon(room.code);
    }, this.disconnectGraceMs);
    this.disconnectTimers.set(playerId, timer);
  }

  /** Recovery/test hook: broadcasts an action journaled outside live message handling. */
  broadcastApplied(room: Room, entry: RoomActionEntry): void {
    this.broadcast(room, {
      type: 'battle.applied',
      seq: entry.seq,
      byController: entry.controller,
      action: entry.action,
      stateHash: entry.stateHash,
    });
    if (room.state?.result !== 'ongoing') {
      this.broadcast(room, { type: 'battle.end', result: room.state!.result });
      this.clearRoomTimers(room);
      this.rooms.finish(room.code);
    }
  }

  close(): void {
    for (const timer of this.disconnectTimers.values()) clearTimeout(timer);
    for (const tracked of this.deployTimers.values()) if (tracked.timer) clearTimeout(tracked.timer);
    this.disconnectTimers.clear();
    this.deployTimers.clear();
  }

  private roomPlayers(room: Room): RoomPlayer[] {
    return [room.host, ...(room.guest ? [room.guest] : [])].map(member => ({
      playerId: member.playerId,
      controllerId: member.controllerId,
      connected: this.transport.isConnected(member.playerId),
    }));
  }

  private sendRoomState(room: Room): void {
    this.broadcast(room, {
      type: 'room.state',
      code: room.code,
      phase: room.phase,
      players: this.roomPlayers(room),
      ...(room.battleId ? { battleId: room.battleId } : {}),
      lastSeq: room.actions.length,
    });
  }

  private broadcast(room: Room, message: ServerMessage, except?: WebSocket): void {
    for (const member of [room.host, room.guest]) {
      if (member) this.transport.sendTo(member.playerId, message, except);
    }
  }

  private sendApplied(socket: WebSocket, entry: RoomActionEntry): void {
    this.transport.send(socket, {
      type: 'battle.applied',
      seq: entry.seq,
      byController: entry.controller,
      action: entry.action,
      stateHash: entry.stateHash,
    });
  }

  private prepareDeploy(room: Room): void {
    const host = parseLoadout(room.host.loadout);
    const guest = parseLoadout(room.guest?.loadout);
    if (!host || !guest) throw new RoomError('invalid_loadout', 'both players need a hero and army');
    const enemyArmy = mergeArmySlots(
      [...host.army, ...guest.army]
        .map(slot => ({ ...slot, count: Math.max(1, Math.ceil(slot.count * 0.75)) }))
    );
    const deploy = initBattle(
      host.army,
      enemyArmy,
      host.hero,
      Date.now() % 2 ** 31,
      guest.army,
      undefined,
      { controllers: { player: 'host', ally: 'guest', enemy: 'ai' }, allyHero: guest.hero }
    );
    this.rooms.setDeploy(room.code, deploy);
    this.sendRoomState(room);
    this.broadcastDeploy(room);
    this.startDeployTimer(room, this.deployTimeoutMs);
  }

  private broadcastDeploy(room: Room): void {
    this.broadcast(room, { type: 'deploy.state', state: room.deployState!, confirmed: [...room.confirmed] });
  }

  private requiredRoom(playerId: string, phase: Room['phase']): Room {
    const room = this.rooms.findForPlayer(playerId);
    if (!room) throw new RoomError('room_gone', 'room no longer exists');
    if (room.phase !== phase) throw new RoomError('invalid_phase', `room is not in ${phase}`);
    return room;
  }

  private controllerFor(room: Room, playerId: string): 'host' | 'guest' {
    if (room.host.playerId === playerId) return 'host';
    if (room.guest?.playerId === playerId) return 'guest';
    throw new RoomError('not_in_room', 'player is not in this room');
  }

  private allConnected(room: Room): boolean {
    return this.transport.isConnected(room.host.playerId) &&
      !!room.guest &&
      this.transport.isConnected(room.guest.playerId);
  }

  private driveAi(room: Room): void {
    while (room.state?.result === 'ongoing') {
      const actor = room.state.units.find(unit => unit.id === room.state!.currentUnitId);
      if (!actor || actor.controllerId !== 'ai') break;
      this.broadcastApplied(room, this.rooms.appendAction(room.code, 'ai', aiTakeTurn(room.state, actor.id)));
    }
  }

  private finishDeploy(room: Room): void {
    if (room.phase !== 'deploy' || !room.deployState) return;
    const tracked = this.deployTimers.get(room.code);
    if (tracked?.timer) clearTimeout(tracked.timer);
    this.deployTimers.delete(room.code);
    const combat = beginCombat(room.deployState);
    this.rooms.startBattle(room.code, combat);
    this.broadcast(room, { type: 'battle.start', initialState: combat });
    this.sendRoomState(room);
    this.driveAi(room);
  }

  private startDeployTimer(room: Room, remaining: number): void {
    const tracked: DeployTimer = { remaining, startedAt: Date.now() };
    tracked.timer = setTimeout(() => {
      try {
        this.finishDeploy(room);
      } catch (error) {
        console.error('deploy timer error:', error);
      }
    }, remaining);
    this.deployTimers.set(room.code, tracked);
  }

  private clearRoomTimers(room: Room): void {
    const deploy = this.deployTimers.get(room.code);
    if (deploy?.timer) clearTimeout(deploy.timer);
    this.deployTimers.delete(room.code);
    for (const member of [room.host, room.guest]) {
      if (!member) continue;
      const disconnect = this.disconnectTimers.get(member.playerId);
      if (disconnect) clearTimeout(disconnect);
      this.disconnectTimers.delete(member.playerId);
    }
  }

  private freezeDeployTimer(room: Room): void {
    const tracked = this.deployTimers.get(room.code);
    if (!tracked?.timer) return;
    clearTimeout(tracked.timer);
    tracked.remaining = Math.max(0, tracked.remaining - (Date.now() - tracked.startedAt));
    tracked.timer = undefined;
  }

  private resumeDeployTimer(room: Room): void {
    const tracked = this.deployTimers.get(room.code);
    if (!tracked || tracked.timer || room.phase !== 'deploy') return;
    this.startDeployTimer(room, tracked.remaining);
  }
}

function parseLoadout(value: unknown): CoopLoadout | null {
  if (!value || typeof value !== 'object') return null;
  const loadout = value as Partial<CoopLoadout>;
  const hero = loadout.hero as Partial<CoopLoadout['hero']> | undefined;
  if (
    !hero || !['barbarian', 'knight', 'wizard', 'necromancer', 'ranger', 'demon'].includes(hero.class ?? '') ||
    !Number.isInteger(hero.level) || hero.level! < 1 || !Number.isInteger(hero.xp) || hero.xp! < xpToReach(hero.level!) ||
    hero.xp! >= xpToReach(hero.level! + 1) || hero.attack !== hero.level! + 1 || hero.defense !== hero.level ||
    hero.statPoints !== 0 || !Array.isArray(loadout.army) || loadout.army.length === 0 || loadout.army.length > MAX_STACKS
  ) return null;
  const faction = hero.class as CoopLoadout['hero']['class'];
  const seen = new Set<string>();
  const army: CoopLoadout['army'] = [];
  for (const slot of loadout.army) {
    if (!Number.isInteger(slot?.count) || slot.count < 1 || !slot?.unit || typeof slot.unit.name !== 'string') return null;
    const unit = FACTION_UNITS[faction].find(candidate => candidate.name === slot.unit.name);
    if (!unit || seen.has(unit.name)) return null;
    seen.add(unit.name);
    army.push({ unit, count: slot.count });
  }
  if (armyCost(army) > budgetForLevel(hero.level!)) return null;
  const canonicalHero = updateFactionSkills({
    class: faction,
    ...(typeof hero.name === 'string' && hero.name.trim() ? { name: hero.name.trim().slice(0, 40) } : {}),
    level: hero.level!,
    xp: hero.xp!,
    attack: hero.attack!,
    defense: hero.defense!,
    statPoints: 0,
    factionSkills: [],
  });
  return { hero: canonicalHero, army };
}

function requireLoadout(value: unknown): CoopLoadout {
  const loadout = parseLoadout(value);
  if (!loadout) throw new RoomError('invalid_loadout', 'a valid hero and army are required');
  return loadout;
}

function isLegalAction(state: BattleState, action: BattleAction): boolean {
  const actor = state.units.find(unit => unit.id === state.currentUnitId);
  if (!actor || actor.count <= 0) return false;
  if (action.type === 'wait' || action.type === 'defend' || action.type === 'cast') return true;
  if (action.type === 'move') {
    return isPos(action.to) && getReachableCells(state.grid, actor).some(pos => samePos(pos, action.to));
  }
  const target = state.units.find(unit => unit.id === action.targetId);
  if (!target || target.count <= 0 || target.side === actor.side || target.isHero) return false;
  if (action.type === 'shoot') return canShootTarget(actor, target) && !isShootingBlocked(state, actor);
  const origins = getAttackOrigins(state, actor, target);
  return action.moveTo && isPos(action.moveTo)
    ? origins.some(pos => samePos(pos, action.moveTo!))
    : origins.some(pos => samePos(pos, actor.pos));
}

function isPos(value: unknown): value is { col: number; row: number } {
  if (!value || typeof value !== 'object') return false;
  const pos = value as { col?: unknown; row?: unknown };
  return Number.isInteger(pos.col) && Number.isInteger(pos.row);
}

function samePos(a: { col: number; row: number }, b: { col: number; row: number }): boolean {
  return a.col === b.col && a.row === b.row;
}
