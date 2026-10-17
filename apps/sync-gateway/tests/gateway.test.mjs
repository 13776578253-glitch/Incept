import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGateway} from '../dist/library.mjs';
test('gateway exposes no unauthenticated status/dispatch RPC and rejects token-bearing upgrade URLs',async()=>{
  const gateway=createGateway({webBase:'http://127.0.0.1:1',secret:'a'.repeat(64),heartbeatMs:100});
  await new Promise(yes=>gateway.server.listen(0,'127.0.0.1',yes));const base='http://127.0.0.1:'+gateway.server.address().port;
  try{assert.equal((await fetch(base+'/rpc/status',{method:'POST',headers:{'content-type':'application/json'},body:'{"devices":[]}'})).status,403);assert.equal((await fetch(base+'/')).status,404);
    const socket=new WebSocket(base.replace('http:','ws:')+'/api/sync/ws?token=redacted');assert(await new Promise(yes=>{socket.addEventListener('error',()=>yes(true));socket.addEventListener('open',()=>{socket.close();yes(false);});}));assert.equal(gateway.stats().connections,0);
  }finally{await gateway.close();}
});
test('gateway refuses weak service keys',()=>{assert.throws(()=>createGateway({webBase:'http://127.0.0.1:1',secret:'short'}),/RPC_NOT_CONFIGURED/);});
