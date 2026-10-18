import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {hash} from '../../../packages/dashboard/src/adapters/local/imports/identity';
import type {SyncReceipt} from '../../../packages/dashboard/src/domain/sync';
import type {ParentCapture,buildCandidate} from '../../../packages/dashboard/src/agent/capture';
export type Candidate=ReturnType<typeof buildCandidate>;
export const scopeKey=(source:string,sessionId:string)=>hash([source,sessionId]);
export class AgentState {
  readonly db:DatabaseSync;
  constructor(readonly directory:string){mkdirSync(directory,{recursive:true,mode:0o700});this.db=new DatabaseSync(join(directory,'state.db'));this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=1000;
    CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS lineage(scope TEXT PRIMARY KEY,parent_json TEXT NOT NULL,signature TEXT NOT NULL,receipt_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS heads(scope TEXT PRIMARY KEY,parent_json TEXT NOT NULL,signature TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS outbox(serial INTEGER PRIMARY KEY,batch TEXT NOT NULL UNIQUE,scope TEXT NOT NULL,header_json TEXT NOT NULL,proof_json TEXT NOT NULL,signature TEXT NOT NULL,state TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_retry INTEGER NOT NULL DEFAULT 0,error TEXT,admitted INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS outbox_scope ON outbox(scope,serial);
    CREATE TABLE IF NOT EXISTS records(batch TEXT NOT NULL,position INTEGER NOT NULL,json TEXT NOT NULL,PRIMARY KEY(batch,position));
    CREATE TABLE IF NOT EXISTS receipts(batch TEXT PRIMARY KEY,json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS commands(id TEXT PRIMARY KEY,kind TEXT NOT NULL,state TEXT NOT NULL,at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS remote_jobs(id TEXT PRIMARY KEY,expires_at INTEGER NOT NULL,state TEXT NOT NULL,cursor INTEGER,result_json TEXT,attempts INTEGER NOT NULL DEFAULT 0,next_retry INTEGER NOT NULL DEFAULT 0);
  `);}
  close(){this.db.close();}
  tx<T>(fn:()=>T):T{this.db.exec('BEGIN IMMEDIATE');try{const v=fn();this.db.exec('COMMIT');return v;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  set(key:string,value:unknown){this.db.prepare('INSERT INTO meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));}
  get<T>(key:string):T|undefined{const r=this.db.prepare('SELECT value FROM meta WHERE key=?').get(key);return r?JSON.parse(String(r.value)):undefined;}
  parents():ParentCapture[]{const all=new Map<string,ParentCapture>();for(const row of this.db.prepare('SELECT scope,parent_json FROM lineage').all())all.set(String(row.scope),JSON.parse(String(row.parent_json)));
    for(const row of this.db.prepare('SELECT scope,parent_json FROM heads').all())all.set(String(row.scope),JSON.parse(String(row.parent_json)));
    for(const row of this.db.prepare("SELECT scope,header_json,proof_json FROM outbox WHERE state IN ('pending','review','held') ORDER BY serial").all())all.set(String(row.scope),{header:JSON.parse(String(row.header_json)),proofs:JSON.parse(String(row.proof_json))});return [...all.values()];}
  tail(scope:string):{parent:ParentCapture;signature:string}|undefined {const row=this.db.prepare("SELECT header_json,proof_json,signature FROM outbox WHERE scope=? AND state IN ('pending','review','held') ORDER BY serial DESC LIMIT 1").get(scope);if(row)return {parent:{header:JSON.parse(String(row.header_json)),proofs:JSON.parse(String(row.proof_json))},signature:String(row.signature)};
    const head=this.db.prepare('SELECT parent_json,signature FROM lineage WHERE scope=?').get(scope)??this.db.prepare('SELECT parent_json,signature FROM heads WHERE scope=?').get(scope);return head?{parent:JSON.parse(String(head.parent_json)),signature:String(head.signature)}:undefined;}
  blocked(scope:string){return !!this.db.prepare("SELECT 1 FROM outbox WHERE scope=? AND state IN ('review','held') LIMIT 1").get(scope);}
  reviewBatches(){return this.db.prepare("SELECT batch FROM outbox WHERE state='review' ORDER BY serial").all().map(row=>String(row.batch));}
  reviewCount(){return Number(this.db.prepare("SELECT COUNT(*) n FROM outbox WHERE state='review'").get()!.n);}
  heldCount(){return Number(this.db.prepare("SELECT COUNT(*) n FROM outbox WHERE state='held'").get()!.n);}
  batchTokens(batch:string){return Number(this.db.prepare("SELECT COALESCE(SUM(json_extract(json,'$.event.inputTokens')+json_extract(json,'$.event.outputTokens')+json_extract(json,'$.event.cacheReadTokens')+json_extract(json,'$.event.cacheCreationTokens')+json_extract(json,'$.event.reasoningTokens')),0) n FROM records WHERE batch=?").get(batch)!.n);}
  private fits(c:Candidate,exclude?:string[]){const size=c.records.reduce((n,r)=>n+Buffer.byteLength(JSON.stringify(r)),0);
    const slots=exclude?.length?exclude.map(()=>'?').join(','):'';
    const used=exclude?.length?this.db.prepare(`SELECT COALESCE(SUM(length(CAST(json AS BLOB))),0) bytes FROM records WHERE batch NOT IN (${slots})`).get(...exclude):this.db.prepare('SELECT COALESCE(SUM(length(CAST(json AS BLOB))),0) bytes FROM records').get();
    return size<=128*1024**2&&size+Number(used!.bytes)<=256*1024**2;}
  private put(c:Candidate,signature:string,state:'pending'|'held'){const scope=scopeKey(c.header.manifest.scope.source,c.header.manifest.scope.sessionId);
    if(!this.fits(c))throw Error('OUTBOX_CAPACITY');
    this.db.prepare("INSERT INTO outbox(batch,scope,header_json,proof_json,signature,state) VALUES(?,?,?,?,?,?)").run(c.header.batchId,scope,JSON.stringify(c.header),JSON.stringify(c.proofs),signature,state);
    const insert=this.db.prepare('INSERT INTO records VALUES(?,?,?)');for(const [i,row] of c.records.entries())insert.run(c.header.batchId,i,JSON.stringify(row));}
  enqueue(c:Candidate,signature:string){this.tx(()=>{this.put(c,signature,'pending');});}
  hold(c:Candidate,signature:string){this.tx(()=>{const scope=scopeKey(c.header.manifest.scope.source,c.header.manifest.scope.sessionId);
    const current=this.db.prepare("SELECT batch,signature FROM outbox WHERE scope=? AND state='held' ORDER BY serial DESC LIMIT 1").get(scope);
    if(current&&String(current.signature)===signature)return;
    if(current&&!this.fits(c,[String(current.batch)]))throw Error('OUTBOX_CAPACITY');
    if(current){this.db.prepare("UPDATE outbox SET state='superseded' WHERE batch=?").run(current.batch);this.db.prepare('DELETE FROM records WHERE batch=?').run(current.batch);}
    this.put(c,signature,'held');});}
  supersedeScope(scope:string){return this.tx(()=>{const rows=this.db.prepare("SELECT batch FROM outbox WHERE scope=? AND state IN ('review','held')").all(scope);for(const row of rows){this.db.prepare("UPDATE outbox SET state='superseded' WHERE batch=?").run(row.batch);this.db.prepare('DELETE FROM records WHERE batch=?').run(row.batch);}return rows.length;});}
  resumeWith(scope:string,c:Candidate,signature:string,head?:ParentCapture){return this.tx(()=>{const rows=this.db.prepare("SELECT batch FROM outbox WHERE scope=? AND state IN ('review','held')").all(scope),batches=rows.map(row=>String(row.batch));
    if(!this.fits(c,batches))throw Error('OUTBOX_CAPACITY');for(const row of rows){this.db.prepare("UPDATE outbox SET state='superseded' WHERE batch=?").run(row.batch);this.db.prepare('DELETE FROM records WHERE batch=?').run(row.batch);}
    if(head&&!this.db.prepare('SELECT 1 FROM lineage WHERE scope=?').get(scope))this.db.prepare('INSERT INTO heads VALUES(?,?,?) ON CONFLICT(scope) DO UPDATE SET parent_json=excluded.parent_json,signature=excluded.signature').run(scope,JSON.stringify(head),hash(head.header.manifest.manifestHash));
    this.put(c,signature,'pending');return rows.length;});}
  pending(){return this.db.prepare("SELECT o.* FROM outbox o WHERE state='pending' AND next_retry<=? AND NOT EXISTS(SELECT 1 FROM outbox p WHERE p.scope=o.scope AND p.serial<o.serial AND p.state IN ('pending','review','held')) ORDER BY serial").all(Date.now());}
  renewExpired(batch:string,newBatch:string){this.tx(()=>{const row=this.db.prepare("SELECT header_json FROM outbox WHERE batch=? AND state='pending'").get(batch);if(!row)throw Error('OUTBOX_MISSING');const header=JSON.parse(String(row.header_json));header.batchId=newBatch;
    this.db.prepare('UPDATE records SET batch=? WHERE batch=?').run(newBatch,batch);this.db.prepare('UPDATE outbox SET batch=?,header_json=?,next_retry=0 WHERE batch=?').run(newBatch,JSON.stringify(header),batch);});}
  page(batch:string,offset:number){const page=[];let bytes=2;for(const row of this.db.prepare('SELECT json FROM records WHERE batch=? AND position>=? ORDER BY position LIMIT 500').iterate(batch,offset)){
    const text=String(row.json),size=Buffer.byteLength(text)+(page.length?1:0);if(bytes+size>512*1024)break;bytes+=size;page.push(JSON.parse(text));}if(!page.length)throw Error('EMPTY_PAGE');return page;}
  acknowledge(batch:string,receipt:SyncReceipt){this.tx(()=>{const row=this.db.prepare('SELECT * FROM outbox WHERE batch=?').get(batch);if(!row)throw Error('OUTBOX_MISSING');
    const header=JSON.parse(String(row.header_json));if(receipt.status!=='committed'||receipt.batchId!==batch||receipt.payloadHash!==hash(header)||receipt.generationId!==header.manifest.generationId||receipt.manifestHash!==header.manifest.manifestHash||!Number.isSafeInteger(receipt.dataRevision)||receipt.dataRevision<0)throw Error('RECEIPT_MISMATCH');
    const current=this.db.prepare('SELECT parent_json FROM lineage WHERE scope=?').get(row.scope as string)??this.db.prepare('SELECT parent_json FROM heads WHERE scope=?').get(row.scope as string);const old=current?JSON.parse(String(current.parent_json)).header.manifest:undefined;
    if(header.manifest.parent&&(header.manifest.parent.manifestHash!==old?.manifestHash||header.manifest.parent.generationId!==old?.generationId)||!header.manifest.parent&&old)throw Error('LOCAL_PARENT_MISMATCH');
    this.db.prepare('INSERT INTO lineage VALUES(?,?,?,?) ON CONFLICT(scope) DO UPDATE SET parent_json=excluded.parent_json,signature=excluded.signature,receipt_json=excluded.receipt_json').run(row.scope,JSON.stringify({header,proofs:JSON.parse(String(row.proof_json))}),row.signature,JSON.stringify(receipt));
    this.db.prepare('DELETE FROM heads WHERE scope=?').run(row.scope);
    this.db.prepare('INSERT OR IGNORE INTO receipts VALUES(?,?)').run(batch,JSON.stringify(receipt));this.db.prepare('DELETE FROM records WHERE batch=?').run(batch);this.db.prepare('DELETE FROM outbox WHERE batch=?').run(batch);
    this.set('lastSuccessfulSyncAt',new Date().toISOString());this.set('dataRevision',receipt.dataRevision);
  });}
  fail(batch:string,code:string,permanent=false,retryMs=1000){this.tx(()=>{const row=this.db.prepare('SELECT scope FROM outbox WHERE batch=?').get(batch);this.db.prepare("UPDATE outbox SET attempts=attempts+1,next_retry=?,error=?,state=? WHERE batch=?").run(Date.now()+retryMs,code,permanent?'review':'pending',batch);
    if(permanent&&row)this.db.prepare("UPDATE outbox SET state='review',error=COALESCE(error,'PARENT_REVIEW_REQUIRED') WHERE scope=? AND serial>(SELECT serial FROM outbox WHERE batch=?)").run(row.scope,batch);this.set('lastErrorCode',code);this.set('lastErrorAt',new Date().toISOString());});}
  status(){return {outbox:this.db.prepare('SELECT state,COUNT(*) count FROM outbox GROUP BY state').all(),confirmedScopes:Number(this.db.prepare('SELECT COUNT(*) n FROM lineage').get()!.n),receiptCount:Number(this.db.prepare('SELECT COUNT(*) n FROM receipts').get()!.n),
    lastCollectedAt:this.get('lastCollectedAt'),lastReportAt:this.get('lastReportAt'),lastSuccessfulSyncAt:this.get('lastSuccessfulSyncAt'),dataRevision:this.get('dataRevision'),lastErrorCode:this.get('lastErrorCode'),lastErrorAt:this.get('lastErrorAt'),issues:this.get('issues'),heartbeat:this.get('heartbeat'),remoteOnline:this.get('remoteOnline'),lastRemoteJob:this.get('lastRemoteJob'),remoteError:this.get('remoteError')};}
}
