// Correctness oracle + synthetic fixtures; not an upload protocol implementation.
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
export async function fixtures(){
  const outfile=root+'dist/phase2e-fixtures.mjs';
  await build({stdin:{contents:`export {fromEvents} from './src/__tests__/phase1/fixtures'; export {loadTokenDashboardData} from './src/adapters/local/loader'; export {writePhase0Home,writePhase0Pricing,phase0Export,phase0Import} from './src/__tests__/fixtures/sync-agent-phase0'; export {hashPassword,encryptTotp,createTotpSecret,totpAt} from '../db/src/owner/security';`,resolveDir:root,loader:'ts'},
    outfile,bundle:true,platform:'node',format:'esm',target:'node24',plugins:[{name:'test-only-server-marker',setup(b){b.onResolve({filter:/^server-only$/},()=>({path:'marker',namespace:'empty'}));b.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:'',loader:'js'}));}}]});
  return import(outfile);
}
