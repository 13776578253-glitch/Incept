'use client';

import { useTranslations } from 'next-intl';
import type { TokenDashboardData } from '../../../domain/index';
import { formatCompactTokens, formatUsd, formatPercent } from '../../formatters';
import { CredibilityPill } from '../../components/credibility-pill';

type OverviewMetricsProps = {
  data: TokenDashboardData;
};

export function OverviewMetrics({
  data,
}: OverviewMetricsProps) {
  const t = useTranslations('dashboard');

  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
      {/* Card 1: Total Known Tokens */}
      <div className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.76rem] font-medium text-[var(--color-text-muted)]">
            {t('overview.kpi.knownTokens')}
          </span>
          <CredibilityPill label={t('overview.kpi.measuredBadge')} tone="sky" />
        </div>
        <div className="mt-2 text-[1.75rem] font-semibold tracking-[-0.04em] tabular-nums text-[var(--color-text)]">
          {formatCompactTokens(data.totals.totalTokens)}
        </div>
        <p className="mt-1.5 truncate font-mono text-[0.7rem] tabular-nums text-[var(--color-nav-muted)]">
          {t('overview.kpi.knownTokensSub', {
            input: formatCompactTokens(data.totals.inputTokens),
            output: formatCompactTokens(data.totals.outputTokens),
            cache: formatCompactTokens(data.totals.cacheReadTokens),
          })}
        </p>
      </div>

      {/* Card 2: Sessions & Active Days */}
      <div className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.76rem] font-medium text-[var(--color-text-muted)]">
            {t('overview.kpi.sessionsActivity')}
          </span>
          <CredibilityPill label={t('overview.kpi.measuredBadge')} tone="sky" />
        </div>
        <div className="mt-2 flex items-baseline gap-2 tabular-nums">
          <span className="text-[1.75rem] font-semibold tracking-[-0.04em] text-[var(--color-text)]">
            {t('overview.kpi.sessionsUnit', { count: data.totals.sessionCount })}
          </span>
        </div>
        <p className="mt-1.5 font-mono text-[0.7rem] tabular-nums text-[var(--color-nav-muted)]">
          {t('overview.kpi.sessionsActivitySub', {
            days: data.dateRange.activeDays,
            dailyAvg: formatCompactTokens(
              data.totals.totalTokens / Math.max(1, (data.dateRange.calendarDays ?? data.dateRange.activeDays)),
            ),
          })}
        </p>
      </div>

      {/* Card 3: Cache Hit Efficiency */}
      <div className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.76rem] font-medium text-[var(--color-text-muted)]">
            {t('overview.kpi.cacheEfficiency')}
          </span>
          <CredibilityPill label={t('overview.kpi.derivedBadge')} tone="indigo" />
        </div>
        <div className="mt-2 text-[1.75rem] font-semibold tracking-[-0.04em] tabular-nums text-[var(--color-text)]">
          {formatPercent(data.totals.cacheHitRate, 2)}
        </div>
        <p className="mt-1.5 font-mono text-[0.7rem] tabular-nums text-[var(--color-nav-muted)]">
          {t('overview.kpi.cacheEfficiencySub', {
            cacheRead: formatCompactTokens(data.totals.cacheReadTokens),
            outRatio: formatPercent(data.totals.outputToInputRatio, 2),
          })}
        </p>
      </div>

      {/* Card 4: Known API Equiv. Cost */}
      <div className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.76rem] font-medium text-[var(--color-text-muted)]">
            {t('overview.kpi.apiCost')}
          </span>
          <CredibilityPill label={t('overview.kpi.estimatedBadge')} tone="emerald" />
        </div>
        <div className="mt-2 text-[1.75rem] font-semibold tracking-[-0.04em] tabular-nums text-[var(--color-text)]">
          {formatUsd(data.totals.cost)}
        </div>
        <p className="mt-1.5 truncate font-mono text-[0.7rem] tabular-nums text-[var(--color-nav-muted)]">
          {t('overview.kpi.apiCostSub', {
            dailyAvg: formatUsd(data.costs.avgDailyCost),
            unitRate: formatUsd(data.costs.blendedCostPerMillion, 2),
            coverage: formatPercent(data.costs.tokenCoverageRate, 1),
          })}
        </p>
      </div>
    </div>
  );
}
