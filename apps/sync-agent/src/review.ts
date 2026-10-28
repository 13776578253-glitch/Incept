import {hash} from '../../../packages/dashboard/src/adapters/local/imports/identity';
import type {AgentState} from './state';
import type {AgentHttp} from './transport';
import type {SyncHeader,SyncReceipt,SyncScope} from '../../../packages/dashboard/src/domain/sync';
import type {ParentCapture} from '../../../packages/dashboard/src/agent/capture';

export async function resumeReviewed(state:AgentState,http:AgentHttp,batch:string) {
  const row=state.db.prepare("SELECT header_json FROM outbox WHERE batch=? AND state='review'").get(batch);
  if(!row)throw Error('REVIEW_BATCH_REQUIRED');
  const header=JSON.parse(String(row.header_json)) as SyncHeader,scope=header.manifest.scope;
  const binding=await http.request<{scope:unknown;headManifest:string}>('/scopes/resolve','POST',{source:scope.source,sessionId:scope.sessionId});
  if(hash(binding.scope)!==hash(scope))throw Error('REVIEW_SCOPE_MISMATCH');
  const result=await http.request<{receipt?:SyncReceipt;review?:{id:number;resolution:{disposition:string;committedSuccessor?:string}|null}}>('/batches/'+batch,'GET',undefined,[200,409]);
  if(!result.receipt)throw Error('REVIEW_RECEIPT_REQUIRED');
  if(result.review?.resolution){
    const resolution=result.review.resolution;
    state.supersedeBatch(batch,resolution.disposition==='accepted-successor'?'REVIEW_ACCEPTED_SUCCESSOR':'REVIEW_DISMISSED');
    return {confirmed:false,superseded:true,dataRevision:result.receipt.dataRevision};
  }
  if(result.receipt.status==='review-required'){
    state.markReviewRequired(batch,result.receipt,result.receipt.code);
    return {confirmed:false,reviewRequired:true,dataRevision:result.receipt.dataRevision};
  }
  if(result.receipt.status!=='committed')throw Error('REVIEW_RECEIPT_INVALID');
  state.acknowledge(batch,result.receipt);
  return {confirmed:true,dataRevision:result.receipt.dataRevision};
}

// Owner rebases change the server head outside the receipt flow. Refresh the
// local parent from the committed server head and drop candidates that were
// built on the old parent. The next capture creates one fresh pending batch.
export async function reconcileHeads(state:AgentState,http:AgentHttp,options:{session?:string}={}) {
  const rows=state.db.prepare("SELECT scope,header_json FROM outbox WHERE state IN ('pending','review','held','lineage') ORDER BY serial").all() as Array<{scope:string;header_json:string}>;
  const scopes=new Map<string,SyncScope>();
  for(const row of rows){const header=JSON.parse(String(row.header_json)) as SyncHeader,scope=header.manifest.scope;if(options.session&&scope.sessionId!==options.session)continue;scopes.set(String(row.scope),scope);}
  const reconciled=[] as Array<{session:string;head:string;superseded:number}>,skipped=[] as Array<{session:string;reason:string}>;
  for(const [key,scope] of scopes){
    if(state.db.prepare("SELECT 1 FROM outbox WHERE scope=? AND state='quarantined' LIMIT 1").get(key)){skipped.push({session:scope.sessionId,reason:'QUARANTINED'});continue;}
    let admission:{scope:unknown;status?:string;headManifest?:string|null;head?:SyncHeader|null};
    try{admission=await http.request('/scopes/resolve','POST',{source:scope.source,sessionId:scope.sessionId},[200,409]);}
    catch(error){skipped.push({session:scope.sessionId,reason:error instanceof Error?error.message:'RESOLVE_FAILED'});continue;}
    if(admission.status==='review-required'||!admission.head||!admission.headManifest){skipped.push({session:scope.sessionId,reason:admission.status??'HEAD_UNAVAILABLE'});continue;}
    if(hash(admission.scope)!==hash(scope)||hash(admission.head.manifest.scope)!==hash(scope)||admission.head.manifest.manifestHash!==admission.headManifest){skipped.push({session:scope.sessionId,reason:'HEAD_MISMATCH'});continue;}
    const localParent=state.tail(key)?.parent;
    if(localParent?.header.manifest.manifestHash===admission.headManifest){skipped.push({session:scope.sessionId,reason:'ALREADY_CURRENT'});continue;}
    const parent:ParentCapture={header:admission.head,proofs:admission.head.manifest.ranges.map(range=>({range,parts:localParent?.proofs.find(proof=>proof.range.locatorHash===range.locatorHash)?.parts}))};
    const superseded=state.reconcileWith(key,parent,hash(['owner-rebase/reconcile/1',admission.headManifest]));
    reconciled.push({session:scope.sessionId,head:admission.headManifest,superseded});
  }
  return {reconciled,skipped};
}
