import {afterEach,expect,it} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {CompatibleSyncService} from '../../adapters/local/imports/sync/legacy';
import {resolveScope} from '../../sync/admission';

const dirs:string[]=[];
afterEach(()=>{for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true});});

it('trusted resolution auto-registers a new scope when legacy review is disabled',()=>{
  const dir=mkdtempSync(join(tmpdir(),'trusted-sync-'));dirs.push(dir);
  const service=new CompatibleSyncService(join(dir,'v3.db'));
  try{
    const result=resolveScope(service,{source:'codex',sessionId:'trusted-session'},{role:'device',deviceId:'device-a'},undefined,1_800_000_000_000);
    expect(result.status).toBe('registered');
    expect(result.scope.deviceId).toBe('device-a');
    expect(service.db.prepare('SELECT COUNT(*) n FROM sync_origins').get()!.n).toBe(1);
    expect(service.db.prepare('SELECT COUNT(*) n FROM sync_admission_reviews').get()!.n).toBe(0);
  }finally{service.close();}
});
