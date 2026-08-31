# Warlords

Warlords is a browser strategy game inspired by LordsWM and Heroes of Might and Magic. It includes
deterministic tactical combat, six factions, a campaign, an endless gauntlet, experimental
two-player co-op against server-driven AI, persisted battle history, and animated replays.

## Local development

Requires Node.js 26 and npm.

```sh
npm install
npm run dev
```

The Vite development process serves the Svelte app, REST API, and `/ws` WebSocket endpoint together.
SQLite data defaults to `data/warlords.db` and can be moved with `DATABASE_PATH`.

Useful checks:

```sh
npm test
npm run check
npm run build
```

Run the production build locally with:

```sh
DATABASE_PATH=data/warlords.db PORT=3000 npm run start
```

## Persistence and multiplayer

Game saves live in SQLite behind authenticated REST endpoints. A random session token is kept in
localStorage; no account or IndexedDB is required. Solo battles upload a combat-start snapshot and
cause-only action journal when they finish. Co-op rooms apply and journal actions authoritatively on
the server, pause while a player reconnects, and abandon after ten minutes away.

Battle history is available at `/history`. Replays re-simulate the journal through the deterministic
engine and are enabled only when the recording's engine version matches the running build. History
is capped at 200 safely-prunable battles per player.

Co-op is an experimental standalone skirmish available directly at `/coop`; it is intentionally
not linked from the player-facing navigation until it is integrated with gauntlet/events. It does
not mutate campaign or gauntlet saves.

## Deployment

The production image uses `node:26-bookworm-slim` because `better-sqlite3` targets glibc. The
Kubernetes manifests in `k8s/` deliberately run one replica with a `Recreate` strategy and mount the
SQLite PVC at `/data`. Traefik handles HTTP and WebSocket traffic through the same ingress.

The complete deployment has a single Kustomize entry point. Skaffold builds and tags the image
with the explicit release version configured in `skaffold.yaml`,
pushes it to `docker.io/bevdev1/warlords`, and deploys the rendered manifests:

```sh
skaffold run
kubectl -n warlords rollout status deployment/warlords --timeout=5m
```

For a manifest-only install after separately publishing the image:

```sh
kubectl apply -k k8s
kubectl -n warlords rollout status deployment/warlords --timeout=5m
```

The manifests create the namespace, PVC, service, one-pod deployment, certificate, and Traefik
ingress for `https://warlords.bevsoft.com`. The pod runs as uid/gid 1000; `fsGroup` makes the
mounted `/data` volume writable for SQLite. CPU/memory bounds and startup, readiness, and liveness
probes are declared in `k8s/deployment.yaml`.

The Node process writes a rotating weekday backup beside the database and drains HTTP/WebSocket
connections on SIGTERM.
