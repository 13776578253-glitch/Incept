import {hash} from '../../../packages/dashboard/src/adapters/local/imports/identity';
import type {AgentState} from './state';
import type {AgentHttp} from './transport';
import type {SyncHeader,SyncReceipt} from '../../../packages/dashboard/src/domain/sync';

export async function resumeReviewed(state:AgentState,http:AgentHttp,batch:string) {
  const row=state.db.prepare("SELECT header_json FROM outbox WHERE batch=? AND state='review'").get(batch);
  if(!row)throw Error('REVIEW_BATCH_REQUIRED');
  const header=JSON.parse(String(row.header_json)) as SyncHeader,scope=header.manifest.scope;
  const binding=await http.request<{scope:unknown;headManifest:string}>('/scopes/resolve','POST',{source:scope.source,sessionId:scope.sessionId});
  if(hash(binding.scope)!==hash(scope))throw Error('REVIEW_SCOPE_MISMATCH');
  const result=await http.request<{receipt?:SyncReceipt}>('/batches/'+batch);
  if(!result.receipt)throw Error('REVIEW_RECEIPT_REQUIRED');
  if(result.receipt.status==='review-required'){
    state.markReviewRequired(batch,result.receipt,result.receipt.code);
    return {confirmed:false,reviewRequired:true,dataRevision:result.receipt.dataRevision};
  }
  if(result.receipt.status!=='committed')throw Error('REVIEW_RECEIPT_INVALID');
  state.acknowledge(batch,result.receipt);
  return {confirmed:true,dataRevision:result.receipt.dataRevision};
}
