export type RemoteErrorMeta={fromJson?:boolean;pathCategory?:string;stage?:string;durationMs?:number;requestId?:string;retryAfterHeader?:string};
export class RemoteError extends Error{
  readonly fromJson:boolean;
  readonly pathCategory?:string;
  readonly stage?:string;
  readonly durationMs?:number;
  readonly requestId?:string;
  readonly retryAfterHeader?:string;
  constructor(readonly code:string,readonly status:number,readonly retryMs=1000,readonly receipt?:unknown,meta:RemoteErrorMeta={}){
    super(code);
    this.fromJson=meta.fromJson??true;
    this.pathCategory=meta.pathCategory;
    this.stage=meta.stage;
    this.durationMs=meta.durationMs;
    this.requestId=meta.requestId;
    this.retryAfterHeader=meta.retryAfterHeader;
  }
}
export function validateEndpoint(value:string,allowLoopbackHttp=false){const url=new URL(value);if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||url.protocol!=='https:'&&!(allowLoopbackHttp&&url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)))throw Error('HTTPS_ENDPOINT_REQUIRED');return url.origin;}
function classifyRequest(method:string,path:string):{pathCategory:string;stage:string}{
  if(path==='/agent')return {pathCategory:'/agent',stage:'identity'};
  if(path==='/scopes/resolve')return {pathCategory:'/scopes/resolve',stage:'resolve'};
  if(path==='/batches'&&method==='POST')return {pathCategory:'/batches',stage:'begin'};
  if(/^\/batches\/[a-zA-Z0-9_-]+$/.test(path))return {pathCategory:'/batches/:batch',stage:'status'};
  if(/^\/batches\/[a-zA-Z0-9_-]+\/pages\/\d+$/.test(path))return {pathCategory:'/batches/:batch/pages/:offset',stage:'stage'};
  if(/^\/batches\/[a-zA-Z0-9_-]+\/commit$/.test(path))return {pathCategory:'/batches/:batch/commit',stage:'commit'};
  if(path==='/agent/jobs')return {pathCategory:'/agent/jobs',stage:'job-discover'};
  if(/^\/agent\/jobs\/[a-zA-Z0-9_-]+\/start$/.test(path))return {pathCategory:'/agent/jobs/:id/start',stage:'job-start'};
  if(/^\/agent\/jobs\/[a-zA-Z0-9_-]+\/complete$/.test(path))return {pathCategory:'/agent/jobs/:id/complete',stage:'job-complete'};
  if(/^\/agent\/jobs\/[a-zA-Z0-9_-]+\/fail$/.test(path))return {pathCategory:'/agent/jobs/:id/fail',stage:'job-fail'};
  return {pathCategory:'other',stage:'request'};
}
function parseRetryAfter(header:string|null|undefined,fallbackMs=1000):number{
  if(!header)return fallbackMs;
  const trimmed=header.trim();
  const seconds=Number(trimmed);
  if(trimmed!==''&&Number.isFinite(seconds)&&seconds>0)return Math.min(Math.round(seconds*1000),3600000);
  const at=Date.parse(trimmed);
  if(Number.isFinite(at)){const delta=at-Date.now();if(delta>0)return Math.min(delta,3600000);}
  return fallbackMs;
}
function safeHeader(value:string|null):string|undefined{
  const trimmed=value?.trim();
  return trimmed&&trimmed.length<=128&&!/[\r\n\x00-\x1f]/.test(trimmed)?trimmed:undefined;
}
export class AgentHttp {
  private last=0;
  constructor(readonly endpoint:string,private token:string,readonly options:{allowLoopbackHttp?:boolean;paceMs?:number;signal?:AbortSignal;timeoutMs?:number}={}){validateEndpoint(endpoint,options.allowLoopbackHttp);}
  async request<T=ApiReply>(path:string,method='GET',body?:unknown,allowed=[200]):Promise<T>{
    if(!/^\/[a-zA-Z0-9_/-]*$/.test(path))throw Error('INVALID_API_PATH');
    const wait=Math.max(0,(this.options.paceMs??370)-(Date.now()-this.last));if(wait)await new Promise<void>((resolve,reject)=>{const signal=this.options.signal;const done=()=>{signal?.removeEventListener('abort',abort);resolve();};const t=setTimeout(done,wait);const abort=()=>{clearTimeout(t);signal?.removeEventListener('abort',abort);reject(new RemoteError('STOPPED',503));};if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});});
    this.last=Date.now();let response:Response;
    const {pathCategory,stage}=classifyRequest(method,path);
    const startedAt=Date.now();
    // The server serializes sync jobs on one worker; a queued page commit can make a
    // single request wait well past 20s. Give the server room before declaring a
    // transport failure, which would otherwise abort the whole upload round.
    for(let attempt=0;;attempt++){
      const timeout=AbortSignal.timeout(this.options.timeoutMs??120_000);
      try{response=await fetch(this.endpoint+'/api/dashboard/sync'+path,{method,redirect:'error',headers:{authorization:'Bearer '+this.token,...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:this.options.signal?AbortSignal.any([this.options.signal,timeout]):timeout});break;}
      catch(error){
        if(this.options.signal?.aborted)throw new RemoteError('STOPPED',503,1000,undefined,{fromJson:false,pathCategory,stage,durationMs:Date.now()-startedAt});
        if(attempt>=4)throw new RemoteError('NETWORK_UNAVAILABLE',503,5000,undefined,{fromJson:false,pathCategory,stage,durationMs:Date.now()-startedAt});
        await new Promise<void>(resolve=>setTimeout(resolve,250*2**attempt));
      }
    }
    let bytes=0,text='',bodyTooLarge=false;const decoder=new TextDecoder();
    if(response.body){
      for await(const chunk of response.body as unknown as AsyncIterable<Uint8Array>){
        bytes+=chunk.byteLength;
        if(bytes>256*1024){bodyTooLarge=true;break;}
        text+=decoder.decode(chunk,{stream:true});
      }
    }
    if(!bodyTooLarge)text+=decoder.decode();
    const durationMs=Date.now()-startedAt;
    const requestId=safeHeader(response.headers.get('x-request-id'));
    const retryAfterHeader=safeHeader(response.headers.get('retry-after'));
    let parsed:ApiReply|undefined,jsonValid=false;
    if(!bodyTooLarge&&text.trim().length>0){
      try{
        const candidate=JSON.parse(text);
        if(candidate&&typeof candidate==='object'&&!Array.isArray(candidate)){parsed=candidate as ApiReply;jsonValid=true;}
      }catch{jsonValid=false;}
    }
    const baseMeta:RemoteErrorMeta={fromJson:jsonValid,pathCategory,stage,durationMs,requestId,retryAfterHeader};
    if(allowed.includes(response.status)){
      if(bodyTooLarge)throw new RemoteError('RESPONSE_TOO_LARGE',response.status,parseRetryAfter(retryAfterHeader,1000),undefined,{...baseMeta,fromJson:false});
      if(!jsonValid)throw new RemoteError('INVALID_JSON_RESPONSE',response.status,parseRetryAfter(retryAfterHeader,1000),undefined,{...baseMeta,fromJson:false});
      if(response.status===404&&parsed?.error!=='BATCH_NOT_FOUND')throw new RemoteError('INVALID_NOT_FOUND_RESPONSE',404,parseRetryAfter(retryAfterHeader,1000),undefined,{...baseMeta,fromJson:false});
      return parsed as T;
    }
    if(jsonValid){
      const raw=parsed?.error??parsed?.code??parsed?.receipt?.code;
      if(typeof raw==='string'&&/^[A-Z][A-Z0-9_]{0,80}$/.test(raw)){
        const fallbackRetry=[429,502,503,504].includes(response.status)?5000:1000;
        throw new RemoteError(raw,response.status,parseRetryAfter(retryAfterHeader,fallbackRetry),parsed?.receipt,{...baseMeta,fromJson:true});
      }
    }
    if(response.status===504)throw new RemoteError('UPSTREAM_TIMEOUT',504,parseRetryAfter(retryAfterHeader,5000),undefined,{...baseMeta,fromJson:false});
    if(response.status===502||response.status===503)throw new RemoteError('UPSTREAM_UNAVAILABLE',response.status,parseRetryAfter(retryAfterHeader,5000),undefined,{...baseMeta,fromJson:false});
    if(response.status===429)throw new RemoteError('RATE_LIMITED',429,parseRetryAfter(retryAfterHeader,5000),undefined,{...baseMeta,fromJson:false});
    if(response.status===401)throw new RemoteError('UNAUTHENTICATED',401,parseRetryAfter(retryAfterHeader,1000),undefined,{...baseMeta,fromJson:false});
    if(response.status===403)throw new RemoteError('FORBIDDEN',403,parseRetryAfter(retryAfterHeader,1000),undefined,{...baseMeta,fromJson:false});
    throw new RemoteError('REMOTE_HTTP_ERROR',response.status,parseRetryAfter(retryAfterHeader,1000),undefined,{...baseMeta,fromJson:false});
  }
}
import type {SyncReceipt,SyncScope} from '../../../packages/dashboard/src/domain/sync';
type ApiReply={deviceId?:unknown;allowedSources?:unknown;scope?:SyncScope;headManifest?:string|null;state?:string;receipt?:SyncReceipt;nextOffset?:number;error?:unknown;code?:unknown};
