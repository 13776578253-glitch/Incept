import { readPublishedBilling } from '@incept/dashboard/adapters/billing';
import { usageRanges, type UsageRange } from '@incept/dashboard/domain';
import { JobError, requireSyncOwner } from '@incept/db/agent';
import { getCurrentViewer } from '@/server/auth';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'no-store', Vary: 'Cookie' };
  if (process.env.INCEPT_BILLING_READ_MODE !== 'owner') {
    return Response.json({ error: 'BILLING_READ_DISABLED' }, { status: 404, headers });
  }
  const viewer = await getCurrentViewer();
  if (viewer.role !== 'owner') return Response.json({ error: 'FORBIDDEN' }, { status: 403, headers });
  const range = new URL(request.url).searchParams.get('range') ?? '30d';
  if (!usageRanges.includes(range as UsageRange)) {
    return Response.json({ error: 'INVALID_BILLING_RANGE' }, { status: 400, headers });
  }
  try {
    await requireSyncOwner(viewer.sessionId);
    const data = await readPublishedBilling(range as UsageRange, process.env.INCEPT_SYNC_DATABASE_FILE ?? '',
      process.env.INCEPT_BILLING_PUBLICATION_FILE ?? '');
    return Response.json(data, { headers });
  } catch (error) {
    if (error instanceof JobError) return Response.json({ error: error.code }, { status: error.status, headers });
    return Response.json({ error: 'BILLING_PUBLICATION_UNAVAILABLE' }, { status: 503, headers });
  }
}
