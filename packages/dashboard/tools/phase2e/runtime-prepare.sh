#!/bin/sh
set -eu
cd /phase2e
cp -a node_modules/.pnpm/@prisma+engines@*/node_modules/@prisma/engines /tmp/phase2e-engines
rm -rf /phase2e/node_modules /phase2e/apps/web/node_modules /phase2e/packages/db/node_modules /phase2e/packages/music/node_modules /phase2e/packages/roadmap/node_modules /phase2e/packages/dashboard/node_modules
CI=true NODE_ENV=production pnpm install --prod --offline --frozen-lockfile --ignore-scripts --store-dir /phase2e-store > /evidence/production-dependencies.txt 2>&1
cp -a /tmp/phase2e-engines/. node_modules/.pnpm/@prisma+engines@*/node_modules/@prisma/engines/
test -z "$(find apps/web/.next -xtype l -print)"
node -e 'const fs=require("fs");const p="apps/web/.next/server/app/api/dashboard/";for(const [route,worker] of [["usage","dashboard-usage-worker.mjs"],["sync/[[...path]]","dashboard-sync-worker.mjs"]]){const f=p+route+"/route.js.nft.json";const rows=JSON.parse(fs.readFileSync(f)).files;if(!rows.some(s=>s.endsWith(worker)))throw Error("WORKER_NOT_TRACED");console.log(JSON.stringify({route,worker,traced:true,files:rows.length}));}console.log(JSON.stringify({buildId:fs.readFileSync("apps/web/.next/BUILD_ID","utf8").trim(),lock:require("crypto").createHash("sha256").update(fs.readFileSync("pnpm-lock.yaml")).digest("hex")}));' > /evidence/artifacts.jsonl
