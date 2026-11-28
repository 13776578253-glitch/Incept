import {homedir} from 'node:os';
import {requireSyncOwner} from '@incept/db/agent';
import {dashboardUsageGet} from '@incept/dashboard/next';
import {readDashboardSnapshot,trustedDashboardEnabled} from '@incept/dashboard/adapters';
import {usageRanges,type UsageRange,type TokenDashboardData} from '@incept/dashboard/domain';
import type {SyncExecutor} from '@incept/dashboard/sync';
import {hash} from '../../../../../packages/dashboard/src/adapters/local/imports/identity';
class SnapshotUpdatingError extends Error {
  constructor(readonly targetRevision:number,readonly publishedRevision:number,readonly retryAfterSeconds=3){super('SNAPSHOT_UPDATING');}
}
export async function syncUsageGet(request:Request,sessionId:string,executor:SyncExecutor,mode=process.env.INCEPT_SYNC_READ_MODE??'v1'){
  await requireSyncOwner(sessionId);const params=new URL(request.url).searchParams,range=params.get('range')??'30d',minimum=Number(params.get('minRevision')??0);
  if(!usageRanges.includes(range as UsageRange)||!Number.isSafeInteger(minimum)||minimum<0||!['v1','shadow','v2'].includes(mode))return Response.json({error:'INVALID_SYNC_READ'},{status:400});
  const waitForFresh=minimum>0&&params.get('wait')!=='0';
  const metadata={remote:process.env.INCEPT_SYNC_REMOTE_ENABLED==='1',intervalMs:Math.max(300000,Math.min(600000,Number(process.env.INCEPT_SYNC_POLL_MS??300000)))};
  // Trusted v2 reads are served from the published snapshot generation. The
  // snapshot store refreshes itself when the ledger revision moves; running a
  // full projection per request would queue every Owner refresh behind the
  // same worker that accepts device commits.
  const v2=async()=>{
    if(mode==='v2'&&trustedDashboardEnabled()){
      const snapshot=await readDashboardSnapshot(range as UsageRange,{waitForFresh});
      if(!snapshot)throw new Error('REVISION_NOT_VISIBLE');
      const publishedRevision=snapshot.sync?.dataRevision??0;
      if(publishedRevision<minimum)throw new SnapshotUpdatingError(minimum,publishedRevision,3);
      return snapshot;
    }
    return executor.execute<TokenDashboardData>({op:'projection',range:range as UsageRange,home:process.env.INCEPT_DASHBOARD_HOME??homedir(),minimumRevision:minimum,actor:{role:'owner',subject:'owner',reason:'Controlled sync projection'}});
  };
  try{if(mode==='v2'){const data=await v2();return Response.json({...data,sync:{...metadata,...data.sync}},{headers:{'Cache-Control':'no-store',Vary:'Cookie'}});}
    const legacy=await dashboardUsageGet(request,sessionId,true);if(!legacy.ok)return legacy;const data=await legacy.json() as TokenDashboardData;
    let equal:boolean|undefined;if(mode==='shadow'){const next=await v2();const content=(v:TokenDashboardData)=>({...v,checkedAt:undefined,sync:undefined,importsCheckedAt:undefined,importSignature:undefined,revalidating:undefined});equal=hash(content(data))===hash(content(next));}
    return Response.json({...data,sync:{...metadata,readMode:mode,shadowEqual:equal}},{headers:{'Cache-Control':'no-store',Vary:'Cookie'}});
  }catch(error){
    if(error instanceof SnapshotUpdatingError){
      return Response.json(
        {error:'SNAPSHOT_UPDATING',targetRevision:error.targetRevision,publishedRevision:error.publishedRevision,retryAfterSeconds:error.retryAfterSeconds},
        {status:503,headers:{'Cache-Control':'no-store','Retry-After':String(error.retryAfterSeconds)}},
      );
    }
    return Response.json({error:'SYNC_PROJECTION_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'no-store','Retry-After':'2'}});
  }
}
