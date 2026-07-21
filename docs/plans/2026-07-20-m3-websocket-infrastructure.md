# M3: WebSocket Infrastructure — Implementation Plan

**Goal:** Add the authenticated `/ws` transport, two-player room lifecycle, reconnect/gap
replay, heartbeats, and SQLite-backed live-room recovery needed by authoritative co-op combat.

**Architecture:** A framework-free WebSocket service attaches to the existing Node/Vite HTTP
server using `ws` in `noServer` mode. A `RoomRegistry` owns in-memory room state while writing
membership metadata and every live action to SQLite synchronously. On boot it discards short
lobby/deploy rooms, replays recent combat journals through the shared engine, and finalizes
expired combat rooms as abandoned. The browser client is transport-only in this milestone:
authentication, reconnection, heartbeat responses, and typed events are ready; turn validation,
dual deployment, AI driving, and chat remain Milestone 4.

Parent plan: `2026-07-19-coop-websockets-sqlite-plan.md`, Milestone 3.

**Schema clarification:** The v1 parent schema stores battle snapshots/actions but not the room
code or host/guest membership mapping needed to reconnect after process restart. Add a narrow
`rooms` table in migration 002 rather than hiding runtime metadata in `battles.summary`.

---

### Task 1: Shared protocol, dependency, and room migration

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `src/lib/net/protocol.ts`
- Create: `server/protocol.ts`
- Create: `server/migrations/002-rooms.sql`
- Modify: `server/__tests__/db.test.ts`

**Steps:**
1. Add `ws` and `@types/ws`.
2. Define discriminated client/server message unions for hello, room create/join/state/peer,
   ping/pong, applied-action gaps, resync, and errors.
3. Add persisted room code, host/guest ids and loadouts, phase, battle id, and activity time.
4. Prove migration v2 applies once and preserves/reopens existing databases.

### Task 2: Persistent room registry and journal recovery

**Files:**
- Create: `server/rooms.ts`
- Create: `server/__tests__/rooms.test.ts`

**Steps:**
1. Add failing tests for unique five-letter room creation, two-player join, full/missing room
   errors, and membership lookup.
2. Implement `startBattle` as an infrastructure seam that transactionally creates the live
   battle snapshot and links it to the room; Milestone 4 will call it after dual deploy.
3. Implement synchronous `appendAction`: apply the shared engine action, append the next
   journal row, and update room activity in one transaction.
4. On registry construction, replay recent live journals exactly; delete lobby/deploy rooms and
   finalize live rooms older than the ten-minute recovery window as `abandoned`.

### Task 3: Authenticated WebSocket server

**Files:**
- Create: `server/ws.ts`
- Create: `server/__tests__/ws.test.ts`

**Steps:**
1. Attach only `/ws` upgrades and require a valid `hello` token before other messages.
2. Make newest duplicate session win: send `superseded` to and close the old socket.
3. Handle room create/join, broadcast connected/disconnected peer state, and restore membership
   automatically after hello.
4. Replay journal rows after `lastSeq`, or send a full state resync when the sequence is invalid
   or exceeds the bounded gap threshold; return `room_gone` for stale reconnect attempts.
5. Add configurable server app-heartbeats; close a socket after two unanswered pings.

### Task 4: Browser reconnect client

**Files:**
- Create: `src/lib/net/wsClient.ts`
- Create: `src/lib/net/__tests__/wsClient.test.ts`

**Steps:**
1. Implement a typed client with injected WebSocket/timer seams, latest-sequence tracking, and
   message/status subscriptions.
2. Reply to server pings, proactively reconnect after connection loss, and use 1s/2s/4s…
   exponential delays capped at 15s forever.
3. Expose lost status after the second failed attempt and reconnect on visible-tab resume.

### Task 5: Production/dev wiring and restart integration

**Files:**
- Modify: `server/index.ts`, `server/dev-plugin.ts`
- Create: `server/__tests__/restart.test.ts`

**Steps:**
1. Attach the same WebSocket service and room registry in production and Vite development.
2. Ensure shutdown stops heartbeat timers/sockets before closing SQLite.
3. Integration test with two real `ws` clients: authenticate, create/join, start and journal a
   seeded battle, stop/reopen the server on the same SQLite file, reconnect both clients, replay
   the missing gap, and finish the recovered battle.

### Task 6: Whole-milestone verification

1. Run focused room/WebSocket/restart tests, the full suite, `npm run check`, and `npm run build`.
2. Review authentication boundaries, timer cleanup, transaction ordering, duplicate sessions,
   restart expiry, and preservation of M1/M2 behavior.
3. Mark Milestone 3 complete in the parent plan only after all checks are green.
