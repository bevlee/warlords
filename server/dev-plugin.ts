// Mounts the real save API inside Vite's dev server so `npm run dev` runs the
// whole stack in one process (parent plan, "Local dev"). Same middleware as
// production; only the database file differs.
import type { Plugin } from 'vite';
import { openDb } from './db.ts';
import { createApi } from './api.ts';
import { RoomRegistry } from './rooms.ts';
import { attachWebSocketServer } from './ws.ts';

export function warlordsApi(): Plugin {
  return {
    name: 'warlords-api',
    configureServer(server) {
      // Vitest boots a Vite server for transforms; it must not touch the dev db.
      if (process.env.VITEST) return;
      const db = openDb(process.env.DATABASE_PATH ?? 'data/warlords-dev.db');
      server.middlewares.use(createApi(db));
      if (server.httpServer) {
        const wsService = attachWebSocketServer(server.httpServer, db, new RoomRegistry(db));
        server.httpServer.once('close', () => {
          void wsService.close().finally(() => db.close());
        });
      }
    },
  };
}
