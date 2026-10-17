import {homedir} from 'node:os';
import {requireSyncOwner} from '@incept/db/agent';
import {dashboardUsageGet} from '@incept/dashboard/next';
import {usageRanges,type UsageRange,type TokenDashboardData} from '@incept/dashboard/domain';
import type {SyncExecutor} from '@incept/dashboard/sync';
import {hash} from '../../../../../packages/dashboard/src/adapters/local/imports/identity';
export async function syncUsageGet(request:Request,sessionId:string,executor:SyncExecutor,mode=process.env.INCEPT_SYNC_READ_MODE??'v1'){
  await requireSyncOwner(sessionId);const params=new URL(request.url).searchParams,range=params.get('range')??'30d',minimum=Number(params.get('minRevision')??0);
  if(!usageRanges.includes(range as UsageRange)||!Number.isSafeInteger(minimum)||minimum<0||!['v1','shadow','v2'].includes(mode))return Response.json({error:'INVALID_SYNC_READ'},{status:400});
  const metadata={remote:process.env.INCEPT_SYNC_REMOTE_ENABLED==='1',intervalMs:Math.max(300000,Math.min(600000,Number(process.env.INCEPT_SYNC_POLL_MS??300000)))};
  const v2=async()=>executor.execute<TokenDashboardData>({op:'projection',range:range as UsageRange,home:process.env.INCEPT_DASHBOARD_HOME??homedir(),minimumRevision:minimum,actor:{role:'owner',subject:'owner',reason:'Controlled sync projection'}});
  try{if(mode==='v2'){const data=await v2();return Response.json({...data,sync:{...metadata,...data.sync}},{headers:{'Cache-Control':'no-store',Vary:'Cookie'}});}
    const legacy=await dashboardUsageGet(request,sessionId,true);if(!legacy.ok)return legacy;const data=await legacy.json() as TokenDashboardData;
    let equal:boolean|undefined;if(mode==='shadow'){const next=await v2();const content=(v:TokenDashboardData)=>({...v,checkedAt:undefined,sync:undefined});equal=hash(content(data))===hash(content(next));}
    return Response.json({...data,sync:{...metadata,readMode:mode,shadowEqual:equal}},{headers:{'Cache-Control':'no-store',Vary:'Cookie'}});
  }catch{return Response.json({error:'SYNC_PROJECTION_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'no-store','Retry-After':'2'}});}
}
