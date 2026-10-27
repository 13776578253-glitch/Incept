// Read-only inventory: report source metadata, never source contents or credentials.
import {existsSync,readFileSync,readdirSync,lstatSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
const roots={codex:['.codex/sessions','.codex/archived_sessions'],commandcode:['.commandcode/projects'],
  claudeCode:['.claude/projects'],geminiCli:['.gemini/tmp'],
  antigravity:['antigravity','antigravity-cli','antigravity-ide'].map(x=>'.gemini/'+x+'/conversations'),
  opencode:['.local/share/opencode'],zcode:['.zcode/cli/db']};
const base=join(process.env.LOCALAPPDATA,'Incept');
const formal=join(base,'sync-agent'),baseline=join(base,'sync-agent-v4-prodcheck');
const configured=existsSync(join(formal,'config.json'))?JSON.parse(readFileSync(join(formal,'config.json'),'utf8')):{};
const home=configured.home??homedir();
function stateMetadata(directory){
 if(!existsSync(join(directory,'state.db')))return {exists:false};
 const db=new DatabaseSync(join(directory,'state.db'),{readOnly:true});
 try{
  const value=key=>{const row=db.prepare('SELECT value FROM meta WHERE key=?').get(key);return row?JSON.parse(row.value):null;};
  const heartbeat=value('heartbeat');let heartbeatPidAlive=false;if(heartbeat?.pid){try{process.kill(heartbeat.pid,0);heartbeatPidAlive=true;}catch{}}
  return {exists:true,lastCollectedAt:value('lastCollectedAt'),lastSuccessfulSyncAt:value('lastSuccessfulSyncAt'),heartbeat,heartbeatPidAlive,
   outbox:db.prepare('SELECT state,COUNT(*) count FROM outbox GROUP BY state').all()};
 }finally{db.close();}
}
const report={checkedAt:new Date().toISOString(),sourceHome:home,formal:stateMetadata(formal),baseline:stateMetadata(baseline),sources:{}};
for(const [source,paths]of Object.entries(roots)){
 const files=[];
 for(const root of paths){const absolute=join(home,root);if(!existsSync(absolute))continue;
  for(const entry of readdirSync(absolute,{recursive:true,withFileTypes:true})){
   if(!entry.isFile())continue;const file=join(entry.parentPath,entry.name);
   if(!(source==='antigravity'?file.endsWith('.db'):/\.(jsonl|json|db|sqlite|jsonl\.zst)$/.test(file)))continue;
   const st=lstatSync(file);if(st.isSymbolicLink())continue;
   files.push({size:st.size,modifiedAt:st.mtime.toISOString()});
  }
 }
 const baselineAt=Date.parse(report.baseline.lastCollectedAt??'');
 report.sources[source]={files:files.length,bytes:files.reduce((n,f)=>n+f.size,0),latestModifiedAt:files.map(f=>f.modifiedAt).sort().at(-1)??null,
  modifiedSinceAcceptedState:Number.isFinite(baselineAt)?files.filter(f=>Date.parse(f.modifiedAt)>baselineAt).length:null};
}
writeFileSync('output/r5-real-source-inventory.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
