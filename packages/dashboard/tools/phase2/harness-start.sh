#!/bin/sh
set -eu
export CI=1
cd /app
cp -a /fixture-src/packages/dashboard/src/. packages/dashboard/src/
cp -a /fixture-src/packages/dashboard/dist/. packages/dashboard/dist/
cp /fixture-src/packages/dashboard/package.json packages/dashboard/package.json
cp -a /fixture-src/packages/db/src/. packages/db/src/
cp /fixture-src/packages/db/package.json packages/db/package.json
cp /fixture-src/packages/db/prisma/schema.prisma packages/db/prisma/schema.prisma
cp -a /fixture-src/apps/web/src/server/sync apps/web/src/server/
node packages/db/node_modules/prisma/build/index.js generate --schema packages/db/prisma/schema.prisma > /tmp/prisma-generation.log 2>&1
mkdir -p /app/sync-harness/app/api/dashboard/sync/'[[...path]]' /app/sync-harness/app/api/health/live /tmp/sync-phase2/home
test -e /app/sync-harness/node_modules || ln -s /app/apps/web/node_modules /app/sync-harness/node_modules
printf '%s\n' '{"private":true,"type":"module","dependencies":{"next":"16.4.0","react":"19.2.8","react-dom":"19.2.8"}}' > /app/sync-harness/package.json
rm -f /app/sync-harness/app/api/dashboard/sync/'[[...path]]'/route.ts /app/sync-harness/app/page.tsx /app/sync-harness/app/layout.tsx /app/sync-harness/app/api/health/live/route.ts /app/sync-harness/tsconfig.json
cp /fixture-src/apps/web/src/app/api/dashboard/sync/'[[...path]]'/route.ts /app/sync-harness/app/api/dashboard/sync/'[[...path]]'/route.js
cp -a /fixture-src/apps/web/src/app/api/dashboard/sync apps/web/src/app/api/dashboard/
printf '%s\n' 'export function GET(){return Response.json({status:"ok"});}' > /app/sync-harness/app/api/health/live/route.js
printf '%s\n' 'export default function Page(){return <main>Isolated Sync API harness</main>}' > /app/sync-harness/app/page.jsx
printf '%s\n' 'export default function Layout({children}){return <html><body>{children}</body></html>}' > /app/sync-harness/app/layout.jsx
printf '%s\n' 'export default {experimental:{cpus:2},typescript:{ignoreBuildErrors:true},outputFileTracingIncludes:{"/api/dashboard/sync/*":["../packages/dashboard/dist/dashboard-sync-worker.mjs"]},transpilePackages:["@incept/db","@incept/dashboard"]};' > /app/sync-harness/next.config.mjs
printf '%s\n' '{"compilerOptions":{"baseUrl":".","paths":{"@/*":["../apps/web/src/*"]}}}' > /app/sync-harness/jsconfig.json
cd /app/sync-harness
node node_modules/next/dist/bin/next build > /tmp/next-harness-build.log 2>&1
exec node --import /fixture-src/packages/dashboard/tools/phase2/loop-metrics.mjs node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port 3000
