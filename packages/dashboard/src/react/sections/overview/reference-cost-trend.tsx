import { useState, type CSSProperties } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import type { BillingPreview } from '../../hooks/use-billing-preview';
import { formatShortDate, formatUsd } from '../../formatters';

export function ReferenceCostTrend({ preview }: { preview: BillingPreview }) {
  const t = useTranslations('dashboard.costs.reference');
  const format = useFormatter();
  const [selectedDay, setSelectedDay] = useState<string>();
  const days = preview.status === 'ready' ? preview.data.breakdown?.days : undefined;
  if (!days?.length) {
    const message = days ? 'emptyBreakdown' : preview.status === 'ready' ? 'breakdownUnavailable' : preview.status;
    return <p role="status" className="px-3 py-5 text-sm text-[var(--color-text-muted)]">{t(message)}</p>;
  }
  const active = days.find(day => day.day === selectedDay) ?? days[days.length - 1];
  const max = days.reduce((value, day) => Math.max(value, Number(day.estimatedCostUsd)), 0);
  const amount = (day: typeof active) => day.estimatedTokens > 0 ? formatUsd(Number(day.estimatedCostUsd)) + ' USD' : '—';
  const color = 'var(--badge-emerald-dot)';

  return <div className="dashboard-trend-chart">
    <div className="dashboard-trend-scroll dashboard-subtle-scrollbar">
      <div className="dashboard-trend-columns" style={{ minWidth: days.length * 44 }}>
        {days.map((day, index) => {
          const selected = day === active;
          const value = Number(day.estimatedCostUsd);
          const height = value > 0 ? Math.max(2, value / max * 100) : 0;
          const label = t('dailyPoint', { day: day.day, amount: amount(day), tokens: format.number(day.unpricedTokens) });
          return <button key={day.day} type="button" className="dashboard-trend-column focus-visible:ring-2 focus-visible:ring-[var(--badge-sky-dot)]" aria-label={label}
            title={label} aria-pressed={selected} data-selected={selected}
            onMouseEnter={() => setSelectedDay(day.day)} onFocus={() => setSelectedDay(day.day)} onClick={() => setSelectedDay(day.day)}>
            <div className="dashboard-trend-plot">
              <div className="dashboard-trend-bar" data-selected={selected && value > 0}
                style={{ height: height + '%', backgroundColor: color, '--trend-color': color } as CSSProperties} />
            </div>
            <span className="dashboard-trend-date">
              {days.length <= 14 || selected || index % Math.ceil(days.length / 10) === 0 ? formatShortDate(day.day) : ''}
            </span>
          </button>;
        })}
      </div>
    </div>
    <p className="px-3 py-2 text-sm tabular-nums text-[var(--color-text)]">
      {t('dailyPoint', { day: active.day, amount: amount(active), tokens: format.number(active.unpricedTokens) })}
    </p>
  </div>;
}
