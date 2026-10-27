// Export only synthetic acceptance results, never credentials or database contents.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
const directory='C:/Users/86139/AppData/Local/Incept/v4-acceptance-20261019';
assert.equal(resolve(process.env.INCEPT_V4_ACCEPTANCE_DIR??''),resolve(directory));
const read=file=>JSON.parse(readFileSync(file,'utf8'));
const runtime=read('output/r5-entry-runtime.json');
const protocol=read(join(directory,'e2e-report.json'));
const pending=read(join(directory,'pending-restart-report.json'));
for(const result of [runtime,protocol,pending])assert.equal(result.status,'passed','ACCEPTANCE_NOT_COMPLETE');
const report={status:'local-isolated-acceptance-passed',completedAt:new Date().toISOString(),
  environment:'Windows + Docker Desktop / WSL2; incept-v4-acceptance',
  fixtureKind:'synthetic-source-format-fixtures over real isolated r5 HTTP',
  historical359:'previously passed with zero differences; not repeated',
  runtime:{status:runtime.status,completedAt:runtime.completedAt,steps:runtime.steps},
  protocol:{status:protocol.status,steps:protocol.steps,syntheticReceipts:protocol.beforeRestart.receiptCount},
  pendingRestart:{status:pending.status,steps:pending.steps,syntheticReceipts:pending.receiptCountBefore+1},
  totalSyntheticReceipts:protocol.beforeRestart.receiptCount+pending.receiptCountBefore+1,
  retainedResources:'three local services running; original three independent volumes and credentials reused',
  productionModified:false,formalAgentStarted:false,databaseExportRepeated:false,identityRegenerated:false,
  releaseStatus:'NO-GO',remaining:['real source new-event validation','real server deployment / Caddy / TLS / resource validation',
    'production migration and state continuity, formal source authorization and Owner confirmation']};
writeFileSync('output/r5-local-acceptance-final.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,totalSyntheticReceipts:report.totalSyntheticReceipts,releaseStatus:report.releaseStatus}));
