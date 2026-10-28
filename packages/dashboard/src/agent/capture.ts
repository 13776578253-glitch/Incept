// Node-only source adapter. Raw bytes exist ONLY in a protected, disposable local
// snapshot. The wire contract contains normalized usage and bounded digests.
import {backup,DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,lstatSync,readdirSync,mkdirSync,existsSync,rmSync} from 'node:fs';
import {zstdDecompressSync} from 'node:zlib';
import {decodeHarnessZstd} from '../adapters/local/collectors/harness-zstd';
import {join,relative,dirname,basename} from 'node:path';
import {collectCommandCodeEvents} from '../adapters/local/collectors/commandcode';
import {collectAiusageAndRawAgentEvents} from '../adapters/local/collectors/agents';
import {loadLocalPricingMap, lookupPricing} from '../adapters/local/pricing';
import {normalizeFile} from '../adapters/local/collectors/common';
import {hash,nativeEventId} from '../adapters/local/imports/identity';
import {normalizeCodexRecords} from './codex-normalize';
import {isCodexAutoReviewModel} from '../adapters/local/collectors/codex-purpose';
import {canonicalTransferId} from '../adapters/local/imports/matching';
import {makeManifest,sequenceHash,syncEnvelope,SYNC_LIMITS,validateHeader,validateRecords,qualifyRanges} from '../adapters/local/imports/sync/contract';
import type {SyncScope,SyncHeader,SyncRecord,SyncRange} from '../domain/sync';
import type {TransferSource,TransferEvent} from '../domain';

export type RangeProof={range:SyncRange;parts?:{schema:string;rows:string[];envelopes:string[]}[];recoveryAfterTimestampMs?:number};
export type Capture={source:TransferSource;sessionId:string;reader:TransferSource|'aiusage';records:SyncRecord[];proofs:RangeProof[];rates:SyncHeader['basis']['rates'];prefixes:Record<string,string>};
export type ParentCapture={header:SyncHeader;proofs:RangeProof[]};
export type SessionIsolation={source:TransferSource;sessionId:string;reason:string;affectedRecords:number;unattributedTokens:number;
  firstAffectedAtMs?:number;lastAffectedAtMs?:number;recoveryAfterTimestampMs?:number;locatorHashes?:string[];coverage:'session'|'prefix'};
export type RecoveryRange={source:TransferSource;sessionId:string;afterTimestampMs:number};
export type CaptureOptions={tolerantIncomplete?:boolean;recoveryRanges?:RecoveryRange[];autoReviewSessions?:string[]};
export type CaptureResult={captures:Capture[];issues:string[];isolations?:SessionIsolation[]};
const roots:Record<string,string[]>={codex:['.codex/sessions','.codex/archived_sessions'],commandcode:['.commandcode/projects'],claudeCode:['.claude/projects'],geminiCli:['.gemini/tmp'],
  antigravity:['antigravity','antigravity-cli','antigravity-ide'].map(x=>'.gemini/'+x+'/conversations'),opencode:['.local/share/opencode'],zcode:['.zcode/cli/db'],deepseekHarness:['.dsh/sessions'],aiusage:['.aiusage']};
const binary=(value:unknown):unknown=>value instanceof Uint8Array?{blobHash:hash(Buffer.from(value).toString('base64'))}:value;
const quote=(s:string)=>'"'+s.replaceAll('"','""')+'"';
function inventory(home:string){return Object.entries(roots).flatMap(([source,dirs])=>dirs.flatMap(dir=>existsSync(join(home,dir))?readdirSync(join(home,dir),{recursive:true,withFileTypes:true}).filter(r=>r.isFile()).map(r=>({source,locator:relative(home,join(r.parentPath,r.name)).replaceAll('\\','/')})):[]))
  .filter(r=>r.source==='aiusage'?r.locator.endsWith('cache.db'):r.source==='antigravity'?r.locator.endsWith('.db'):/\.(jsonl|json|db|sqlite|jsonl\.zst|jsonl\.zstd)$/.test(r.locator)).sort((a,b)=>a.locator.localeCompare(b.locator));}
function dbRows(path:string,scope?:{source:TransferSource;sessionId:string},reader?:string,mask=false){
  const db=new DatabaseSync(path,{readOnly:true});
  try{
    if(scope?.source==='antigravity'){try{const latest=db.prepare("SELECT status FROM steps ORDER BY idx DESC LIMIT 1").get() as {status?:number}|undefined;if(latest?.status===2)throw Error('RUNNING_USAGE');}catch(e){if(e instanceof Error&&e.message==='RUNNING_USAGE')throw e;}}
    db.exec('BEGIN');return db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(table=>{
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
  if(source==='deepseekHarness'&&row.data&&typeof row.data==='object'){const data=row.data as Record<string,unknown>;if(data.usage)data.usage=numbers(data.usage);}
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
  }else if(text&&(file.locator.endsWith('.jsonl')||file.locator.endsWith('.jsonl.zst')||file.locator.endsWith('.jsonl.zstd'))){
    const rows=text.split('\n').filter(r=>r.trim()).map(r=>{try{return JSON.parse(r);}catch(error){if(scope.source==='deepseekHarness')return {unparsedLine:r};throw error;}});envelopeRoot=hash(rows.map(r=>hash(maskUsage(r,scope.source))));
    if(scope.source==='codex'&&rows.some(r=>r.type==='session_meta'&&r.payload?.id===scope.sessionId)||scope.source==='claudeCode'&&rows.every(r=>!r.sessionId||r.sessionId===scope.sessionId)&&rows.some(r=>r.sessionId===scope.sessionId)
      ||scope.source==='deepseekHarness'&&rows.some(r=>r.type==='session'&&r.id===scope.sessionId)
      ||scope.source==='commandcode'&&'cc-'+basename(file.locator,'.jsonl')===scope.sessionId)anchor=hash(scope.sessionId);
  }else throw Error('UNSUPPORTED_EVIDENCE');
  return {range:{locatorHash:hash(file.locator),identityHash:file.identity,root,envelopeRoot,byteLength:file.byteLength,kind:parts?(reader==='geminiCli'?'json':'sqlite'):'jsonl',...(anchor?{sessionAnchorHash:anchor}:{})},...(parts?{parts}:{})};
}
// Caller supplies a private disposable snapshot directory and cleans it even on worker termination.
export async function captureHome(home:string,snapshot:string,allowed:TransferSource[],parents:ParentCapture[]=[],options:CaptureOptions={}):Promise<CaptureResult>{
  mkdirSync(snapshot,{recursive:true,mode:0o700});const files:File[]=[],issues:string[]=[],failed=new Set<string>(),isolations:SessionIsolation[]=[];let bytes=0;
  const list=inventory(home);
  for(const item of list){if(item.source!=='aiusage'&&!allowed.includes(item.source as TransferSource))continue;
    try{const input=join(home,item.locator),st=lstatSync(input);if(st.isSymbolicLink()||st.size>256*1024**2||(bytes+=st.size)>1536*1024**2)throw Error('CAPTURE_LIMIT');
      const path=join(snapshot,item.locator);mkdirSync(dirname(path),{recursive:true,mode:0o700});
      let data:Buffer|undefined,root:string,filePath=path;
      if(/\.(db|sqlite)$/.test(input)){const before=hash(dbRows(input));const db=new DatabaseSync(input,{readOnly:true});try{await backup(db,path);}finally{db.close();}root=hash(dbRows(path));if(before!==root||root!==hash(dbRows(input)))throw Error('CHANGED_DURING_READ');}
      else {if(item.source==='deepseekHarness'&&input.endsWith('.zstd')){const compressed=readFileSync(input),decoded=decodeHarnessZstd(compressed);data=Buffer.from(decoded.text);filePath=path.replace(/\.zstd$/,'');writeFileSync(filePath,data,{mode:0o600});root=hash(data.toString('base64'));if(!compressed.equals(readFileSync(input)))throw Error('CHANGED_DURING_READ');if(decoded.error){isolations.push({source:'deepseekHarness',sessionId:'unidentified-file:'+hash(item.locator),reason:'UNREADABLE_COMPRESSED_SUFFIX',affectedRecords:0,unattributedTokens:0,coverage:'prefix',locatorHashes:[hash(item.locator)]});issues.push('deepseekHarness:INTERVAL_ISOLATED');}}
        else if(input.endsWith('.jsonl.zst')){const compressed=readFileSync(input);data=zstdDecompressSync(compressed);filePath=path.replace(/\.zst$/,'');writeFileSync(filePath,data,{mode:0o600});root=hash(data.toString('base64'));}
        else {if(input.endsWith('.zst'))throw Error('COMPRESSED_ARCHIVE_REVIEW');data=readFileSync(input);root=hash(data.toString('base64'));writeFileSync(path,data,{mode:0o600});if(root!==hash(readFileSync(input).toString('base64')))throw Error('CHANGED_DURING_READ');}
        if(filePath.endsWith('.jsonl')){if(item.source!=='codex'&&item.source!=='deepseekHarness')data.toString('utf8').split('\n').filter(r=>r.trim()).forEach(r=>JSON.parse(r));}else JSON.parse(data.toString('utf8'));}
      files.push({...item,path:filePath,identity:hash([String(st.dev),String(st.ino),st.birthtimeMs]),byteLength:data?.length??st.size,root,bytes:data});
    }catch(error){if(process.env.INCEPT_CAPTURE_DEBUG)console.error('CAPTURE_FILE_FAILED',item.locator,String(error));rmSync(join(snapshot,item.locator),{force:true});
      if(item.source==='aiusage'){failed.add(item.source);continue;}
      const related=parents.filter(p=>p.header.manifest.scope.source===item.source&&p.proofs.some(p=>p.range.locatorHash===hash(item.locator)));
      for(const sessionId of related.length?related.map(p=>p.header.manifest.scope.sessionId):['unidentified-file:'+hash(item.locator)])isolations.push({source:item.source as TransferSource,sessionId,reason:'SOURCE_FILE_UNREADABLE',affectedRecords:0,unattributedTokens:0,coverage:'session',locatorHashes:[hash(item.locator)]});
      issues.push(item.source+':SESSION_ISOLATED');}}
  if(hash(list)!==hash(inventory(home)))throw Error('CHANGED_DURING_READ');
  // Pricing configuration is read-only. It is never part of the uploaded raw snapshot.
  const pricing=loadLocalPricingMap(home,{aliases:{},prices:{},updatedAt:0});
  const cc=collectCommandCodeEvents(snapshot,pricing),agents=collectAiusageAndRawAgentEvents(snapshot,pricing,{autoReviewSessions:options.autoReviewSessions}),commandFiles=new Set(cc.events.flatMap(r=>r.sourceFile?[normalizeFile(r.sourceFile)]:[]));
  for(const diagnostic of agents.sessionIntegrity){if(!allowed.includes(diagnostic.source))continue;
    const {sourceFiles,...detail}=diagnostic;
    isolations.push({...detail,coverage:'session',locatorHashes:files.filter(file=>sourceFiles.map(normalizeFile).includes(normalizeFile(file.path))).map(file=>hash(file.locator))});
    issues.push(diagnostic.source+':SESSION_ISOLATED');
  }
  for(const diagnostic of agents.harnessDiagnostics){isolations.push({source:'deepseekHarness',sessionId:diagnostic.sessionId??'unidentified-file:'+hash(diagnostic.sourceFile),reason:diagnostic.reason,affectedRecords:diagnostic.affectedRecords,unattributedTokens:0,coverage:'prefix',locatorHashes:files.filter(file=>normalizeFile(file.path)===normalizeFile(diagnostic.sourceFile)).map(file=>hash(file.locator))});issues.push('deepseekHarness:INTERVAL_ISOLATED');}
  if(cc.errors.length)failed.add('commandcode');for(const error of agents.errors){
    if(process.env.INCEPT_CAPTURE_DEBUG)console.error('COLLECTOR_FAILED',error);
    const source=Object.entries({codex:/codex/i,geminiCli:/gemini/i,antigravity:/antigravity/i,claudeCode:/claude/i,opencode:/opencode/i,zcode:/zcode/i,deepseekHarness:/harness/i,aiusage:/indexed|aiusage/i}).find(([,pattern])=>pattern.test(error))?.[0];
    if(source&&allowed.includes(source as TransferSource)){if(options.tolerantIncomplete){issues.push(source+':INCOMPLETE_DATA');if(/session openings/i.test(error))issues.push(source+':UNKNOWN_OPENING');}else failed.add(source);issues.push(source+':COLLECTOR_INCOMPLETE');}else if(!source){issues.push('sources:COLLECTOR_INCOMPLETE');for(const item of allowed)failed.add(item);}
  }
  const rows=[...cc.events,...agents.events.filter(r=>r.sourceId!=='commandcode'||!r.sourceFile||!commandFiles.has(normalizeFile(r.sourceFile)))];
  const groups=new Map<string,typeof rows>();for(const row of rows){if(!allowed.includes(row.sourceId as TransferSource))continue;const key=JSON.stringify([row.sourceId,row.sessionId]),group=groups.get(key)??[];group.push(row);groups.set(key,group);}
  const captures:Capture[]=[];
  for(let group of groups.values()){
    const source=group[0].sourceId as TransferSource,sessionId=group[0].sessionId,reader=group.some(r=>agents.fallbackEvents.includes(r))?'aiusage':source;
    let recoveryAfterTimestampMs:number|undefined;
    if(failed.has(source)||reader==='aiusage'&&failed.has('aiusage')){issues.push(source+':COLLECTOR_INCOMPLETE');continue;}
    const quarantined=isolations.filter(item=>item.source===source&&!(source==='deepseekHarness'&&item.coverage==='prefix')&&(item.sessionId===sessionId||item.locatorHashes?.some(locator=>files.some(file=>hash(file.locator)===locator&&group.some(row=>row.sourceFile&&normalizeFile(row.sourceFile)===normalizeFile(file.path))))));
    if(quarantined.length||group.some(r=>r.historyIncomplete)){
      if(!quarantined.length){isolations.push({source,sessionId,reason:'HISTORY_INCOMPLETE',affectedRecords:group.length,unattributedTokens:0,coverage:'session'});issues.push(source+':SESSION_ISOLATED');continue;}
      const recovery=options.recoveryRanges?.find(item=>item.source===source&&item.sessionId===sessionId);
      const openingOnly=quarantined.every(item=>['OPENING_PREFIX_MISSING','OPENING_USAGE_UNCERTAIN'].includes(item.reason)&&item.recoveryAfterTimestampMs!==undefined);
      const anchor=Math.max(...quarantined.map(item=>item.recoveryAfterTimestampMs??Infinity));
      const parent=parents.find(item=>item.header.manifest.scope.source===source&&item.header.manifest.scope.sessionId===sessionId);
      // A range recovery must be explicitly pinned. Never reinterpret an accepted full-session baseline.
      const parentRecovery=recovery&&parent&&parent.proofs.length>0
        &&parent.proofs.every(proof=>proof.recoveryAfterTimestampMs===recovery.afterTimestampMs);
      if(!recovery||!openingOnly||!Number.isSafeInteger(recovery.afterTimestampMs)||recovery.afterTimestampMs<anchor||parent&&!parentRecovery)continue;
      const suffix=group.filter(row=>row.timestampMs>recovery.afterTimestampMs&&row.usageInterval?.kind==='cumulative-delta'
        &&row.usageInterval.afterTimestampMs>=recovery.afterTimestampMs);
      if(!suffix.length)continue;
      group=suffix;recoveryAfterTimestampMs=recovery.afterTimestampMs;for(const item of quarantined)item.coverage='prefix';
    }
    try{
      const independentReview=source==='codex'&&reader==='codex'&&group.every(row=>isCodexAutoReviewModel(row.modelName));
      if(group.some(row=>isCodexAutoReviewModel(row.modelName))&&!independentReview)throw Error('MIXED_USAGE_BASIS');
      const referenced=new Set(group.flatMap(r=>source==='deepseekHarness'?(r.sourceFile?[r.sourceFile]:[]):[...(r.sourceFiles??[]),...(r.sourceFile?[r.sourceFile]:[])]).map(normalizeFile));
      const selected=files.filter(file=>reader==='aiusage'?file.source==='aiusage':file.source===source&&referenced.has(normalizeFile(file.path)));
      if(!selected.length)throw Error('MISSING_ORIGIN');
      const commandHasIds=source!=='commandcode'||selected.every(file=>file.bytes!.toString('utf8').split('\n').filter(r=>r.trim()).every(line=>!!JSON.parse(line).id));
      const points=source==='codex'&&reader==='codex'?selected.flatMap(file=>file.bytes!.toString('utf8').split('\n').filter(r=>r.trim()).map(r=>JSON.parse(r))).filter(r=>r.payload?.type==='token_count'&&group.some(row=>row.timestampMs===Date.parse(r.timestamp))):[];
      const usable=group.filter(raw=>(raw.inputTokens??0)+(raw.outputTokens??0)+(raw.cacheReadTokens??0)+(raw.cacheCreationTokens??0)+(raw.reasoningTokens??0)>0);
      if(usable.length!==group.length)issues.push(source+':EMPTY_USAGE_SKIPPED');
      if(!usable.length)continue;
      const mapped=usable.sort((a,b)=>a.timestampMs-b.timestampMs).map((raw):SyncRecord|null=>{
        const event:TransferEvent={eventId:nativeEventId(raw),source,sessionId,timestampMs:raw.timestampMs,modelName:raw.modelName,projectKey:raw.projectKey+':'+hash(raw.workspacePath??raw.projectKey).slice(0,16),projectName:raw.projectName,
          ...(raw.workspacePath?{workspacePath:raw.workspacePath}:{}),...(raw.sessionTitle?{sessionTitle:raw.sessionTitle}:{}),inputTokens:raw.inputTokens,outputTokens:raw.outputTokens,cacheReadTokens:raw.cacheReadTokens,cacheCreationTokens:raw.cacheCreationTokens,reasoningTokens:raw.reasoningTokens,
          ...(raw.costSource==='recorded'&&source!=='codex'?{recordedCost:raw.nominalCost??raw.cost}:{})};event.eventId=canonicalTransferId(event);
        const record:SyncRecord={event,envelopeHash:''};record.envelopeHash=syncEnvelope(record);
        if(source==='codex'&&reader==='codex'){
          record.pointKey=hash([sessionId,event.timestampMs]);
          if(independentReview)return record;
          const candidates=points.filter(p=>Date.parse(p.timestamp)===event.timestampMs&&p.payload?.info?.total_token_usage),unique=new Map(candidates.map(p=>[hash(p.payload.info.total_token_usage),p]));
          if(unique.size===0)throw Error('CODEX_CUMULATIVE_EVIDENCE_MISSING');
          if(unique.size!==1)throw Error('AMBIGUOUS_RECORD');
          const total=unique.values().next().value?.payload.info.total_token_usage;if(!total)throw Error('CODEX_CUMULATIVE_EVIDENCE_MISSING');record.pointKey=hash([sessionId,event.timestampMs]);record.cumulative={input:total.input_tokens??0,cache:total.cached_input_tokens??0,output:total.output_tokens??0,reasoning:total.reasoning_output_tokens??0};
        }else if(reader!=='aiusage'&&raw.eventId&&commandHasIds)record.nativeKey={source,keyHash:hash(raw.eventId)};
        return record;
      });
      const records=mapped.filter((record):record is SyncRecord=>record!==null);
      const counters=points.map(p=>({timestampMs:Date.parse(p.timestamp),total:p.payload?.info?.total_token_usage,last:p.payload?.info?.last_token_usage}));
      const normalized=source==='codex'&&reader==='codex'?normalizeCodexRecords(records,independentReview?[]:counters):records;
      if(normalized.length>SYNC_LIMITS.records||new Set(normalized.map(r=>r.event.eventId)).size!==normalized.length)throw Error('AMBIGUOUS_RECORD');
      const rates=Object.fromEntries([...new Set(normalized.map(r=>r.event.modelName))].flatMap(name=>{
        if(isCodexAutoReviewModel(name))return [];
        const price=lookupPricing(pricing,name)??(pricing.has(name)?pricing.get(name)!:undefined);
        return price?[[name,price]]:[];
      }));
      const prefixes:Record<string,string>={};for(const parent of parents.filter(p=>p.header.manifest.scope.source===source&&p.header.manifest.scope.sessionId===sessionId))for(const old of parent.proofs){const file=selected.find(f=>hash(f.locator)===old.range.locatorHash);if(file?.bytes&&file.bytes.length>=old.range.byteLength)prefixes[old.range.locatorHash+':'+old.range.byteLength]=hash(file.bytes.subarray(0,old.range.byteLength).toString('base64'));}
      const capture:Capture={source,sessionId,reader,records:normalized,proofs:selected.map(file=>({...fileProof(file,{source,sessionId},reader),
        ...(recoveryAfterTimestampMs!==undefined?{recoveryAfterTimestampMs}:{})})),rates,prefixes};
      const parent=parents.find(item=>item.header.manifest.scope.source===source&&item.header.manifest.scope.sessionId===sessionId);
      const candidate=buildCandidate(capture,parent?.header.manifest.scope??{deviceId:'00000000-0000-4000-8000-000000000000',source,sessionId,
        originId:hash(['incept-origin/1',source,sessionId])},parent,'00000000-0000-4000-8000-000000000000');
      if(source==='codex'&&reader==='codex')qualifyRanges(parent?.header.manifest,candidate.header.manifest);
      captures.push(capture);
    }catch(error){if(error instanceof Error&&error.message==='RUNNING_USAGE'){continue;}if(process.env.INCEPT_CAPTURE_DEBUG)console.error('CAPTURE_GROUP_FAILED',source,sessionId,error instanceof Error?error.stack:String(error));
      const reason=error instanceof Error&&/^[A-Z][A-Z0-9_]+$/.test(error.message)?error.message:'SOURCE_REVIEW_REQUIRED';
      isolations.push({source,sessionId,reason,affectedRecords:group.length,unattributedTokens:0,coverage:'session'});issues.push(source+':SESSION_ISOLATED');}
  }
  return {captures,issues:[...new Set(issues)],isolations};
}
export function buildCandidate(capture:Capture,scope:SyncScope,parent:ParentCapture|undefined,batchId:string,readCurrentPrefix?:(locatorHash:string,length:number)=>string|undefined){
  const proofs=capture.proofs.map(p=>structuredClone(p));
  for(const proof of proofs){const next=proof.range,old=parent?.proofs.find(p=>p.range.locatorHash===next.locatorHash);
    if(old&&old.range.root!==next.root){let retained=false;
      if(proof.parts&&old.parts){
        retained=old.parts.every((part,i)=>part.schema===proof.parts![i]?.schema&&part.rows.every((h,n)=>h===proof.parts![i].rows[n]));
        if(!retained&&scope.source==='antigravity'&&capture.records.length>=(parent?.header.manifest.recordCount??0)){
          const schemasMatch=old.parts.every((part,i)=>part.schema===proof.parts![i]?.schema);
          const noRowsDeleted=old.parts.every((part,i)=>(proof.parts![i]?.rows.length??0)>=part.rows.length);
          if(schemasMatch&&noRowsDeleted)retained=true;
        }
      }
      else retained=(readCurrentPrefix?.(next.locatorHash,old.range.byteLength)??capture.prefixes[next.locatorHash+':'+old.range.byteLength])===old.range.root;
      next.previous={locatorHash:old.range.locatorHash,root:old.range.root,retainedRoot:retained?old.range.root:hash('PREFIX_NOT_RETAINED'),retainedBytes:old.range.byteLength,change:retained?'append':next.envelopeRoot===old.range.envelopeRoot&&capture.reader!=='aiusage'&&scope.source!=='antigravity'?'usage-revision':'append'};
    }}
  const ranges=proofs.map(p=>p.range),root=hash(ranges.map(r=>[r.locatorHash,r.root])),basis=parent?.header.basis??{rates:capture.rates,aliases:{},schedule:'commandcode-peak-v1' as const},mappings=parent?.header.mappings??{};
  const header:SyncHeader={batchId,basis,mappings,manifest:makeManifest({version:2,scope,reader:capture.reader,collectorVersion:'incept-collector/1',epoch:parent?.header.manifest.epoch??0,parent:parent?{generationId:parent.header.manifest.generationId,manifestHash:parent.header.manifest.manifestHash}:null,
    read:{status:'complete',inventoryHash:hash(ranges.map(r=>r.locatorHash).sort()),beforeRoot:root,afterRoot:root,snapshotRoot:root},ranges,recordCount:capture.records.length,sequenceHash:sequenceHash(capture.records),basisHash:hash(basis),mappingsHash:hash(mappings),intent:'observe'})};
  validateHeader(header);for(let i=0;i<capture.records.length;i+=500)validateRecords(capture.records.slice(i,i+500),header);
  return {header,records:capture.records,proofs};
}
