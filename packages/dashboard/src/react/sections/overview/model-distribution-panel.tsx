'use client';

import { ExpandRowsButton } from '../../components/expand-rows-button';
import { useTranslations } from 'next-intl';
import type { TokenDashboardData } from '../../../domain/index';
import { formatCompactTokens, formatUsd, formatPercent } from '../../formatters';
import { MODEL_COLORS } from '../../model-colors';
import type { OverviewState } from './use-overview-state';

type ModelDistributionPanelProps = {
  data: TokenDashboardData;
} & Pick<OverviewState, 'showAllOverviewModels' | 'setShowAllOverviewModels' | 'maxModelTokens' | 'overviewModelsVisible'>;

export function ModelDistributionPanel({
  showAllOverviewModels,
  setShowAllOverviewModels,
  maxModelTokens,
  overviewModelsVisible,
  data,
}: ModelDistributionPanelProps) {
  const t = useTranslations('dashboard');

  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-card)]">
      <div className="shrink-0 border-b border-[var(--color-border)] px-5 py-3.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[0.95rem] font-semibold text-[var(--color-text)]">
            {t('overview.distribution.title')}
          </h3>
          <span className="rounded-md border border-[var(--surface-chip-border)] bg-[var(--surface-chip-bg)] px-2 py-0.5 font-mono text-[0.7rem] tabular-nums text-[var(--color-text-muted)]">
            {data.models.length}
          </span>
        </div>
        <p className="text-[0.73rem] text-[var(--color-nav-muted)]">
          {t('overview.distribution.subtitle')}
        </p>

        {/* Global Share Bar */}
        <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-[var(--color-row-bg)]">
          {data.models
            .filter((m) => m.totalTokens > 0)
            .map((model, index) => (
              <div
                key={model.modelName}
                style={{
                  width: `${model.shareOfTokens * 100}%`,
                  backgroundColor: MODEL_COLORS[index % MODEL_COLORS.length],
                }}
                className="h-full"
                title={`${model.modelName}: ${formatPercent(model.shareOfTokens, 2)}`}
              />
            ))}
        </div>
      </div>

      {/* Flat Divide-Y Ranking Rows */}
      <div style={{ height: Math.min(data.models.length, 10) * 56 }} className={`dashboard-ranking-rows dashboard-subtle-scrollbar divide-y divide-[var(--color-border)] px-5 ${showAllOverviewModels ? 'is-expanded' : ''}`}>
        {overviewModelsVisible.map((model, index) => {
          const isSlot = model.slotStatus === 'configured';
          const relativeToTopPct = isSlot
            ? 0
            : Math.max(2, Math.round((model.totalTokens / maxModelTokens) * 100));
          return (
            <div
              key={model.modelName}
              className={`dashboard-ranking-row ${isSlot ? 'opacity-75' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="w-5 font-mono text-[0.68rem] text-[var(--color-nav-muted)]">
                    #{index + 1}
                  </span>
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{
                      backgroundColor: MODEL_COLORS[index % MODEL_COLORS.length],
                    }}
                  />
                  <span className="truncate font-mono text-[0.76rem] font-medium text-[var(--color-text)]">
                    {model.modelName}
                  </span>
                  <span className="hidden rounded border border-[var(--color-border)] bg-[var(--color-row-bg)] px-1.5 py-0.5 text-[0.62rem] text-[var(--color-nav-muted)] sm:inline-block">
                    {model.source}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2.5 font-mono text-[0.74rem] tabular-nums">
                  <span className="font-semibold text-[var(--color-text)]">
                    {isSlot ? '—' : formatCompactTokens(model.totalTokens)}
                  </span>
                  <span className="w-12 text-right text-[var(--color-text-muted)]">
                    {isSlot ? '—' : formatPercent(model.shareOfTokens, 1)}
                  </span>
                </div>
              </div>

              {/* Relative-to-#1 Bar + Cost */}
              <div className="mt-1.5 flex items-center gap-3 pl-7">
                {isSlot ? (
                  <div className="h-1.5 flex-1 rounded-full border border-dashed border-[var(--color-border)]" />
                ) : (
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-row-bg)]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${relativeToTopPct}%`,
                        backgroundColor: MODEL_COLORS[index % MODEL_COLORS.length],
                      }}
                    />
                  </div>
                )}
                <span className="w-28 shrink-0 whitespace-nowrap text-right font-mono text-[0.68rem] tabular-nums text-[var(--color-nav-muted)]">
                  {isSlot
                    ? t('overview.distribution.slotBadge')
                    : model.missingPricing
                      ? '—'
                      : formatUsd(model.cost)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <ExpandRowsButton preservePagePosition expanded={showAllOverviewModels} count={data.models.length} limit={10}
        onToggle={() => setShowAllOverviewModels(value => !value)}
        expandLabel={t('overview.distribution.showAllModels', { count: data.models.length })}
        collapseLabel={t('overview.distribution.showTopModels')} />
    </div>
  );
}
