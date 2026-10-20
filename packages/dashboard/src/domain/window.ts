export type UsageRange = 'all' | '7d' | '14d' | '30d';
export const usageRanges: readonly UsageRange[] = ['all', '7d', '14d', '30d'];
export const dashboardTimeZone = 'Asia/Shanghai';

export function dashboardDate(timestampMs: number): string {
  return new Date(timestampMs + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function dateWindow(range: UsageRange, now: number, firstDate?: string) {
  const to = dashboardDate(now);
  const days = range === 'all' ? null : Number.parseInt(range, 10);
  const from = days === null ? (firstDate && firstDate < to ? firstDate : to)
    : new Date(Date.parse(`${to}T00:00:00Z`) - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const calendarDays = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  return { from, to, calendarDays };
}

export function nonNegative(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}
