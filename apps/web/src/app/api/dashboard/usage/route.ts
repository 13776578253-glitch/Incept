import { dashboardUsageGet } from '@incept/dashboard/next';
import { getCurrentViewer } from '@/server/auth';
import { traceNavigation } from '@/server/navigation-timing';
import {syncUsageGet} from '@/server/sync/usage';
import {syncExecutor} from '@/server/sync/next';
import {trustedDashboardEnabled} from '@incept/dashboard/adapters';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  if(trustedDashboardEnabled())syncExecutor();
  const viewer = await getCurrentViewer();
  const response = viewer.role === 'owner' && process.env.INCEPT_SYNC_ENABLED === '1'
    && (process.env.INCEPT_SYNC_REMOTE_ENABLED === '1' || ['shadow', 'v2'].includes(process.env.INCEPT_SYNC_READ_MODE ?? ''))
    ? await traceNavigation('dashboard_sync_snapshot', () => syncUsageGet(request, viewer.sessionId, syncExecutor()))
    : await traceNavigation('dashboard_usage_snapshot', () =>
      dashboardUsageGet(request, viewer.role === 'owner' ? viewer.sessionId : undefined, viewer.role !== 'guest'));
  response.headers.set('X-Incept-Dashboard-Role', viewer.role);
  return response;
}
