import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root=fileURLToPath(new URL('../../',import.meta.url));
await mkdir(join(root,'dist'),{recursive:true});
await build({
  entryPoints:[join(root,'src/sync/maintenance-cli.ts')],
  outfile:join(root,'dist/sync-maintenance.mjs'),
  bundle:true,platform:'node',format:'esm',target:'node24',
  plugins:[{name:'server-only-marker',setup(builder){
    builder.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'empty'}));
    builder.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:'',loader:'js'}));
  }}],
});
console.log('Sync maintenance CLI built');
