import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateSyncConfiguration} from './sync-config.mjs';
test('sync defaults are disabled/v1 and activation requires a separate database and exactly one canary',()=>{
  assert.doesNotThrow(()=>validateSyncConfiguration({}));
  assert.throws(()=>validateSyncConfiguration({INCEPT_SYNC_REMOTE_ENABLED:'1'}),/CONFLICT/);
  const env={INCEPT_SYNC_ENABLED:'1',INCEPT_SYNC_DATABASE_FILE:process.cwd()+'/v2.db',INCEPT_DASHBOARD_IMPORTS_FILE:process.cwd()+'/v1.db'};
  assert.throws(()=>validateSyncConfiguration(env),/CANARY/);
  assert.doesNotThrow(()=>validateSyncConfiguration({...env,INCEPT_SYNC_DEVICE_ALLOWLIST:'00000000-0000-4000-8000-000000000001'}));
  assert.throws(()=>validateSyncConfiguration({...env,INCEPT_SYNC_DATABASE_FILE:env.INCEPT_DASHBOARD_IMPORTS_FILE}),/DISTINCT/);
  assert.throws(()=>validateSyncConfiguration({...env,INCEPT_SYNC_READ_MODE:'other'}),/READ_MODE/);
});
test('remote activation requires an injected secret file and the private Gateway identity',()=>{
  const directory=mkdtempSync(join(tmpdir(),'incept-sync-config-'));
  try{
    const secret=join(directory,'sync-rpc.key');writeFileSync(secret,'a'.repeat(63)+'b',{mode:0o600});
    const env={INCEPT_SYNC_ENABLED:'1',INCEPT_SYNC_REMOTE_ENABLED:'1',INCEPT_SYNC_DATABASE_FILE:join(directory,'v2.db'),
      INCEPT_DASHBOARD_IMPORTS_FILE:join(directory,'v1.db'),INCEPT_SYNC_DEVICE_ALLOWLIST:'00000000-0000-4000-8000-000000000001',
      INCEPT_SYNC_RPC_KEY_FILE:secret,INCEPT_SYNC_GATEWAY_INTERNAL_URL:'http://sync-gateway:3101'};
    assert.doesNotThrow(()=>validateSyncConfiguration(env));
    assert.throws(()=>validateSyncConfiguration({...env,INCEPT_SYNC_RPC_KEY_FILE:undefined}),/SECRET_FILE/);
    assert.throws(()=>validateSyncConfiguration({...env,INCEPT_SYNC_GATEWAY_INTERNAL_URL:'https://public.example'}),/INTERNAL_GATEWAY/);
    assert.throws(()=>validateSyncConfiguration({...env,INCEPT_SYNC_DEVICE_ALLOWLIST:'a,b'}),/CANARY/);
  }finally{rmSync(directory,{recursive:true,force:true});}
});
