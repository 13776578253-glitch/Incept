export class RemoteError extends Error{constructor(readonly code:string,readonly status:number,readonly retryMs=1000,readonly receipt?:unknown){super(code);}}
export function validateEndpoint(value:string,allowLoopbackHttp=false){const url=new URL(value);if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||url.protocol!=='https:'&&!(allowLoopbackHttp&&url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)))throw Error('HTTPS_ENDPOINT_REQUIRED');return url.origin;}
export class AgentHttp {
  private last=0;
  constructor(readonly endpoint:string,private token:string,readonly options:{allowLoopbackHttp?:boolean;paceMs?:number;signal?:AbortSignal;timeoutMs?:number}={}){validateEndpoint(endpoint,options.allowLoopbackHttp);}
  async request<T=ApiReply>(path:string,method='GET',body?:unknown,allowed=[200]):Promise<T>{
    if(!/^\/[a-zA-Z0-9_/-]*$/.test(path))throw Error('INVALID_API_PATH');
    const wait=Math.max(0,(this.options.paceMs??370)-(Date.now()-this.last));if(wait)await new Promise<void>((resolve,reject)=>{const signal=this.options.signal;const done=()=>{signal?.removeEventListener('abort',abort);resolve();};const t=setTimeout(done,wait);const abort=()=>{clearTimeout(t);signal?.removeEventListener('abort',abort);reject(new RemoteError('STOPPED',503));};if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});});
    this.last=Date.now();let response:Response;
    // The server serializes sync jobs on one worker; a queued page commit can make a
    // single request wait well past 20s. Give the server room before declaring a
    // transport failure, which would otherwise abort the whole upload round.
    const timeout=AbortSignal.timeout(this.options.timeoutMs??60_000);
    try{response=await fetch(this.endpoint+'/api/dashboard/sync'+path,{method,redirect:'error',headers:{authorization:'Bearer '+this.token,...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:this.options.signal?AbortSignal.any([this.options.signal,timeout]):timeout});}catch{throw new RemoteError('NETWORK_UNAVAILABLE',503);}
    let bytes=0,text='';const decoder=new TextDecoder();if(response.body)for await(const chunk of response.body as unknown as AsyncIterable<Uint8Array>){bytes+=chunk.byteLength;if(bytes>256*1024)throw new RemoteError('INVALID_RESPONSE',502);text+=decoder.decode(chunk,{stream:true});}text+=decoder.decode();
    let value;try{value=JSON.parse(text);}catch{throw new RemoteError('INVALID_RESPONSE',502);}
    if(!allowed.includes(response.status)){const raw=value?.error??value?.code??value?.receipt?.code,code=typeof raw==='string'&&/^[A-Z][A-Z0-9_]{0,80}$/.test(raw)?raw:'REMOTE_REJECTED';const retry=Number(response.headers.get('retry-after'));throw new RemoteError(code,response.status,Number.isFinite(retry)&&retry>0?Math.min(retry*1000,3600000):1000,value?.receipt);}
    return value;
  }
}
import type {SyncReceipt,SyncScope} from '../../../packages/dashboard/src/domain/sync';
type ApiReply={deviceId?:unknown;allowedSources?:unknown;scope?:SyncScope;headManifest?:string|null;state?:string;receipt?:SyncReceipt;nextOffset?:number;error?:unknown;code?:unknown};
