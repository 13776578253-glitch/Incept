// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- Explicit Node vendor declaration; the pinned bundled WS module has no .d.ts.
/// <reference path="./ws.d.ts" />
import {createServer as httpServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {createServer as httpsServer} from 'node:https';
import {randomUUID} from 'node:crypto';
import ws,{type Socket} from 'next/dist/compiled/ws';
import {RpcVerifier,rpcCall,RpcError} from '../../../packages/dashboard/src/sync/rpc';
type Identity={deviceId:string;version:number;policyHash:string;job?:{id:string;expiresAt:string}};
type Connection={socket:Socket;identity:Identity;alive:boolean;id:string;reported?:{lastCollectedAt?:string;lastReportAt?:string;activity?:string}};
export type GatewayOptions={webBase:string;secret:string;heartbeatMs?:number;maxConnections?:number;tls?:{key:Buffer;cert:Buffer}};
export function createGateway(options:GatewayOptions){
  const verifier=new RpcVerifier(options.secret),connections=new Map<string,Connection>(),sockets=new Set<Socket>();let stopping=false;
  const remote=<T>(op:string,value:unknown)=>rpcCall<T>(options.webBase,'/api/internal/sync/'+op,options.secret,value);
  async function valid(c:Connection){try{await remote('check',{deviceId:c.identity.deviceId,version:c.identity.version,policyHash:c.identity.policyHash});return connections.get(c.identity.deviceId)===c&&c.socket.readyState===1;}catch{c.socket.close(4003,'authorization unavailable');connections.delete(c.identity.deviceId);return false;}}
  const send=(c:Connection,job:{id:string;expiresAt:string})=>{if(Date.parse(job.expiresAt)<=Date.now()||c.socket.bufferedAmount>16384)throw new RpcError('DISPATCH_UNAVAILABLE');c.socket.send(JSON.stringify({type:'sync_now',jobId:job.id,expiresAt:job.expiresAt,connectionId:c.id}));};
  const handle=async(req:IncomingMessage,res:ServerResponse)=>{
    try{if(req.method==='GET'&&req.url==='/healthz'){res.writeHead(200,{'content-type':'application/json'}).end('{"ready":true}');return;}
      if(req.method!=='POST'||!['/rpc/status','/rpc/dispatch','/rpc/kick'].includes(req.url??'')){res.writeHead(404).end();return;}
      let text='';for await(const b of req){text+=b.toString();if(Buffer.byteLength(text)>32768)throw new RpcError('RPC_BODY_LIMIT',413);}
      const request=new Request('http://gateway'+req.url,{method:'POST',headers:req.headers as HeadersInit});verifier.verify(request,text);const body=JSON.parse(text);
      if(!Array.isArray(body.devices)||body.devices.length>100||body.devices.some((id:unknown)=>typeof id!=='string'||!/^[\da-f-]{36}$/i.test(id)))throw new RpcError('INVALID_RPC',400);
      const result:Record<string,unknown>={},reported:Record<string,Connection['reported']>={};
      for(const id of body.devices){const c=connections.get(id);if(req.url==='/rpc/kick'){c?.socket.close(4003,'credentials changed');connections.delete(id);result[id]=false;continue;}
        const online=!!c&&await valid(c);result[id]=online;if(online&&c?.reported)reported[id]=c.reported;
        if(req.url==='/rpc/dispatch'&&online){if(!body.job||!/^[\da-f-]{36}$/i.test(body.job.id)||!Number.isFinite(Date.parse(body.job.expiresAt)))throw new RpcError('INVALID_RPC',400);send(c!,body.job);}
      }
      res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'}).end(JSON.stringify({online:result,reported}));
    }catch(error){res.writeHead(error instanceof RpcError?error.status:503,{'content-type':'application/json'}).end(JSON.stringify({error:error instanceof RpcError?error.code:'GATEWAY_UNAVAILABLE'}));}
  };
  const server=options.tls?httpsServer(options.tls,(req,res)=>{void handle(req,res);}):httpServer((req,res)=>{void handle(req,res);});server.requestTimeout=10000;server.headersTimeout=10000;server.maxConnections=(options.maxConnections??100)+28;
  const wss=new ws.Server({noServer:true,maxPayload:4096,perMessageDeflate:false});
  server.on('upgrade',(req,socket,head)=>{
    if(stopping||req.url!=='/api/sync/ws'||req.headers['sec-websocket-protocol']||req.headers.authorization||sockets.size>=(options.maxConnections??100)){socket.destroy();return;}
    try{wss.handleUpgrade(req,socket,head,peer=>{sockets.add(peer);let connection:Connection|undefined,authenticating=false,messages=0,windowAt=Date.now();const timeout=setTimeout(()=>peer.close(4003,'authentication timeout'),5000);
      peer.on('error',()=>{});peer.on('close',()=>{clearTimeout(timeout);sockets.delete(peer);if(connection&&connections.get(connection.identity.deviceId)===connection)connections.delete(connection.identity.deviceId);});
      peer.on('pong',()=>{if(connection)connection.alive=true;});
      peer.on('message',(bytes:Buffer,binary:boolean)=>{void(async()=>{
        try{if(Date.now()-windowAt>=60000){windowAt=Date.now();messages=0;}if(++messages>120||binary)throw Error('protocol');const value=JSON.parse(bytes.toString());
          if(connection){if(value.type!=='pong'||Object.keys(value).some(k=>!['type','status'].includes(k)))throw Error('protocol');if(value.status){if(typeof value.status!=='object'||Object.keys(value.status).some(k=>!['lastCollectedAt','lastReportAt','activity'].includes(k))||Object.entries(value.status).some(([k,v])=>k==='activity'?!['idle','collecting','uploading'].includes(String(v)):typeof v!=='string'||v.length>40||!Number.isFinite(Date.parse(v))))throw Error('protocol');connection.reported=value.status;}connection.alive=true;return;}
          if(authenticating||value.type!=='auth'||typeof value.token!=='string'||!/^isync_[A-Za-z0-9_-]{43}$/.test(value.token)||Object.keys(value).length!==2)throw Error('protocol');authenticating=true;
          const identity=await remote<Identity>('auth',{token:value.token});if(peer.readyState!==1)return;
          connections.get(identity.deviceId)?.socket.close(4001,'connection replaced');connection={socket:peer,identity,alive:true,id:randomUUID()};connections.set(identity.deviceId,connection);clearTimeout(timeout);
          peer.send(JSON.stringify({type:'ready',deviceId:identity.deviceId,connectionId:connection.id,heartbeatMs:options.heartbeatMs??30000}));if(identity.job)send(connection,identity.job);
        }catch{peer.close(4003,'authentication or protocol rejected');}
      })();});
    });}catch{socket.destroy();}
  });
  const timer=setInterval(()=>{for(const c of connections.values())void(async()=>{try{if(!c.alive||!await valid(c)){c.socket.terminate();return;}c.alive=false;c.socket.ping();c.socket.send('{"type":"ping"}');}catch{c.socket.terminate();}})();},options.heartbeatMs??30000);timer.unref();
  return {server,stats:()=>({connections:connections.size,unauthenticated:sockets.size-connections.size,rssBytes:process.memoryUsage().rss}),close:async()=>{stopping=true;clearInterval(timer);for(const peer of sockets)peer.terminate();wss.close();server.closeAllConnections();await new Promise<void>(yes=>server.close(()=>yes()));}};
}
