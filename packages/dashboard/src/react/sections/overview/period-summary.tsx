'use client';

import { useTranslations } from 'next-intl';
import { formatCompactTokens, formatUsd } from '../../formatters';
import { CredibilityPill } from '../../components/credibility-pill';
import type { OverviewState } from './use-overview-state';

export function PeriodSummary({ selectedPeriodItem: period }: Pick<OverviewState, 'selectedPeriodItem'>) {
  const t = useTranslations('dashboard');
  const models = period?.modelBreakdowns ?? [];
  const unpriced = models.some(model => model.missingPricing);
  return (
    <div className="dashboard-period-summary">
      <div className="dashboard-period-totals">
        <span className="font-mono font-semibold text-[var(--color-text)]">{period?.fullLabel ?? '—'}</span>
        <span className="font-mono font-semibold tabular-nums text-[var(--color-text)]">{period ? formatCompactTokens(period.totalTokens) : '—'}</span>
        <span className="font-mono tabular-nums text-[var(--color-text-muted)]">{period ? '(' + formatUsd(period.cost) + ')' : '—'}</span>
        {models.length ? (
          <CredibilityPill label={t(unpriced ? 'overview.trend.unpricedSubset' : 'overview.trend.knownSubset')} tone={unpriced ? 'indigo' : 'emerald'} />
        ) : null}
      </div>
      <div className="dashboard-period-models dashboard-subtle-scrollbar">
        <div className="dashboard-period-model-track">
        <span className="shrink-0 whitespace-nowrap text-[0.7rem] text-[var(--color-nav-muted)]">{t('overview.trend.modelsOnDay', { count: models.length })}</span>
        {models.map(model => (
          <span key={model.modelName} className="shrink-0 whitespace-nowrap rounded-md border border-[var(--color-border)] bg-[var(--color-row-bg)] px-1.5 py-0.5 font-mono text-[0.68rem] tabular-nums text-[var(--color-text)]">
            {model.modelName}{' '}
            <span className="text-[var(--color-nav-muted)]">{model.missingPricing ? '—' : formatUsd(model.cost)}</span>
          </span>
        ))}
        </div>
      </div>
    </div>
  );
}
