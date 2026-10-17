import {createHmac,createHash,randomUUID,timingSafeEqual} from 'node:crypto';
export class RpcError extends Error {constructor(readonly code:string,readonly status=503){super(code);}}
export const rpcDigest=(body:string)=>createHash('sha256').update(body).digest('hex');
function key(value:string){if(!/^[a-f0-9]{64,128}$/i.test(value))throw new RpcError('RPC_NOT_CONFIGURED');return value;}
const signature=(secret:string,method:string,path:string,at:string,nonce:string,body:string)=>createHmac('sha256',key(secret)).update([method,path,at,nonce,rpcDigest(body)].join('\n')).digest('hex');
export function rpcHeaders(secret:string,path:string,body:string){const at=String(Date.now()),nonce=randomUUID();return {'content-type':'application/json','x-incept-at':at,'x-incept-nonce':nonce,'x-incept-signature':signature(secret,'POST',path,at,nonce,body)};}
export class RpcVerifier {
  private nonces=new Map<string,number>();
  constructor(readonly secret:string){key(secret);}
  verify(request:Request,body:string){
    const url=new URL(request.url),at=request.headers.get('x-incept-at')??'',nonce=request.headers.get('x-incept-nonce')??'',supplied=request.headers.get('x-incept-signature')??'';
    if(request.method!=='POST'||url.search||body.length>32768||!/^\d{13}$/.test(at)||Math.abs(Date.now()-Number(at))>30000||!/^[a-f0-9-]{36}$/.test(nonce)||!/^[a-f0-9]{64}$/.test(supplied))throw new RpcError('RPC_FORBIDDEN',403);
    const expected=signature(this.secret,'POST',url.pathname,at,nonce,body);
    if(!timingSafeEqual(Buffer.from(expected),Buffer.from(supplied)))throw new RpcError('RPC_FORBIDDEN',403);
    for(const [id,time] of this.nonces)if(time<Date.now()-30000)this.nonces.delete(id);
    if(this.nonces.has(nonce))throw new RpcError('RPC_REPLAY',409);if(this.nonces.size>=4096)throw new RpcError('RPC_BUSY',429);this.nonces.set(nonce,Number(at));
  }
}
export async function rpcCall<T>(base:string,path:string,secret:string,value:unknown):Promise<T>{
  const url=new URL(base);if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!['http:','https:'].includes(url.protocol))throw new RpcError('INVALID_RPC_ENDPOINT');
  const body=JSON.stringify(value);if(Buffer.byteLength(body)>32768)throw new RpcError('RPC_BODY_LIMIT',413);
  const result=await fetch(url.origin+path,{method:'POST',redirect:'error',headers:rpcHeaders(secret,path,body),body,signal:AbortSignal.timeout(5000)}).catch(()=>{throw new RpcError('RPC_UNAVAILABLE');});
  if(!result.ok)throw new RpcError('RPC_REJECTED',result.status);const text=await result.text();if(Buffer.byteLength(text)>65536)throw new RpcError('RPC_BODY_LIMIT');return JSON.parse(text) as T;
}
