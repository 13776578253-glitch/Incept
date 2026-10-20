import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {AgentState} from '../dist/library.mjs';
const {build}=createRequire(new URL('../../../packages/dashboard/package.json',import.meta.url))('esbuild');

test('tray status excludes private ledger data and coalesces heartbeat-only changes',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'incept-tray-contract-')),state=new AgentState(join(dir,'state')),originalNow=Date.now;
  try{
    const modulePath=join(dir,'snapshot.mjs');
    await build({entryPoints:[fileURLToPath(new URL('../src/snapshot.ts',import.meta.url))],outfile:modulePath,bundle:true,platform:'node',format:'esm',target:'node24'});
    const {publishStatus}=await import(pathToFileURL(modulePath).href);let now=1792490400000;Date.now=()=>now;
    state.set('lastCollectionReport',{privateSession:'DO_NOT_PUBLISH'});state.set('issues',['DO_NOT_PUBLISH']);
    publishStatus(state);const first=JSON.parse(readFileSync(join(state.directory,'status.json'),'utf8'));
    assert.equal(JSON.stringify(first).includes('DO_NOT_PUBLISH'),false);assert.equal(first.running,true);
    state.set('heartbeat',{pid:process.pid,at:++now});publishStatus(state);
    assert.equal(JSON.parse(readFileSync(join(state.directory,'status.json'),'utf8')).at,first.at);
    state.set('paused',true);publishStatus(state);assert.equal(JSON.parse(readFileSync(join(state.directory,'status.json'),'utf8')).paused,true);
    now+=5000;publishStatus(state);assert.equal(JSON.parse(readFileSync(join(state.directory,'status.json'),'utf8')).at,now);
    publishStatus(state,false,true);assert.equal(JSON.parse(readFileSync(join(state.directory,'status.json'),'utf8')).running,false);
  }finally{Date.now=originalNow;state.close();rmSync(dir,{recursive:true,force:true});}
});

test('pause and resume persist on a disposable stopped Agent without starting it',()=>{
  const dir=mkdtempSync(join(tmpdir(),'incept-tray-pause-'));let state=new AgentState(dir);state.close();
  try{
    writeFileSync(join(dir,'config.json'),JSON.stringify({version:1,endpoint:'https://localhost:1',home:dir,deviceId:'00000000-0000-4000-8000-000000000001',allowedSources:['codex']}));
    for(const [command,paused]of [['pause',true],['resume',false]]){
      const run=spawnSync(process.execPath,[fileURLToPath(new URL('../dist/agent.mjs',import.meta.url)),command,'--state',dir],{encoding:'utf8',windowsHide:true});
      assert.equal(run.status,0,run.stderr);assert.deepEqual(JSON.parse(run.stdout),{paused});
      state=new AgentState(dir);assert.equal(state.get('paused'),paused);state.close();
      const status=JSON.parse(readFileSync(join(dir,'status.json'),'utf8'));assert.equal(status.running,false);assert.equal(status.paused,paused);
    }
  }finally{rmSync(dir,{recursive:true,force:true});}
});
