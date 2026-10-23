import {describe,it,expect,afterEach} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CompatibleSyncService} from '../adapters/local/imports/sync/legacy';
import {syncScopeId} from '../adapters/local/imports/sync/contract';
import {hash} from '../adapters/local/imports/identity';
import type {SyncScope} from '../domain/sync';
import type {TransferEvent} from '../domain';
import {fromEvents} from './phase1/fixtures';

const DEVICE={role:'device' as const,deviceId:'11111111-1111-4111-8111-111111111111'};
const OWNER={role:'owner' as const,subject:'owner-cli',reason:'review acceptance guard test'};
const SCOPE:SyncScope={deviceId:DEVICE.deviceId,source:'zcode',sessionId:'session_guard_0001',originId:'origin-guard-0001'};

function event(id:string,timestampMs:number,input=10,output=5):TransferEvent {
  return {eventId:hash(['guard-event',id]),source:'zcode',sessionId:SCOPE.sessionId,timestampMs,modelName:'glm-test',projectKey:'guard',projectName:'Guard',
    workspacePath:'C:\\guard',inputTokens:input,outputTokens:output,cacheReadTokens:0,cacheCreationTokens:0,reasoningTokens:0};
}

let service:CompatibleSyncService|undefined;
let directory='';

function open(){
  directory=mkdtempSync(join(tmpdir(),'incept-review-guard-'));
  service=new CompatibleSyncService(join(directory,'sync.db'));
  return service;
}

function seed(svc:CompatibleSyncService){
  svc.register(SCOPE,'guard scope',OWNER);
  const now=Date.now();
  const init=fromEvents([event('a',now-120000)],SCOPE,undefined,'init-guard');
  svc.begin(init.header,DEVICE);svc.stage(DEVICE.deviceId,init.header.batchId,0,init.records,DEVICE);svc.commit(DEVICE.deviceId,init.header.batchId,DEVICE);
  const next=fromEvents([event('a',now-120000),event('b',now-60000)],SCOPE,init.header,'held-guard');
  const id=Number(svc.db.prepare('INSERT INTO sync_reviews(scope_id,manifest_id,code,header_json,created_at,proposal_hash) VALUES(?,?,?,?,?,?)')
    .run(syncScopeId(SCOPE),next.header.manifest.manifestHash,'PREFIX_LOST',JSON.stringify(next.header),Date.now(),hash(['guard-proposal'])).lastInsertRowid);
  const observation=svc.db.prepare('INSERT OR IGNORE INTO sync_observations VALUES(?,?,?,?,?)'),member=svc.db.prepare('INSERT INTO sync_review_members VALUES(?,?,?)');
  next.records.forEach((record,position)=>{observation.run(hash(record),JSON.stringify(record),record.event.timestampMs,record.event.source,record.event.sessionId);member.run(id,position,hash(record));});
  return {id,header:next.header};
}

afterEach(()=>{service?.close();service=undefined;if(directory)rmSync(directory,{recursive:true,force:true});directory='';});

describe('Owner review acceptance guards',()=>{
  it('commits a valid proposal and advances the scope head',()=>{
    const svc=open(),{id,header}=seed(svc);
    const result=svc.acceptReview(id,OWNER);
    expect(result.receipt.status).toBe('committed');
    expect(result.committedSuccessor).toBe(header.manifest.manifestHash);
    expect(svc.db.prepare('SELECT head_manifest FROM sync_scopes WHERE scope_id=?').get(syncScopeId(SCOPE))).toMatchObject({head_manifest:header.manifest.manifestHash});
  });

  it('rejects a review whose scope was rolled back',()=>{
    const svc=open(),{id}=seed(svc);
    svc.db.prepare('UPDATE sync_scopes SET fenced=1 WHERE scope_id=?').run(syncScopeId(SCOPE));
    expect(()=>svc.acceptReview(id,OWNER)).toThrow(/ROLLED_BACK_LINEAGE/);
  });

  it('rejects a review row whose manifest id does not match its header',()=>{
    const svc=open(),{id}=seed(svc);
    svc.db.prepare('UPDATE sync_reviews SET manifest_id=? WHERE id=?').run('0'.repeat(64),id);
    expect(()=>svc.acceptReview(id,OWNER)).toThrow(/REVIEW_MANIFEST_MISMATCH/);
  });

  it('rejects a proposal that no longer descends from the current head',()=>{
    const svc=open(),{id,header}=seed(svc);
    const stale=JSON.parse(JSON.stringify(header)) as typeof header;
    if(!stale.manifest.parent)throw Error('fixture parent missing');
    stale.manifest.parent.manifestHash='f'.repeat(64);
    svc.db.prepare('UPDATE sync_reviews SET header_json=? WHERE id=?').run(JSON.stringify(stale),id);
    expect(()=>svc.acceptReview(id,OWNER)).toThrow(/PARENT_MISMATCH/);
  });

  it('rejects a proposal whose stored members do not match its sequence hash',()=>{
    const svc=open(),{id}=seed(svc);
    const record=JSON.parse(String((svc.db.prepare('SELECT o.record_json j FROM sync_review_members m JOIN sync_observations o ON o.id=m.observation_id WHERE m.review_id=? AND m.position=0').get(id) as {j:string}).j));
    record.envelopeHash='tampered';
    svc.db.prepare('INSERT OR IGNORE INTO sync_observations VALUES(?,?,?,?,?)').run(hash(record),JSON.stringify(record),record.event.timestampMs,record.event.source,record.event.sessionId);
    svc.db.prepare('UPDATE sync_review_members SET observation_id=? WHERE review_id=? AND position=0').run(hash(record),id);
    expect(()=>svc.acceptReview(id,OWNER)).toThrow(/SEQUENCE_HASH_MISMATCH/);
  });
});
