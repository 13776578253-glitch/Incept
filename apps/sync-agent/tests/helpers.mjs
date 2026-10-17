import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const {build}=createRequire(new URL('../../../packages/dashboard/package.json',import.meta.url))('esbuild');
const output=new URL('../dist/test-fixtures.mjs',import.meta.url);
await build({stdin:{contents:`export * from './packages/dashboard/src/__tests__/fixtures/sync-agent-phase0'; export {CompatibleSyncService} from './packages/dashboard/src/adapters/local/imports/sync/legacy'; export {resolveScope,guardExternalLegacy} from './packages/dashboard/src/sync/admission'; export {readSyncView} from './packages/dashboard/src/adapters/local/imports/sync/read'; export {hash} from './packages/dashboard/src/adapters/local/imports/identity';`,resolveDir:root,loader:'ts'},outfile:fileURLToPath(output),bundle:true,platform:'node',format:'esm',target:'node24',plugins:[{name:'test-node',setup(b){b.onResolve({filter:/^server-only$/},()=>({path:'marker',namespace:'empty'}));b.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:'',loader:'js'}));}}]});
export const fixtures=await import(output);
