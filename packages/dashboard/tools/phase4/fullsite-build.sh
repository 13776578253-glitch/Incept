#!/bin/sh
set -eu
export CI=1 NEXT_TELEMETRY_DISABLED=1 NODE_USE_ENV_PROXY=1
unset INCEPT_AUTH_TEST_DATABASE_URL INCEPT_SYNC_TEST_DATABASE_URL INCEPT_AGENT_TEST_DATABASE_URL INCEPT_REMOTE_TEST_DATABASE_URL
mkdir -p /phase4 /evidence
tar -xf /input/source.tar -C /phase4
cd /phase4
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
set +e
pnpm --filter web typecheck > /evidence/web-types.txt 2>&1
web_code=$?
printf '%s\n' "$web_code" > /evidence/web-types.exit
pnpm typecheck > /evidence/workspace-types.txt 2>&1
workspace_code=$?
printf '%s\n' "$workspace_code" > /evidence/workspace-types.exit
pnpm --filter @incept/sync-agent typecheck > /evidence/agent-types.txt 2>&1
agent_code=$?
pnpm --filter @incept/sync-gateway typecheck > /evidence/gateway-types.txt 2>&1
gateway_code=$?
pnpm build > /evidence/build.txt 2>&1
build_code=$?
printf '%s\n' "$build_code" > /evidence/build.exit
if [ "$web_code" -ne 0 ] || [ "$workspace_code" -ne 0 ] || [ "$agent_code" -ne 0 ] || [ "$gateway_code" -ne 0 ]; then exit 1; fi
exit "$build_code"
