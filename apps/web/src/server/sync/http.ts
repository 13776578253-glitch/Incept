import { randomUUID } from 'node:crypto';
import { SyncTransportError } from '@incept/dashboard/sync';

export const HTTP_LIMITS={headerBytes:144*1024,pageBytes:544*1024,managementBytes:4096,bodyTimeoutMs:10_000} as const;
export async function boundedJson(request:Request,limit:number,allowEmpty=false):Promise<Record<string,unknown>> {
  const json=request.headers.get('content-type')?.split(';')[0]==='application/json';
  if(!json&&!allowEmpty)throw new SyncTransportError('JSON_REQUIRED',400,0);
  const declared=request.headers.get('content-length');
  if(declared&&(!/^\d+$/.test(declared)||Number(declared)>limit))throw new SyncTransportError('REQUEST_BODY_LIMIT',413,0);
  if(!request.body){if(allowEmpty)return {};throw new SyncTransportError('BODY_REQUIRED',400,0);}
  const reader=request.body.getReader(),parts:Uint8Array[]=[];let size=0,timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;void reader.cancel();},HTTP_LIMITS.bodyTimeoutMs);
  try {
    while(true) {const row=await reader.read();if(row.done)break;size+=row.value.byteLength;
      if(size>limit){await reader.cancel();throw new SyncTransportError('REQUEST_BODY_LIMIT',413,0);}parts.push(row.value);}
    if(timedOut)throw new SyncTransportError('REQUEST_BODY_TIMEOUT',408,2);
    if(!size&&allowEmpty)return {};
    if(!json)throw new SyncTransportError('JSON_REQUIRED',400,0);
    const input:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));
    if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('json');return input as Record<string,unknown>;
  }catch(error){if(timedOut)throw new SyncTransportError('REQUEST_BODY_TIMEOUT',408,2);if(error instanceof SyncTransportError)throw error;throw new SyncTransportError('INVALID_JSON',400,0);}
  finally{clearTimeout(timer);reader.releaseLock();}
}
export function exactFields(value:Record<string,unknown>,allowed:string[]) {
  if(Object.keys(value).some(k=>!allowed.includes(k)))throw new SyncTransportError('UNEXPECTED_FIELD',400,0);
}
export function safeId(value:unknown):string {
  if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(value))throw new SyncTransportError('INVALID_ID',400,0);return value;
}
export function response(value:unknown,status=200,requestId=randomUUID(),retryAfter?:number) {
  return Response.json({...value as object,requestId},{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(retryAfter?{'Retry-After':String(retryAfter)}:{})}});
}
export class DeviceRequestLimiter {
  private buckets=new Map<string,{count:number;until:number}>();
  constructor(readonly maximum=180,readonly windowMs=60_000){}
  check(device:string,now=Date.now()) {
    for(const[key,row]of this.buckets)if(row.until<=now)this.buckets.delete(key);
    const row=this.buckets.get(device);
    if((!row&&this.buckets.size>=10_000)||row&&row.count>=this.maximum)throw new SyncTransportError('RATE_LIMITED',429,Math.max(1,Math.ceil(((row?.until??now+this.windowMs)-now)/1000)));
    this.buckets.set(device,{count:(row?.count??0)+1,until:row?.until??now+this.windowMs});
  }
}
export class PreAuthRequestLimiter {
  private buckets=new Map<string,{count:number;until:number}>();
  constructor(readonly maximum=600,readonly windowMs=60_000){}
  check(client:string,now=Date.now()) {
    for(const[key,row]of this.buckets)if(row.until<=now)this.buckets.delete(key);
    const row=this.buckets.get(client);
    if((!row&&this.buckets.size>=10_000)||row&&row.count>=this.maximum)throw new SyncTransportError('RATE_LIMITED',429,Math.max(1,Math.ceil(((row?.until??now+this.windowMs)-now)/1000)));
    this.buckets.set(client,{count:(row?.count??0)+1,until:row?.until??now+this.windowMs});
  }
}
