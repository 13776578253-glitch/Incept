import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { closeSync, existsSync, lstatSync, openSync, readFileSync, readdirSync, readSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..');
const reportFile=join(root,'output/release-incremental-handoff-2026-10-20.json');
const accepted=JSON.parse(readFileSync(join(root,'output/release-clean-candidate-2026-10-20.json'),'utf8'));
const directory=accepted.candidateDirectory;
const sourceHome=JSON.parse(readFileSync(join(root,'output/r5-real-source-inventory.json'),'utf8')).sourceHome;
const sha=value=>createHash('sha256').update(value).digest('hex');
function stable(value){if(Array.isArray(value))return '['+value.map(stable).join(',')+']';if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')+'}';return JSON.stringify(value)??'null';}
const hash=value=>sha(stable(value));
const fingerprint=()=>accepted.files.map(({file,sha256})=>({file,expectedSha256:sha256,actualSha256:sha(readFileSync(join(directory,file)))}));
const before=fingerprint();
if(before.some(f=>f.actualSha256!==f.expectedSha256))throw Error('FROZEN_INPUT_HASH_MISMATCH');
const db=new DatabaseSync(join(directory,'v4-release.db'),{readOnly:true});
const state=new DatabaseSync(join(directory,'agent-state/state.db'),{readOnly:true});
const config=JSON.parse(readFileSync(join(directory,'agent-state/config.json'),'utf8'));
const roots={codex:['.codex/sessions','.codex/archived_sessions'],commandcode:['.commandcode/projects'],claudeCode:['.claude/projects'],geminiCli:['.gemini/tmp'],antigravity:['antigravity','antigravity-cli','antigravity-ide'].map(x=>'.gemini/'+x+'/conversations'),opencode:['.local/share/opencode'],zcode:['.zcode/cli/db'],aiusage:['.aiusage']};
const inventory=Object.entries(roots).flatMap(([source,dirs])=>dirs.flatMap(dir=>existsSync(join(sourceHome,dir))?readdirSync(join(sourceHome,dir),{recursive:true,withFileTypes:true}).filter(e=>e.isFile()).map(e=>({source,locator:relative(sourceHome,join(e.parentPath,e.name)).replaceAll('\\','/'),path:join(e.parentPath,e.name)})):[])).filter(r=>r.source==='aiusage'?r.locator.endsWith('cache.db'):r.source==='antigravity'?r.locator.endsWith('.db'):/\.(jsonl|json|db|sqlite|jsonl\.zst)$/.test(r.locator));
const locators=new Map(inventory.map(item=>[hash(item.locator),item]));
const mismatches=[],checks=[],missingLocators=[],incrementalProofs=[];
let summary;
try{
  db.exec('PRAGMA query_only=ON');state.exec('PRAGMA query_only=ON');
  const rows=state.prepare('SELECT scope,parent_json,signature,receipt_json FROM lineage ORDER BY scope').all();
  const databaseHeads=db.prepare('SELECT s.scope_id,s.head_manifest,s.head_generation,o.scope_json FROM sync_scopes s JOIN sync_origins o ON o.scope_id=s.scope_id').all();
  const headMap=new Map(databaseHeads.map(r=>{const scope=JSON.parse(r.scope_json);return [hash([scope.source,scope.sessionId]),r];}));
  const receiptCount=Number(db.prepare('SELECT COUNT(*) n FROM sync_receipts').get().n);
  for(const row of rows){
    const parent=JSON.parse(row.parent_json),header=parent.header,manifest=header.manifest,scope=manifest.scope;
    const receipt=JSON.parse(row.receipt_json),head=headMap.get(row.scope);
    const serverReceiptRow=db.prepare('SELECT payload_hash,receipt_json FROM sync_receipts WHERE device_id=? AND batch_id=?').get(scope.deviceId,header.batchId);
    const localReceiptRow=state.prepare('SELECT json FROM receipts WHERE batch=?').get(header.batchId);
    const codes=[];
    if(row.scope!==hash([scope.source,scope.sessionId])||!head||hash(JSON.parse(head.scope_json))!==hash(scope)||head.head_manifest!==manifest.manifestHash||head.head_generation!==manifest.generationId)codes.push('HEAD_IDENTITY_MISMATCH');
    if(scope.deviceId!==config.deviceId)codes.push('CONFIG_DEVICE_MISMATCH');
    if(receipt.status!=='committed'||receipt.batchId!==header.batchId||receipt.payloadHash!==hash(header)||receipt.manifestHash!==manifest.manifestHash||receipt.generationId!==manifest.generationId||!serverReceiptRow||serverReceiptRow.payload_hash!==receipt.payloadHash||hash(JSON.parse(serverReceiptRow.receipt_json))!==hash(receipt)||!localReceiptRow||hash(JSON.parse(localReceiptRow.json))!==hash(receipt))codes.push('RECEIPT_IDENTITY_MISMATCH');
    if(!/^[a-f0-9]{64}$/.test(row.signature))codes.push('SIGNATURE_INVALID');
    if(codes.length)mismatches.push({scopeHash:row.scope,codes});
    checks.push({scopeHash:row.scope,source:scope.source,headAndReceiptMatched:codes.length===0,signaturePresent:/^[a-f0-9]{64}$/.test(row.signature)});
    for(const proof of parent.proofs){
      const item=locators.get(proof.range.locatorHash);
      if(!item)missingLocators.push({scopeHash:row.scope,source:scope.source,locatorHash:proof.range.locatorHash});
      if(receipt.dataRevision>=385){
        const result={scopeHash:row.scope,source:scope.source,locatorHash:proof.range.locatorHash,kind:proof.range.kind,locatorPresent:!!item,prefixCheck:'not-applicable-sqlite-row-proof'};
        if(item){const stat=lstatSync(item.path);result.originalFileIdentityMatches=hash([String(stat.dev),String(stat.ino),stat.birthtimeMs])===proof.range.identityHash;
          if(proof.range.kind==='jsonl'&&!item.path.endsWith('.zst')){
            const fd=openSync(item.path,'r');try{const bytes=Buffer.alloc(proof.range.byteLength);let position=0;while(position<bytes.length){const n=readSync(fd,bytes,position,bytes.length-position,position);if(n===0)break;position+=n;}result.prefixCheck=position===bytes.length&&hash(bytes.toString('base64'))===proof.range.root?'matched':'mismatch';}finally{closeSync(fd);}
            if(result.prefixCheck==='mismatch')mismatches.push({scopeHash:row.scope,codes:['INCREMENTAL_ORIGINAL_PREFIX_CHANGED']});
          }
        }
        incrementalProofs.push(result);
      }
    }
  }
  summary={stateHeads:rows.length,stateReceipts:Number(state.prepare('SELECT COUNT(*) n FROM receipts').get().n),databaseHeads:databaseHeads.length,databaseReceipts:receiptCount,unconfirmedHeads:Number(state.prepare('SELECT COUNT(*) n FROM heads').get().n),activeOutbox:Number(state.prepare('SELECT COUNT(*) n FROM outbox').get().n),activeIsolationLedger:Number(state.prepare('SELECT COUNT(*) n FROM session_isolations WHERE active=1').get().n)};
}finally{db.close();state.close();}
const after=fingerprint();
const frozenInputsUnchanged=hash(before)===hash(after);
const countPass=summary.stateHeads===362&&summary.stateReceipts===362&&summary.databaseHeads===362&&summary.databaseReceipts===362&&summary.unconfirmedHeads===0&&summary.activeOutbox===0;
const report={status:mismatches.length===0&&countPass&&frozenInputsUnchanged?'passed':'failed',checkedAt:new Date().toISOString(),mode:'read-only-head-receipt-and-original-locator-check',historicalRecordsRead:0,newUsageCollected:0,uploads:0,agentStarted:false,summary,checks,mismatches,sourceRetention:{inventoryFrom:'output/r5-real-source-inventory.json',sourceHome,fileNamesOnlyInventoried:inventory.length,missingProofLocators:missingLocators,incrementalProofs,policy:'Original JSONL prefixes of the 3 real incremental scopes only; SQLite evidence checked by locator/stat without scanning source rows'},frozenInputsUnchanged,fingerprints:after,agentEnablementPrerequisites:[
  'Set and review formal config home to the retained original sourceHome; candidate home is intentionally empty.',
  'Set and review formal HTTPS endpoint; bind valid production credentials separately. Candidate carries no credentials.',
  'Preserve the 2 opening-incomplete Codex session isolation ledger and exact user-confirmed autoReviewSessions policy before Agent enablement; do not enable global allowIncomplete.',
  'Confirm the separate Owner disposition for the 2 archived historical review batches before formal state installation.',
],configSafety:{candidateRemote:config.remote,homeIsOriginal:config.home===sourceHome,hasAutoReviewPolicy:Array.isArray(config.autoReviewSessions)&&config.autoReviewSessions.length>0,credentialPresent:existsSync(join(directory,'agent-state/credential.dpapi'))},mechanismEvidence:[
  {file:'apps/sync-agent/src/engine.ts',lines:[58,59,72,116,123,125],explanation:'Unchanged capture signature skips enqueue; changed capture references tail parent; durable batch offset resumes pages; matching committed receipt acknowledged once.'},
  {file:'apps/sync-agent/src/state.ts',lines:[47,50,82,85,86,88,89],explanation:'Confirmed lineage and pending tail kept separately; ACK validates payload/manifest/generation and current parent then atomically persists lineage, receipt and token watermark while deleting pending batch.'},
  {file:'packages/dashboard/src/agent/capture.ts',lines:[163,176,178,185],explanation:'Retained locator and prefix proofs fence append, rewrite and rotation; next generation references confirmed parent, preserves pricing basis and validates normalized records.'},
  {file:'apps/sync-agent/tests/agent.test.mjs',tests:['seven REAL collectors: baseline and ordinary append preserve all old records','offline captures form durable planned parents; only matching committed receipt advances lineage'],status:'PASS from completed 38-test release regression'},
  {file:'apps/sync-agent/tests/session-integrity.test.mjs',tests:['partial upload stays partial on repetition and a newly created healthy session continues incrementally','recovered intervals retain their identities on repeat and admit only newly appended usage'],status:'PASS from completed 38-test release regression'},
],appDisplayBlockedByAgentEnablementPrerequisites:false};
report.sourceRetention.status=missingLocators.length?'partial-original-locator-retention':'all-original-locators-retained';
report.sourceRetention.missingUniqueLocators=new Set(missingLocators.map(p=>p.locatorHash)).size;
report.sourceRetention.missingProofReferencesBySource=missingLocators.reduce((all,p)=>(all[p.source]=(all[p.source]??0)+1,all),{});
report.sourceRetention.realIncrementalLocatorsAllPresent=incrementalProofs.every(p=>p.locatorPresent);
if(missingLocators.length)report.agentEnablementPrerequisites.push('Review absent historical locator hashes and preserve archived original sources before enabling incremental sync; retain MISSING_ORIGIN_RETAINED behavior and never re-import an unchanged baseline.');
writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,reportFile,summary,mismatches,missingProofLocators:missingLocators.length,incrementalProofs:incrementalProofs.length,prefixMatched:incrementalProofs.filter(p=>p.prefixCheck==='matched').length,frozenInputsUnchanged}));
if(report.status!=='passed')process.exitCode=1;
