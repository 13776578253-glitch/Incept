// Hash/freeze existing artifacts only: never imports usage, runs a collector or deploys.
import assert from 'node:assert/strict';
import {createReadStream,readFileSync,writeFileSync,copyFileSync,existsSync,mkdirSync,statSync,constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join,basename} from 'node:path';

const read = file => JSON.parse(readFileSync(file,'utf8'));
async function sha(file){const digest=createHash('sha256');for await(const chunk of createReadStream(file))digest.update(chunk);return digest.digest('hex');}
const root=resolve('output/release-candidate-2026-10-20');
assert(!existsSync(join(root,'RELEASE-MANIFEST.json')),'FINAL_MANIFEST_ALREADY_FROZEN');
const app=read('output/release-app-build-2026-10-20.json');
const agent=read('output/release-agent-build-2026-10-20.json');
const data=read('output/release-clean-candidate-2026-10-20.json');
const handoff=read('output/release-incremental-handoff-2026-10-20.json');
assert.equal(app.status,'passed','APP_BUILD_MUST_PASS');assert.equal(agent.status,'passed');assert.equal(data.status,'passed');assert.equal(handoff.status,'passed');
assert.deepEqual(data.final,{scopes:362,tokens:4558021501,receipts:362,revision:387});
assert(handoff.frozenInputsUnchanged);assert.equal(handoff.mismatches.length,0);
const businessChanges=[];
for(const input of agent.source.buildInputs){
 if((await sha(input.path))!==input.sha256&&!input.path.includes('/__tests__/'))businessChanges.push(input.path);
}
assert.deepEqual(businessChanges,[],'AGENT_BUSINESS_SOURCE_CHANGED');
const artifacts=[];
async function add(file,kind,expected){const actual=await sha(file);if(expected)assert.equal(actual,expected,'FROZEN_HASH_CHANGED');artifacts.push({kind,path:resolve(file),bytes:statSync(file).size,sha256:actual});}
await add(agent.zip.path,'windows-agent',agent.zip.sha256);
for(const file of data.files)await add(join(data.candidateDirectory,file.file),'fixed-data-and-state',file.sha256);
// The App builder supplies a classified archive rather than a registry tag alone.
const archive=app.archive;
assert(archive?.path&&archive.sha256,'APP_ARCHIVE_REQUIRED');
await add(archive.path,'app-image-archive',archive.sha256);
const scriptDirectory=join(root,'final-scripts');mkdirSync(scriptDirectory,{recursive:true});
for(const file of ['scripts/archive/release-clean-candidate.mjs','scripts/local-r5-state-migration-rehearsal.mjs','scripts/production-sync-backup.mjs','scripts/archive/check-release-incremental-handoff.mjs','scripts/archive/freeze-v4-release.mjs']){
 const target=join(scriptDirectory,basename(file));copyFileSync(file,target,constants.COPYFILE_EXCL);await add(target,'frozen-local-script');
}
for(const file of ['output/release-app-build-2026-10-20.json','output/release-app-source-2026-10-20.json','output/release-agent-build-2026-10-20.json','output/release-clean-candidate-2026-10-20.json','output/release-incremental-handoff-2026-10-20.json'])await add(file,'build-and-validation-evidence');
const manifest={format:'incept-v4-release',version:1,frozenAt:new Date().toISOString(),status:'ready_for_owner_display_cutover',
 snapshot:{...data.final,realIncrement:data.realIncrement,syntheticRowsImported:0,immutable:true,rebuildOnNewLocalUsage:false},
 app,agent:{zip:agent.zip.path,sha256:agent.zip.sha256,businessInputsUnchanged:true,postPackageChanges:'test fixtures only; production logic unchanged'},
 incrementalHandoff:{heads:362,receipts:362,mismatches:0,agentStarted:false,originalIncrementalFilesRetained:handoff.sourceRetention.realIncrementalLocatorsAllPresent,
  missingHistoricalLocators:handoff.sourceRetention.missingUniqueLocators,enablementPrerequisites:handoff.agentEnablementPrerequisites},
 displayDeployment:{ownerApprovalRequired:true,scope:'Back up current production; upload fixed image+SQLite snapshot; replace App with trusted snapshot projection; retain current PostgreSQL and Caddy routing',
  retainCurrentPostgresql:true,postgresDumpPurpose:'Preserved historical backup/reference only; do not overwrite current PostgreSQL with this old copy',
  formalStateModified:false,formalAgentStarted:false,remoteStagingRequired:false,remoteExtraMemoryGateRequired:false},
 artifacts,remoteOperationsExecuted:false};
const text=JSON.stringify(manifest,null,2)+'\n';writeFileSync(join(root,'RELEASE-MANIFEST.json'),text,{flag:'wx'});
const sum=await sha(join(root,'RELEASE-MANIFEST.json'));
writeFileSync(join(root,'SHA256SUMS'),[...artifacts.map(row=>row.sha256+'  '+row.path),sum+'  '+join(root,'RELEASE-MANIFEST.json')].join('\n')+'\n',{flag:'wx'});
const uploadFiles=[{name:basename(archive.path),sha256:archive.sha256},{name:'v4-release.db',sha256:data.files.find(file=>file.file==='v4-release.db').sha256},
 {name:'incept-sync-agent-win-node24.zip',sha256:agent.zip.sha256}];
writeFileSync(join(root,'UPLOAD-SHA256SUMS'),uploadFiles.map(row=>row.sha256+'  '+row.name).join('\n')+'\n',{flag:'wx'});
console.log(JSON.stringify({status:manifest.status,manifest:join(root,'RELEASE-MANIFEST.json'),sha256:sum,artifactCount:artifacts.length,remoteOperationsExecuted:false}));
