'use client';

import { useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { DailyUsagePoint } from '../../../domain';
import { formatCompactTokens } from '../../formatters';
import { adjacentMonth, calendarMonth } from './calendar-month';

type UsageCalendarProps = { points: DailyUsagePoint[]; selectedDate?: string; onSelect: (index: number) => void };

export function UsageCalendar(props: UsageCalendarProps) {
  const t = useTranslations('dashboard');
  if (!props.points.length) return <p className="text-sm text-[var(--color-nav-muted)]">{t('page.noUsage')}</p>;
  return <CalendarMonth key={props.points[0].date + ':' + props.points.at(-1)!.date} {...props} />;
}

function CalendarMonth({ points, selectedDate, onSelect }: UsageCalendarProps) {
  const locale = useLocale();
  const t = useTranslations('dashboard');
  const firstMonth = points[0].date.slice(0, 7);
  const lastMonth = points.at(-1)!.date.slice(0, 7);
  const [month, setMonth] = useState(selectedDate?.slice(0, 7) ?? lastMonth);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const cells = useMemo(() => calendarMonth(month), [month]);
  const usage = useMemo(() => new Map(points.map((point, index) => [point.date, { point, index }])), [points]);
  const maxTokens = Math.max(1, ...points.map(point => point.totalTokens));
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  const monthLabel = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(month + '-01T00:00:00Z'));
  const focusKey = cells.some(cell => cell.key === selectedDate && cell.inMonth) ? selectedDate
    : cells.find(cell => cell.inMonth && usage.has(cell.key))?.key;

  return <div className="dashboard-calendar">
    <div className="dashboard-calendar-caption">
      <h4 id="dashboard-calendar-month">{monthLabel}</h4>
      <div className="flex items-center gap-2">
        <button type="button" aria-label={t('overview.trend.previousMonth')} disabled={month <= firstMonth}
          onClick={() => setMonth(adjacentMonth(month, -1))}>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m14 6-6 6 6 6" /></svg>
        </button>
        <button type="button" aria-label={t('overview.trend.nextMonth')} disabled={month >= lastMonth}
          onClick={() => setMonth(adjacentMonth(month, 1))}>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m10 6 6 6-6 6" /></svg>
        </button>
      </div>
    </div>
    <div className="dashboard-calendar-grid" role="grid" aria-labelledby="dashboard-calendar-month">
      <div className="dashboard-calendar-weekdays" role="row">
        {Array.from({ length: 7 }, (_, index) => <span role="columnheader" key={index}>{weekday.format(new Date(Date.UTC(2026, 5, 1 + index)))}</span>)}
      </div>
      {Array.from({ length: 6 }, (_, week) => <div className="dashboard-calendar-week" role="row" key={week}>
        {cells.slice(week * 7, week * 7 + 7).map((cell, day) => {
          const entry = usage.get(cell.key);
          const disabled = !cell.inMonth || !entry;
          const tokens = entry?.point.totalTokens ?? 0;
          const intensity = tokens > 0 ? 15 + Math.round(tokens / maxTokens * 70) : 0;
          const selected = cell.key === selectedDate && !disabled;
          return <div role="gridcell" aria-selected={selected} key={cell.key}>
            <button type="button" ref={element => { buttons.current[week * 7 + day] = element; }}
              className="dashboard-calendar-day" disabled={disabled} data-selected={selected}
              data-outside={!cell.inMonth} tabIndex={cell.key === focusKey ? 0 : -1}
              aria-label={cell.key + ': ' + (disabled ? '—' : formatCompactTokens(tokens))}
              style={{ backgroundColor: intensity && !disabled ? `color-mix(in srgb, var(--badge-sky-dot) ${intensity}%, var(--color-row-bg))` : undefined }}
              onClick={() => { if (entry) onSelect(entry.index); }}
              onKeyDown={event => {
                const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 }[event.key];
                if (!step) return;
                event.preventDefault();
                let next = week * 7 + day + step;
                while (next >= 0 && next < 42 && buttons.current[next]?.disabled) next += step;
                buttons.current[next]?.focus();
              }}>
              <span>{cell.date.getUTCDate()}</span>
              <strong>{disabled ? '—' : formatCompactTokens(tokens)}</strong>
            </button>
          </div>;
        })}
      </div>)}
    </div>
    <div className="dashboard-calendar-legend">
      <span>{t('overview.trend.calendarLess')}</span>
      {[0, 20, 40, 60, 85].map(intensity => <span key={intensity} className="dashboard-calendar-swatch"
        style={{ backgroundColor: `color-mix(in srgb, var(--badge-sky-dot) ${intensity}%, var(--color-row-bg))` }} />)}
      <span>{t('overview.trend.calendarMore')}</span>
    </div>
  </div>;
}
