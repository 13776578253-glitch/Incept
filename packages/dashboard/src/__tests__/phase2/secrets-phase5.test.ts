import {expect,it} from 'vitest';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {readRpcSecret} from '../../sync/secrets';
it('RPC secret file overrides environment without exposing its contents and rejects weak keys',()=>{
  const dir=mkdtempSync(join(tmpdir(),'phase5-secrets-')),file=join(dir,'rpc.key'),key=randomBytes(32).toString('hex');
  try{writeFileSync(file,key+'\n',{mode:0o600});expect(readRpcSecret({INCEPT_SYNC_RPC_KEY_FILE:file,INCEPT_SYNC_RPC_KEY:'bad'})).toBe(key);expect(()=>readRpcSecret({INCEPT_SYNC_RPC_KEY:'a'.repeat(64)})).toThrow('RPC_SECRET_INVALID');expect(()=>readRpcSecret({INCEPT_SYNC_RPC_KEY_FILE:'relative'})).toThrow('RPC_SECRET_FILE_REQUIRED');}
  finally{rmSync(dir,{recursive:true,force:true});}
});
