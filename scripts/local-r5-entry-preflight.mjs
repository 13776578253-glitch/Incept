// Read-only Docker/configuration review. Never starts a service or reads database contents.
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { checkV4Isolation } from './check-v4-isolation.mjs';
import { verifyR5ImageIdentity, R5_IMAGE } from '../apps/sync-agent/dist/library.mjs';

const project = 'incept-v4-acceptance';
const directory = 'C:/Users/86139/AppData/Local/Incept/v4-acceptance-20261019';
const image = `incept-sync-trusted@${R5_IMAGE.manifestListDigest}`;
const composeFile = 'deployment/compose.v4-acceptance.json';
const expectedPg = 'postgres:16-alpine@sha256:4e6e670bb069649261c9c18031f0aded7bb249a5b6664ddec29c013a89310d50';
const check = (condition, code) => { if (!condition) throw Error(code); };
function docker(args) {
  const result = spawnSync('docker', args, {encoding:'utf8', windowsHide:true, maxBuffer:8*1024*1024});
  check(result.status === 0, 'READ_ONLY_DOCKER_CHECK_FAILED');
  return result.stdout;
}
try {
  check(resolve(process.env.INCEPT_V4_ACCEPTANCE_DIR ?? '') === resolve(directory), 'EXACT_PRIVATE_DIRECTORY_REQUIRED');
  for (const name of ['acceptance.env', 'config.json', 'token.txt', 'test-owner.json']) check(statSync(join(directory,name)).size > 0, 'RETAINED_CREDENTIAL_FILE_REQUIRED');
  const local = JSON.parse(readFileSync(join(directory,'config.json'),'utf8'));
  check(process.env.INCEPT_V4_DEVICE_ID, 'EXPECTED_TEST_DEVICE_ID_REQUIRED');
  check(local.deviceId === process.env.INCEPT_V4_DEVICE_ID
    && local.endpoint === 'http://127.0.0.1:3305' && local.remote === false, 'RETAINED_TEST_IDENTITY_REQUIRED');
  const config = JSON.parse(docker(['compose','--project-name',project,'--env-file',join(directory,'acceptance.env'),'-f',composeFile,'config','--format','json']));
  const isolation = checkV4Isolation(config);
  check(config.services.app.image === image && config.services.postgres.image === expectedPg
    && config.services.app.environment.INCEPT_SYNC_DEVICE_ALLOWLIST === local.deviceId, 'RETAINED_IMAGE_OR_DEVICE_CHANGED');
  check(!docker(['ps','-a','--filter',`label=com.docker.compose.project=${project}`,'--format','{{.ID}}']).trim(), 'PROJECT_CONTAINERS_ALREADY_EXIST');
  check(!docker(['ps','--filter','publish=3305','--format','{{.ID}}']).trim(), 'DOCKER_PORT_3305_IN_USE');
  const retainedVolumes = ['v4_data','pg_data','acceptance_secrets'].map(name => `${project}_${name}`);
  for (const name of retainedVolumes) {
    const [volume] = JSON.parse(docker(['volume','inspect',name]));
    check(volume.Name === name && volume.Driver === 'local' && (!volume.Options || !Object.keys(volume.Options).length)
      && volume.Labels?.['com.docker.compose.project'] === project, 'RETAINED_PROJECT_VOLUME_REQUIRED');
  }
  const [observed] = JSON.parse(docker(['image','inspect','--platform','linux/amd64',image]));
  const graph = JSON.parse(readFileSync('output/r5-image-evidence.json','utf8'));
  graph.observed = {id:observed.Id,os:observed.Os,architecture:observed.Architecture,rootfsDiffIds:observed.RootFS?.Layers};
  check(verifyR5ImageIdentity(graph).passed, 'R5_RUNTIME_IMAGE_GRAPH_FAILED');
  for (const service of ['postgres','entry']) docker(['image','inspect','--platform','linux/amd64',config.services[service].image]);
  const version = JSON.parse(docker(['version','--format','{{json .Server}}']));
  const files = [composeFile,'deployment/v4-http-entry.mjs','scripts/check-v4-isolation.mjs','scripts/local-r5-entry-preflight.mjs',
    'scripts/production-v4-isolation.test.mjs','scripts/production-v4-proxy.test.mjs','docs/plans/2026-10-19-local-r5-entry-fix.md'];
  const report = {status:'prepared-awaiting-startup-approval',checkedAt:new Date().toISOString(),engine:version.Version,
    compose:docker(['compose','version','--short']).trim(),project,isolation,retainedVolumes,
    imageIdentity:'manifest list / linux platform manifest / config graph matched',
    historical359:'passed previously; not repeated',containersStarted:false,credentialsRegenerated:false,
    databaseExported:false,productionModified:false,runtimeEgressGate:'pending authorized startup',
    files:Object.fromEntries(files.map(file=>[file,createHash('sha256').update(readFileSync(file)).digest('hex')]))};
  writeFileSync('output/r5-entry-review.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} catch (error) {
  const safe = /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'ENTRY_PREFLIGHT_FAILED';
  console.error(JSON.stringify({status:'blocked',code:safe,containersStarted:false}));
  process.exitCode = 1;
}
