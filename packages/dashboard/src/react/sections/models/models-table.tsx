'use client';

import { ExpandRowsButton } from '../../components/expand-rows-button';
import { useExpandableRows } from '../../hooks/use-expandable-rows';
import { DashboardTableFrame } from '../../components/dashboard-table-frame';
import { useTranslations } from 'next-intl';
import type { TokenDashboardData } from '../../../domain/index';
import { formatKnownCost, formatCompactTokens, formatUsd, formatPercent } from '../../formatters';
import { ProviderBadge } from '../../components/provider-badge';
import { CredibilityPill } from '../../components/credibility-pill';
import type { ModelsState } from './use-models-state';

type ModelsTableProps = {
  data: TokenDashboardData;
} & Pick<ModelsState,
  'selectedModelSource'
  | 'setSelectedModelSource'
  | 'modelSort'
  | 'setModelSort'
  | 'modelSourceFilters'
  | 'sortedModels'
  | 'maxSortedModelMetric'
>;

export function ModelsTable({
  selectedModelSource,
  setSelectedModelSource,
  modelSort,
  setModelSort,
  modelSourceFilters,
  sortedModels,
  maxSortedModelMetric,
  data,
}: ModelsTableProps) {
  const t = useTranslations('dashboard');
  const { expanded, visibleRows, toggle } = useExpandableRows(sortedModels, 10, (data.range ?? 'all') + ':' + selectedModelSource);

  return (
    <div className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-card)]">
      <div className="space-y-3 border-b border-[var(--color-border)] px-5 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[0.95rem] font-semibold text-[var(--color-text)]">
              {t('models.table.title', { count: sortedModels.length })}
            </h3>
            <p className="text-[0.73rem] text-[var(--color-nav-muted)]">
              {t('models.table.subtitle')}
            </p>
          </div>
          <div className="inline-flex items-center rounded-[8px] border border-[var(--color-border)] bg-[var(--color-row-bg)] p-0.5">
            {(
              [
                { id: 'tokens', label: t('models.table.sortByTokens') },
                { id: 'cost', label: t('models.table.sortByCost') },
                { id: 'output', label: t('models.table.sortByOutput') },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setModelSort(item.id)}
                className={`rounded-[6px] px-2.5 py-1 text-[0.72rem] font-medium transition-all ${modelSort === item.id
                    ? 'bg-[var(--color-pill-active-bg)] text-[var(--color-text)] shadow-[var(--shadow-pill-active)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                  }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Source Filter Pill Bar */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedModelSource('all')}
            className={`rounded-md border px-2.5 py-1 text-[0.72rem] font-medium transition-colors ${selectedModelSource === 'all'
                ? 'border-[var(--color-text-soft)] bg-[var(--color-nav-item-hover)] text-[var(--color-text)]'
                : 'border-[var(--color-border)] bg-[var(--color-row-bg)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
              }`}
          >
            {t('models.table.filterAll', { count: data.models.length })}
          </button>
          {modelSourceFilters.map((sf) => {
            const active = selectedModelSource === sf.source;
            return (
              <button
                key={sf.source}
                type="button"
                onClick={() =>
                  setSelectedModelSource((cur) =>
                    cur === sf.source ? 'all' : sf.source,
                  )
                }
                className={`rounded-md border px-2.5 py-1 text-[0.72rem] font-medium transition-colors ${active
                    ? 'border-[var(--color-text-soft)] bg-[var(--color-nav-item-hover)] text-[var(--color-text)]'
                    : 'border-[var(--color-border)] bg-[var(--color-row-bg)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                  }`}
              >
                {sf.source} ({sf.count})
              </button>
            );
          })}
        </div>
      </div>

      <DashboardTableFrame rowLimit={10} expanded={expanded}>
        <table aria-label={t("models.table.title", { count: sortedModels.length })} className="dashboard-data-table w-full min-w-[860px] border-collapse text-left text-[0.8rem]">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[var(--color-nav-muted)]">
              <th className="py-2.5 pr-4">{t('models.table.colModel')}</th>
              <th className="px-3 py-2.5">{t('models.table.colSource')}</th>
              <th className="px-3 py-2.5 text-right">{t('models.table.colInput')}</th>
              <th className="px-3 py-2.5 text-right">{t('models.table.colCacheRead')}</th>
              <th className="px-3 py-2.5 text-right">{t('models.table.colOutput')}</th>
              <th className="px-3 py-2.5 text-right">{t('models.table.colCacheHit')}</th>
              <th className="px-4 py-2.5">{t('models.table.colTotal')}</th>
              <th className="py-2.5 pl-3 text-right">{t('models.table.colCost')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)] tabular-nums">
            {visibleRows.map((model, idx) => {
              const isSlot = model.slotStatus === 'configured';
              const metricVal =
                modelSort === 'cost'
                  ? model.cost
                  : modelSort === 'output'
                    ? model.outputTokens
                    : model.totalTokens;
              const relToTop = isSlot
                ? 0
                : Math.max(2, Math.round((metricVal / maxSortedModelMetric) * 100));

              return (
                <tr
                  key={model.modelName}
                  className={`${isSlot ? 'opacity-75' : ''
                    }`}
                >
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2.5">
                      <span className="w-5 font-mono text-[0.7rem] text-[var(--color-nav-muted)]">
                        #{idx + 1}
                      </span>
                      <ProviderBadge provider={model.provider} />
                      <div>
                        <div className="font-mono text-[0.8rem] font-medium text-[var(--color-text)]">
                          {model.modelName}
                        </div>
                        <div className="text-[0.68rem] text-[var(--color-nav-muted)]">
                          {model.displayName}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center rounded-md border border-[var(--surface-chip-border)] bg-[var(--surface-chip-bg)] px-2 py-0.5 font-mono text-[0.68rem] text-[var(--color-text)]">
                      {model.source}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-[var(--color-text-muted)]">
                    {isSlot ? '—' : formatCompactTokens(model.inputTokens)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-[var(--color-text-muted)]">
                    {isSlot ? '—' : formatCompactTokens(model.cacheReadTokens)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-[var(--color-text-muted)]">
                    {isSlot ? '—' : formatCompactTokens(model.outputTokens)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono font-medium text-[var(--color-text)]">
                    {isSlot ? '—' : formatPercent(model.cacheHitRate, 1)}
                  </td>
                  <td className="px-4 py-3">
                    {isSlot ? (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between font-mono text-[0.73rem] text-[var(--color-nav-muted)]">
                          <span>{formatKnownCost(model.cost, model.missingPricing)}</span>
                          <span>{t('models.table.slotBadge')}</span>
                        </div>
                        <div className="h-1.5 w-36 rounded-full border border-dashed border-[var(--color-border)]" />
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-2 font-mono text-[0.75rem]">
                          <span className="font-semibold text-[var(--color-text)]">
                            {formatCompactTokens(model.totalTokens)}
                          </span>
                          <span className="text-[var(--color-nav-muted)]">
                            {formatPercent(model.shareOfTokens, 2)}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 w-36 overflow-hidden rounded-full bg-[var(--color-row-bg)]">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${relToTop}%`,
                              backgroundColor: 'var(--badge-indigo-dot)',
                            }}
                          />
                        </div>
                      </>
                    )}
                  </td>
                  <td className="py-3 pl-3 text-right font-mono">
                    {isSlot ? (
                      <CredibilityPill
                        label={t('models.table.slotBadge')}
                        tone="indigo"
                      />
                    ) : model.missingPricing ? (
                      <span className="inline-flex items-center gap-1.5 text-[var(--color-nav-muted)]">
                        <span>—</span>
                        <CredibilityPill
                          label={t('models.table.unpricedBadge')}
                          tone="rose"
                        />
                      </span>
                    ) : (
                      <span className="font-semibold text-[var(--color-text)]">
                        {formatUsd(model.cost)}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </DashboardTableFrame>
      <ExpandRowsButton preservePagePosition expanded={expanded} count={sortedModels.length} limit={10} onToggle={toggle}
        expandLabel={t('models.table.showAll', { count: sortedModels.length })}
        collapseLabel={t('models.table.showLess')} />
    </div>
  );
}
