import {Worker} from 'node:worker_threads';
import {resolve} from 'node:path';
import {rmSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {hash} from '../../../packages/dashboard/src/adapters/local/imports/identity';
import {buildCandidate,selectCaptureMode,type Capture,type ParentCapture,type CaptureResult,type CaptureOptions,type SessionIsolation} from '../../../packages/dashboard/src/agent/capture';
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
export {verifyLineage,V4_BASELINE} from './verify-lineage';
export {verifyR5ImageIdentity,classifyR5Digest,R5_IMAGE} from './image-identity';
export {captureHome,buildCandidate,selectCaptureMode} from '../../../packages/dashboard/src/agent/capture';
export type Config={version:1;endpoint:string;deviceId:string;home:string;allowedSources:TransferSource[];allowLoopbackHttp?:boolean;remote?:boolean;allowIncomplete?:boolean;autoReviewSessions?:string[]};
export type Collector=(home:string,allowed:TransferSource[],parents:ParentCapture[],signal?:AbortSignal,options?:CaptureOptions)=>Promise<CaptureResult>;
export function workerCollector(stateDirectory:string):Collector{return async(home,allowed,parents,signal,options)=>{
  const snapshot=resolve(stateDirectory,'capture-'+randomUUID());
  const worker=new Worker(fileURLToPath(new URL('./collect-worker.mjs',import.meta.url)),{workerData:{home,allowed,parents,snapshot,tolerantIncomplete:options?.tolerantIncomplete===true,recoveryRanges:options?.recoveryRanges,autoReviewSessions:options?.autoReviewSessions},resourceLimits:{maxOldGenerationSizeMb:1024}});
  try{return await new Promise<CaptureResult>((yes,no)=>{const abort=()=>{clearTimeout(timer);void worker.terminate();no(Error('CAPTURE_STOPPED'));};const timer=setTimeout(abort,120_000);signal?.addEventListener('abort',abort,{once:true});
    const finish=(error?:Error,result?:CaptureResult)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);if(error)no(error);else yes(result!);};
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
    const captured={captures:[] as Capture[],issues:[] as string[],isolations:[] as SessionIsolation[]};let quarantineNew=0;
    const historicalPolicies=this.state.historicalPolicies();
    const policyFor=(source:string,sessionId:string)=>historicalPolicies.find(policy=>policy.source===source&&policy.sessionId===sessionId);
    const currentPolicies=this.state.parents().filter(parent=>this.state.isHistoricalPolicyCurrent(parent,this.config.deviceId));
    const sourceReports:Record<string,{capturedSessions:number;isolatedSessions:number;sealedSessions?:number;heldHistoricalSessions?:number;failed:boolean;changedSessions?:number;outcome?:string}>={};
    for(const source of this.config.allowedSources){
      try{const part=await this.collect(this.config.home,[source],this.state.parents(),signal,{tolerantIncomplete:false,recoveryRanges:this.state.recoveryRanges(),autoReviewSessions:this.config.autoReviewSessions});
        const restricted=(sessionId:string)=>!!policyFor(source,sessionId);
        const healthy=part.captures.filter(c=>!restricted(c.sessionId));
        const isolations:SessionIsolation[]=[...part.isolations??[],...part.captures.filter(c=>restricted(c.sessionId)).map(c=>({source,sessionId:c.sessionId,
          reason:policyFor(source,c.sessionId)?.disposition==='isolated'?'HISTORICAL_CONTINUATION_UNVERIFIED':'HISTORICAL_SCOPE_SEALED',affectedRecords:c.records.length,unattributedTokens:0,coverage:'session' as const}))];
        captured.captures.push(...healthy);captured.issues.push(...part.issues,...(isolations.length?[source+':SESSION_ISOLATED']:[]));captured.isolations.push(...isolations);
        quarantineNew+=this.state.observeSessionIsolations(source,isolations,healthy.map(c=>c.sessionId));
        sourceReports[source]={capturedSessions:healthy.length,isolatedSessions:new Set(isolations.map(item=>item.sessionId)).size,
          sealedSessions:currentPolicies.filter(parent=>parent.header.manifest.scope.source===source&&policyFor(source,parent.header.manifest.scope.sessionId)?.disposition!=='isolated').length,
          heldHistoricalSessions:currentPolicies.filter(parent=>parent.header.manifest.scope.source===source&&policyFor(source,parent.header.manifest.scope.sessionId)?.disposition==='isolated').length,
          failed:classifyIssues(part.issues,[source]).blocking.length>0||!healthy.length&&isolations.some(item=>!restricted(item.sessionId))};
      }
      catch{if(signal?.aborted)break;captured.issues.push(source+':COLLECTOR_FAILED');sourceReports[source]={capturedSessions:0,isolatedSessions:0,failed:true};}
    }
    this.state.set('lastCollectedAt',new Date().toISOString());this.state.set('issues',[...new Set(captured.issues)]);
    const reviewBefore=new Set(this.state.reviewBatches());
    const seen=new Set<string>(),oldParents=this.state.parents();
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
      // A native, session-anchored Codex log has its own identity. Missing unrelated
      // history cannot block it; reused old evidence still requires isolation.
      const independentCodex=capture.source==='codex'&&capture.reader==='codex'&&capture.proofs.length>0
        &&capture.proofs.every(proof=>proof.range.sessionAnchorHash===hash(capture.sessionId)
          &&!oldParents.some(parent=>parent.header.manifest.scope.source==='codex'&&parent.header.manifest.scope.sessionId!==capture.sessionId
            &&parent.proofs.some(old=>old.range.locatorHash===proof.range.locatorHash||old.range.identityHash===proof.range.identityHash||old.range.root===proof.range.root)));
      try{
        if(!previous&&capture.source==='codex'&&!independentCodex)throw Error('ROTATION_UNVERIFIED');
        const scope=previous?.parent.header.manifest.scope??{deviceId:this.config.deviceId,source:capture.source,sessionId:capture.sessionId,originId:hash(['incept-origin/1',capture.source,capture.sessionId])};
        const mode=selectCaptureMode(capture,previous?.parent);
        this.state.enqueue(buildCandidate(capture,scope,previous?.parent,randomUUID(),undefined,mode),signature);
        if(sourceReports[capture.source])sourceReports[capture.source].changedSessions=(sourceReports[capture.source].changedSessions??0)+1;
      }catch(error){
        if(error instanceof Error&&error.message==='OUTBOX_CAPACITY')throw error;
        const isolation:SessionIsolation={source:capture.source,sessionId:capture.sessionId,
          reason:error instanceof Error&&/^[A-Z][A-Z0-9_]+$/.test(error.message)?error.message:'CANDIDATE_VALIDATION_FAILED',
          affectedRecords:capture.records.length,unattributedTokens:0,coverage:'session'};
        quarantineNew+=this.state.observeSessionIsolations(capture.source,[isolation],[]);captured.isolations.push(isolation);
        this.state.set('issues',[...(this.state.get<string[]>('issues')??[]),capture.source+':SESSION_ISOLATED']);
        if(sourceReports[capture.source]){sourceReports[capture.source].isolatedSessions++;sourceReports[capture.source].capturedSessions--;}
      }
    }
    const missingParents=this.state.parents().filter(p=>this.config.allowedSources.includes(p.header.manifest.scope.source)&&!seen.has(scopeKey(p.header.manifest.scope.source,p.header.manifest.scope.sessionId)));
    const policyMissing=missingParents.filter(parent=>this.state.isHistoricalPolicyCurrent(parent,this.config.deviceId));
    const missing=missingParents.filter(parent=>!policyMissing.includes(parent));
    if(policyMissing.length)this.state.set('issues',[...(this.state.get<string[]>('issues')??[]),...new Set(policyMissing.map(parent=>parent.header.manifest.scope.source+(policyFor(parent.header.manifest.scope.source,parent.header.manifest.scope.sessionId)?.disposition==='isolated'?':HELD_ORIGIN_RETAINED':':SEALED_ORIGIN_RETAINED')))]);
    const isolated=this.state.sessionIsolations().filter(item=>item.active&&this.config.allowedSources.includes(item.source));
    const unexpectedMissing=missing.filter(parent=>!isolated.some(item=>item.source===parent.header.manifest.scope.source&&item.sessionId===parent.header.manifest.scope.sessionId));
    // Retain the old head and receipt; quarantine only the absent Codex session.
    // Its own strict continuation can clear the quarantine on a later scan.
    const missingCodex=unexpectedMissing.filter(parent=>parent.header.manifest.scope.source==='codex');
    if(missingCodex.length){
      const items:SessionIsolation[]=missingCodex.map(parent=>({source:'codex',sessionId:parent.header.manifest.scope.sessionId,
        reason:'MISSING_ORIGIN_RETAINED',affectedRecords:parent.header.manifest.recordCount,unattributedTokens:0,coverage:'session',
        locatorHashes:parent.proofs.map(proof=>proof.range.locatorHash)}));
      quarantineNew+=this.state.observeSessionIsolations('codex',items,[]);
    }
    const otherMissing=unexpectedMissing.filter(parent=>parent.header.manifest.scope.source!=='codex');
    if(otherMissing.length)this.state.set('issues',[...(this.state.get<string[]>('issues')??[]),...new Set(otherMissing.map(parent=>parent.header.manifest.scope.source+':MISSING_ORIGIN_RETAINED'))]);
    if(missingCodex.length)this.state.set('issues',[...(this.state.get<string[]>('issues')??[]),'codex:ISOLATED_ORIGIN_RETAINED']);
    if(missing.length!==unexpectedMissing.length)this.state.set('issues',[...(this.state.get<string[]>('issues')??[]),...new Set(missing.filter(parent=>!unexpectedMissing.includes(parent)).map(parent=>parent.header.manifest.scope.source+':ISOLATED_ORIGIN_RETAINED'))]);
    // Offline captures above are durable BEFORE any network operation. Planned
    // outbox parents do not advance the separate confirmed lineage table.
    const {sent,newTokens,uploadedTokens}=await this.upload(signal);
    const issues=this.state.get<string[]>('issues')??[],classified=classifyIssues(issues,this.config.allowedSources);
    for(const source of this.config.allowedSources)if(sourceReports[source])sourceReports[source].isolatedSessions=new Set([...captured.isolations,...this.state.sessionIsolations().filter(item=>item.active)].filter(item=>item.source===source).map(item=>item.sessionId)).size;
    const reviewTotal=this.state.reviewCount(),reviewNew=this.state.reviewBatches().filter(batch=>!reviewBefore.has(batch)).length;
    const uploadIncomplete=!!this.state.db.prepare("SELECT 1 FROM outbox WHERE state IN ('pending','review','held') LIMIT 1").get();
    for(const source of this.config.allowedSources){const report=sourceReports[source];if(!report)continue;
      const pending=!!this.state.db.prepare("SELECT 1 FROM outbox WHERE json_extract(header_json,'$.manifest.scope.source')=? AND state IN ('pending','review','held') LIMIT 1").get(source);
      const blocked=classifyIssues(issues,[source]).blocking.length>0;
      report.outcome=report.failed||pending||blocked||!report.capturedSessions&&report.isolatedSessions>0&&!report.sealedSessions&&!report.heldHistoricalSessions?'source_failed':report.isolatedSessions||report.sealedSessions||report.heldHistoricalSessions?'partial_success':report.changedSessions?'complete_success':'no_change';
    }
    const failed=Object.values(sourceReports).some(report=>report.outcome==='source_failed'),healthy=Object.values(sourceReports).some(report=>report.capturedSessions>0);
    const outcome=failed&&!healthy||uploadIncomplete&&!sent?'source_failed':currentPolicies.some(parent=>this.config.allowedSources.includes(parent.header.manifest.scope.source))||this.state.sessionIsolations().some(item=>item.active&&this.config.allowedSources.includes(item.source))||failed||classified.blocking.length||reviewTotal||uploadIncomplete?'partial_success':sent?'complete_success':'no_change';
    this.state.set('lastCollectionReport',{outcome,sourceReports,quarantineNew,newTokens,uploadedTokens,tokenDeltaKnown:newTokens!==null});
    return {sent,newTokens,uploadedTokens,tokenDeltaKnown:newTokens!==null,reviewTotal,reviewNew,held:this.state.heldCount(),warnings:classified.warnings.length,blockingIssues:classified.blocking.length,
      outcome,quarantineNew,sourceReports,...this.state.status()};
  }
  private async upload(signal?:AbortSignal){
    this.state.set('activity','uploading');let sent=0,newTokens:number|null=0,uploadedTokens=0;for(let round=0;round<100&&!signal?.aborted;round++){
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
          const tokens=this.state.batchTokens(batch),previousTokens=this.state.confirmedTokenTotal(String(row.scope))??(header.manifest.parent?undefined:0);
          this.state.acknowledge(batch,confirmed.receipt);uploadedTokens+=tokens;
          if(previousTokens===undefined)newTokens=null;else if(newTokens!==null)newTokens+=tokens-previousTokens;
          this.state.set('lastReportAt',new Date().toISOString());this.state.set('lastErrorCode',null);sent++;progress=true;
        }catch(error){const remote=error instanceof RemoteError?error:undefined,code=remote?.code??'LOCAL_SYNC_FAILED';
          const permanent=!!remote&&[400,403,409,413].includes(remote.status);const retry=Math.max(remote?.retryMs??0,Math.min(300000,1000*2**Math.min(Number(row.attempts),8))*(1+Math.random()*.2));
          this.state.fail(batch,code,permanent,retry);if(remote?.status===401||remote?.status===429||remote?.status===503)break;
        }
      }if(!progress)break;
    }
    return {sent,newTokens,uploadedTokens};
  }
  async flush(signal?:AbortSignal){
    if(this.running)return this.running;
    this.running=this.upload(signal).finally(()=>{this.running=undefined;this.state.set('activity','idle');});
    return this.running;
  }
}
