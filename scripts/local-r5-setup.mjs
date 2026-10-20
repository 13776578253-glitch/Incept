import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomBytes,createHash,createCipheriv,scryptSync} from 'node:crypto';
import {checkV4Isolation} from './check-v4-isolation.mjs';
import {verifyR5ImageIdentity} from '../apps/sync-agent/dist/library.mjs';

const directory = 'C:/Users/86139/AppData/Local/Incept/v4-acceptance-20261019';
if (path.resolve(process.env.INCEPT_V4_ACCEPTANCE_DIR ?? '') !== path.resolve(directory)) throw Error('EXACT_PRIVATE_DIRECTORY_REQUIRED');
const project = 'incept-v4-acceptance';
const image = 'incept-sync-trusted@sha256:cc705ce22cea38b1a8c01cea28fe1e1dd2ca6cbae500516f00eaee6c497d6685';
const deviceId = process.env.INCEPT_V4_DEVICE_ID;
if (!deviceId) throw Error('EXPECTED_TEST_DEVICE_ID_REQUIRED');
const report = {startedAt:new Date().toISOString(),project,baselineKind:'independent accepted v4 and PostgreSQL copies',offlineReconciliationRepeated:false,steps:[],status:'running'};
function record(step) { report.steps.push({step,at:new Date().toISOString()}); fs.writeFileSync(path.join(directory,'setup-report.json'),JSON.stringify(report,null,2)); console.log(JSON.stringify({step,passed:true})); }
function docker(args, options={}) {
  const result = spawnSync('docker',args,{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024,...options});
  if (result.status !== 0) {
    fs.appendFileSync(path.join(directory,'setup-private-errors.log'),JSON.stringify({args:args.slice(0,5),stderr:result.stderr,code:result.status})+'\n');
    throw Error('ISOLATED_DOCKER_OPERATION_FAILED');
  }
  return result.stdout;
}
const compose = (...args) => docker(['compose','--project-name',project,'--env-file',path.join(directory,'acceptance.env'),'-f','deployment/compose.v4-acceptance.json',...args]);
const pg = project+'-postgres-1';
const sql = text => docker(['exec','-i',pg,'psql','-X','--set','ON_ERROR_STOP=1','--username','incept_v4_restore','--dbname','incept_v4_acceptance','-At'],{input:text});
const guard = `DO $$ BEGIN IF current_database()<>'incept_v4_acceptance' THEN RAISE EXCEPTION 'WRONG_ACCEPTANCE_DATABASE'; END IF; END $$;\n`;
const quote = text => "'"+text.replaceAll("'","''")+"'";
try {
  if (docker(['ps','-a','--filter','label=com.docker.compose.project='+project,'--format','{{.ID}}']).trim()) throw Error('PROJECT_ALREADY_EXISTS');
  const graph = JSON.parse(fs.readFileSync('output/r5-image-evidence.json','utf8'));
  if (!verifyR5ImageIdentity(graph).passed) throw Error('R5_IDENTITY_GATE_FAILED');
  for (const name of ['v4-baseline.db','production-copy.pgdump']) if (!fs.statSync(path.join(directory,name)).size) throw Error('INDEPENDENT_COPY_REQUIRED');
  const token='isync_'+randomBytes(32).toString('base64url'), password=randomBytes(32).toString('hex'), adminPassword=randomBytes(32).toString('hex'), authKey=randomBytes(32).toString('hex');
  const env={INCEPT_V4_APP_IMAGE:image,INCEPT_V4_POSTGRES_IMAGE:'postgres:16-alpine@sha256:4e6e670bb069649261c9c18031f0aded7bb249a5b6664ddec29c013a89310d50',INCEPT_V4_PG_PASSWORD:password,INCEPT_V4_PG_ADMIN_PASSWORD:adminPassword,INCEPT_V4_AUTH_ENCRYPTION_KEY:authKey,INCEPT_V4_DEVICE_ID:deviceId};
  fs.writeFileSync(path.join(directory,'acceptance.env'),Object.entries(env).map(([k,v])=>k+'='+v).join('\n')+'\n',{flag:'wx',mode:0o600});
  fs.writeFileSync(path.join(directory,'token.txt'),token+'\n',{flag:'wx',mode:0o600});
  fs.writeFileSync(path.join(directory,'config.json'),JSON.stringify({version:1,endpoint:'http://127.0.0.1:3305',deviceId,home:path.join(directory,'fixture-home'),allowedSources:['codex','commandcode','claudeCode','geminiCli','antigravity','opencode','zcode'],allowLoopbackHttp:true,remote:false,baselineKind:'independent accepted v4 database copy; original359 reconciliation reused'}),{flag:'wx',mode:0o600});
  const rendered=JSON.parse(compose('config','--format','json'));
  checkV4Isolation(rendered);fs.writeFileSync(path.join(directory,'rendered-private.json'),JSON.stringify(rendered));record('immutable-image-and-isolation-config-gates');
  compose('up','-d','--wait','--pull','never','postgres');record('independent-postgresql-started');
  sql(guard+`CREATE ROLE incept_v4_acceptance LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD ${quote(password)}; GRANT CONNECT,CREATE ON DATABASE incept_v4_acceptance TO incept_v4_acceptance; GRANT USAGE,CREATE ON SCHEMA public TO incept_v4_acceptance;`);
  const dump=fs.readFileSync(path.join(directory,'production-copy.pgdump'));
  const toc=docker(['exec','-i',pg,'pg_restore','--list'],{input:dump}).split('\n').map(line=>/ (?:SCHEMA - public|COMMENT - SCHEMA public) /.test(line)?';'+line:line).join('\n');
  docker(['exec','-i',pg,'sh','-c','umask 077; cat > /tmp/acceptance-restore.list'],{input:toc});
  docker(['exec','-i',pg,'pg_restore','--username','incept_v4_restore','--dbname','incept_v4_acceptance','--no-owner','--no-acl','--exit-on-error','--role','incept_v4_acceptance','--use-list','/tmp/acceptance-restore.list'],{input:dump});record('postgresql-copy-restored-without-production-ownership');
  const ownerPassword=randomBytes(24).toString('base64url'),salt=randomBytes(16).toString('hex');
  const passwordHash='scrypt:32768:8:3:'+salt+':'+scryptSync(ownerPassword,salt,32,{N:32768,r:8,p:3,maxmem:64*1024*1024}).toString('hex');
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits=0,value=0,secret='';for(const byte of randomBytes(20)){value=(value<<8)|byte;bits+=8;while(bits>=5){secret+=alphabet[(value>>>(bits-5))&31];bits-=5;}}
  const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(authKey,'hex'),nonce);cipher.setAAD(Buffer.from('incept-owner-totp-v1'));
  const encrypted=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);const totpCipher=['v1',nonce.toString('hex'),cipher.getAuthTag().toString('hex'),encrypted.toString('hex')].join(':');
  sql(guard+`BEGIN;
    UPDATE access_sessions SET "revokedAt"=now(); UPDATE owner_devices SET "revokedAt"=now(); UPDATE owner_permits SET "revokedAt"=now();
    UPDATE owner_challenges SET "consumedAt"=now(); UPDATE owner_recovery_codes SET "consumedAt"=now(); UPDATE access_grants SET "revokedAt"=now();
    UPDATE owner_accounts SET username='acceptance-owner',"passwordHash"=${quote(passwordHash)},"totpCiphertext"=${quote(totpCipher)},"totpLastStep"=-1,"credentialVersion"="credentialVersion"+1;
    UPDATE agent_devices SET "revokedAt"=now();
    UPDATE agent_devices SET "revokedAt"=NULL,"tokenHash"=${quote(createHash('sha256').update(token).digest('hex'))},"tokenHint"=${quote(token.slice(-6))},"credentialVersion"="credentialVersion"+1,"rotatedAt"=now(),"allowedSources"=ARRAY['codex','commandcode','claudeCode','geminiCli','antigravity','opencode','zcode'] WHERE id=${quote(deviceId)};
    UPDATE sync_jobs SET status='cancelled',"activeKey"=NULL,"finishedAt"=now(),"errorCode"='ISOLATED_COPY' WHERE status IN ('queued','dispatched','running');
    COMMIT;`);record('cloned-identities-replaced-with-independent-test-credentials');
  fs.writeFileSync(path.join(directory,'test-owner.json'),JSON.stringify({username:'acceptance-owner',password:ownerPassword,totpSecret:secret}),{flag:'wx',mode:0o600});
  compose('create','--no-build','--pull','never','app');
  docker(['run','--rm','--pull','never','--network','none','--read-only','--user','0:0','--cap-drop','ALL','--cap-add','CHOWN','--cap-add','DAC_OVERRIDE','--security-opt','no-new-privileges:true','--mount','type=volume,source='+project+'_v4_data,target=/data','--entrypoint','node',image,'-e',"const fs=require('node:fs');fs.mkdirSync('/data/sync',{recursive:true});fs.chownSync('/data',1000,1000);fs.chownSync('/data/sync',1000,1000);"]);
  // Stream the already exported private copy only into this project's new volume.
  docker(['run','--rm','-i','--pull','never','--network','none','--read-only','--user','1000:1000','--cap-drop','ALL','--security-opt','no-new-privileges:true','--mount','type=volume,source='+project+'_v4_data,target=/data','--entrypoint','node',image,'-e',"const fs=require('node:fs');const out=fs.createWriteStream('/data/sync/v4.db',{flags:'wx',mode:0o600});process.stdin.pipe(out);"],{encoding:null,input:fs.readFileSync(path.join(directory,'v4-baseline.db'))});record('v4-independent-copy-installed-without-production-bind-mounts');
  compose('up','-d','--wait','--pull','never','app');record('independent-r5-app-ready');
  const ready=await fetch('http://127.0.0.1:3305/api/health/ready');if(!ready.ok)throw Error('APP_NOT_READY');
  const identity=await fetch('http://127.0.0.1:3305/api/dashboard/sync/agent',{headers:{authorization:'Bearer '+token}});const who=await identity.json();if(!identity.ok||who.deviceId!==deviceId)throw Error('TEST_DEVICE_IDENTITY_MISMATCH');
  const privileges=sql("SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication FROM pg_roles WHERE rolname='incept_v4_acceptance';").trim();if(privileges!=='f|f|f|f')throw Error('APPLICATION_ROLE_OVERPRIVILEGED');
  report.status='ready';report.completedAt=new Date().toISOString();record('readiness-device-identity-and-least-privilege');
} catch(error) {
  report.status='failed';report.error=error.message;fs.writeFileSync(path.join(directory,'setup-report.json'),JSON.stringify(report,null,2));
  console.error(JSON.stringify({status:'failed',code:error.message}));process.exitCode=1;
}
