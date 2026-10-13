import 'server-only';
import { refreshDashboardSnapshot } from '../adapters';
import { usageRanges, type UsageRange } from '../domain';

export async function dashboardUsageGet(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams;
  const range = query.get('range') ?? '30d';
  if (!usageRanges.includes(range as UsageRange)) {
    return Response.json({ error: 'Invalid usage range.' }, { status: 400 });
  }
  try {
    return Response.json(await refreshDashboardSnapshot({ range: range as UsageRange, force: query.get('refresh') === '1' }), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return Response.json({ error: 'Unable to load usage data.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
