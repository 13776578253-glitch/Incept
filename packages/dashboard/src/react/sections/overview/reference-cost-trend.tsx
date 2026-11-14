import { useState, type CSSProperties } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { dateWindow, type BillingDailyCost, type BillingReadResponse } from '../../../domain';
import type { BillingPreview } from '../../hooks/use-billing-preview';
import { CredibilityPill } from '../../components/credibility-pill';
import { formatCompactTokens, formatReferenceUsd, formatShortDate, referenceCoverageRatio } from '../../formatters';

export function buildReferenceTrendDays(data: BillingReadResponse): BillingDailyCost[] {
  const observed = data.breakdown?.days ?? [];
  if (!observed.length) return [];
  return data.range === 'all' ? observed : calendarDays(observed, dateWindow(data.range, Date.parse(data.asOf)));
}

export function resolveSelectedBillingDay(
  days: BillingDailyCost[],
  observed: BillingDailyCost[],
  selectedDay?: string,
): BillingDailyCost | undefined {
  return days.find(day => day.day === selectedDay) ?? observed[observed.length - 1];
}

export function ReferenceCostTrend({
  preview,
  selectedDay: controlledDay,
  onSelectDay,
}: {
  preview: BillingPreview;
  selectedDay?: string;
  onSelectDay?: (day: string) => void;
}) {
  const t = useTranslations('dashboard.costs.reference');
  const format = useFormatter();
  const [internalDay, setInternalDay] = useState<string>();
  const selectedDay = onSelectDay ? controlledDay : internalDay;
  const selectDay = onSelectDay ?? setInternalDay;
  const observed = preview.status === 'ready' ? preview.data.breakdown?.days : undefined;
  if (preview.status !== 'ready' || !observed?.length) {
    const message = observed ? 'emptyBreakdown' : preview.status === 'ready' ? 'breakdownUnavailable' : preview.status;
    return <p role="status" className="px-3 py-5 text-sm text-[var(--color-text-muted)]">{t(message)}</p>;
  }
  const days = buildReferenceTrendDays(preview.data);
  const active = resolveSelectedBillingDay(days, observed, selectedDay);
  if (!active) return null;
  const max = days.reduce((value, day) => Math.max(value, Number(day.estimatedCostUsd)), 0);
  const color = 'var(--badge-emerald-dot)';

  return (
    <div className="dashboard-trend-chart">
      <div className="dashboard-trend-scroll dashboard-subtle-scrollbar">
        <div className="dashboard-trend-columns" style={{ minWidth: Math.max(480, days.length * 32) }}>
          {days.map((day, index) => {
            const selected = day === active;
            const value = Number(day.estimatedCostUsd);
            const height = value > 0 && max > 0 ? Math.max(2, (value / max) * 100) : 0;
            const shortAmount = formatReferenceUsd(day.estimatedCostUsd, day.estimatedTokens);
            const fullAmount = formatReferenceUsd(day.estimatedCostUsd, day.estimatedTokens, true);
            const label = t('dailyPoint', { day: day.day, amount: fullAmount, tokens: format.number(day.unpricedTokens) });
            return (
              <button key={day.day} type="button" className="dashboard-trend-column"
                aria-label={label} title={label} aria-pressed={selected} data-selected={selected}
                onMouseEnter={() => selectDay(day.day)} onFocus={() => selectDay(day.day)} onClick={() => selectDay(day.day)}>
                <div className="dashboard-trend-plot">
                  {days.length <= 31 ? (
                    <span className="dashboard-trend-value" style={{ bottom: `calc(${height}% + 6px)` }}>{shortAmount}</span>
                  ) : null}
                  <div className="dashboard-trend-bar" data-selected={selected && value > 0}
                    style={{ height: height + '%', backgroundColor: color, '--trend-color': color } as CSSProperties} />
                </div>
                <span className="dashboard-trend-date">
                  {days.length <= 20 || selected || index % Math.ceil(days.length / 12) === 0 ? formatShortDate(day.day) : ''}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {!onSelectDay && (
        <p className="px-3 py-2 text-sm tabular-nums text-[var(--color-text)]">
          {t('dailyPoint', { day: active.day, amount: formatReferenceUsd(active.estimatedCostUsd, active.estimatedTokens, true), tokens: format.number(active.unpricedTokens) })}
        </p>
      )}
    </div>
  );
}

export function ReferenceCostPeriodSummary({ preview, selectedDay }: { preview: BillingPreview; selectedDay?: string }) {
  const t = useTranslations('dashboard.costs.reference');
  const format = useFormatter();
  const observed = preview.status === 'ready' ? preview.data.breakdown?.days : undefined;
  if (preview.status !== 'ready' || !observed?.length) {
    return (
      <div className="dashboard-period-summary">
        <div className="dashboard-period-totals text-[var(--color-nav-muted)]">
          <span>{t(preview.status === 'ready' ? (observed ? 'emptyBreakdown' : 'breakdownUnavailable') : preview.status)}</span>
        </div>
      </div>
    );
  }
  const days = buildReferenceTrendDays(preview.data);
  const active = resolveSelectedBillingDay(days, observed, selectedDay);
  if (!active) return null;
  const ratio = referenceCoverageRatio(active.estimatedTokens, active.unpricedTokens);
  const coverage = ratio === null
    ? t('notApplicable')
    : format.number(ratio, { style: 'percent', maximumFractionDigits: 1 });

  return (
    <div className="dashboard-period-summary">
      <div className="dashboard-period-totals">
        <span className="font-mono font-semibold text-[var(--color-text)]">{active.day}</span>
        <span className="font-mono font-semibold tabular-nums text-[var(--color-text)]">
          {formatReferenceUsd(active.estimatedCostUsd, active.estimatedTokens, true)}
        </span>
        <CredibilityPill label={t('coverage', { coverage })} tone={active.unpricedTokens > 0 ? 'indigo' : 'emerald'} />
      </div>
      <div className="dashboard-period-models dashboard-subtle-scrollbar">
        <div className="dashboard-period-model-track">
          <span className="shrink-0 whitespace-nowrap rounded-md border border-[var(--color-border)] bg-[var(--color-row-bg)] px-1.5 py-0.5 font-mono text-[0.68rem] tabular-nums text-[var(--color-text)]">
            {t('estimatedTokens')} {formatCompactTokens(active.estimatedTokens)}
          </span>
          <span className="shrink-0 whitespace-nowrap rounded-md border border-[var(--color-border)] bg-[var(--color-row-bg)] px-1.5 py-0.5 font-mono text-[0.68rem] tabular-nums text-[var(--color-text)]">
            {t('unpricedTokens')} {formatCompactTokens(active.unpricedTokens)}
          </span>
          <span className="shrink-0 whitespace-nowrap rounded-md border border-[var(--color-border)] bg-[var(--color-row-bg)] px-1.5 py-0.5 font-mono text-[0.68rem] tabular-nums text-[var(--color-text)]">
            {t('excludedTokens')} {formatCompactTokens(active.excludedTokens)}
          </span>
        </div>
      </div>
    </div>
  );
}

function calendarDays(observed: BillingDailyCost[], window: { from: string; calendarDays: number }): BillingDailyCost[] {
  const byDate = new Map(observed.map(day => [day.day, day]));
  const start = Date.parse(window.from);
  return Array.from({ length: window.calendarDays }, (_, index) => {
    const day = new Date(start + index * 86_400_000).toISOString().slice(0, 10);
    return byDate.get(day) ?? { day, estimatedCostUsd: '0', estimatedTokens: 0, unpricedTokens: 0, excludedTokens: 0 };
  });
}
