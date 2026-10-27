import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {scopeKey} from '../../apps/sync-agent/dist/library.mjs';
import {classifyMissingScopes,classifyMissingLocators,metadataInventory} from './prepare-auto-sync-candidate.mjs';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function row(sessionId,locatorHash='old-path',root='old-root',byteLength=0){return {scope:scopeKey('codex',sessionId),parent_json:JSON.stringify({header:{manifest:{scope:{source:'codex',sessionId}}},proofs:[{range:{locatorHash,root,byteLength,kind:'jsonl'}}]})};}
const ref=(item,locatorHash='old-path')=>({scopeHash:item.scope,source:'codex',locatorHash});

test('scope classification uses exact session metadata and groups shared locators without merging identities',()=>{
  const absent=row('old'),present=row('current'),prefixOnly=row('current-suffix');
  const result=classifyMissingScopes([absent,present,prefixOnly],[ref(absent),ref(present),ref(present),ref(prefixOnly)],new Map([[scopeKey('codex','current'),['new-path']]]));
  assert.equal(result.length,3);assert.equal(result.find(item=>item.sessionId==='current').disposition,'isolated');assert.equal(result.find(item=>item.sessionId==='current-suffix').disposition,'sealed');
  assert.equal(result.find(item=>item.sessionId==='current').missingLocatorHashes.length,1);
  assert.throws(()=>classifyMissingScopes([absent],[{...ref(absent),scopeHash:'unknown'}],new Map()),/MISSING_SCOPE_NOT_IN_CONFIRMED_LINEAGE/);
  assert.throws(()=>classifyMissingScopes([absent],[ref(absent,'unproved')],new Map()),/MISSING_LOCATOR_NOT_IN_CONFIRMED_PROOF/);
});

test('metadata inventory stops at identities and does not parse usage or open Antigravity records',async()=>{
  const home=mkdtempSync(join(tmpdir(),'incept-metadata-test-'));try{
    const codex=join(home,'.codex/sessions'),antigravity=join(home,'.gemini/antigravity/conversations');mkdirSync(codex,{recursive:true});mkdirSync(antigravity,{recursive:true});
    writeFileSync(join(codex,'file.jsonl'),JSON.stringify({type:'session_meta',payload:{id:'actual-session'}})+'\n{usage-is-not-json');writeFileSync(join(antigravity,'conversation.db'),'not a SQLite usage database');
    const result=await metadataInventory(home);assert(result.sessions.has(scopeKey('codex','actual-session')));assert(!result.sessions.has(scopeKey('codex','file')));assert(result.sessions.has(scopeKey('antigravity','conversation')));
  }finally{rmSync(home,{recursive:true,force:true});}
});

test('locator classification requires exact retained-prefix evidence and keeps recovery nonautomatic',()=>{
  const home=mkdtempSync(join(tmpdir(),'incept-prefix-test-'));try{
    const file=join(home,'current.jsonl'),prefix='original-prefix';writeFileSync(file,prefix+'new-tail');
    const good=row('good','shared',hash(Buffer.from(prefix).toString('base64')),Buffer.byteLength(prefix)),bad=row('bad','different','wrong-root',3),absent=row('absent','shared');
    const refs=[ref(good,'shared'),ref(bad,'different'),ref(absent,'shared')],metadata=new Map([[scopeKey('codex','good'),[file]],[scopeKey('codex','bad'),[file]]]);
    const scopes=classifyMissingScopes([good,bad,absent],refs,metadata),locators=classifyMissingLocators([good,bad,absent],refs,scopes,metadata);
    assert.equal(locators.length,2);assert.equal(locators.find(item=>item.locatorHash==='shared').classification,'recoverable_locator');assert.equal(locators.find(item=>item.locatorHash==='different').classification,'continuation_isolated');
    assert(locators.every(item=>item.scopeClassifications.every(scope=>scope.autoResume===false)));
  }finally{rmSync(home,{recursive:true,force:true});}
});
