import 'server-only';
import { refreshDashboardSnapshot, readDashboardSnapshot } from '../adapters';
import { emptyDashboard, publicDashboardSummary, usageRanges, type UsageRange } from '../domain';

const refreshes = new Map<string, number>();

export async function dashboardUsageGet(request: Request, ownerSessionId?: string, canViewDetails = !!ownerSessionId): Promise<Response> {
  const query = new URL(request.url).searchParams;
  const range = query.get('range') ?? '30d';
  if (!usageRanges.includes(range as UsageRange)) {
    return Response.json({ error: 'Invalid usage range.' }, { status: 400 });
  }
  const force = query.get('refresh') === '1';
  if (!ownerSessionId) {
    if (force) return Response.json({ error: 'Owner access required.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
    const history = await readDashboardSnapshot(range as UsageRange);
    return Response.json(publicDashboardSummary(history ?? emptyDashboard(range as UsageRange), canViewDetails), {
      headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' },
    });
  }
  if (force) {
    const now = Date.now();
    for (const [key, time] of refreshes) if (now - time >= 30_000) refreshes.delete(key);
    if (refreshes.has(ownerSessionId)) return Response.json({ error: 'Please wait before refreshing again.' }, {
      status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' },
    });
    refreshes.set(ownerSessionId, now);
  }
  try {
    return Response.json(await refreshDashboardSnapshot({ range: range as UsageRange, force }), {
      headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' },
    });
  } catch {
    console.error(JSON.stringify({ event: 'usage_collection_failed' }));
    return Response.json({ error: 'Unable to load usage data.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
