import type { TokenDashboardData, UsageRange } from '../../domain';

// Keep returning navigations instant without synchronous browser-storage writes.
const snapshots = new Map<UsageRange, TokenDashboardData>();
export function clientSnapshot(range: UsageRange) { return snapshots.get(range); }
export function rememberSnapshot(data: TokenDashboardData) {
  if (!data.range || !data.checkedAt) return;
  const previous = snapshots.get(data.range);
  if (!previous || Date.parse(data.checkedAt) >= Date.parse(previous.checkedAt ?? '')) snapshots.set(data.range, data);
}
