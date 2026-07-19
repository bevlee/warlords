# Online Co-op via WebSocket Server + SQLite Persistence — Plan

**Date:** 2026-07-19
**Status:** Proposed

## Goal

Two changes that belong together because both introduce a server for the first time:

1. **Online co-op**: two players fight on the same side against the AI in a shared
   battle, connected through a WebSocket server (room codes, live turns, reconnect).
2. **Persistence moves server-side**: replace IndexedDB (`idb`) with SQLite 3 via
   `better-sqlite3`. Saves (hero, campaign, gauntlet runs) live in one SQLite file
   on the server; the client talks to an API instead of the browser database.

## What we're building on

The codebase is unusually well prepared for this:

- **The engine is a pure, deterministic state machine.** `applyAction(state, action)`
  in `src/lib/engine/battle.ts` returns a new `BattleState`; all randomness flows
  through the seeded mulberry32 PRNG (`src/lib/engine/rng.ts`) with the seed stored
  in `BattleState.seed`. Integer-only mixing + `Math.imul` means results are
  identical across JS runtimes — the same engine code can run on the server (Node)
  and in the browser and stay in lockstep.
- **Actions are already a small serializable union.** `BattleAction` in
  `src/lib/engine/types.ts` (`move`, `attack`, `shoot`, `defend`, `cast`, `wait`)
  is the natural wire format.
- **Controllers were designed for this.** `src/lib/ui/controllers.ts` says it
  outright: "when real multiplayer arrives, stamp a controller id on UnitStack in
  initBattle and this becomes a field read — every consumer already goes through
  here." Every log line and badge color already routes through `controllerOf()`.
- **Ally armies exist.** `initBattle(..., allyArmy)` fields `isAlly` stacks on the
  player side (`allyBattle.test.ts`). Co-op is largely "an ally army whose stacks
  a second human commands instead of `aiTakeTurn`".
- **AI turns are engine-side.** `aiTakeTurn(state, unitId)` returns a plain
  `BattleAction`, so the server can drive enemy turns and broadcast them like any
  other action.

What we do **not** have today: any server runtime. The app is a static SvelteKit
SPA (`adapter-static`) served by nginx in Docker/k8s. All persistence is
client-side IndexedDB in `src/lib/storage.ts` and `src/lib/campaign/campaignStore.ts`.

## Architecture decision: one Node service

Replace the nginx static container with a **single Node process** that serves the
SPA, the save API, and the WebSocket endpoint, with the SQLite file on a mounted
volume.

- Switch SvelteKit to `@sveltejs/adapter-node` with a custom `server/index.ts`
  entry: create the HTTP server, mount the SvelteKit handler, attach a `ws`
  WebSocketServer on the `/ws` upgrade path.
- The game stays a client-rendered SPA (`ssr = false` in the root layout, as now);
  adapter-node just hosts it. No SSR work.
- `better-sqlite3` (synchronous API) is a perfect fit for a single-process game
  server: no connection pool, no async plumbing, microsecond reads. WAL mode on.
- SQLite's single-writer model means **one replica**. That is fine at this scale
  and is the simplest thing that works. (If we ever need horizontal scale, rooms
  shard naturally — not now.)

Rejected alternatives:

- *Separate ws/api sidecar next to the nginx static container*: two services, two
  deploy paths, CORS, and the engine code shared across container boundaries — all
  cost, no benefit at this size.
- *Client-hosted lockstep (P2P/WebRTC)*: no server persistence (which we want for
  SQLite anyway), painful NAT traversal, trivial cheating. A relay server is
  needed regardless, so make it authoritative.

## Repo layout

```
src/lib/engine/        ← unchanged home of the shared simulation (imported by both sides)
src/lib/net/           ← NEW: client-side — protocol types, ws client, save API client
server/
  index.ts             ← http server + sveltekit handler + ws upgrade
  db.ts                ← better-sqlite3 open/migrate
  migrations/          ← numbered .sql files, applied in order at boot
  saves.ts             ← save/load REST handlers
  rooms.ts             ← room registry, join codes, membership
  battle.ts            ← authoritative battle loop (initBattle/applyAction/aiTakeTurn)
  protocol.ts          ← re-exports shared message types from src/lib/net/protocol.ts
```

The engine stays under `src/lib/engine` and is imported by the server via a
`tsconfig` path alias — it has no browser dependencies (verified: only `uuid`).
Protocol/message types live in `src/lib/net/protocol.ts` so client and server
share one definition.

## Part 1 — SQLite persistence (replace IndexedDB)

### Schema (v1)

```sql
CREATE TABLE players (
  id         TEXT PRIMARY KEY,          -- uuid, minted on first visit
  token      TEXT NOT NULL UNIQUE,      -- bearer secret held by the client
  created_at INTEGER NOT NULL
);

-- Same key/value shape the idb layer used, but per-player and typed by slot.
-- slot: 'hero' | 'campaign' | 'gauntletRun'
CREATE TABLE saves (
  player_id  TEXT NOT NULL REFERENCES players(id),
  slot       TEXT NOT NULL,
  data       TEXT NOT NULL,             -- JSON
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, slot)
);

CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT);  -- schema_version etc.
```

Keeping saves as JSON blobs mirrors today's KV usage exactly, so the swap is
mechanical. Relational breakdown (per-unit rows etc.) buys nothing yet.

### Identity

No accounts. On first load the client calls `POST /api/session`; the server mints
a player row and returns `{playerId, token}`, which the client keeps in
`localStorage` (tiny, allowed — the "no IndexedDB" rule is about game saves).
All save/API/ws calls carry the token. Accounts/login can layer on later without
schema changes.

### API

- `GET /api/save/:slot` → JSON or 404
- `PUT /api/save/:slot` → upsert
- `DELETE /api/save/:slot`

### Client swap

`src/lib/storage.ts` and the storage half of `campaignStore.ts` keep their exact
exported signatures (`loadHero`, `saveHero`, `resetHero`, `loadRun`, `saveRun`,
`clearRun`, `loadCampaign`, `saveCampaign`, `resetCampaign`) but their bodies
become `fetch` calls to the API. No call-site changes anywhere in the UI.

### Migration of existing saves

One-time, client-driven: on first load with a session token, if the `warlords`
IndexedDB database exists, read `hero` / `campaign` / `gauntletRun`, `PUT` each to
the server, then delete the IndexedDB database. Ship this shim for a release or
two, then remove it together with the `idb` dependency.

Note the tradeoff to accept explicitly: saves stop working offline. That's the
cost of "no IndexedDB", and co-op requires being online anyway.

## Part 2 — Co-op over WebSockets

### Model

- **Room-based**: host creates a room → gets a 5-letter join code; guest joins by
  code. Room holds ≤ 2 players (design leaves space for more later).
- **Server-authoritative**: the server owns the canonical `BattleState`. It runs
  `initBattle`, validates every incoming action (right player, right unit, legal
  per `checkBattleEnd`/phase), applies it, and broadcasts.
- **Clients simulate too.** Because the engine is deterministic, the server
  broadcasts the *action* (plus a state hash), and each client runs
  `applyAction` locally — this feeds the existing `revealAction` animation
  pipeline in `Battle.svelte` unchanged. If a client's post-action hash mismatches
  the server's, it requests a full-state resync (belt and suspenders; should
  never fire).
- **Enemy AI runs on the server** via `aiTakeTurn`, broadcast as ordinary actions.

### Engine changes (small, targeted)

1. Stamp `controllerId?: string` on `UnitStack` in `initBattle` — exactly what the
   `controllers.ts` comment planned. `controllerOf()` becomes a field read with
   the current derivation as fallback; single-player behavior is unchanged.
2. Co-op battle = host army as `side: 'player'` + guest army via the existing
   ally-army path, but stamped with the guest's controller id and **not** flagged
   for AI control. Turn gating: a unit acts only on an action from its controller.
3. Hero bonuses: `withHeroBonus`/gating in `battle.ts` key off `state.hero` for
   the whole player side. For v1 co-op, the guest's stacks use the guest's hero
   for these bonuses — add `heroes?: Record<controllerId, Hero>` to `BattleState`
   with `state.hero` remaining the host's (and the fallback). Spellcasting per
   player uses their own hero's mana. This is the one real engine refactor; it's
   localized to the `hero` reads in `battle.ts`.
4. Deploy phase: both players place their own stacks; server flips to `combat`
   when both confirm (or a 60s timer fires).

### Protocol (JSON over `/ws`)

```
client→server: hello{token}, room.create{loadout}, room.join{code, loadout},
               deploy.move / deploy.confirm, battle.action{seq, action},
               resync.request, ping
server→client: hello.ok{playerId}, room.state{players, code, phase},
               battle.start{initialState},            -- full snapshot
               battle.applied{seq, byController, action, stateHash},
               battle.resync{state}, room.peer{joined|left|reconnected},
               error{code, msg}, pong
```

Every applied action carries a monotonically increasing `seq`. Reconnect =
re-`hello` with the token + last seen `seq`; the server replays the gap or sends
a snapshot if the room's ring buffer no longer covers it. Heartbeat ping/pong
with a 30s liveness timeout; on disconnect the room pauses (co-op vs AI — no one
is disadvantaged by waiting) with a "waiting for player" overlay, and the room is
garbage-collected after 10 minutes of a player being absent.

Room state is **in-memory** (a `Map` of rooms). A finished/abandoned battle
writes nothing durable in v1 — SQLite holds saves, not live battles. If we want
crash-resilient battles later, the action log per room is trivially appendable to
a table (the seq + deterministic engine make it a free replay journal).

### UI

- New pre-battle screen: **Play co-op** → create (shows code) / join (enter code),
  then each player picks faction/army with the existing `ArmySetup`.
- `Battle.svelte` gets a thin input gate: local input is only accepted when
  `controllerOf(currentUnit) === myControllerId`; remote/AI actions arrive from
  the socket and flow into the existing `revealAction(applyAction(...))` path.
- Third controller color already exists (`ally` = emerald) — the guest renders as
  a named controller using that style entry.

## Deployment changes

- **Dockerfile**: builder stage additionally builds the server bundle; runtime
  stage becomes `node:26-bookworm-slim` running `node server/index.js`. (Not
  alpine: `better-sqlite3` ships glibc prebuilds; musl forces a source compile
  and a python3/make/g++ toolchain in the image. bookworm-slim avoids all that.)
  nginx stage and `nginx.conf` are removed; adapter-node serves the immutable
  assets with the right cache headers.
- **k8s**: `deployment.yaml` → `replicas: 1`, `strategy: Recreate` (two pods must
  never share the SQLite file), a PVC mounted at `/data`
  (`DATABASE_PATH=/data/warlords.db`), and a readiness probe on `/api/health`.
  `ingress.yaml` needs WebSocket-friendly annotations (proxy read timeout ↑).
- Local dev: `npm run dev` runs Vite with a small plugin that starts the ws/api
  server in-process, so one command still runs everything.

## Milestones

Each lands green (`npm run test`, `npm run check`) and playable on its own.

1. **Server scaffold + SQLite saves.** adapter-node + custom server, `db.ts` +
   migrations, session minting, save API. Client `storage.ts`/`campaignStore.ts`
   rewritten to fetch; IndexedDB import shim. Dockerfile/k8s updated. `idb` still
   installed but unused (removed in M4).
2. **WS infrastructure.** `/ws` upgrade, hello/auth, rooms + join codes,
   heartbeat, reconnect-with-seq, in-memory room registry. Integration test: two
   `ws` clients create/join/rejoin a room under vitest.
3. **Co-op battle.** Engine: `controllerId` stamping, `heroes` map, per-controller
   turn gating, dual deploy. Server battle loop with validation + AI turns.
   Client: lobby UI, input gate, remote actions through `revealAction`. Hash
   check + resync. Determinism test: replay a full recorded action log on server
   and client engines, assert identical final state.
4. **Polish + cleanup.** Disconnect/rejoin UX, battle-end flow back to each
   player's own save, drop the `idb` dependency and the import shim (next
   release), docs.

## Risks / open questions

- **Guest hero bonuses** (M3, engine item 3) is the riskiest refactor — `hero`
  is read in ~10 places in `battle.ts`. Mitigation: introduce
  `heroFor(state, stack)` first as a pure refactor (all existing tests stay
  green), then wire the map.
- **better-sqlite3 native builds** on dev machines: it has prebuilds for common
  platforms; CI/docker uses bookworm so no toolchain needed.
- **What do co-op battles mean for progression?** Proposal for v1: co-op is a
  standalone skirmish (no campaign/gauntlet mutation) — each player's saves are
  untouched. Hooking co-op into the gauntlet can be a follow-up.
- **Do we keep an offline fallback?** Current answer: no, per the "no IndexedDB"
  direction. If offline play turns out to matter, a localStorage snapshot cache
  can be added without reintroducing idb.
