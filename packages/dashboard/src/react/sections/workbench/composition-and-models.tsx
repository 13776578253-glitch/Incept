'use client';

import { useTranslations } from 'next-intl';
import { Fragment, useMemo, useState } from 'react';
import type { DailyUsagePoint, ModelUsageSummary, TokenDashboardData } from '../../../domain';
import {
  buildStableModelColorMap,
  deriveTokenComposition,
  resolveBreakdownTokens,
  type DashboardColorOverrides,
} from '../../analytics/derive-analytics';
import {
  formatCompactTokens,
  formatFullNumber,
  formatKnownCost,
  formatPercent,
  formatUsd,
} from '../../formatters';
import type { BillingPreview } from '../../hooks/use-billing-preview';
import { ProviderBadge } from '../../components/provider-badge';
import { IconChevronDown, IconChevronRight, IconLineChart } from './workbench-icons';

type ModelSortKey = 'tokens' | 'cacheHit' | 'cost' | 'meanSession';

type CompositionAndModelsProps = {
  data: TokenDashboardData;
  billingPreview?: BillingPreview;
  colorOverrides?: DashboardColorOverrides;
  viewMode: 'range' | 'day';
  selectedDay: DailyUsagePoint | null;
  onInspectModelCache: (modelName: string) => void;
};

export function CompositionAndModels({
  data,
  billingPreview,
  colorOverrides,
  viewMode,
  selectedDay,
  onInspectModelCache,
}: CompositionAndModelsProps) {
  const t = useTranslations('dashboard');
  const [sortBy, setSortBy] = useState<ModelSortKey>('tokens');
  const [hideEmptySlots, setHideEmptySlots] = useState(true);
  const [showAllModels, setShowAllModels] = useState(false);
  const [expandedModel, setExpandedModel] = useState<string | null>(null);

  const isSingleDay = viewMode === 'day' && selectedDay !== null;

  const modelColorMap = useMemo(
    () => buildStableModelColorMap(data.models, data.daily, colorOverrides),
    [data.models, data.daily, colorOverrides],
  );

  const tokenLabels = {
    input: t('workbench.tokenLabels.input'),
    cacheRead: t('workbench.tokenLabels.cacheRead'),
    cacheWrite: t('workbench.tokenLabels.cacheWrite'),
    output: t('workbench.tokenLabels.output'),
    reasoning: t('workbench.tokenLabels.reasoning'),
  };

  // Merge day-level model breakdowns when in 1D mode while retaining catalog metadata from data.models
  const tableModels: ModelUsageSummary[] = useMemo(() => {
    if (!isSingleDay) return data.models;
    const byModel = new Map<string, ModelUsageSummary>();
    for (const base of data.models) {
      byModel.set(base.modelName, base);
    }
    const dayRows = new Map<string, ModelUsageSummary>();
    const dayTotal = Math.max(1, resolveBreakdownTokens(selectedDay));
    for (const row of selectedDay.modelBreakdowns) {
      const prev = dayRows.get(row.modelName);
      const base = byModel.get(row.modelName);
      const rowTotal = resolveBreakdownTokens(row);
      const inputTokens = (prev?.inputTokens ?? 0) + (row.inputTokens || 0);
      const outputTokens = (prev?.outputTokens ?? 0) + (row.outputTokens || 0);
      const cacheReadTokens = (prev?.cacheReadTokens ?? 0) + (row.cacheReadTokens || 0);
      const cacheCreationTokens =
        (prev?.cacheCreationTokens ?? 0) + (row.cacheCreationTokens || 0);
      const reasoningTokens = (prev?.reasoningTokens ?? 0) + (row.reasoningTokens || 0);
      const totalTokens = (prev?.totalTokens ?? 0) + rowTotal;
      const prompt = inputTokens + cacheReadTokens + cacheCreationTokens;
      dayRows.set(row.modelName, {
        modelName: row.modelName,
        displayName: base?.displayName || row.modelName,
        canonicalModelId: base?.canonicalModelId,
        provider: base?.provider ?? 'other',
        source: base?.source ?? '—',
        sourcesUsed: base?.sourcesUsed,
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheCreationTokens,
        reasoningTokens,
        totalTokens,
        cost: (prev?.cost ?? 0) + (row.cost || 0),
        missingPricing: Boolean(prev?.missingPricing || row.missingPricing),
        shareOfTokens: totalTokens / dayTotal,
        shareOfCost: 0,
        cacheHitRate: prompt > 0 ? cacheReadTokens / prompt : 0,
        slotStatus: 'measured',
        sessionCount: 1,
        activeDays: 1,
        unitPricing: base?.unitPricing,
      });
    }
    return Array.from(dayRows.values());
  }, [data.models, isSingleDay, selectedDay]);

  const filteredModels = useMemo(() => {
    const base = hideEmptySlots
      ? tableModels.filter((m) => m.slotStatus !== 'configured' && m.totalTokens > 0)
      : tableModels;

    return [...base].sort((a, b) => {
      if (a.slotStatus === 'configured' && b.slotStatus !== 'configured') return 1;
      if (a.slotStatus !== 'configured' && b.slotStatus === 'configured') return -1;
      switch (sortBy) {
        case 'cacheHit':
          return b.cacheHitRate - a.cacheHitRate || b.totalTokens - a.totalTokens;
        case 'cost':
          return b.cost - a.cost || b.totalTokens - a.totalTokens;
        case 'meanSession': {
          const meanA = a.sessionCount > 0 ? a.totalTokens / a.sessionCount : -1;
          const meanB = b.sessionCount > 0 ? b.totalTokens / b.sessionCount : -1;
          return meanB - meanA || b.totalTokens - a.totalTokens;
        }
        default:
          return b.totalTokens - a.totalTokens;
      }
    });
  }, [tableModels, hideEmptySlots, sortBy]);

  const maxModelTokens = Math.max(1, ...filteredModels.map((m) => m.totalTokens || 0));
  const visibleModels = showAllModels ? filteredModels : filteredModels.slice(0, 8);

  return (
    <section className="dashboard-wb-stage p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border-faint)] pb-3">
        <h2 className="text-[0.95rem] font-semibold text-[var(--color-text)]">
          {t('workbench.modelsTitle')}
        </h2>

        <div className="flex flex-wrap items-center gap-2">
          <div className="dashboard-wb-tabs" role="group" aria-label={t('workbench.modelsTitle')}>
            {(
              [
                ['tokens', t('workbench.sortTokens')],
                ['cacheHit', t('workbench.sortCacheHit')],
                ['cost', t('workbench.sortCost')],
                ['meanSession', t('workbench.sortMeanSession')],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={sortBy === key}
                data-active={sortBy === key}
                onClick={() => setSortBy(key)}
                className="dashboard-wb-tab"
              >
                {label}
              </button>
            ))}
          </div>

          {!isSingleDay ? (
            <button
              type="button"
              aria-pressed={hideEmptySlots}
              onClick={() => setHideEmptySlots((prev) => !prev)}
              className={`cursor-pointer rounded-[8px] border px-2.5 py-1 text-[0.72rem] transition-colors ${
                hideEmptySlots
                  ? 'border-[var(--color-accent-border)] bg-[var(--color-accent-soft)] font-medium text-[var(--color-text)]'
                  : 'border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              {t('workbench.hideConfiguredSlots')}
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        {visibleModels.length === 0 ? (
          <div className="flex h-[180px] items-center justify-center text-[0.78rem] text-[var(--color-text-soft)]">
            {t('workbench.noData')}
          </div>
        ) : (
          <table className="dashboard-data-table w-full min-w-[600px] text-left text-[0.76rem]">
            <thead>
              <tr className="border-b border-[var(--color-border-faint)] text-[0.68rem] font-medium text-[var(--color-text-soft)]">
                <th className="py-2 pr-2 font-medium">{t('workbench.colModel')}</th>
                <th className="py-2 px-2 font-medium">{t('workbench.colThroughput')}</th>
                <th className="py-2 px-2 font-medium">{t('workbench.colSplit')}</th>
                <th className="py-2 px-2 text-right font-medium">{t('workbench.colCacheHit')}</th>
                <th className="py-2 pl-2 text-right font-medium">{t('workbench.colCost')}</th>
              </tr>
            </thead>
            <tbody>
              {visibleModels.map((model) => {
                const isExpanded = expandedModel === model.modelName;
                const isSlot = model.slotStatus === 'configured' || model.totalTokens === 0;
                const parts = deriveTokenComposition(model);
                const partSum = Math.max(
                  1,
                  parts.reduce((acc, p) => acc + p.tokens, 0),
                );
                const meanSession =
                  model.sessionCount > 0 ? model.totalTokens / model.sessionCount : null;
                const costAvailable =
                  !billingPreview || billingPreview.status === 'ready';
                const modelColor =
                  modelColorMap.get(model.modelName) ?? 'var(--chart-other-1, #e05275)';

                return (
                  <Fragment key={model.modelName}>
                    <tr data-selected={isExpanded}>
                      <td className="py-2.5 pr-2">
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          aria-label={
                            isExpanded
                              ? t('workbench.collapseRow', { model: model.modelName })
                              : t('workbench.expandRow', { model: model.modelName })
                          }
                          onClick={() =>
                            setExpandedModel((prev) =>
                              prev === model.modelName ? null : model.modelName,
                            )
                          }
                          className="flex w-full cursor-pointer items-center gap-2 text-left"
                        >
                          {isExpanded ? (
                            <IconChevronDown className="size-3.5 shrink-0 text-[var(--color-text-muted)]" />
                          ) : (
                            <IconChevronRight className="size-3.5 shrink-0 text-[var(--color-text-soft)]" />
                          )}
                          <ProviderBadge provider={model.provider} />
                          <span className="min-w-0 flex-1 truncate font-mono font-medium text-[var(--color-text)]">
                            {model.displayName || model.modelName}
                          </span>
                          {isSlot ? (
                            <span className="shrink-0 rounded-full border border-[var(--color-border-subtle)] px-1.5 py-0.5 text-[0.62rem] text-[var(--color-text-soft)]">
                              {t('workbench.configuredSlotBadge')}
                            </span>
                          ) : model.missingPricing ? (
                            <span className="shrink-0 rounded-full bg-[var(--badge-amber-bg)] px-1.5 py-0.5 text-[0.62rem] text-[var(--badge-amber-fg)]">
                              {t('workbench.unpricedBadge')}
                            </span>
                          ) : null}
                        </button>
                      </td>

                      <td className="py-2.5 px-2 tabular-nums">
                        {isSlot ? (
                          <span className="font-mono text-[var(--color-text-soft)]">—</span>
                        ) : (
                          <div className="flex items-center gap-3">
                            <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-[var(--surface-recessed-bg,var(--color-row-bg))]">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.max(4, (model.totalTokens / maxModelTokens) * 100)}%`,
                                  backgroundColor: modelColor,
                                }}
                              />
                            </div>
                            <span className="font-mono text-[0.74rem] font-medium text-[var(--color-text)]">
                              {formatCompactTokens(model.totalTokens)}
                            </span>
                            <span className="font-mono text-[0.68rem] text-[var(--color-text-muted)]">
                              {formatPercent(model.shareOfTokens)}
                            </span>
                          </div>
                        )}
                      </td>

                      <td className="py-2.5 px-2">
                        {isSlot ? (
                          <span className="font-mono text-[var(--color-text-soft)]">—</span>
                        ) : (
                          <div
                            className="flex h-2 w-28 overflow-hidden rounded-full bg-[var(--surface-recessed-bg,var(--color-row-bg))]"
                            title={parts
                              .map((p) => `${tokenLabels[p.id]}: ${formatCompactTokens(p.tokens)}`)
                              .join(' · ')}
                          >
                            {parts.map((p) =>
                              p.tokens > 0 ? (
                                <span
                                  key={p.id}
                                  style={{
                                    width: `${(p.tokens / partSum) * 100}%`,
                                    backgroundColor: p.color,
                                  }}
                                />
                              ) : null,
                            )}
                          </div>
                        )}
                      </td>

                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-[var(--color-text)]">
                        {isSlot ? '—' : formatPercent(model.cacheHitRate)}
                      </td>

                      <td className="py-2.5 pl-2 text-right font-mono tabular-nums text-[var(--color-text)]">
                        {!costAvailable || isSlot
                          ? '—'
                          : formatKnownCost(model.cost, model.missingPricing)}
                      </td>
                    </tr>

                    {isExpanded ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="bg-[var(--surface-recessed-bg,var(--color-row-bg))] px-4 py-3 text-[0.72rem]"
                        >
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono tabular-nums text-[var(--color-text-muted)]">
                                {parts.map((p) => (
                                  <span key={p.id} className="inline-flex items-center gap-1.5">
                                    <span
                                      aria-hidden="true"
                                      className="size-2 rounded-[2px]"
                                      style={{ backgroundColor: p.color }}
                                    />
                                    <span>{tokenLabels[p.id]}:</span>
                                    <span className="text-[var(--color-text)]">
                                      {formatFullNumber(p.tokens)}
                                    </span>
                                  </span>
                                ))}
                              </div>
                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[var(--color-text-soft)]">
                                <span>
                                  {t('workbench.sourcesLabel')}:{' '}
                                  <strong className="font-normal text-[var(--color-text)]">
                                    {model.sourcesUsed?.join(', ') || model.source}
                                  </strong>
                                </span>
                                <span>
                                  {t('workbench.activeSpan', {
                                    days: model.activeDays,
                                    sessions: model.sessionCount,
                                  })}
                                </span>
                                <span>
                                  {t('workbench.meanPerSession')}:{' '}
                                  {meanSession !== null ? formatCompactTokens(meanSession) : '—'}
                                </span>
                              </div>
                            </div>

                            <div className="flex flex-col items-start justify-between gap-2 sm:items-end">
                              <div className="font-mono text-[0.69rem] tabular-nums text-[var(--color-text-soft)]">
                                {t('workbench.unitRatesLabel')}:{' '}
                                {model.unitPricing
                                  ? `${formatUsd(model.unitPricing.inputPerMillion)} / ${formatUsd(
                                      model.unitPricing.outputPerMillion,
                                    )} / ${
                                      model.unitPricing.cacheReadPerMillion !== undefined
                                        ? formatUsd(model.unitPricing.cacheReadPerMillion)
                                        : '—'
                                    } / ${
                                      model.unitPricing.cacheWritePerMillion !== undefined
                                        ? formatUsd(model.unitPricing.cacheWritePerMillion)
                                        : '—'
                                    }`
                                  : '—'}
                              </div>

                              {!isSingleDay && !isSlot ? (
                                <button
                                  type="button"
                                  onClick={() => onInspectModelCache(model.modelName)}
                                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface-card)] px-2.5 py-1 text-[0.72rem] font-medium text-[var(--color-text)] transition-colors hover:border-[var(--color-accent)]"
                                >
                                  <IconLineChart className="size-3.5 text-[var(--color-accent)]" />
                                  <span>{t('workbench.focusCacheTrend')}</span>
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {filteredModels.length > 8 ? (
        <div className="mt-3 flex justify-center border-t border-[var(--color-border-faint)] pt-2.5">
          <button
            type="button"
            onClick={() => setShowAllModels((prev) => !prev)}
            className="dashboard-expand-button cursor-pointer"
          >
            {showAllModels
              ? t('workbench.collapseModels')
              : t('workbench.showAllModels', { count: filteredModels.length })}
          </button>
        </div>
      ) : null}
    </section>
  );
}
