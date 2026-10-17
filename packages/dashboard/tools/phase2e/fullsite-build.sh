#!/bin/sh
set -eu
export CI=1 NEXT_TELEMETRY_DISABLED=1 NODE_USE_ENV_PROXY=1
unset INCEPT_AUTH_TEST_DATABASE_URL INCEPT_SYNC_TEST_DATABASE_URL
mkdir -p /phase2e /evidence
tar -xf /input/source.tar -C /phase2e
cd /phase2e
node --version > /evidence/versions.txt
pnpm --version >> /evidence/versions.txt
sha256sum pnpm-lock.yaml > /evidence/lock-before.txt
# Entire workspace is fresh: no inherited node_modules, generated client, .env or .next.
NODE_ENV=development pnpm install --frozen-lockfile --ignore-scripts --store-dir /phase2e-store > /evidence/install.txt 2>&1
export NODE_ENV=production
sha256sum pnpm-lock.yaml > /evidence/lock-after.txt
pnpm db:generate > /evidence/prisma.txt 2>&1
pnpm --filter @incept/dashboard build:runtime > /evidence/workers.txt 2>&1
# Separate diagnostics from build; preserve failures without relaxing Next checks.
set +e
pnpm --filter web typecheck > /evidence/web-types.txt 2>&1
web_code=$?
printf '%s\n' "$web_code" > /evidence/web-types.exit
pnpm typecheck > /evidence/workspace-types.txt 2>&1
workspace_code=$?
printf '%s\n' "$workspace_code" > /evidence/workspace-types.exit
pnpm build > /evidence/build.txt 2>&1
code=$?
printf '%s\n' "$code" > /evidence/build.exit
if [ "$web_code" -ne 0 ] || [ "$workspace_code" -ne 0 ]; then exit 1; fi
exit "$code"
