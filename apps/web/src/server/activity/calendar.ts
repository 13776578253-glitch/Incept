import type { ActivityDay, ActivityRange } from '@/features/about/activity-data';

// 全局时区：上海
export const ACTIVITY_TIME_ZONE = 'Asia/Shanghai';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: ACTIVITY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function getDateParts(date: Date) {
  const parts = dateFormatter.formatToParts(date);
  const valueFor = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;

  const year = valueFor('year');
  const month = valueFor('month');
  const day = valueFor('day');

  if (!year || !month || !day) {
    throw new Error('Could not resolve a Shanghai calendar date.');
  }

  return { year: Number(year), month: Number(month), day: Number(day) };
}

function formatDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function getShanghaiDate(date = new Date()) {
  const { year, month, day } = getDateParts(date);
  return formatDate(year, month, day);
}

export function addCalendarDays(date: string, amount: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

export function getAvailableActivityYears(now = new Date()) {
  const currentYear = Number(getShanghaiDate(now).slice(0, 4));
  return [currentYear, currentYear - 1] as const;
}

/**
 * 创建一个活动数据的日期范围
 * @param year  目标年份
 * @param now   当前时间（用于判断是否为当前年份）
 * @param mode  范围模式：'rolling' 最近363天滚动窗口，'calendar' 自然年
 *              默认规则：当年 rolling，往年 calendar
 */
export function createActivityRange(
  year: number,
  now = new Date(),
  mode: 'rolling' | 'calendar' = year === Number(getShanghaiDate(now).slice(0, 4))
    ? 'rolling'
    : 'calendar',
): ActivityRange {
  const today = getShanghaiDate(now);

  if (mode === 'rolling') {
    return {
      year,
      kind: 'rolling',
      from: addCalendarDays(today, -363),
      to: today,
    };
  }

  return {
    year,
    kind: 'calendar',
    from: `${year}-01-01`,
    to: `${year}-12-31`,
  };
}

export function toShanghaiDateTime(date: string, endOfDay = false) {
  return `${date}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+08:00`;
}

export function normalizeActivityDays(
  range: ActivityRange,
  countedDays: Iterable<ActivityDay>,
) {
  const counts = new Map<string, number>();

  for (const { date, count } of countedDays) {
    if (date >= range.from && date <= range.to) {
      counts.set(date, (counts.get(date) ?? 0) + count);
    }
  }

  const days: ActivityDay[] = [];
  for (let date = range.from; date <= range.to; date = addCalendarDays(date, 1)) {
    days.push({ date, count: counts.get(date) ?? 0 });
  }

  return days;
}

export function getActivityTotal(days: ActivityDay[]) {
  return days.reduce((total, day) => total + day.count, 0);
}
