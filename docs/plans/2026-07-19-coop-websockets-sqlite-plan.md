# Online Co-op via WebSocket Server + SQLite Persistence — Plan

> **For Claude:** This is the design-level plan. Before executing a milestone, write a
> bite-sized implementation plan for that milestone (superpowers:writing-plans) and
> execute it with superpowers:executing-plans.

**Date:** 2026-07-19 (revised 2026-07-20 after review)
**Status:** Proposed

## Goal

Three changes that belong together because they all hang off the same two primitives —
a server and a persisted action log:

1. **Online co-op**: two players fight on the same side against the AI in a shared
   battle, connected through a WebSocket server (room codes, live turns, reconnect).
2. **Persistence moves server-side**: replace IndexedDB (`idb`) with SQLite 3 via
   `better-sqlite3`. Saves (hero, campaign, gauntlet runs) live in one SQLite file
   on the server; the client talks to an API instead of the browser database.
3. **Replays + combat history + chat (MVP)**: every battle (solo and co-op) is
   recorded as its initial snapshot + action log; a history screen lists past
   battles and a replay player re-simulates them through the engine with
   pause/speed controls. Co-op gets a chat line in the battle log.

## What we're building on

The codebase is unusually well prepared for this:

- **The engine is a pure, deterministic state machine.** `applyAction(state, action)`
  in `src/lib/engine/battle.ts` returns a new `BattleState`; all randomness flows
  through the seeded mulberry32 PRNG (`src/lib/engine/rng.ts`). Crucially the RNG
  needs no serialized stream position: `applyAction` derives a fresh generator per
  action from `mulberry32(state.seed + state.log.length)` (`battle.ts:402`), so any
  snapshot alone is enough to continue or replay deterministically. Integer-only
  mixing + `Math.imul` means results are identical across JS runtimes — the same
  engine code runs on the server (Node) and in the browser and stays in lockstep.
- **Reward rolls are already independent of combat length.** Gauntlet items/skills/
  encounters derive their own streams via `mixSeed(run.seed, structural salt)`
  (`gauntlet/items.ts:145`, `run.ts:149`), never from combat's numbers — so replays
  and variable-length battles can't skew rewards. Any future co-op rewards must
  follow the same pattern (salt off the battle id).
- **Actions are already a small serializable union.** `BattleAction` in
  `src/lib/engine/types.ts` (`move`, `attack`, `shoot`, `defend`, `cast`, `wait`)
  is the natural wire format — measured ~73 bytes of JSON each. Note it carries no
  acting-unit id: the actor is always `state.currentUnitId`, dictated by the
  deterministic ATB order, so server-side validation reduces to "does the sender
  control the current unit".
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

One determinism hole to fix first: `splitStack` (`battle.ts:352`) mints a `uuidv4()`
**inside a state transition**. Replaying or remotely applying a split would mint a
different id and every later action referencing that stack would dangle. See engine
changes below — new-stack ids become deterministic and the engine drops its only
dependency.

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

Owning the consequences of one replica explicitly:

- **Every deploy restarts the process** (`strategy: Recreate` — two pods must never
  share the SQLite file). Live rooms therefore must survive a restart: the action
  journal (Part 3) is written synchronously per action, and on boot the server
  **rehydrates rooms** whose battles were live in the last 10 minutes by replaying
  their journals through the engine. Clients reconnect with their token and resume.
  Deploys stop being battle-killers; a mid-deploy blip looks like any reconnect.
- The save API blinks for a few seconds per deploy. Client fetch wrappers retry
  with backoff (see Part 1).
- If the node dies, the RWO PVC can pin the rescheduled pod for minutes while the
  volume detaches/reattaches. Accepted at this scale.
- **Backups**: the PVC is the only copy of every player's saves. A k8s CronJob runs
  `sqlite3 /data/warlords.db ".backup ..."` nightly into a 7-day ring shipped
  off-volume (object storage or a second PVC). Litestream is the upgrade path if
  continuous replication ever matters.

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
src/lib/net/           ← NEW: client-side — protocol types, ws client, save/battles API client
src/lib/replay/        ← NEW: client-side — timeline builder, replay playback controller
server/
  index.ts             ← http server + sveltekit handler + ws upgrade
  db.ts                ← better-sqlite3 open/migrate
  migrations/          ← numbered .sql files, applied in order at boot
  saves.ts             ← save/load REST handlers
  battles.ts           ← battle journal writes, history/replay REST handlers
  rooms.ts             ← room registry, join codes, membership, boot-time rehydration
  battle.ts            ← authoritative battle loop (initBattle/applyAction/aiTakeTurn)
  protocol.ts          ← re-exports shared message types from src/lib/net/protocol.ts
```

The engine stays under `src/lib/engine` and is imported by the server via a
`tsconfig` path alias — after the deterministic-id change it has zero dependencies.
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

-- One row per battle (solo and co-op). initial_state is the full BattleState
-- snapshot taken at combat start (post-deploy, log stripped), ~10 KB; it embeds
-- the seed, which is what makes the action log replayable.
CREATE TABLE battles (
  id             TEXT PRIMARY KEY,
  mode           TEXT NOT NULL,         -- 'solo' | 'coop'
  player_ids     TEXT NOT NULL,         -- JSON array
  initial_state  TEXT NOT NULL,         -- JSON BattleState, log: []
  engine_version TEXT NOT NULL,         -- gates replay validity across patches
  result         TEXT,                  -- null while live; 'player_wins' | 'enemy_wins' | 'abandoned'
  summary        TEXT,                  -- JSON cache for the history list (casualties, rounds…)
  started_at     INTEGER NOT NULL,
  ended_at       INTEGER
);

-- The replay journal: causes only, ~73 B per row. Deaths/damage/procs are NOT
-- stored — the deterministic engine regenerates them exactly on replay.
CREATE TABLE battle_actions (
  battle_id  TEXT NOT NULL REFERENCES battles(id),
  seq        INTEGER NOT NULL,
  controller TEXT NOT NULL,             -- 'host' | 'guest' | 'ai'
  action     TEXT NOT NULL,             -- BattleAction JSON
  PRIMARY KEY (battle_id, seq)
);

-- Chat is not a BattleAction and never touches the engine or state hash.
CREATE TABLE battle_chat (
  battle_id  TEXT NOT NULL REFERENCES battles(id),
  after_seq  INTEGER NOT NULL,          -- room's action seq when received; orders chat into the log
  controller TEXT NOT NULL,
  text       TEXT NOT NULL,
  ts         INTEGER NOT NULL
);

CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT);  -- schema_version etc.
```

Keeping saves as JSON blobs mirrors today's KV usage exactly, so the swap is
mechanical. Relational breakdown (per-unit rows etc.) buys nothing yet.

Storage math (measured through the engine, 2026-07-20): initial snapshot ~10.3 KB
raw / 1.5 KB gzipped; ~36–300 actions per battle at ~73 B each; **~13–30 KB per
battle raw**. 1 GB holds ~75k battles, so long retention is not a constraint.
Rows stay raw JSON for the MVP (individually appendable = crash recovery);
gzipping `initial_state` is the 7:1 lever if the file ever gets big. A per-player
cap (~200 battles, oldest pruned) is a spam guard, not a storage necessity.

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
- `POST /api/battles` → solo battle upload at battle end: `{initialState, actions, summary, result}`
- `GET /api/battles` → history list for the player (summary rows only, newest first)
- `GET /api/battles/:id` → `{initialState, actions, chat}` for the replay player
- `GET /api/health` → readiness probe

### Client swap

`src/lib/storage.ts` and the storage half of `campaignStore.ts` keep their exact
exported signatures (`loadHero`, `saveHero`, `resetHero`, `loadRun`, `saveRun`,
`clearRun`, `loadCampaign`, `saveCampaign`, `resetCampaign`) but their bodies
become `fetch` calls to the API. No call-site changes anywhere in the UI.
The shared fetch wrapper retries idempotent requests with exponential backoff
(3 attempts, 0.5s/2s/8s) so the few seconds of deploy downtime never surface as
a lost save.

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
  `initBattle`, validates every incoming action (sender controls
  `state.currentUnitId`, phase is right, seq is current), applies it, journals it,
  and broadcasts.
- **Clients simulate too.** Because the engine is deterministic, the server
  broadcasts the *action* (plus a state hash), and each client runs
  `applyAction` locally — this feeds the existing `revealAction` animation
  pipeline in `Battle.svelte` unchanged. If a client's post-action hash mismatches
  the server's, it requests a full-state resync. Applying a resync snapshot must
  cancel/fast-forward the in-flight animation queue before rendering the new state.
- **Enemy AI runs on the server** via `aiTakeTurn`, broadcast as ordinary actions.

### Engine changes (small, targeted)

0. **Deterministic stack ids** (prerequisite for lockstep, journal rehydration,
   and replays). Replace `uuidv4()` with ids derived from a counter in
   `BattleState` (e.g. `u1`, `u2`, …, `nextId` incremented in `initBattle`/
   `splitStack`/summon paths). Pure refactor, all tests stay green, and the
   engine's last dependency (`uuid`) goes away.
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
   when both confirm (or a 60s timer fires — **frozen while either player is
   disconnected**, see timeouts).
5. `engineVersion` constant in `src/lib/engine/version.ts`, bumped on any
   behavior change — including changes to how many `BattleEvent`s an action logs,
   since the per-action RNG derives from `log.length` and an event-count change
   shifts every subsequent roll.

### Protocol (JSON over `/ws`)

```
client→server: hello{token, lastSeq?}, room.create{loadout}, room.join{code, loadout},
               deploy.move / deploy.split / deploy.confirm,
               battle.action{lastSeq, action}, chat.send{text},
               resync.request, ping
server→client: hello.ok{playerId}, room.state{players, code, phase},
               battle.start{initialState},            -- full snapshot at combat start
               battle.applied{seq, byController, action, stateHash},
               chat.message{afterSeq, byController, text},
               battle.resync{state}, room.peer{joined|left|reconnected},
               error{code, msg}, pong
```

**Seq semantics (idempotency).** `battle.applied.seq` increases by one per applied
action. A client sends `battle.action` carrying `lastSeq` = the latest seq it has
seen; the server rejects the action unless `lastSeq` equals the room's current
seq. This is optimistic concurrency: a client that sent an action, dropped before
the ack, and resends after reconnect gets a clean rejection instead of a
double-apply — resends are naturally idempotent.

**Reconnect.** Re-`hello` with the token + `lastSeq`; the server replays the gap
from the journal (which always covers it — it's the same rows the room was built
from) or sends `battle.resync` if the client is hopelessly behind. Reconnecting
to a room that no longer exists gets `error{code:'room_gone'}` → client returns
to the lobby with a message. Client reconnect loop: exponential backoff 1s/2s/4s…
capped at 15s, forever (a "connection lost" banner shows after the second failure).
The client also treats a missed pong or a `visibilitychange`-resume (backgrounded
mobile tab = half-open socket) as a cue to proactively reconnect.

**Duplicate sessions.** The token lives in localStorage, shared across tabs. If a
second socket hellos with the same player id, the newest socket wins and the old
one is closed with `error{code:'superseded'}`.

**Timeouts (policy, not just values).**

- Heartbeat: the **server** pings every 15s; a connection is dead after two misses
  (30s). App-level ping/pong (browsers can't see protocol-level pings).
- On a player disconnect the room pauses — the ATB loop stops, and **the deploy
  confirm timer freezes too** if still in deploy. Co-op vs AI: no one is
  disadvantaged by waiting. The connected player sees a "waiting for player"
  overlay.
- If a player stays absent for 10 minutes, the room is not silently deleted: the
  battle formally ends as `abandoned`, flows through the normal battle-end path
  for the remaining player, and the battle row/journal is finalized. Then the
  room is GC'd.

**Journal + rehydration.** Room state is in-memory (a `Map`), but every applied
action is synchronously written to `battle_actions` in the same handler that
broadcasts it (see Part 3 — same rows serve replays). On boot the server scans
`battles` for rows with `result IS NULL` and recent activity (within the 10-minute
absence window), rebuilds each room by replaying its journal through `applyAction`,
and waits for reconnects. Anything older is finalized as `abandoned`. Deploys and
crashes thus cost a reconnect, not a battle. (Battles that crash during the deploy
phase are lost — the journal starts at combat start; deploy is short, accepted.)

### UI

- New pre-battle screen: **Play co-op** → create (shows code) / join (enter code),
  then each player picks faction/army with the existing `ArmySetup`.
- `Battle.svelte` gets a thin input gate: local input is only accepted when
  `controllerOf(currentUnit) === myControllerId`; remote/AI actions arrive from
  the socket and flow into the existing `revealAction(applyAction(...))` path.
- Third controller color already exists (`ally` = emerald) — the guest renders as
  a named controller using that style entry.
- Chat: an input line under the battle log; `chat.message` renders into the
  existing battle-log list styled by controller color, ordered by `afterSeq`.

## Part 3 — Replays & combat history

### Recording

The journal **is** the replay. One `battles` row (snapshot at combat start — after
deploy, so splits/placement are baked in and deploy ops need no recording — plus
`engine_version` and, at the end, `result`/`summary`) and one `battle_actions` row
per action. Nothing derived is stored per action: deaths, damage, morale/luck
procs are all regenerated by the engine, and storing them would create a second
source of truth that can drift. The one denormalized convenience is
`battles.summary`, written once at battle end from the final state (result,
rounds, casualties per side) so the history list renders without replaying.

- **Co-op**: the server writes rows as it applies actions (Part 2).
- **Solo**: no server round-trips during play. The client snapshots the state at
  `beginCombat`, accumulates actions in memory, and `POST /api/battles` once at
  battle end. An abandoned tab simply loses that battle's record — fine.

### Recreation

```ts
let state = JSON.parse(initial_state);
const timeline = rows.map(row => {
  const before = state.log.length;
  state = applyAction(state, JSON.parse(row.action));
  return { seq: row.seq, events: state.log.slice(before), state };
});
```

One pass (~1 ms — measured: three full battles simulate in 9 ms) yields, for every
seq, the action, the exact `BattleEvent`s it caused (deaths included), and the
full board state. That is the entire data layer for both replay playback and the
pause-for-analysis view.

### Playback

The replay player is the co-op remote-action path with the socket swapped for a
cursor: a controller in `src/lib/replay/` walks `timeline` and feeds each entry
into the existing `revealAction` pipeline.

- **Pause** = stop the walk; the current action's animation completes, then hold.
  Clean between-action pause points are exactly what analysis wants; the paused
  view renders `timeline[n].state` and can show unit inspection.
- **Speed** = a global `speedFactor` in the animation layer scaling durations and
  inter-action delays (0.5×/1×/2×/4×). New knob, one place; doubles later as
  fast-forward for live AI turns.
- **Scrubbing** (not MVP, design left open): re-simulate to seq N with animations
  suppressed, then resume revealing. The engine is fast enough that no keyframes
  are needed.
- Replays of co-op battles interleave `battle_chat` rows by `after_seq`.

### History screen

`GET /api/battles` → list rendered purely from `summary` rows ("Victory — lost 12
Goblins, killed 30 Archers, 8 rounds", mode, date). The **Watch replay** button is
enabled only when the row's `engine_version` matches the current engine — an old
replay re-simulated on a patched engine would silently diverge. Summaries stay
valid forever; replays age out with engine changes. (If watching across patches
ever becomes a must-have, that's the point where storing rendered outcomes enters
as a deliberate v2 trade — not the MVP.)

## Deployment changes

- **Dockerfile**: builder stage additionally builds the server bundle; runtime
  stage becomes `node:26-bookworm-slim` running `node server/index.js`. (Not
  alpine: `better-sqlite3` ships glibc prebuilds; musl forces a source compile
  and a python3/make/g++ toolchain in the image. bookworm-slim avoids all that.)
  nginx stage and `nginx.conf` are removed; adapter-node serves the immutable
  assets with the right cache headers.
- **k8s**: `deployment.yaml` → `replicas: 1`, `strategy: Recreate` (two pods must
  never share the SQLite file), `containerPort: 3000` (unprivileged node process —
  the Service `targetPort` changes to match), a PVC mounted at `/data`
  (`DATABASE_PATH=/data/warlords.db`), a readiness probe on `/api/health`, and the
  backup CronJob. The ingress is **Traefik** (`ingressClassName: traefik`), which
  proxies WebSockets natively — no annotations needed; the 15s heartbeat keeps
  idle connections alive through any intermediary anyway.
- Local dev: `npm run dev` runs Vite with a small plugin that starts the ws/api
  server in-process, so one command still runs everything.

## Milestones

Each lands green (`npm run test`, `npm run check`) and playable on its own.
Write the bite-sized TDD task plan per milestone before starting it.

1. **Server scaffold + SQLite saves.** adapter-node + custom server, `db.ts` +
   migrations (full schema incl. battles tables), session minting, save API with
   client retry wrapper, backup CronJob. Client `storage.ts`/`campaignStore.ts`
   rewritten to fetch; IndexedDB import shim. Dockerfile/k8s updated (ports,
   PVC, probe). `idb` still installed but unused (removed in M5).
2. **Engine prerequisites + solo recording.** Deterministic stack ids (drop
   `uuid`), `engineVersion` constant, `POST /api/battles` + client-side action
   accumulation at battle end, `GET /api/battles[/:id]`. Determinism test: replay
   a recorded solo action log, assert final-state equality with the live run.
3. **WS infrastructure.** `/ws` upgrade, hello/auth, duplicate-session handling,
   rooms + join codes, server-side heartbeat, reconnect (lastSeq replay,
   `room_gone`, client backoff loop), journal writes + boot rehydration.
   Integration test: two `ws` clients create/join a room; kill and restart the
   server mid-battle; both rejoin and finish.
4. **Co-op battle + chat.** Engine: `controllerId` stamping, `heroes` map,
   per-controller turn gating, dual deploy with freezable timer. Server battle
   loop with seq/turn validation + AI turns + abandoned-battle finalization.
   Client: lobby UI, input gate, remote actions through `revealAction`, resync
   with animation-queue cancel, chat send/render. Hash check + resync test.
5. **Replays + history UI + polish.** Timeline builder + replay controller,
   `speedFactor` in the animation layer, pause, history screen with
   engine-version gating, chat interleaving in replays. Disconnect/rejoin UX
   polish, battle-end flow back to each player's own save, retention pruning,
   drop the `idb` dependency and the import shim (next release), docs.

## Risks / open questions

- **Guest hero bonuses** (M4, engine item 3) is the riskiest refactor — `hero`
  is read in ~10 places in `battle.ts`. Mitigation: introduce
  `heroFor(state, stack)` first as a pure refactor (all existing tests stay
  green), then wire the map.
- **Engine-version drift** silently invalidates replays; discipline required to
  bump `engineVersion` on every behavior change (including event-count changes —
  they shift the RNG). Mitigation: the co-op state-hash test doubles as a canary,
  and the history UI degrades gracefully (summary stays, replay gates off).
- **better-sqlite3 native builds** on dev machines: it has prebuilds for common
  platforms; CI/docker uses bookworm so no toolchain needed.
- **What do co-op battles mean for progression?** Proposal for v1: co-op is a
  standalone skirmish (no campaign/gauntlet mutation) — each player's saves are
  untouched. Hooking co-op into the gauntlet can be a follow-up. If it ever
  grants rewards, salt reward streams off the battle id (`mixSeed`), never off
  combat's RNG.
- **Do we keep an offline fallback?** Current answer: no, per the "no IndexedDB"
  direction. If offline play turns out to matter, a localStorage snapshot cache
  can be added without reintroducing idb.
