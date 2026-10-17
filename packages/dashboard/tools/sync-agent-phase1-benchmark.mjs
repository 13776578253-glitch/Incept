// No real home, network or production DB. Run from the monorepo root.
import { build } from 'esbuild';
import { mkdir,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join,basename } from 'node:path';
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
const root=fileURLToPath(new URL('../../../',import.meta.url)),directory=join(root,'.scratch','sync-agent-phase1','benchmark-'+Date.now());
await mkdir(join(directory,'tmp'),{recursive:true});const runner=join(directory,'worker.cjs');
await build({entryPoints:[fileURLToPath(new URL('../src/__tests__/phase1/benchmark-worker.ts',import.meta.url))],outfile:runner,bundle:true,platform:'node',format:'cjs',target:'node24',
  plugins:[{name:'server-only-test-marker',setup(builder){builder.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'empty'}));builder.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:''}));}}]});
const report={measuredAt:new Date().toISOString(),node:process.version,platform:process.platform,logicalCpus:cpus().length,budgetMiB:768,
  notes:['Synthetic data only; separate process per operation.','Writes/migrations n=1; warm reads n=3. Preparation excluded from operation wall/CPU.',
    'Peak RSS is kernel maxRSS for the entire child including startup and synthetic write payload.','CPU is user+system milliseconds; averageCorePercent uses one logical core as 100%.',
    'New children use --max-old-space-size=512 and SQLite cache_size=32MiB; RSS guard is 768MiB.','Disk includes normalized DB; source v1 copy is reported separately.'],results:[]};
async function run(mode,path,size,batches=1){return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['--max-old-space-size=512',runner,mode,path,String(size),String(batches)],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:180000,env:{...process.env,TEMP:join(directory,'tmp'),TMP:join(directory,'tmp')}});
  let output='';child.stdout.on('data',data=>output+=data);child.stderr.resume();child.once('error',()=>reject(new Error('benchmark-process-start-failed')));child.once('close',code=>code===0?resolve(JSON.parse(output)):reject(new Error('benchmark-failed:'+mode)));});}
async function measure(mode,path,size,batches=1,repeats=1){for(let repeat=1;repeat<=repeats;repeat++){
  const row={scenario:basename(path).startsWith('v2-')?'v2':'legacy',...await run(mode,path,size,batches),repeat};report.results.push(row);await writeFile(join(directory,'results.json'),JSON.stringify(report,null,2)+'\n');
  if(row.count!==size||mode==='mixed-read'&&row.provenanceRows!==size)throw new Error('BENCHMARK_CARDINALITY_DIVERGENCE');
  console.log(JSON.stringify({...row,plans:undefined}));if(mode!=='old-read'&&row.peakRssMiB>=768)throw new Error('RSS_BUDGET_EXCEEDED');}}
for(const size of [700,7000,15700,70000]){const path=join(directory,'v2-'+size);await measure('write',path,size);await measure('read',path,size,1,3);}
for(const batches of [1,288]){const path=join(directory,'legacy-'+batches);await run('prepare-legacy',path,700,batches);await measure('migrate',path,700,batches);await measure('old-read',path,700,batches,3);await measure('read',path,700,batches,3);await measure('adopt-legacy',path,700,batches);await measure('mixed-read',path,700,batches,3);}
await writeFile(join(root,'docs/research/sync-agent-phase1-benchmark.json'),JSON.stringify(report,null,2)+'\n');console.log('Benchmark report saved; '+report.results.length+' measurements.');
