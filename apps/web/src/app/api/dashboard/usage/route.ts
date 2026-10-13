import { dashboardUsageGet } from '@incept/dashboard/next';
import { getCurrentViewer } from '@/server/auth';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  const viewer = await getCurrentViewer();
  return dashboardUsageGet(request, viewer.role === 'owner' ? viewer.sessionId : undefined);
}
