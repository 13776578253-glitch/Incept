// Node-only source adapter. Raw bytes exist ONLY in a protected, disposable local
// snapshot. The wire contract contains normalized usage and bounded digests.
import {backup,DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,lstatSync,readdirSync,mkdirSync,existsSync,rmSync} from 'node:fs';
import {join,relative,dirname,basename} from 'node:path';
import {collectCommandCodeEvents} from '../adapters/local/collectors/commandcode';
import {collectAiusageAndRawAgentEvents} from '../adapters/local/collectors/agents';
import {loadLocalPricingMap} from '../adapters/local/pricing';
import {normalizeFile} from '../adapters/local/collectors/common';
import {hash,nativeEventId} from '../adapters/local/imports/identity';
import {canonicalTransferId} from '../adapters/local/imports/matching';
import {makeManifest,sequenceHash,syncEnvelope,SYNC_LIMITS,validateHeader,validateRecords} from '../adapters/local/imports/sync/contract';
import type {SyncScope,SyncHeader,SyncRecord,SyncRange} from '../domain/sync';
import type {TransferSource,TransferEvent} from '../domain';

export type RangeProof={range:SyncRange;parts?:{schema:string;rows:string[];envelopes:string[]}[]};
export type Capture={source:TransferSource;sessionId:string;reader:TransferSource|'aiusage';records:SyncRecord[];proofs:RangeProof[];rates:SyncHeader['basis']['rates'];prefixes:Record<string,string>};
export type ParentCapture={header:SyncHeader;proofs:RangeProof[]};
const roots:Record<string,string[]>={codex:['.codex/sessions','.codex/archived_sessions'],commandcode:['.commandcode/projects'],claudeCode:['.claude/projects'],geminiCli:['.gemini/tmp'],
  antigravity:['antigravity','antigravity-cli','antigravity-ide'].map(x=>'.gemini/'+x+'/conversations'),opencode:['.local/share/opencode'],zcode:['.zcode/cli/db'],aiusage:['.aiusage']};
const binary=(value:unknown):unknown=>value instanceof Uint8Array?{blobHash:hash(Buffer.from(value).toString('base64'))}:value;
const quote=(s:string)=>'"'+s.replaceAll('"','""')+'"';
function inventory(home:string){return Object.entries(roots).flatMap(([source,dirs])=>dirs.flatMap(dir=>existsSync(join(home,dir))?readdirSync(join(home,dir),{recursive:true,withFileTypes:true}).filter(r=>r.isFile()).map(r=>({source,locator:relative(home,join(r.parentPath,r.name)).replaceAll('\\','/')})):[]))
  .filter(r=>r.source==='aiusage'?r.locator.endsWith('cache.db'):/\.(jsonl|json|db|sqlite|jsonl\.zst)$/.test(r.locator)).sort((a,b)=>a.locator.localeCompare(b.locator));}
function dbRows(path:string,scope?:{source:TransferSource;sessionId:string},reader?:string,mask=false){
  const db=new DatabaseSync(path,{readOnly:true});
  try{db.exec('BEGIN');return db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(table=>{
    const name=String(table.name),rows:string[]=[],envelopes:string[]=[];
    for(const raw of db.prepare(`SELECT * FROM ${quote(name)} ORDER BY rowid`).iterate()){
      if(scope){if(reader==='aiusage'){const tool=String(raw.tool??'').toLowerCase(),source=tool==='claude'?'claudeCode':tool==='gemini'?'geminiCli':tool;if(name!=='records'||String(raw.session_id)!==scope.sessionId||source!==scope.source)continue;}
        else if(['opencode','zcode'].includes(scope.source)){if(name==='session'?String(raw.id)!==scope.sessionId:String(raw.session_id)!==scope.sessionId)continue;}}
      if(scope?.source==='zcode'&&name==='model_usage'&&raw.status==='running')throw Error('RUNNING_USAGE');
      const row=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,binary(v)]));rows.push(hash(row));
      envelopes.push(hash(mask?maskUsage(row,scope?.source??reader??''):row));
    }
    return {schema:hash([name,table.sql]),rows,envelopes};});
  }finally{db.close();}
}
const counters=new Set(['input_tokens','output_tokens','cached_input_tokens','cache_read_input_tokens','cache_creation_input_tokens','reasoning_output_tokens','reasoning_tokens','total_tokens',
  'inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','cacheCreationTokens','reasoningTokens','costUsd','input','output','cached','thoughts','reasoning','read','write','total']);
function numbers(value:unknown):unknown {if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,counters.has(k)&&typeof v==='number'?0:typeof v==='object'?numbers(v):v]));}
function maskUsage(input:Record<string,unknown>,source:string):Record<string,unknown>{
  const row=structuredClone(input) as Record<string,unknown>&{payload?:{type?:string;info?:Record<string,unknown>};message?:{usage?:unknown}};
  if(source==='codex'&&row.payload?.type==='token_count'){const info=row.payload.info;if(info?.total_token_usage)info.total_token_usage=numbers(info.total_token_usage);if(info?.last_token_usage)info.last_token_usage=numbers(info.last_token_usage);}
  if(source==='commandcode'){if(row.usage)row.usage=numbers(row.usage);}
  if(source==='claudeCode'){if(row.message?.usage)row.message.usage=numbers(row.message.usage);if(typeof row.costUSD==='number')row.costUSD=0;}
  if(source==='geminiCli'&&row.tokens)row.tokens=numbers(row.tokens);
  if(source==='opencode'&&typeof row.data==='string'){const data=JSON.parse(row.data),body=data.info??data;if(body.tokens)body.tokens=numbers(body.tokens);if(typeof body.cost==='number')body.cost=0;row.data=JSON.stringify(data);}
  if(source==='zcode')for(const key of Object.keys(row))if(key.endsWith('_tokens')&&typeof row[key]==='number')row[key]=0;
  return row;
}
type File={locator:string;path:string;source:string;identity:string;byteLength:number;root:string;bytes?:Buffer};
function fileProof(file:File,scope:{source:TransferSource;sessionId:string},reader:string):RangeProof {
  let parts:RangeProof['parts'],root=file.root,envelopeRoot:string,anchor:string|undefined;
  const text=file.bytes?.toString('utf8');
  if(/\.(db|sqlite)$/.test(file.locator)){parts=dbRows(file.path,scope,reader,true);root=hash(parts.map(p=>[p.schema,p.rows]));envelopeRoot=hash(parts.map(p=>[p.schema,p.envelopes]));}
  else if(text&&file.locator.endsWith('.json')&&scope.source==='geminiCli'){
    const obj=JSON.parse(text),{messages,...meta}=obj;if(!Array.isArray(messages))throw Error('UNSUPPORTED_EVIDENCE');
    if(messages.some((r:{tokens?:unknown;timestamp?:string})=>r.tokens&&(!r.timestamp||!Number.isFinite(Date.parse(r.timestamp)))))throw Error('ESTIMATED_TIMESTAMP');
    parts=[{schema:hash(meta),rows:messages.map(hash),envelopes:messages.map((r:Record<string,unknown>)=>hash(maskUsage(r,scope.source)))}];
    root=hash(parts.map(p=>[p.schema,p.rows]));envelopeRoot=hash(parts.map(p=>[p.schema,p.envelopes]));if(obj.sessionId===scope.sessionId)anchor=hash(scope.sessionId);
  }else if(text&&file.locator.endsWith('.jsonl')){
    const rows=text.split('\n').filter(r=>r.trim()).map(r=>JSON.parse(r));envelopeRoot=hash(rows.map(r=>hash(maskUsage(r,scope.source))));
    if(scope.source==='codex'&&rows.some(r=>r.type==='session_meta'&&r.payload?.id===scope.sessionId)||scope.source==='claudeCode'&&rows.every(r=>!r.sessionId||r.sessionId===scope.sessionId)&&rows.some(r=>r.sessionId===scope.sessionId)
      ||scope.source==='commandcode'&&'cc-'+basename(file.locator,'.jsonl')===scope.sessionId)anchor=hash(scope.sessionId);
  }else throw Error('UNSUPPORTED_EVIDENCE');
  return {range:{locatorHash:hash(file.locator),identityHash:file.identity,root,envelopeRoot,byteLength:file.byteLength,kind:parts?(reader==='geminiCli'?'json':'sqlite'):'jsonl',...(anchor?{sessionAnchorHash:anchor}:{})},...(parts?{parts}:{})};
}
// Caller supplies a private disposable snapshot directory and cleans it even on worker termination.
export async function captureHome(home:string,snapshot:string,allowed:TransferSource[],parents:ParentCapture[]=[]):Promise<{captures:Capture[];issues:string[]}>{
  mkdirSync(snapshot,{recursive:true,mode:0o700});const files:File[]=[],issues:string[]=[],failed=new Set<string>();let bytes=0;
  const list=inventory(home);
  for(const item of list){if(item.source!=='aiusage'&&!allowed.includes(item.source as TransferSource))continue;
    try{const input=join(home,item.locator),st=lstatSync(input);if(st.isSymbolicLink()||st.size>256*1024**2||(bytes+=st.size)>512*1024**2)throw Error('CAPTURE_LIMIT');
      const path=join(snapshot,item.locator);mkdirSync(dirname(path),{recursive:true,mode:0o700});
      let data:Buffer|undefined,root:string;
      if(/\.(db|sqlite)$/.test(input)){const before=hash(dbRows(input));const db=new DatabaseSync(input,{readOnly:true});try{await backup(db,path);}finally{db.close();}root=hash(dbRows(path));if(before!==root||root!==hash(dbRows(input)))throw Error('CHANGED_DURING_READ');}
      else {if(input.endsWith('.zst'))throw Error('COMPRESSED_ARCHIVE_REVIEW');data=readFileSync(input);root=hash(data.toString('base64'));writeFileSync(path,data,{mode:0o600});if(root!==hash(readFileSync(input).toString('base64')))throw Error('CHANGED_DURING_READ');
        if(input.endsWith('.jsonl'))data.toString('utf8').split('\n').filter(r=>r.trim()).forEach(r=>JSON.parse(r));else JSON.parse(data.toString('utf8'));}
      files.push({...item,path,identity:hash([String(st.dev),String(st.ino),st.birthtimeMs]),byteLength:st.size,root,bytes:data});
    }catch{rmSync(join(snapshot,item.locator),{force:true});failed.add(item.source);issues.push(item.source+':INCOMPLETE_READ');}}
  if(hash(list)!==hash(inventory(home)))throw Error('CHANGED_DURING_READ');
  // Pricing configuration is read-only. It is never part of the uploaded raw snapshot.
  const pricing=loadLocalPricingMap(home,{aliases:{},prices:{},updatedAt:0});
  const cc=collectCommandCodeEvents(snapshot,pricing),agents=collectAiusageAndRawAgentEvents(snapshot,pricing),commandFiles=new Set(cc.events.flatMap(r=>r.sourceFile?[normalizeFile(r.sourceFile)]:[]));
  if(cc.errors.length)failed.add('commandcode');for(const error of agents.errors){
    const source=Object.entries({codex:/codex/i,geminiCli:/gemini/i,antigravity:/antigravity/i,claudeCode:/claude/i,opencode:/opencode/i,zcode:/zcode/i,aiusage:/indexed|aiusage/i}).find(([,pattern])=>pattern.test(error))?.[0];
    if(source){failed.add(source);issues.push(source+':COLLECTOR_INCOMPLETE');}else{issues.push('sources:COLLECTOR_INCOMPLETE');for(const item of allowed)failed.add(item);}
  }
  const rows=[...cc.events,...agents.events.filter(r=>r.sourceId!=='commandcode'||!r.sourceFile||!commandFiles.has(normalizeFile(r.sourceFile)))];
  const groups=new Map<string,typeof rows>();for(const row of rows){if(!allowed.includes(row.sourceId as TransferSource))continue;const key=JSON.stringify([row.sourceId,row.sessionId]),group=groups.get(key)??[];group.push(row);groups.set(key,group);}
  const captures:Capture[]=[];
  for(const group of groups.values()){
    const source=group[0].sourceId as TransferSource,sessionId=group[0].sessionId,reader=group.some(r=>agents.fallbackEvents.includes(r))?'aiusage':source;
    if(failed.has(source)||reader==='aiusage'&&failed.has('aiusage')||group.some(r=>r.historyIncomplete)){issues.push(source+':COLLECTOR_INCOMPLETE');continue;}
    try{
      const referenced=new Set(group.flatMap(r=>[...(r.sourceFiles??[]),...(r.sourceFile?[r.sourceFile]:[])]).map(normalizeFile));
      const selected=files.filter(file=>reader==='aiusage'?file.source==='aiusage':file.source===source&&referenced.has(normalizeFile(file.path)));
      if(!selected.length)throw Error('MISSING_ORIGIN');
      const commandHasIds=source!=='commandcode'||selected.every(file=>file.bytes!.toString('utf8').split('\n').filter(r=>r.trim()).every(line=>!!JSON.parse(line).id));
      const points=source==='codex'&&reader==='codex'?selected.flatMap(file=>file.bytes!.toString('utf8').split('\n').filter(r=>r.trim()).map(r=>JSON.parse(r))).filter(r=>r.payload?.type==='token_count'):[];
      const records:SyncRecord[]=group.sort((a,b)=>a.timestampMs-b.timestampMs).map(raw=>{
        const event:TransferEvent={eventId:nativeEventId(raw),source,sessionId,timestampMs:raw.timestampMs,modelName:raw.modelName,projectKey:raw.projectKey+':'+hash(raw.workspacePath??raw.projectKey).slice(0,16),projectName:raw.projectName,
          ...(raw.workspacePath?{workspacePath:raw.workspacePath}:{}),...(raw.sessionTitle?{sessionTitle:raw.sessionTitle}:{}),inputTokens:raw.inputTokens,outputTokens:raw.outputTokens,cacheReadTokens:raw.cacheReadTokens,cacheCreationTokens:raw.cacheCreationTokens,reasoningTokens:raw.reasoningTokens,
          ...(raw.costSource==='recorded'&&source!=='codex'?{recordedCost:raw.nominalCost??raw.cost}:{})};event.eventId=canonicalTransferId(event);
        const record:SyncRecord={event,envelopeHash:''};record.envelopeHash=syncEnvelope(record);
        if(source==='codex'&&reader==='codex'){
          const candidates=points.filter(p=>Date.parse(p.timestamp)===event.timestampMs),unique=new Map(candidates.map(p=>[hash(p.payload.info.total_token_usage),p]));if(unique.size!==1)throw Error('CODEX_COUNTER_INVALID');
          const total=unique.values().next().value?.payload.info.total_token_usage;if(!total)throw Error('CODEX_COUNTER_INVALID');record.pointKey=hash([sessionId,event.timestampMs]);record.cumulative={input:total.input_tokens??0,cache:total.cached_input_tokens??0,output:total.output_tokens??0,reasoning:total.reasoning_output_tokens??0};
        }else if(reader!=='aiusage'&&raw.eventId&&commandHasIds)record.nativeKey={source,keyHash:hash(raw.eventId)};
        return record;
      });
      if(records.length>SYNC_LIMITS.records||new Set(records.map(r=>r.event.eventId)).size!==records.length)throw Error('AMBIGUOUS_RECORD');
      const rates=Object.fromEntries([...new Set(records.map(r=>r.event.modelName))].flatMap(name=>pricing.has(name)?[[name,pricing.get(name)!]]:[]));
      const prefixes:Record<string,string>={};for(const parent of parents.filter(p=>p.header.manifest.scope.source===source&&p.header.manifest.scope.sessionId===sessionId))for(const old of parent.proofs){const file=selected.find(f=>hash(f.locator)===old.range.locatorHash);if(file?.bytes&&file.bytes.length>=old.range.byteLength)prefixes[old.range.locatorHash+':'+old.range.byteLength]=hash(file.bytes.subarray(0,old.range.byteLength).toString('base64'));}
      captures.push({source,sessionId,reader,records,proofs:selected.map(file=>fileProof(file,{source,sessionId},reader)),rates,prefixes});
    }catch{issues.push(source+':SOURCE_REVIEW_REQUIRED');}
  }
  return {captures,issues:[...new Set(issues)]};
}
export function buildCandidate(capture:Capture,scope:SyncScope,parent:ParentCapture|undefined,batchId:string,readCurrentPrefix?:(locatorHash:string,length:number)=>string|undefined){
  const proofs=capture.proofs.map(p=>structuredClone(p));
  for(const proof of proofs){const next=proof.range,old=parent?.proofs.find(p=>p.range.locatorHash===next.locatorHash);
    if(old&&old.range.root!==next.root){let retained=false;
      if(proof.parts&&old.parts)retained=old.parts.every((part,i)=>part.schema===proof.parts![i]?.schema&&part.rows.every((h,n)=>h===proof.parts![i].rows[n]));
      else retained=(readCurrentPrefix?.(next.locatorHash,old.range.byteLength)??capture.prefixes[next.locatorHash+':'+old.range.byteLength])===old.range.root;
      next.previous={locatorHash:old.range.locatorHash,root:old.range.root,retainedRoot:retained?old.range.root:hash('PREFIX_NOT_RETAINED'),retainedBytes:old.range.byteLength,change:retained?'append':next.envelopeRoot===old.range.envelopeRoot&&capture.reader!=='aiusage'&&scope.source!=='antigravity'?'usage-revision':'append'};
    }}
  const ranges=proofs.map(p=>p.range),root=hash(ranges.map(r=>[r.locatorHash,r.root])),basis=parent?.header.basis??{rates:capture.rates,aliases:{},schedule:'commandcode-peak-v1' as const},mappings=parent?.header.mappings??{};
  const header:SyncHeader={batchId,basis,mappings,manifest:makeManifest({version:2,scope,reader:capture.reader,collectorVersion:'incept-collector/1',epoch:parent?.header.manifest.epoch??0,parent:parent?{generationId:parent.header.manifest.generationId,manifestHash:parent.header.manifest.manifestHash}:null,
    read:{status:'complete',inventoryHash:hash(ranges.map(r=>r.locatorHash).sort()),beforeRoot:root,afterRoot:root,snapshotRoot:root},ranges,recordCount:capture.records.length,sequenceHash:sequenceHash(capture.records),basisHash:hash(basis),mappingsHash:hash(mappings),intent:'observe'})};
  validateHeader(header);for(let i=0;i<capture.records.length;i+=500)validateRecords(capture.records.slice(i,i+500),header);
  return {header,records:capture.records,proofs};
}
