import type Database from 'better-sqlite3';
import { ConnectionManager, type ConnectionManagerOptions, type UpgradeServer } from './ws-connections.ts';
import { RoomOrchestrator, type RoomOrchestratorOptions } from './room-orchestrator.ts';
import type { RoomRegistry, Room, RoomActionEntry } from './rooms.ts';

export interface WsServiceOptions extends ConnectionManagerOptions, RoomOrchestratorOptions {}

/** Compose transport/auth and room/game orchestration on one HTTP server. */
export function attachWebSocketServer(
  server: UpgradeServer,
  db: Database.Database,
  rooms: RoomRegistry,
  options: WsServiceOptions = {}
) {
  const connections = new ConnectionManager(server, db, options);
  const orchestrator = new RoomOrchestrator(rooms, connections, options);
  connections.setHandlers({
    authenticated: (socket, playerId, lastSeq) => orchestrator.handleAuthenticated(socket, playerId, lastSeq),
    message: (socket, playerId, message) => orchestrator.handleMessage(socket, playerId, message),
    disconnected: playerId => orchestrator.handleDisconnected(playerId),
  });

  return {
    /** Recovery/test hook for actions journaled outside the live socket path. */
    broadcastApplied(room: Room, entry: RoomActionEntry): void {
      orchestrator.broadcastApplied(room, entry);
    },
    async close(): Promise<void> {
      orchestrator.close();
      await connections.close();
    },
  };
}
