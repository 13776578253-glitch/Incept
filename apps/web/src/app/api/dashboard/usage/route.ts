import { dashboardUsageGet } from '@incept/dashboard/next';
import { getCurrentViewer } from '@/server/auth';
import {syncUsageGet} from '@/server/sync/usage';
import {syncExecutor} from '@/server/sync/next';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  const viewer = await getCurrentViewer();
  if(viewer.role==='owner'&&process.env.INCEPT_SYNC_ENABLED==='1'&&(process.env.INCEPT_SYNC_REMOTE_ENABLED==='1'||['shadow','v2'].includes(process.env.INCEPT_SYNC_READ_MODE??'')))return syncUsageGet(request,viewer.sessionId,syncExecutor());
  return dashboardUsageGet(request, viewer.role === 'owner' ? viewer.sessionId : undefined, viewer.role === 'owner' || viewer.role === 'pro');
}
