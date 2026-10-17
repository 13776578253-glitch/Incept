#!/bin/sh
set -eu
export CI=1 NEXT_TELEMETRY_DISABLED=1 NODE_USE_ENV_PROXY=0
unset INCEPT_AUTH_TEST_DATABASE_URL INCEPT_SYNC_TEST_DATABASE_URL INCEPT_AGENT_TEST_DATABASE_URL INCEPT_REMOTE_TEST_DATABASE_URL
mkdir -p /phase5 /evidence
tar -xf /input/source.tar -C /phase5
cd /phase5
node --version > /evidence/versions.txt
pnpm --version >> /evidence/versions.txt
sha256sum pnpm-lock.yaml > /evidence/lock-before.txt
NODE_ENV=development pnpm install --offline --frozen-lockfile --ignore-scripts --store-dir /phase2e-store > /evidence/install.txt 2>&1
sha256sum pnpm-lock.yaml > /evidence/lock-after.txt
export NODE_ENV=production
pnpm db:generate > /evidence/prisma.txt 2>&1
pnpm --filter @incept/dashboard build:runtime > /evidence/workers.txt 2>&1
pnpm --filter @incept/sync-agent build > /evidence/agent.txt 2>&1
pnpm --filter @incept/sync-gateway build > /evidence/gateway.txt 2>&1
node packages/dashboard/tools/phase5/build.mjs > /evidence/maintenance.txt 2>&1
pnpm typecheck > /evidence/types.txt 2>&1
pnpm --filter @incept/sync-agent typecheck >> /evidence/types.txt 2>&1
pnpm --filter @incept/sync-gateway typecheck >> /evidence/types.txt 2>&1
pnpm build > /evidence/build.txt 2>&1
printf '0\n' > /evidence/build.exit
