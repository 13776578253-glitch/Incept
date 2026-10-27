#!/usr/bin/env node
// Read-only comparison for a staged trusted baseline. It never writes either DB.
import {DatabaseSync} from 'node:sqlite';
import {existsSync,writeFileSync} from 'node:fs';
import {resolve,isAbsolute} from 'node:path';

function arg(name){const i=process.argv.indexOf('--'+name);return i>=0?process.argv[i+1]:undefined;}
const candidate=arg('candidate'),reference=arg('reference'),out=arg('out');
if(!candidate||!isAbsolute(candidate)||!existsSync(candidate)){console.error(JSON.stringify({error:'CANDIDATE_REQUIRED'}));process.exit(1);}
function summary(path){
  const db=new DatabaseSync(path,{readOnly:true});
  try{
    const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>String(r.name)));
    if(!tables.has('sync_observations')||!tables.has('sync_meta'))throw Error('NOT_A_SYNC_DATABASE');
    const revision=Number(db.prepare('SELECT data_revision n FROM sync_meta').get().n);
    const receipts=Number(db.prepare('SELECT COUNT(*) n FROM sync_receipts').get().n);
    const legacy=tables.has('sync_legacy_batches')?Number(db.prepare('SELECT COUNT(*) n FROM sync_legacy_batches').get().n):0;
    const raw=db.prepare('SELECT source,session_id,record_json FROM sync_observations').all();
    const by={};const sessions=new Map();
    for(const row of raw){const source=String(row.source),session=String(row.session_id);const record=JSON.parse(String(row.record_json));const event=record.event??record;
      const tokens=Number(event.inputTokens??0)+Number(event.outputTokens??0)+Number(event.cacheReadTokens??0)+Number(event.cacheCreationTokens??0)+Number(event.reasoningTokens??0);
      const rowData=by[source]??={sessions:new Set(),events:0,tokens:0,cost:0,unpriced:0};rowData.sessions.add(session);rowData.events++;rowData.tokens+=tokens;
      if(typeof event.cost==='number')rowData.cost+=event.cost;else rowData.unpriced++;
      const key=source+'\u0000'+session;const saved=sessions.get(key)??{source,session,tokens:0,events:0};saved.tokens+=tokens;saved.events++;sessions.set(key,saved);
    }
    const sources={};for(const [source,row] of Object.entries(by))sources[source]={sessions:row.sessions.size,events:row.events,tokens:row.tokens,cost:row.cost,unpriced:row.unpriced};
    return {revision,receipts,legacyBatches:legacy,sources,sessions:[...sessions.values()]};
  }finally{db.close();}
}
try{
  const now=summary(candidate),before=reference?summary(reference):null;
  const old=before?new Map(before.sessions.map(s=>[s.source+'\u0000'+s.session,s])):new Map();
  const current=new Set(now.sessions.map(s=>s.source+'\u0000'+s.session));
  const onlyOld=before?[...old.values()].filter(s=>!current.has(s.source+'\u0000'+s.session)):[];
  const onlyNew=before?now.sessions.filter(s=>!old.has(s.source+'\u0000'+s.session)):[];
  const result={ok:now.legacyBatches===0,generatedAt:new Date().toISOString(),candidate:{revision:now.revision,receipts:now.receipts,legacyBatches:now.legacyBatches,sources:now.sources},reference:before?{revision:before.revision,receipts:before.receipts,legacyBatches:before.legacyBatches,sources:before.sources}:null,
    onlyInReference:{sessions:onlyOld.length,tokens:onlyOld.reduce((n,s)=>n+s.tokens,0),sample:onlyOld.slice(0,20)},onlyInCandidate:{sessions:onlyNew.length,tokens:onlyNew.reduce((n,s)=>n+s.tokens,0),sample:onlyNew.slice(0,20)}};
  if(out){if(!isAbsolute(out))throw Error('OUTPUT_MUST_BE_ABSOLUTE');writeFileSync(out,JSON.stringify(result,null,2),{flag:'wx',mode:0o600});}
  console.log(JSON.stringify(result,null,2));
}catch(error){console.error(JSON.stringify({error:error instanceof Error?error.message:'BASELINE_VALIDATION_FAILED'}));process.exit(1);}
