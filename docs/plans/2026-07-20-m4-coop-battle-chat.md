# M4: Co-op Battle + Chat — Implementation Plan

**Goal:** Turn M3's authenticated rooms into a playable, server-authoritative two-player battle
with controller-owned stacks/heroes, dual deployment, AI turns, disconnect pause/resume, resync,
and persisted chat.

**Architecture:** The shared engine gains controller identity and per-controller hero lookup while
preserving every solo call signature and behavior. The WebSocket service owns ephemeral deploy
state, then hands the confirmed combat snapshot to `RoomRegistry.startBattle`; all combat actions
are validated against the canonical current actor, synchronously applied/journalled, and broadcast.
Clients reuse `Battle.svelte`'s existing reveal pipeline through an optional network adapter; a
small lobby drives room create/join and army selection.

Parent plan: `2026-07-19-coop-websockets-sqlite-plan.md`, Milestone 4.

---

### Task 1: Controller-aware engine

- Add `controllerId` to stacks and `heroes` to battle state.
- Add co-op init options that stamp host/guest/AI stacks and create a guest hero actor.
- Introduce `heroFor`/`updateHeroFor`; route bonuses, spell mana, gating, damage, and regeneration
  through the acting/defending controller's hero.
- Allow deploy move/split to be scoped to a controller; split stacks inherit ownership.
- Keep solo snapshots and tests unchanged; add exact controller/hero regression coverage.

### Task 2: Deploy and authoritative combat protocol

- Extend shared protocol with deploy state/move/split/confirm, battle start/action/end, chat, and
  waiting-peer messages.
- On guest join, validate both `{hero, army}` loadouts and create canonical co-op deploy state.
- Apply only each sender's deploy operations; start combat after both confirmations.
- Validate `lastSeq`, phase, connected peers, current controller, and action legality before
  journalling/broadcasting; drive consecutive AI turns server-side.
- Pause on disconnect, resume on reconnect, and finalize abandoned after the recovery window.

### Task 3: Chat and resync

- Validate/trim chat to 300 characters, persist it at the current action sequence, and broadcast.
- Include ordered chat in reconnect/detail paths.
- Send canonical deploy/combat resync snapshots and make client resync reset its action cursor.

### Task 4: Co-op client UI

- Add a co-op lobby route with army selection, create/join code flow, peer status, and errors.
- Add network mode to `Battle.svelte`: controller input gate, remote/AI actions through
  `revealAction`, resync cancellation, waiting overlay, and chat input/log.
- Keep existing solo/campaign/gauntlet behavior unchanged.

### Task 5: Verification

- Engine tests for per-controller bonuses/mana and scoped deployment.
- Real two-client integration test for deploy ownership, turn rejection, AI journalling, chat,
  disconnect pause/rejoin, hash/resync, and terminal battle persistence.
- Run full tests, type checks, production build, and an authenticated production WebSocket smoke.
- Mark Milestone 4 complete only after all checks pass.
