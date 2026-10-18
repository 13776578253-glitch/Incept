import {randomUUID} from 'node:crypto';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {hash} from '../../../packages/dashboard/src/adapters/local/imports/identity';
import {buildCandidate, captureHome, type ParentCapture} from '../../../packages/dashboard/src/agent/capture';
import type {SyncHeader} from '../../../packages/dashboard/src/domain/sync';
import type {AgentState} from './state';
import {scopeKey} from './state';
import type {AgentHttp} from './transport';
import type {Config} from './engine';

// Owner adoption must happen before this runs. The held/review candidate is
// superseded only after the server exposes a committed head for the same scope.
export async function resumeHeld(state:AgentState,http:AgentHttp,config:Config,batch:string){
  const row=state.db.prepare("SELECT header_json FROM outbox WHERE batch=? AND state IN ('review','held')").get(batch);
  if(!row)throw Error('REVIEW_BATCH_REQUIRED');
  const header=JSON.parse(String(row.header_json)) as SyncHeader,scope=header.manifest.scope;
  const admission=await http.request<{scope:unknown;status?:string;code?:string;headManifest?:string|null;head?:SyncHeader|null}>('/scopes/resolve','POST',{source:scope.source,sessionId:scope.sessionId});
  if(admission.status==='review-required'||!admission.head)throw Error('REVIEW_NOT_RESOLVED');
  if(hash(admission.scope)!==hash(scope)||hash(admission.head.manifest.scope)!==hash(scope)||admission.head.manifest.manifestHash!==admission.headManifest)throw Error('REVIEW_HEAD_MISMATCH');
  const parent:ParentCapture={header:admission.head,proofs:admission.head.manifest.ranges.map(range=>({range}))};
  const snapshot=mkdtempSync(join(tmpdir(),'incept-resume-'));
  try{
    const captured=await captureHome(config.home,snapshot,config.allowedSources,[parent]);
    const capture=captured.captures.find(c=>c.source===scope.source&&c.sessionId===scope.sessionId);
    if(!capture)throw Error('REVIEW_SOURCE_UNAVAILABLE');
    const candidate=buildCandidate(capture,scope,parent,randomUUID());
    const signature=hash([capture.reader,capture.records,capture.proofs.map(p=>[p.range.locatorHash,p.range.identityHash,p.range.root])]);
    const superseded=state.resumeWith(scopeKey(scope.source,scope.sessionId),candidate,signature,parent);
    return {resumed:true,batch:candidate.header.batchId,superseded,dataRevision:null};
  }finally{rmSync(snapshot,{recursive:true,force:true});}
}
