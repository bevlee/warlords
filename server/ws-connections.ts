import type Database from 'better-sqlite3';
import type { IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import WebSocket, { WebSocketServer, type RawData } from 'ws';
import {
  parseClientMessage,
  type AuthenticatedClientMessage,
  type ServerMessage,
} from './protocol.ts';

export interface UpgradeServer {
  on(event: 'upgrade', listener: (request: IncomingMessage, socket: Socket, head: Buffer) => void): unknown;
  off(event: 'upgrade', listener: (request: IncomingMessage, socket: Socket, head: Buffer) => void): unknown;
}

export interface ConnectionManagerOptions {
  heartbeatMs?: number;
  helloTimeoutMs?: number;
}

export interface ConnectionHandlers {
  authenticated(socket: WebSocket, playerId: string, lastSeq?: number): void;
  message(socket: WebSocket, playerId: string, message: AuthenticatedClientMessage): void;
  disconnected(playerId: string): void;
}

interface Connection {
  playerId?: string;
  awaitingPong: boolean;
  missedPongs: number;
  helloTimer: ReturnType<typeof setTimeout>;
}

/** Owns HTTP upgrades, socket lifetime, authentication, and heartbeats.
 *  Game/room behavior is delegated through ConnectionHandlers. */
export class ConnectionManager {
  private readonly wss = new WebSocketServer({ noServer: true });
  private readonly connections = new Map<WebSocket, Connection>();
  private readonly byPlayer = new Map<string, WebSocket>();
  private readonly playerByToken: Database.Statement;
  private readonly heartbeat: ReturnType<typeof setInterval>;
  private handlers: ConnectionHandlers | null = null;

  constructor(
    private readonly server: UpgradeServer,
    db: Database.Database,
    options: ConnectionManagerOptions = {}
  ) {
    const heartbeatMs = options.heartbeatMs ?? 15_000;
    const helloTimeoutMs = options.helloTimeoutMs ?? 5_000;
    this.playerByToken = db.prepare('SELECT id FROM players WHERE token = ?');

    this.server.on('upgrade', this.onUpgrade);
    this.wss.on('connection', socket => this.onConnection(socket, helloTimeoutMs));

    // Browsers cannot emit native WebSocket ping frames, so both ends use
    // protocol-level JSON ping/pong messages for symmetric liveness checks.
    this.heartbeat = setInterval(() => {
      for (const [socket, connection] of this.connections) {
        if (connection.awaitingPong) connection.missedPongs++;
        if (connection.missedPongs >= 2) {
          socket.terminate();
          continue;
        }
        connection.awaitingPong = true;
        this.send(socket, { type: 'ping' });
      }
    }, heartbeatMs);
  }

  setHandlers(handlers: ConnectionHandlers): void {
    this.handlers = handlers;
  }

  isConnected(playerId: string): boolean {
    return this.byPlayer.has(playerId);
  }

  send(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }

  sendTo(playerId: string, message: ServerMessage, except?: WebSocket): void {
    const socket = this.byPlayer.get(playerId);
    if (socket && socket !== except) this.send(socket, message);
  }

  close(): Promise<void> {
    clearInterval(this.heartbeat);
    this.server.off('upgrade', this.onUpgrade);
    // Shutdown-driven closes must not start room reconnect grace timers.
    this.handlers = null;
    for (const socket of this.wss.clients) socket.terminate();
    return new Promise(resolve => this.wss.close(() => resolve()));
  }

  private readonly onUpgrade = (request: IncomingMessage, socket: Socket, head: Buffer) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    // Other services can share this event (Vite uses it for HMR), so only
    // claim /ws. There is no Origin allowlist because authentication is a
    // bearer token in the first message, not a cookie; add one if that changes.
    if (url.pathname !== '/ws') return;
    this.wss.handleUpgrade(request, socket, head, ws => this.wss.emit('connection', ws, request));
  };

  private onConnection(socket: WebSocket, helloTimeoutMs: number): void {
    const connection: Connection = {
      awaitingPong: false,
      missedPongs: 0,
      helloTimer: setTimeout(() => {
        this.send(socket, { type: 'error', code: 'hello_timeout', msg: 'hello required' });
        socket.close(4000, 'hello required');
      }, helloTimeoutMs),
    };
    this.connections.set(socket, connection);
    socket.on('message', data => this.handleMessage(socket, data));
    socket.on('close', () => this.handleClose(socket));
    socket.on('error', error => {
      const playerId = this.connections.get(socket)?.playerId;
      console.error(`websocket error${playerId ? ` for ${playerId}` : ''}:`, error);
    });
  }

  private handleMessage(socket: WebSocket, data: RawData): void {
    let decoded: unknown;
    try {
      decoded = JSON.parse(data.toString());
    } catch {
      return this.send(socket, { type: 'error', code: 'bad_json', msg: 'invalid JSON message' });
    }
    const message = parseClientMessage(decoded);
    if (!message) {
      return this.send(socket, { type: 'error', code: 'invalid_message', msg: 'message does not match the protocol' });
    }

    const connection = this.connections.get(socket);
    if (!connection) return;
    if (message.type === 'pong') {
      connection.awaitingPong = false;
      connection.missedPongs = 0;
      return;
    }
    if (message.type === 'ping') return this.send(socket, { type: 'pong' });
    if (message.type === 'hello') return this.authenticate(socket, connection, message.token, message.lastSeq);
    if (!connection.playerId) {
      return this.send(socket, { type: 'error', code: 'not_authenticated', msg: 'send hello first' });
    }
    this.handlers?.message(socket, connection.playerId, message);
  }

  private authenticate(socket: WebSocket, connection: Connection, token: string, lastSeq?: number): void {
    if (connection.playerId) {
      return this.send(socket, { type: 'error', code: 'already_authenticated', msg: 'hello already received' });
    }
    const row = this.playerByToken.get(token) as { id: string } | undefined;
    if (!row) return this.send(socket, { type: 'error', code: 'unauthorized', msg: 'invalid token' });

    clearTimeout(connection.helloTimer);
    const old = this.byPlayer.get(row.id);
    if (old && old !== socket) {
      this.send(old, { type: 'error', code: 'superseded', msg: 'a newer session connected' });
      old.close(4001, 'superseded');
    }
    connection.playerId = row.id;
    this.byPlayer.set(row.id, socket);
    this.send(socket, { type: 'hello.ok', playerId: row.id });
    this.handlers?.authenticated(socket, row.id, lastSeq);
  }

  private handleClose(socket: WebSocket): void {
    const connection = this.connections.get(socket);
    if (!connection) return;
    clearTimeout(connection.helloTimer);
    this.connections.delete(socket);
    if (!connection.playerId || this.byPlayer.get(connection.playerId) !== socket) return;
    this.byPlayer.delete(connection.playerId);
    this.handlers?.disconnected(connection.playerId);
  }
}
