'use client';

import { useTranslations } from 'next-intl';
import type { TokenDashboardData } from '../../../domain/index';
import { formatCompactTokens, formatPercent } from '../../formatters';

type PricingCoveragePanelProps = {
  data: TokenDashboardData;
};

export function PricingCoveragePanel({
  data,
}: PricingCoveragePanelProps) {
  const t = useTranslations('dashboard');

  return (
    <div className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-card)]">
      <div className="border-b border-[var(--color-border)] px-5 py-3.5">
        <h3 className="text-[0.95rem] font-semibold text-[var(--color-text)]">
          {t('costs.coverage.title')}
        </h3>
        <p className="text-[0.73rem] text-[var(--color-nav-muted)]">
          {t('costs.coverage.subtitle')}
        </p>
      </div>

      <div className="divide-y divide-[var(--color-border)] px-5">
        {/* Row 1: Token Price Coverage Bar */}
        <div className="py-3.5">
          <div className="flex items-center justify-between text-[0.78rem]">
            <span className="font-medium text-[var(--color-text)]">
              {t('costs.coverage.pricedTokens')}
            </span>
            <span className="font-mono font-semibold tabular-nums text-[var(--color-text)]">
              {formatPercent(data.costs.tokenCoverageRate, 2)}
            </span>
          </div>
          <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-[var(--color-row-bg)]">
            <div
              style={{
                width: `${data.costs.tokenCoverageRate * 100}%`,
                backgroundColor: 'var(--badge-emerald-dot)',
              }}
            />
            <div
              className="flex-1"
              style={{ backgroundColor: 'var(--badge-rose-dot)' }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between font-mono text-[0.7rem] tabular-nums text-[var(--color-nav-muted)]">
            <span>
              {t('costs.coverage.pricedTokens')}:{' '}
              <strong className="text-[var(--color-text)]">
                {formatCompactTokens(data.costs.pricedTokens)}
              </strong>
            </span>
            <span>
              {t('costs.coverage.unpricedTokens')}:{' '}
              <strong className="text-[var(--color-text)]">
                {formatCompactTokens(data.costs.unpricedTokens)}
              </strong>
            </span>
          </div>
        </div>

        {/* Row 2: Priced Model Ratio */}
        <div className="flex items-center justify-between py-3 text-[0.78rem]">
          <span className="text-[var(--color-text-muted)]">
            {t('costs.coverage.modelCoverage')}
          </span>
          <span className="font-mono font-semibold tabular-nums text-[var(--color-text)]">
            {data.costs.pricedModelCount} / {data.costs.totalModelCount} (
            {formatPercent(data.costs.modelCoverageRate, 1)})
          </span>
        </div>

        {/* Row 3: Credibility Basis */}
        <div className="flex items-center justify-between py-3 text-[0.78rem]">
          <span className="text-[var(--color-text-muted)]">
            {t('costs.coverage.credibilityLabel')}
          </span>
          <span className="font-mono text-[0.72rem] text-[var(--color-text)]">
            {t('costs.coverage.credibilityValue')}
          </span>
        </div>

        {/* Row 4: Unpriced Subset List */}
        <div className="py-3.5">
          <div className="text-[0.76rem] font-semibold text-[var(--color-text)]">
            {t('costs.coverage.unpricedTitle')}
          </div>
          <p className="mt-0.5 text-[0.7rem] leading-5 text-[var(--color-nav-muted)]">
            {t('costs.coverage.unpricedNote')}
          </p>
          {data.costs.unpricedModels.length ? (
            <div className="mt-2.5 divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
              {data.costs.unpricedModels.map((um) => (
                <div
                  key={um.modelName}
                  className="flex items-center justify-between py-2 font-mono text-[0.73rem] tabular-nums"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[var(--color-text)]">
                      {um.modelName}
                    </span>
                    <span className="rounded border border-[var(--color-border)] bg-[var(--color-row-bg)] px-1.5 py-0.5 text-[0.62rem] text-[var(--color-nav-muted)]">
                      {um.source}
                    </span>
                  </div>
                  <span className="text-[var(--color-text-muted)]">
                    {formatCompactTokens(um.totalTokens)} · {um.sessionCount} sessions ·{' '}
                    <strong>—</strong>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[0.73rem] text-[var(--color-text)]">
              {t(data.costs.totalModelCount ? 'costs.coverage.allCovered' : 'page.noUsage')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
