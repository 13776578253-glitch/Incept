import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
await build({entryPoints:[fileURLToPath(new URL('./seed.ts',import.meta.url))],outfile:fileURLToPath(new URL('../../dist/phase5-seed.mjs',import.meta.url)),bundle:true,platform:'node',format:'esm',external:['../../../db/generated/client/index.js'],plugins:[{name:'node-fixture',setup(b){b.onResolve({filter:/^server-only$/},()=>({path:'stub',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:''}));}}]});
