'use client';

import { useTranslations } from 'next-intl';
import type { TokenDashboardData } from '../../../domain/index';
import { formatCompactTokens, formatUsd, formatPercent } from '../../formatters';

type CostMetricsProps = {
  data: TokenDashboardData;
};

export function CostMetrics({
  data,
}: CostMetricsProps) {
  const t = useTranslations('dashboard');

  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-4">
        <span className="text-[0.75rem] font-medium text-[var(--color-text-muted)]">
          {t('costs.cards.totalCost')}
        </span>
        <div className="mt-2 text-[1.7rem] font-semibold tracking-[-0.04em] tabular-nums text-[var(--color-text)]">
          {formatUsd(data.costs.totalCost)}
        </div>
        <p className="mt-1 text-[0.7rem] leading-5 text-[var(--color-nav-muted)]">
          {t('costs.cards.totalCostDesc')}
        </p>
      </div>

      <div className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-4">
        <span className="text-[0.75rem] font-medium text-[var(--color-text-muted)]">
          {t('costs.cards.cacheSavings')}
        </span>
        <div
          className="mt-2 text-[1.7rem] font-semibold tracking-[-0.04em] tabular-nums"
          style={{ color: 'var(--badge-emerald-fg)' }}
        >
          ~{formatUsd(data.costs.estimatedCacheSavings)}
        </div>
        <p className="mt-1 text-[0.7rem] leading-5 text-[var(--color-nav-muted)]">
          {t('costs.cards.cacheSavingsDesc')}
        </p>
      </div>

      <div className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-4">
        <span className="text-[0.75rem] font-medium text-[var(--color-text-muted)]">
          {t('costs.cards.peakDay')}
        </span>
        <div className="mt-2 text-[1.7rem] font-semibold tracking-[-0.04em] tabular-nums text-[var(--color-text)]">
          {formatUsd(data.costs.peakDay.cost)}
        </div>
        <p className="mt-1 text-[0.7rem] leading-5 text-[var(--color-nav-muted)]">
          {t('costs.cards.peakDayDesc', {
            date: data.costs.peakDay.date,
            tokens: formatCompactTokens(data.costs.peakDay.tokens),
          })}
        </p>
      </div>

      <div className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-4">
        <span className="text-[0.75rem] font-medium text-[var(--color-text-muted)]">
          {t('costs.cards.tokenCoverage')}
        </span>
        <div className="mt-2 text-[1.7rem] font-semibold tracking-[-0.04em] tabular-nums text-[var(--color-text)]">
          {formatPercent(data.costs.tokenCoverageRate, 2)}
        </div>
        <p className="mt-1 text-[0.7rem] leading-5 text-[var(--color-nav-muted)]">
          {t('costs.cards.tokenCoverageDesc', {
            priced: formatCompactTokens(data.costs.pricedTokens),
            total: formatCompactTokens(data.totals.totalTokens),
          })}
        </p>
      </div>
    </div>
  );
}
