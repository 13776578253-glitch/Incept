'use client';

import { useTranslations } from 'next-intl';
import type { DailyUsagePoint, TokenDashboardData } from '../../../domain';
import {
  buildModelLifecycles,
  findPeakTokenDay,
  resolveBreakdownTokens,
} from '../../analytics/derive-analytics';
import {
  formatCompactTokens,
  formatKnownCost,
  formatPercent,
  formatReferenceUsd,
  referenceCoverageRatio,
} from '../../formatters';
import type { BillingPreview } from '../../hooks/use-billing-preview';

type KpiStripProps = {
  data: TokenDashboardData;
  billingPreview?: BillingPreview;
  viewMode: 'range' | 'day';
  selectedDay: DailyUsagePoint | null;
};

const stripClass = 'grid grid-cols-1 gap-y-4 border-y border-[var(--color-border-faint)] py-3.5 sm:grid-cols-2 xl:grid-cols-4 xl:gap-y-0 xl:divide-x xl:divide-[var(--color-border-faint)]';
const colBase = 'min-w-0 sm:px-4 sm:first:pl-0 sm:last:pr-0 xl:px-5';

export function KpiStripPlaceholder() {
  return (
    <div aria-hidden="true" className={stripClass}>
      {[0, 1, 2, 3].map(index => (
        <div key={index} className={`${colBase} flex min-h-[58px] flex-col justify-center gap-2 motion-safe:animate-pulse`}>
          <div className="h-2.5 w-20 rounded-full bg-[var(--color-row-bg)]" />
          <div className="h-5 w-28 rounded bg-[var(--color-row-bg)]" />
          <div className="h-2.5 w-24 rounded-full bg-[var(--color-row-bg)]" />
        </div>
      ))}
    </div>
  );
}

export function KpiStrip({
  data,
  billingPreview,
  viewMode,
  selectedDay,
}: KpiStripProps) {
  const t = useTranslations('dashboard');
  const activeModels = buildModelLifecycles(data.daily, data.models);
  const measuredModels = data.models.filter(
    (m) => m.slotStatus !== 'configured' && m.totalTokens > 0,
  );
  const topModel = [...measuredModels].sort((a, b) => b.totalTokens - a.totalTokens)[0];
  const peakDay = findPeakTokenDay(data.daily);

  const windowDays = Math.max(1, data.dateRange.calendarDays ?? (data.dateRange.activeDays || 1));
  const windowDailyAvg = data.totals.totalTokens / windowDays;

  const isSingleDay = viewMode === 'day' && selectedDay !== null;

  const displayTokens = isSingleDay
    ? resolveBreakdownTokens(selectedDay)
    : data.totals.totalTokens;

  const dayPrompt = isSingleDay
    ? (selectedDay.inputTokens || 0) +
      (selectedDay.cacheReadTokens || 0) +
      (selectedDay.cacheCreationTokens || 0)
    : (data.totals.inputTokens || 0) +
      (data.totals.cacheReadTokens || 0) +
      (data.totals.cacheCreationTokens || 0);

  const displayCacheHit = isSingleDay
    ? dayPrompt > 0
      ? selectedDay.cacheReadTokens / dayPrompt
      : 0
    : data.totals.cacheHitRate;

  const displayOutInRatio = isSingleDay
    ? dayPrompt > 0
      ? ((selectedDay.outputTokens || 0) + (selectedDay.reasoningTokens || 0)) / dayPrompt
      : 0
    : data.totals.outputToInputRatio;

  const displayDayTopModel = isSingleDay
    ? [...selectedDay.modelBreakdowns].sort(
        (a, b) => resolveBreakdownTokens(b) - resolveBreakdownTokens(a),
      )[0]
    : null;

  const dayBillingPoint =
    isSingleDay && billingPreview?.status === 'ready'
      ? billingPreview.data.breakdown?.days.find((d) => d.day === selectedDay.date)
      : undefined;


  const renderCostColumn = () => {
    if (isSingleDay && billingPreview) {
      if (billingPreview.status === 'loading') {
        return (
          <article className={colBase}>
            <p className="text-[0.72rem] font-medium text-[var(--color-text-muted)]">
              {t('workbench.referenceCost')}
            </p>
            <p className="mt-1.5 text-[0.82rem] text-[var(--color-text-soft)]">
              {t('costs.reference.loading')}
            </p>
          </article>
        );
      }
      if (billingPreview.status === 'unavailable') {
        return (
          <article className={colBase}>
            <p className="text-[0.72rem] font-medium text-[var(--color-text-muted)]">
              {t('workbench.referenceCost')}
            </p>
            <p className="mt-1.5 text-[0.82rem] text-[var(--color-text-soft)]">
              {t('costs.reference.unavailable')}
            </p>
          </article>
        );
      }
      const valueText = dayBillingPoint
        ? formatReferenceUsd(
            dayBillingPoint.estimatedCostUsd,
            dayBillingPoint.estimatedTokens,
            true,
          )
        : '—';
      const cov = dayBillingPoint
        ? referenceCoverageRatio(
            dayBillingPoint.estimatedTokens,
            dayBillingPoint.unpricedTokens,
          )
        : null;
      return (
        <article className={colBase}>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[0.72rem] font-medium text-[var(--color-text-muted)]">
              {t('workbench.referenceCost')}
            </span>
            <span className="shrink-0 rounded-full bg-[var(--surface-chip-bg,var(--color-row-bg))] px-2 py-0.5 text-[0.64rem] text-[var(--color-text-muted)]">
              {t('costs.reference.reviewedBadge')}
            </span>
          </div>
          <p className="mt-1 font-mono text-[1.45rem] font-semibold leading-tight tracking-tight tabular-nums text-[var(--color-text)]">
            {valueText}
          </p>
          <p className="mt-1 truncate text-[0.71rem] tabular-nums text-[var(--color-text-soft)]">
            {cov !== null
              ? t('costs.reference.coverage', { coverage: formatPercent(cov, 0) })
              : selectedDay.date}
          </p>
        </article>
      );
    }

    if (billingPreview) {
      if (billingPreview.status === 'loading') {
        return (
          <article className={colBase}>
            <p className="text-[0.72rem] font-medium text-[var(--color-text-muted)]">
              {t('workbench.referenceCost')}
            </p>
            <p className="mt-1.5 text-[0.82rem] text-[var(--color-text-soft)]">
              {t('costs.reference.loading')}
            </p>
          </article>
        );
      }
      if (billingPreview.status !== 'ready') {
        return (
          <article className={colBase}>
            <p className="text-[0.72rem] font-medium text-[var(--color-text-muted)]">
              {t('workbench.referenceCost')}
            </p>
            <p className="mt-1.5 text-[0.82rem] text-[var(--color-text-soft)]">
              {t('costs.reference.unavailable')}
            </p>
          </article>
        );
      }
      const billing = billingPreview.data;
      const cov = referenceCoverageRatio(billing.estimatedTokens, billing.unpricedTokens);
      const isCatchingUp =
        billing.liveRevision !== undefined && billing.liveRevision !== billing.revision;

      return (
        <article className={colBase}>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[0.72rem] font-medium text-[var(--color-text-muted)]">
              {t('workbench.referenceCost')}
            </span>
            <span className="shrink-0 rounded-full bg-[var(--surface-chip-bg,var(--color-row-bg))] px-2 py-0.5 text-[0.64rem] text-[var(--color-text-muted)]">
              {t('costs.reference.reviewedBadge')}
            </span>
          </div>
          <p className="mt-1 font-mono text-[1.45rem] font-semibold leading-tight tracking-tight tabular-nums text-[var(--color-text)]">
            {formatReferenceUsd(billing.estimatedCostUsd, billing.estimatedTokens, true)}
          </p>
          <p className="mt-1 truncate text-[0.71rem] tabular-nums text-[var(--color-text-soft)]">
            {cov !== null
              ? t('costs.reference.coverage', { coverage: formatPercent(cov, 0) })
              : t('costs.reference.notApplicable')}
            {isCatchingUp
              ? ` · ${t('costs.reference.catchingUp', {
                  revision: billing.revision,
                  liveRevision: billing.liveRevision ?? billing.revision,
                })}`
              : ''}
          </p>
        </article>
      );
    }

    const usageCost = isSingleDay ? selectedDay.cost : data.totals.cost;
    const hasCost = usageCost > 0;
    if (hasCost) {
      const dayActiveModels = isSingleDay
        ? selectedDay.modelBreakdowns.filter((b) => resolveBreakdownTokens(b) > 0).length
        : 0;
      return (
        <article className={colBase}>
          <p className="text-[0.72rem] font-medium text-[var(--color-text-muted)]">
            {t('workbench.referenceCost')}
          </p>
          <p className="mt-1 font-mono text-[1.45rem] font-semibold leading-tight tracking-tight tabular-nums text-[var(--color-text)]">
            {formatKnownCost(usageCost, isSingleDay ? selectedDay.missingPricing : data.totals.missingPricing)}
          </p>
          <p className="mt-1 truncate text-[0.71rem] tabular-nums text-[var(--color-text-soft)]">
            {isSingleDay
              ? t('workbench.dayKnownSummary', {
                  tokens: formatCompactTokens(displayTokens),
                  models: dayActiveModels,
                })
              : t('workbench.activeDaysSessions', {
                  days: data.dateRange.activeDays,
                  sessions: data.totals.sessionCount,
                })}
          </p>
        </article>
      );
    }

    return (
      <article className={colBase}>
        <p className="text-[0.72rem] font-medium text-[var(--color-text-muted)]">
          {t('workbench.activeOverview')}
        </p>
        <p className="mt-1 font-mono text-[1.45rem] font-semibold leading-tight tracking-tight tabular-nums text-[var(--color-text)]">
          {data.dateRange.activeDays}d
        </p>
        <p className="mt-1 truncate text-[0.71rem] tabular-nums text-[var(--color-text-soft)]">
          {t('workbench.activeDaysSessions', {
            days: data.dateRange.activeDays,
            sessions: data.totals.sessionCount,
          })}
        </p>
      </article>
    );
  };

  return (
    <section
      aria-label={t('overview.title')}
      className={stripClass}
    >
      {/* Col 1: Throughput */}
      <article className={colBase}>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[0.72rem] font-medium text-[var(--color-text-muted)]">
            {t('workbench.totalThroughput')}
          </span>
          <span className="shrink-0 rounded-full bg-[var(--surface-chip-bg,var(--color-row-bg))] px-2 py-0.5 font-mono text-[0.64rem] tabular-nums text-[var(--color-text-muted)]">
            {isSingleDay ? selectedDay.date : `${data.dateRange.activeDays}d`}
          </span>
        </div>
        <p className="mt-1 font-mono text-[1.45rem] font-semibold leading-tight tracking-tight tabular-nums text-[var(--color-text)]">
          {formatCompactTokens(displayTokens)}
        </p>
        <p className="mt-1 truncate text-[0.71rem] tabular-nums text-[var(--color-text-soft)]">
          {isSingleDay
            ? `${t('workbench.dayVsAvg')}: ${
                windowDailyAvg > 0
                  ? `${((displayTokens / windowDailyAvg) * 100).toFixed(0)}%`
                  : '—'
              }`
            : peakDay
              ? `${t('workbench.dailyAvg', { value: formatCompactTokens(windowDailyAvg) })} · ${t(
                  'workbench.peakDay',
                  {
                    date: peakDay.date.slice(5),
                    value: formatCompactTokens(resolveBreakdownTokens(peakDay)),
                  },
                )}`
              : t('workbench.dailyAvg', { value: formatCompactTokens(windowDailyAvg) })}
        </p>
      </article>

      {/* Col 2: Weighted Cache Efficiency */}
      <article className={colBase}>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[0.72rem] font-medium text-[var(--color-text-muted)]">
            {t('workbench.weightedCacheHit')}
          </span>
        </div>
        <p className="mt-1 font-mono text-[1.45rem] font-semibold leading-tight tracking-tight tabular-nums text-[var(--color-text)]">
          {dayPrompt > 0 ? formatPercent(displayCacheHit) : '—'}
        </p>
        <p className="mt-1 truncate text-[0.71rem] tabular-nums text-[var(--color-text-soft)]">
          {t('workbench.cacheReadSub', {
            value: formatCompactTokens(
              isSingleDay ? selectedDay.cacheReadTokens || 0 : data.totals.cacheReadTokens || 0,
            ),
          })}{' '}
          · {t('workbench.outputInputRatio', { ratio: displayOutInRatio.toFixed(2) })}
        </p>
      </article>

      {/* Col 3: Lead Model */}
      <article className={colBase}>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[0.72rem] font-medium text-[var(--color-text-muted)]">
            {t('workbench.topModel')}
          </span>
          <span className="shrink-0 rounded-full bg-[var(--surface-chip-bg,var(--color-row-bg))] px-2 py-0.5 font-mono text-[0.64rem] tabular-nums text-[var(--color-text-muted)]">
            {t('workbench.activeModelsCount', {
              count: isSingleDay
                ? selectedDay.modelBreakdowns.filter((m) => resolveBreakdownTokens(m) > 0).length
                : activeModels.length,
            })}
          </span>
        </div>
        <p
          className="mt-1 truncate font-mono text-[1.22rem] font-semibold leading-tight tracking-tight text-[var(--color-text)]"
          title={
            isSingleDay
              ? displayDayTopModel?.modelName
              : topModel?.displayName || topModel?.modelName
          }
        >
          {isSingleDay
            ? displayDayTopModel?.modelName ?? t('workbench.noActiveModel')
            : topModel?.displayName || topModel?.modelName || t('workbench.noActiveModel')}
        </p>
        <p className="mt-1 truncate text-[0.71rem] tabular-nums text-[var(--color-text-soft)]">
          {isSingleDay
            ? displayDayTopModel && displayTokens > 0
              ? t('workbench.topShare', {
                  share: formatPercent(resolveBreakdownTokens(displayDayTopModel) / displayTokens),
                })
              : t('workbench.noData')
            : topModel
              ? `${formatCompactTokens(topModel.totalTokens)} · ${t('workbench.topShare', {
                  share: formatPercent(topModel.shareOfTokens),
                })}`
              : t('workbench.noData')}
        </p>
      </article>

      {/* Col 4: Reviewed Billing Cost / Activity Fallback */}
      {renderCostColumn()}
    </section>
  );
}
