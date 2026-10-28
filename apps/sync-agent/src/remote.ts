import {randomUUID} from 'node:crypto';
import type {AgentState} from './state';
import {AgentHttp,RemoteError} from './transport';
import type {Config} from './engine';
import {hash} from '../../../packages/dashboard/src/adapters/local/imports/identity';
import {syncScopeId} from '../../../packages/dashboard/src/adapters/local/imports/sync/contract';
type Command={jobId:string;expiresAt:string;connectionId:string};
type Completion={scanId:string;collectedAt:string;issues:number;pending:number;review:number;batches:string[];lineageHash:string;
  reviewTotal?:number;reviewNew?:number;held?:number;warnings?:number;blockingIssues?:number;newTokens?:number};
type RunSummary={newTokens?:number;reviewTotal?:number;reviewNew?:number;held?:number;warnings?:number;blockingIssues?:number};
export class RemoteLink {
  private socket?:WebSocket;private retry?:ReturnType<typeof setTimeout>;private heartbeat?:ReturnType<typeof setTimeout>;private attempts=0;private stopped=false;private connection='';private lastDiscovery=0;
  constructor(readonly state:AgentState,readonly config:Config,readonly http:AgentHttp,private token:string,readonly notify:()=>void){}
  start(){this.connect();}
  stop(){this.stopped=true;clearTimeout(this.retry);clearTimeout(this.heartbeat);this.socket?.close();this.state.set('remoteOnline',false);}
  private connect(){if(this.stopped)return;const url=new URL('/api/sync/ws',this.config.endpoint);url.protocol=url.protocol==='https:'?'wss:':'ws:';if(url.protocol!=='wss:'&&!this.config.allowLoopbackHttp)throw Error('WSS_REQUIRED');
    const socket=new WebSocket(url);this.socket=socket;const timeout=setTimeout(()=>socket.close(),7000);let ready=false;
    socket.addEventListener('open',()=>{try{socket.send(JSON.stringify({type:'auth',token:this.token}));}catch{socket.close();}});
    socket.addEventListener('message',event=>{if(this.stopped)return;try{if(typeof event.data!=='string'||Buffer.byteLength(event.data)>4096)throw Error('PROTOCOL');const value=JSON.parse(event.data);
      if(value.type==='ready'&&value.deviceId===this.config.deviceId&&typeof value.connectionId==='string'&&!ready){ready=true;this.connection=value.connectionId;this.attempts=0;clearTimeout(timeout);this.state.set('remoteOnline',true);this.armHeartbeat(socket);this.pong(socket);void this.discover();return;}
      if(!ready)throw Error('PROTOCOL');if(value.type==='ping'){this.pong(socket);this.armHeartbeat(socket);return;}
      if(value.type!=='sync_now'||value.connectionId!==this.connection)throw Error('PROTOCOL');this.accept(value);
    }catch{socket.close(1008,'protocol');}});
    socket.addEventListener('error',()=>{});socket.addEventListener('close',()=>{clearTimeout(timeout);clearTimeout(this.heartbeat);if(!this.stopped){this.state.set('remoteOnline',false);this.retry=setTimeout(()=>this.connect(),Math.min(60000,1000*2**Math.min(this.attempts++,6))*(.8+Math.random()*.4));}});
  }
  private armHeartbeat(socket:WebSocket){clearTimeout(this.heartbeat);this.heartbeat=setTimeout(()=>socket.close(),75000);}
  private pong(socket:WebSocket){socket.send(JSON.stringify({type:'pong',status:{lastCollectedAt:this.state.get('lastCollectedAt'),lastReportAt:this.state.get('lastReportAt'),activity:this.state.get('activity')??'idle'}}));}
  private accept(command:Command){if(!/^[a-f\d-]{36}$/i.test(command.jobId)||!Number.isFinite(Date.parse(command.expiresAt))||Date.parse(command.expiresAt)<=Date.now())return;
    const inserted=this.state.db.prepare("INSERT OR IGNORE INTO remote_jobs(id,expires_at,state) VALUES(?,?,'pending')").run(command.jobId,Date.parse(command.expiresAt));if(inserted.changes)this.notify();
  }
  async discover(){if(this.stopped||Date.now()-this.lastDiscovery<30000)return;this.lastDiscovery=Date.now();try{const result=await this.http.request<{job:{id:string;expiresAt:string}|null}>('/agent/jobs');if(result.job)this.accept({jobId:result.job.id,expiresAt:result.job.expiresAt,connectionId:this.connection});}catch{}}
  hasPending(){return !!this.state.db.prepare("SELECT 1 FROM remote_jobs WHERE state IN ('pending','running','reporting') AND next_retry<=? LIMIT 1").get(Date.now());}
  async execute(run:()=>Promise<unknown>){const row=this.state.db.prepare("SELECT * FROM remote_jobs WHERE state IN ('pending','running','reporting') AND next_retry<=? ORDER BY expires_at LIMIT 1").get(Date.now());if(!row)return;
    const id=String(row.id);if(Number(row.expires_at)<=Date.now()){this.state.db.prepare("UPDATE remote_jobs SET state='expired' WHERE id=?").run(id);return;}
    const telemetry=setInterval(()=>{if(!this.stopped&&this.socket?.readyState===1){try{this.pong(this.socket);}catch{this.socket.close();}}},1000);telemetry.unref();
    try{let completion:Completion|undefined=row.result_json?JSON.parse(String(row.result_json)):undefined;
      if(!completion){await this.http.request('/agent/jobs/'+id+'/start','POST',{});const cursor=row.cursor===null?Number(this.state.db.prepare('SELECT COALESCE(MAX(rowid),0) n FROM receipts').get()!.n):Number(row.cursor);
        this.state.db.prepare("UPDATE remote_jobs SET state='running',cursor=? WHERE id=?").run(cursor,id);
        const runResult=await run() as RunSummary|undefined;
        const summary=runResult??{};
        const batches=this.state.db.prepare('SELECT batch FROM receipts WHERE rowid>? ORDER BY rowid LIMIT 257').all(cursor).map(r=>String(r.batch));if(batches.length>256)throw Error('JOB_RECEIPT_LIMIT');
        // A transient upload interruption is recoverable within this durable
        // Job. Keep its receipt cursor and retry before freezing a completion.
        if(this.state.db.prepare("SELECT 1 FROM outbox WHERE state='pending' LIMIT 1").get())throw new RemoteError('UPLOAD_PENDING',503,5000);
        const heads=this.state.db.prepare('SELECT parent_json FROM lineage').all().map(row=>{const m=JSON.parse(String(row.parent_json)).header.manifest;return [syncScopeId(m.scope),m.manifestHash,m.generationId,0];}).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
        const counts=this.state.db.prepare('SELECT state,COUNT(*) n FROM outbox GROUP BY state').all();
        const total=(state:string)=>counts.filter(r=>r.state===state).reduce((n,r)=>n+Number(r.n),0);
        const issues=this.state.get<string[]>('issues')??[];
        completion={scanId:randomUUID(),collectedAt:this.state.get<string>('lastCollectedAt')??new Date(0).toISOString(),issues:issues.length,pending:total('pending'),review:total('review'),batches,lineageHash:hash(heads),
          reviewTotal:total('review'),reviewNew:summary.reviewNew??0,held:total('held'),warnings:summary.warnings??0,blockingIssues:summary.blockingIssues??issues.length,newTokens:summary.newTokens??0};
        this.state.db.prepare("UPDATE remote_jobs SET state='reporting',result_json=? WHERE id=?").run(JSON.stringify(completion),id);
      }
      const result=await this.http.request<{job:{status:string;dataRevision:number}}>('/agent/jobs/'+id+'/complete','POST',completion);this.state.db.prepare('UPDATE remote_jobs SET state=? WHERE id=?').run(result.job.status,id);this.state.set('lastRemoteJob',{id,status:result.job.status,dataRevision:result.job.dataRevision,reviewTotal:completion.reviewTotal??completion.review??0,reviewNew:completion.reviewNew??0,held:completion.held??0});
    }catch(error){const terminal=error instanceof RemoteError&&[400,403,404,409].includes(error.status);this.state.db.prepare('UPDATE remote_jobs SET state=?,attempts=attempts+1,next_retry=? WHERE id=?').run(terminal?'rejected':String(row.state),Date.now()+Math.max(error instanceof RemoteError?error.retryMs:1000,Math.min(60000,1000*2**Math.min(Number(row.attempts),6))),id);this.state.set('remoteError',error instanceof RemoteError?error.code:'REMOTE_JOB_RETRY');}
    finally{clearInterval(telemetry);}
  }
}
