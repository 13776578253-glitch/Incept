import {Worker} from 'node:worker_threads';
import {resolve} from 'node:path';
import {rmSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {hash} from '../../../packages/dashboard/src/adapters/local/imports/identity';
import {buildCandidate,type Capture,type ParentCapture} from '../../../packages/dashboard/src/agent/capture';
import type {TransferSource} from '../../../packages/dashboard/src/domain';
import {AgentState,scopeKey} from './state';
import {AgentHttp,RemoteError} from './transport';
import {classifyIssues} from './issues';
export {AgentState,scopeKey} from './state';
export {AgentHttp,RemoteError,validateEndpoint} from './transport';
export {storeToken,loadToken,protectDirectory,atomicJson} from './credentials';
export {RemoteLink} from './remote';
export {resumeReviewed} from './review';
export {resumeHeld} from './resume';
export {classifyIssues} from './issues';
export {captureHome,buildCandidate} from '../../../packages/dashboard/src/agent/capture';
export type Config={version:1;endpoint:string;deviceId:string;home:string;allowedSources:TransferSource[];allowLoopbackHttp?:boolean;remote?:boolean;allowIncomplete?:boolean};
export type Collector=(home:string,allowed:TransferSource[],parents:ParentCapture[],signal?:AbortSignal,options?:{tolerantIncomplete?:boolean})=>Promise<{captures:Capture[];issues:string[]}>;
export function workerCollector(stateDirectory:string):Collector{return async(home,allowed,parents,signal,options)=>{
  const snapshot=resolve(stateDirectory,'capture-'+randomUUID());
  const worker=new Worker(fileURLToPath(new URL('./collect-worker.mjs',import.meta.url)),{workerData:{home,allowed,parents,snapshot,tolerantIncomplete:options?.tolerantIncomplete===true},resourceLimits:{maxOldGenerationSizeMb:1024}});
  try{return await new Promise((yes,no)=>{const abort=()=>{clearTimeout(timer);void worker.terminate();no(Error('CAPTURE_STOPPED'));};const timer=setTimeout(abort,120_000);signal?.addEventListener('abort',abort,{once:true});
    const finish=(error?:Error,result?:{captures:Capture[];issues:string[]})=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);if(error)no(error);else yes(result!);};
    worker.once('message',message=>message.error?finish(Error('SOURCE_CAPTURE_FAILED')):finish(undefined,message.result));worker.once('error',()=>finish(Error('SOURCE_CAPTURE_FAILED')));worker.once('exit',code=>{if(code)finish(Error('SOURCE_CAPTURE_FAILED'));});});
  }finally{await worker.terminate();if(snapshot.startsWith(resolve(stateDirectory)+ '/capture-')||snapshot.startsWith(resolve(stateDirectory)+'\\capture-'))rmSync(snapshot,{recursive:true,force:true});}
};}
export class SyncEngine {
  private running?:Promise<unknown>;
  constructor(readonly state:AgentState,readonly config:Config,readonly http:AgentHttp,readonly collect:Collector=workerCollector(state.directory)){}
  run(signal?:AbortSignal){if(this.running)return this.running;this.state.set('activity','collecting');this.running=this.cycle(signal).finally(()=>{this.running=undefined;this.state.set('activity','idle');});return this.running;}
  private async cycle(signal?:AbortSignal){
    // Capture one source at a time. This bounds the worker/snapshot to the
    // per-source limits and keeps one large source from marking all others
    // incomplete merely because an aggregate cap was reached.
    const captured={captures:[] as Capture[],issues:[] as string[]};
    for(const source of this.config.allowedSources){
      try{const part=await this.collect(this.config.home,[source],this.state.parents(),signal,{tolerantIncomplete:this.config.allowIncomplete===true});captured.captures.push(...part.captures);captured.issues.push(...part.issues);}
      catch{if(signal?.aborted)break;captured.issues.push(source+':COLLECTOR_FAILED');}
    }
    this.state.set('lastCollectedAt',new Date().toISOString());this.state.set('issues',[...new Set(captured.issues)]);
    const reviewBefore=new Set(this.state.reviewBatches());
    const seen=new Set<string>(),allSeen=new Set(captured.captures.map(c=>scopeKey(c.source,c.sessionId))),oldParents=this.state.parents();
    for(const capture of captured.captures){const key=scopeKey(capture.source,capture.sessionId);seen.add(key);const previous=this.state.tail(key);
      // An unavailable/empty source is not a zero baseline and must not create a scope.
      if(!capture.records.length)continue;
      const signature=hash([capture.reader,capture.records,capture.proofs.map(p=>[p.range.locatorHash,p.range.identityHash,p.range.root])]);
      if(previous?.signature===signature)continue;
      if(this.state.blocked(key)){
        // A reviewed scope must never advance its committed lineage. Keep the
        // new observation as a durable successor, but do not upload it.
        try{const scope=previous?.parent.header.manifest.scope??{deviceId:this.config.deviceId,source:capture.source,sessionId:capture.sessionId,originId:hash(['incept-origin/1',capture.source,capture.sessionId])};
          this.state.hold(buildCandidate(capture,scope,previous?.parent,randomUUID()),signature);}
        catch(error){const code=error instanceof Error&&error.message==='OUTBOX_CAPACITY'?'HELD_CAPACITY':'HELD_WRITE_FAILED';this.state.set('issues',[...(this.state.get<string[]>('issues')??[]),code]);}
        continue;
      }
      if(!previous&&oldParents.some(p=>p.header.manifest.scope.source===capture.source&&!allSeen.has(scopeKey(capture.source,p.header.manifest.scope.sessionId)))){this.state.set('issues',[...(this.state.get<string[]>('issues')??[]),capture.source+':ROTATION_UNVERIFIED']);continue;}
      const scope=previous?.parent.header.manifest.scope??{deviceId:this.config.deviceId,source:capture.source,sessionId:capture.sessionId,originId:hash(['incept-origin/1',capture.source,capture.sessionId])};
      this.state.enqueue(buildCandidate(capture,scope,previous?.parent,randomUUID()),signature);
    }
    const missing=this.state.parents().filter(p=>!seen.has(scopeKey(p.header.manifest.scope.source,p.header.manifest.scope.sessionId)));
    if(missing.length)this.state.set('issues',[...(this.state.get<string[]>('issues')??[]),'MISSING_ORIGIN_RETAINED']);
    // Offline captures above are durable BEFORE any network operation. Planned
    // outbox parents do not advance the separate confirmed lineage table.
    const {sent,newTokens}=await this.upload(signal);
    const issues=this.state.get<string[]>('issues')??[],classified=classifyIssues(issues,this.config.allowedSources);
    const reviewTotal=this.state.reviewCount(),reviewNew=this.state.reviewBatches().filter(batch=>!reviewBefore.has(batch)).length;
    return {sent,newTokens,reviewTotal,reviewNew,held:this.state.heldCount(),warnings:classified.warnings.length,blockingIssues:classified.blocking.length,...this.state.status()};
  }
  private async upload(signal?:AbortSignal){
    this.state.set('activity','uploading');let sent=0,newTokens=0;for(let round=0;round<100&&!signal?.aborted;round++){
      const pending=this.state.pending();if(!pending.length)break;let progress=false;
      for(const row of pending){const header=JSON.parse(String(row.header_json)),batch=String(row.batch),base='/batches/'+batch;
        try{
          if(!row.admitted){const admission=await this.http.request('/scopes/resolve','POST',{source:header.manifest.scope.source,sessionId:header.manifest.scope.sessionId});
            if(hash(admission.scope)!==hash(header.manifest.scope))throw new RemoteError('MANUAL_SCOPE_REVIEW_REQUIRED',409);
            if(!header.manifest.parent&&admission.headManifest&&admission.headManifest!==header.manifest.manifestHash)throw new RemoteError('LOCAL_LINEAGE_RECOVERY_REQUIRED',409);
            this.state.db.prepare('UPDATE outbox SET admitted=1 WHERE batch=?').run(batch);
          }
          let status=await this.http.request(base,'GET',undefined,[200,404]);
          if(status.state==='expired'){this.state.renewExpired(batch,randomUUID());progress=true;continue;}
          if(!status.receipt){status=await this.http.request('/batches','POST',{header});let offset=status.nextOffset??0;
            if(!Number.isSafeInteger(offset)||offset<0||offset>header.manifest.recordCount)throw Error('INVALID_REMOTE_OFFSET');
            while(offset<header.manifest.recordCount){const page=this.state.page(batch,offset);const next=await this.http.request(base+'/pages/'+offset,'PUT',{records:page});if(next.nextOffset!==offset+page.length)throw Error('INVALID_REMOTE_OFFSET');offset=next.nextOffset;}
            status=await this.http.request(base+'/commit','POST');
          }
          const confirmed=await this.http.request(base);if(!confirmed.receipt||hash(confirmed.receipt)!==hash(status.receipt))throw Error('RECEIPT_MISMATCH');
          const tokens=this.state.batchTokens(batch);this.state.acknowledge(batch,confirmed.receipt);newTokens+=tokens;this.state.set('lastReportAt',new Date().toISOString());this.state.set('lastErrorCode',null);sent++;progress=true;
        }catch(error){const remote=error instanceof RemoteError?error:undefined,code=remote?.code??'LOCAL_SYNC_FAILED';
          const permanent=!!remote&&[400,403,409,413].includes(remote.status);const retry=Math.max(remote?.retryMs??0,Math.min(300000,1000*2**Math.min(Number(row.attempts),8))*(1+Math.random()*.2));
          this.state.fail(batch,code,permanent,retry);if(remote?.status===401||remote?.status===429||remote?.status===503)break;
        }
      }if(!progress)break;
    }
    return {sent,newTokens};
  }
  async flush(signal?:AbortSignal){
    if(this.running)return this.running;
    this.running=this.upload(signal).finally(()=>{this.running=undefined;this.state.set('activity','idle');});
    return this.running;
  }
}
