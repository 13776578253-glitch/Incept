import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {captureHome,buildCandidate} from '../dist/library.mjs';
import {fixtures as f} from './helpers.mjs';

const deviceId='00000000-0000-4000-8000-000000000003',actor={role:'device',deviceId},model='codex-auto-review-unpriced';
const at=Date.parse('2026-10-15T23:59:00Z');
async function sandbox(action){const dir=mkdtempSync(join(tmpdir(),'incept-auto-review-'));try{await action(dir);}finally{rmSync(dir,{recursive:true,force:true});}}
function point(timestamp,total,last){return {timestamp:typeof timestamp==='number'?new Date(timestamp).toISOString():timestamp,type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{input_tokens:total,cached_input_tokens:0,output_tokens:0,reasoning_output_tokens:0},...(last===undefined?{}:{last_token_usage:typeof last==='number'?{input_tokens:last,cached_input_tokens:0,output_tokens:0,reasoning_output_tokens:0}:last})}}};}
function session(home,id,points,name=f.PHASE0_MODEL){const path=join(home,'.codex','sessions');mkdirSync(path,{recursive:true});writeFileSync(join(path,id+'.jsonl'),[{type:'session_meta',payload:{id,cwd:'D:/synthetic-project'}},{type:'turn_context',payload:{model:name}},...points].map(JSON.stringify).join('\n')+'\n');}
async function scan(home,dir,options={}){const snapshot=join(dir,'snapshot-'+randomUUID());try{return await captureHome(home,snapshot,['codex'],[],options);}finally{rmSync(snapshot,{recursive:true,force:true});}}
function total(records){return records.reduce((sum,{event:e})=>sum+e.inputTokens+e.outputTokens+e.cacheReadTokens+e.cacheCreationTokens+e.reasoningTokens,0);}
function ingest(service,capture,id){const scope={source:capture.source,sessionId:capture.sessionId,deviceId,originId:f.hash(['incept-origin/1',capture.source,capture.sessionId])};f.resolveScope(service,capture,actor);const candidate=buildCandidate(capture,scope,undefined,id);const receipt=service.ingest(candidate.header,candidate.records,actor);assert.equal(receipt.status,'committed');assert.equal(receipt.manifestHash,candidate.header.manifest.manifestHash);return {candidate,receipt};}

test('explicit AutoReview uses measured last usage across reset and keeps an unpriced receipt',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Pricing(home);session(home,'review',[point(at,25_459_535,5),point(at+1000,10,3)]);
  const result=await scan(home,dir,{autoReviewSessions:['review']});assert.equal(result.isolations.length,0);assert.equal(result.captures.length,1);const capture=result.captures[0];assert.equal(total(capture.records),8);assert.deepEqual(capture.records.map(r=>r.cumulative.input),[5,8]);assert(capture.records.every(r=>r.event.modelName===model));assert.deepEqual(capture.rates,{});
  const service=new f.CompatibleSyncService(join(dir,'cloud.db'));try{ingest(service,capture,'review-receipt');const rows=f.readSyncView(service).events;assert.equal(rows.length,2);assert.equal(rows.reduce((sum,r)=>sum+r.inputTokens,0),8);assert(rows.every(r=>r.missingPricing===true));assert(rows.every(r=>r.modelName===model));}finally{service.close();}
}));

test('normal Codex sessions retain their model and exact role selection does not match a session prefix',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Pricing(home);session(home,'review',[point(at,100,5)]);session(home,'review-neighbor',[point(at+1000,17,17)]);session(home,'normal',[point(at+2000,9,9)],'ordinary-codex-model');
  const result=await scan(home,dir,{autoReviewSessions:['review']});assert.equal(result.captures.find(c=>c.sessionId==='review').records[0].event.modelName,model);assert.equal(result.captures.find(c=>c.sessionId==='review-neighbor').records[0].event.modelName,f.PHASE0_MODEL);assert.equal(result.captures.find(c=>c.sessionId==='normal').records[0].event.modelName,'ordinary-codex-model');
}));

test('a reset without explicit AutoReview identity stays quarantined as CODEX_RESET_REVIEW',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Pricing(home);session(home,'ordinary-reset',[point(at,100,100),point(at+1000,50,10)]);session(home,'confirmed-review',[point(at,100,100),point(at+1000,50,10)]);
  const result=await scan(home,dir,{autoReviewSessions:['confirmed-review']});assert.deepEqual(result.captures.map(c=>c.sessionId),['confirmed-review']);assert.equal(total(result.captures[0].records),110);assert(result.isolations.some(i=>i.sessionId==='ordinary-reset'&&i.reason==='CODEX_RESET_REVIEW'));
}));

test('repeated AutoReview total and last snapshots count only once and repeated scans preserve identities',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Pricing(home);session(home,'review',[point(at,1000,5),point(at+1000,1000,5),point(at+2000,10,3)]);const options={autoReviewSessions:['review']},first=await scan(home,dir,options),again=await scan(home,dir,options);
  assert.equal(first.captures[0].records.length,2);assert.equal(total(first.captures[0].records),8);assert.deepEqual(first.captures[0].records,again.captures[0].records);
}));

test('AutoReview without measured last usage is quarantined while a healthy session continues',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Pricing(home);session(home,'missing-last',[point(at,25_459_535)]);session(home,'healthy',[point(at+1000,7,7)]);const result=await scan(home,dir,{autoReviewSessions:['missing-last']});assert.deepEqual(result.captures.map(c=>c.sessionId),['healthy']);assert(result.isolations.some(i=>i.sessionId==='missing-last'&&i.reason==='INDEPENDENT_USAGE_MISSING'));
}));

test('AutoReview rejects invalid time and measured counters despite the explicit role',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Pricing(home);session(home,'bad-time',[point('not-a-date',1000,5)]);session(home,'bad-counter',[point(at,1000,{input_tokens:5,cached_input_tokens:10,output_tokens:0,reasoning_output_tokens:0})]);session(home,'healthy',[point(at+1000,7,7)]);
  const result=await scan(home,dir,{autoReviewSessions:['bad-time','bad-counter']});assert.deepEqual(result.captures.map(c=>c.sessionId),['healthy']);assert(result.isolations.some(i=>i.sessionId==='bad-time'&&i.reason==='INVALID_TIMESTAMP'));assert(result.isolations.some(i=>i.sessionId==='bad-counter'&&i.reason==='INVALID_COUNTER'));
}));
