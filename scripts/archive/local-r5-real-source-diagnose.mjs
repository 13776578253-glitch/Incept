// Read-only diagnostics after the strict collector gate blocked. No upload.
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const directory='C:/Users/86139/AppData/Local/Incept/v4-acceptance-20261019';
assert.equal(resolve(process.env.INCEPT_V4_ACCEPTANCE_DIR??''),resolve(directory));
const {root}=JSON.parse(readFileSync(join(directory,'real-source-current.json'),'utf8'));
assert(resolve(root).startsWith(resolve(directory)+'\\'),'PRIVATE_RUN_REQUIRED');
const inventory=JSON.parse(readFileSync('output/r5-real-source-inventory.json','utf8'));
const {build}=createRequire(new URL('../../packages/dashboard/package.json',import.meta.url))('esbuild');
const file=join(root,'diagnose.mjs');
await build({stdin:{contents:`export {collectCodexEvents} from ${JSON.stringify(resolve('packages/dashboard/src/adapters/local/collectors/codex.ts'))};`,resolveDir:process.cwd(),loader:'ts'},outfile:file,bundle:true,platform:'node',format:'esm',target:'node24',
 plugins:[{name:'read-only-node-collector',setup(b){b.onResolve({filter:/^server-only$/},()=>({path:'marker',namespace:'empty'}));b.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:'',loader:'js'}));}}]});
const {collectCodexEvents}=await import(pathToFileURL(file).href);
const codex=collectCodexEvents(inventory.sourceHome,new Map(),new Set());
const claude={lines:0,assistantRows:0,assistantUsageRows:0,otherTypes:{}};
const claudeRoot=join(inventory.sourceHome,'.claude','projects');
for(const entry of readdirSync(claudeRoot,{recursive:true,withFileTypes:true})){
 if(!entry.isFile()||!entry.name.endsWith('.jsonl'))continue;
 for(const line of readFileSync(join(entry.parentPath,entry.name),'utf8').split('\n')){
  if(!line.trim())continue;claude.lines++;const row=JSON.parse(line);
  if(row.type==='assistant'){claude.assistantRows++;if(row.message?.usage)claude.assistantUsageRows++;}
  else {const type=['user','system','progress','result','file-history-snapshot'].includes(row.type)?row.type:'other';claude.otherTypes[type]=(claude.otherTypes[type]??0)+1;}
 }
}
const report={checkedAt:new Date().toISOString(),status:'blocked-before-any-real-upload',
 codex:{errors:codex.errors,parsedFiles:codex.parsedFiles.size,events:codex.events.length,
  completeSessions:new Set(codex.events.filter(e=>!e.historyIncomplete).map(e=>e.sessionId)).size},claude,
  historicalAcceptedStateAllowIncomplete:true,currentStrictAllowIncomplete:false};
writeFileSync('output/r5-real-source-diagnostics.json',JSON.stringify(report,null,2)+'\n');
const preparation=JSON.parse(readFileSync(join(root,'prepare-report.json'),'utf8'));
preparation.status='blocked';preparation.failure={code:'CODEX_COLLECTOR_INCOMPLETE_STRICT_MODE'};
preparation.sources.codex.status='blocked-collector-incomplete';preparation.uploadPerformed=false;
writeFileSync(join(root,'prepare-report.json'),JSON.stringify(preparation,null,2));
writeFileSync('output/r5-real-source-preparation.json',JSON.stringify(preparation,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
