import 'server-only';

import { listDocsWritingActivityEntries } from '@incept/db/docs';
import type {
  GitHubActivityPeriod,
  WritingActivityData,
  WritingActivityDay,
} from '@/features/about/activity-data';
import {
  addCalendarDays,
  createActivityRange,
  getAvailableActivityYears,
  getShanghaiDate,
} from './calendar';

// 按 Asia/Shanghai 聚合日记录，并固定映射为 0-3 档
function getWritingLevel(articleCount: number, writingUnits: number) {
  if (!articleCount) return 0;
  if (writingUnits >= 3000) return 3;
  if (writingUnits >= 1500) return 2;
  return 1;
}

export async function getWritingActivity({
  period,
}: {
  period: GitHubActivityPeriod;
}): Promise<WritingActivityData> {
  const years = getAvailableActivityYears();
  if (period !== 'all' && !years.includes(period as (typeof years)[number])) {
    throw new Error('Unsupported writing activity period.');
  }

  const range = period === 'all'
    ? createActivityRange(years[0])
    : createActivityRange(period, new Date(), 'calendar');
  const entries = await listDocsWritingActivityEntries();
  const entriesByDay = new Map<string, Map<number, number>>();

  for (const entry of entries) {
    const date = getShanghaiDate(entry.occurredAt);
    if (date < range.from || date > range.to) continue;

    const documents = entriesByDay.get(date) ?? new Map<number, number>();
    documents.set(entry.documentId, Math.max(documents.get(entry.documentId) ?? 0, entry.writingUnits));
    entriesByDay.set(date, documents);
  }

  const days: WritingActivityDay[] = [];
  for (let date = range.from; date <= range.to; date = addCalendarDays(date, 1)) {
    const documents = entriesByDay.get(date);
    const articleCount = documents?.size ?? 0;
    const writingUnits = documents
      ? [...documents.values()].reduce((total, units) => total + units, 0)
      : 0;

    days.push({
      date,
      count: getWritingLevel(articleCount, writingUnits),
      articleCount,
      writingUnits,
    });
  }

  return {
    range,
    days,
    articleCount: days.reduce((total, day) => total + day.articleCount, 0),
    writingUnits: days.reduce((total, day) => total + day.writingUnits, 0),
  };
}
