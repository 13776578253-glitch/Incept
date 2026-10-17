import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
test('default systemd compose entry enables the Gateway profile only for an explicitly enabled remote rollout',{skip:process.platform==='win32'},()=>{
  const dir=mkdtempSync(join(tmpdir(),'phase5-compose-')),bin=join(dir,'bin'),envFile=join(dir,'env');mkdirSync(bin);const docker=join(bin,'docker');writeFileSync(docker,'#!/bin/sh\nprintf "%s\\n" "$@"\n');chmodSync(docker,0o700);
  const run=()=>execFileSync('/bin/sh',[resolve('deployment/compose.sh'),'--env-file',envFile,'up','-d'],{encoding:'utf8',env:{...process.env,PATH:bin+':'+process.env.PATH}});
  try{writeFileSync(envFile,'INCEPT_PROXY=nginx\nINCEPT_SYNC_REMOTE_ENABLED=0\n');assert.doesNotMatch(run(),/--profile\nsync/);writeFileSync(envFile,'INCEPT_PROXY=nginx\nINCEPT_SYNC_REMOTE_ENABLED=1\n');assert.match(run(),/--profile\nsync/);}
  finally{rmSync(dir,{recursive:true,force:true});}
});
