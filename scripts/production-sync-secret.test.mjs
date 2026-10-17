import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {writeSyncRpcSecret} from './sync-secret.mjs';

test('RPC secret creation and rotation are atomic and never return plaintext',()=>{
  const dir=mkdtempSync(join(tmpdir(),'incept-sync-secret-')),file=join(dir,'sync-rpc.key');
  try{
    const first=writeSyncRpcSecret({output:file}),firstValue=readFileSync(file,'utf8').trim();
    assert.match(firstValue,/^[a-f0-9]{64}$/);assert.equal(JSON.stringify(first).includes(firstValue),false);if(process.platform!=='win32')assert.equal(statSync(file).mode&0o077,0);
    assert.throws(()=>writeSyncRpcSecret({output:file}),/ALREADY_EXISTS/);
    writeFileSync(file,'stale');
    const second=writeSyncRpcSecret({output:file,rotate:true}),secondValue=readFileSync(file,'utf8').trim();
    assert.match(secondValue,/^[a-f0-9]{64}$/);assert.notEqual(secondValue,'stale');assert.equal(JSON.stringify(second).includes(secondValue),false);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
