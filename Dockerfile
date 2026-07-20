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
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

EXPOSE 3000
# Node 26 strips types natively; server/ runs without a build step.
CMD ["node", "server/index.ts"]
