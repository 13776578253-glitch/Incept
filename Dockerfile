FROM node:24.21.0-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME=/pnpm COREPACK_HOME=/pnpm/corepack
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && NODE_USE_ENV_PROXY=1 corepack prepare pnpm@10.30.3 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/package.json
COPY apps/sync-agent/package.json apps/sync-agent/package.json
COPY apps/sync-gateway/package.json apps/sync-gateway/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/music/package.json packages/music/package.json
COPY packages/roadmap/package.json packages/roadmap/package.json
COPY packages/dashboard/package.json packages/dashboard/package.json
RUN NODE_USE_ENV_PROXY=1 pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN if test -d deployment/.prisma-engine-cache; then \
      (cd deployment/.prisma-engine-cache && sha256sum -c SHA256SUMS) \
      && test "$(cat deployment/.prisma-engine-cache/version)" = "$(node -p "require('./packages/db/node_modules/prisma/package.json').version")" \
      && set -- node_modules/.pnpm/@prisma+engines@*/node_modules/@prisma/engines \
      && test "$#" -eq 1 && test -d "$1" && ENGINE_DIR="$PWD/$1" \
      && cp deployment/.prisma-engine-cache/schema-engine-debian-openssl-3.0.x deployment/.prisma-engine-cache/libquery_engine-debian-openssl-3.0.x.so.node "$ENGINE_DIR/" \
      && export PRISMA_SCHEMA_ENGINE_BINARY="$ENGINE_DIR/schema-engine-debian-openssl-3.0.x" PRISMA_QUERY_ENGINE_LIBRARY="$ENGINE_DIR/libquery_engine-debian-openssl-3.0.x.so.node"; \
    fi \
    && NODE_USE_ENV_PROXY=1 DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build pnpm db:generate \
    && rm -rf /app/deployment/.prisma-engine-cache
RUN pnpm --filter @incept/dashboard build:runtime && pnpm --filter @incept/sync-agent build && pnpm --filter @incept/sync-gateway build && pnpm --filter @incept/dashboard build:sync-maintenance
RUN pnpm typecheck && pnpm lint && pnpm test && pnpm test:ops
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build NEXT_TELEMETRY_DISABLED=1 pnpm build

FROM build AS production-dependencies
# Preserve generated Prisma executables while installing only production workspace dependencies.
# Next's generated module aliases inside .next remain part of the compiled application.
RUN cp -a node_modules/.pnpm/@prisma+engines@*/node_modules/@prisma/engines /tmp/incept-prisma-engines \
    && rm -rf /app/node_modules /app/apps/web/node_modules /app/packages/db/node_modules \
       /app/packages/music/node_modules /app/packages/roadmap/node_modules /app/packages/dashboard/node_modules \
       /app/apps/sync-agent/node_modules /app/apps/sync-gateway/node_modules \
    && CI=true pnpm install --prod --offline --frozen-lockfile --ignore-scripts \
    && cp -a /tmp/incept-prisma-engines/. node_modules/.pnpm/@prisma+engines@*/node_modules/@prisma/engines/ \
    && rm -rf /tmp/incept-prisma-engines
RUN test -z "$(find apps/web/.next -xtype l -print)"

FROM base AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=production-dependencies --chown=node:node /app /app
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
ENTRYPOINT ["node", "scripts/production-start.mjs"]
