import type { TokenDashboardData, UsageRange } from '../../domain';

// Keep returning navigations instant without synchronous browser-storage writes.
const snapshots = new Map<string, TokenDashboardData>();
export function clientSnapshot(range: UsageRange, scope = 'public') { return snapshots.get(`${scope}:${range}`); }
export function rememberSnapshot(data: TokenDashboardData, scope = 'public') {
  if (!data.range || !data.checkedAt) return;
  const key = `${scope}:${data.range}`;
  const previous = snapshots.get(key);
  if (!previous || Date.parse(data.checkedAt) >= Date.parse(previous.checkedAt ?? '')) snapshots.set(key, data);
}
