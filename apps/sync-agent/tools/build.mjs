import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const {build}=createRequire(new URL('../../../packages/dashboard/package.json',import.meta.url))('esbuild');
for(const [entry,out] of [['cli','agent'],['collect-worker','collect-worker'],['engine','library']])await build({entryPoints:[join(root,'src',entry+'.ts')],outfile:join(root,'dist',out+'.mjs'),bundle:true,platform:'node',format:'esm',target:'node24',
  plugins:[{name:'explicit-node-collector-entry',setup(b){b.onResolve({filter:/^server-only$/},()=>({path:'node-collector-marker',namespace:'empty'}));b.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:'',loader:'js'}));}}]});
console.log('Windows Sync Agent built (Node 24, no runtime npm install)');
