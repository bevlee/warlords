# bookworm (glibc), not alpine: better-sqlite3 ships glibc prebuilds; musl
# would force a source compile and a python3/make/g++ toolchain in the image.

# --- build stage ---
FROM docker.io/node:26-bookworm-slim AS builder
WORKDIR /app

# Manifests before source: npm ci re-runs only when dependencies change,
# not on every source edit.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

# --- serve stage ---
FROM docker.io/node:26-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_PATH=/data/warlords.db

COPY --from=builder /app/build ./build
COPY --from=builder /app/server ./server
# server/ imports the shared engine/net/replay code under src/lib at runtime
# (e.g. ENGINE_VERSION, applyAction); Node strips their types on load too.
COPY --from=builder /app/src/lib ./src/lib
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

EXPOSE 3000
# Run the .ts sources directly, no build step. transform-types (not plain
# strip-only) because server/ and the shared src/lib code use TS syntax that
# needs real transformation — e.g. constructor parameter properties, which
# strip-only rejects with ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX.
CMD ["node", "--experimental-transform-types", "server/index.ts"]
