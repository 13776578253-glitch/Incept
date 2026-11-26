'use client';

import { useTranslations } from 'next-intl';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { DailyUsagePoint, ModelUsageSummary, TokenDashboardData } from '../../../domain';
import {
  buildStableModelColorMap,
  resolveBreakdownTokens,
  type DashboardColorOverrides,
} from '../../analytics/derive-analytics';
import { useScrollReveal } from '../../charts/use-scroll-reveal';
import { ProviderBadge } from '../../components/provider-badge';
import {
  formatCompactTokens,
  formatKnownCost,
  formatPercent,
  formatUsd,
} from '../../formatters';
import type { BillingPreview } from '../../hooks/use-billing-preview';
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconLineChart,
} from './workbench-icons';

export type ModelSortKey = 'tokens' | 'cacheHit' | 'cost' | 'meanSession';

const LOW_VOLUME_THRESHOLD = 1_000_000;
const MODELS_PAGE_SIZE = 8;

export function ModelsCuratedFilterToggle({
  hideLowVolume,
  onToggle,
}: {
  hideLowVolume: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations('dashboard');

  return (
    <button
      type="button"
      aria-pressed={hideLowVolume}
      onClick={onToggle}
      className="group relative inline-flex h-[28px] shrink-0 -rotate-[1.8deg] cursor-pointer items-center gap-1.5 rounded-[9px] bg-[var(--color-surface-card,var(--color-bg))] px-2.5 text-[0.71rem] font-medium text-[var(--color-text)] transition-transform duration-150 hover:rotate-0 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-focus)]"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 120 38"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        fill="none"
      >
        <path
          d="M7 3.5 C34 1.8, 84 2.2, 113 4.2 C117.5 4.8, 118.2 12, 117.8 19.5 C117.4 28.5, 116.5 34.4, 110.5 34.8 C78 36.2, 32 35.6, 8.5 34.5 C3 34.1, 2.2 27, 2.6 18.5 C2.9 10, 3.2 4.1, 7 3.5 Z"
          stroke={
            hideLowVolume
              ? 'var(--color-accent)'
              : 'var(--color-border-strong, var(--color-border))'
          }
          strokeWidth="1.65"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={hideLowVolume ? undefined : '4 2.5'}
        />
      </svg>

      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="size-3 shrink-0"
        fill="none"
        stroke={hideLowVolume ? 'var(--color-accent)' : 'var(--color-nav-muted)'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {hideLowVolume ? (
          <path d="M8 1.8 L9.4 6.1 L13.8 7.5 L9.4 9 L8 13.6 L6.5 9 L2.2 7.5 L6.5 6.1 Z" />
        ) : (
          <path d="M3 5.2 Q8 4.4 13 5.4 M2.8 8.3 Q8 7.6 13.2 8.4 M3.4 11.4 Q8 10.8 12.6 11.5" />
        )}
      </svg>

      <span className="relative whitespace-nowrap leading-none">
        {hideLowVolume ? t('workbench.curatedFilterOn') : t('workbench.curatedFilterOff')}
      </span>
    </button>
  );
}

type CompositionAndModelsProps = {
  data: TokenDashboardData;
  billingPreview?: BillingPreview;
  colorOverrides?: DashboardColorOverrides;
  viewMode: 'range' | 'day';
  selectedDay: DailyUsagePoint | null;
  onInspectModelCache: (modelName: string) => void;
};

function formatCompactCell(value: number | undefined): string {
  return value && value > 0 ? formatCompactTokens(value) : '—';
}

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
  const [hideLowVolume, setHideLowVolume] = useState(true);
  const [page, setPage] = useState(1);
  const [expandedModel, setExpandedModel] = useState<string | null>(null);
  const [showOuterHint, setShowOuterHint] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const handleScrollReveal = useScrollReveal();

  useEffect(() => {
    const updateSpace = () => {
      const rect = sectionRef.current?.getBoundingClientRect();
      setShowOuterHint(Boolean(rect && rect.left >= 136));
    };
    updateSpace();
    window.addEventListener('resize', updateSpace);
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateSpace) : null;
    if (observer && sectionRef.current) {
      observer.observe(sectionRef.current);
      observer.observe(document.documentElement);
    }
    return () => {
      window.removeEventListener('resize', updateSpace);
      observer?.disconnect();
    };
  }, []);

  const setSort = (key: ModelSortKey) => {
    setSortBy(key);
    setPage(1);
    setExpandedModel(null);
  };

  const toggleHideLowVolume = () => {
    setHideLowVolume((prev) => !prev);
    setPage(1);
    setExpandedModel(null);
  };

  const isSingleDay = viewMode === 'day' && selectedDay !== null;

  const modelColorMap = useMemo(
    () => buildStableModelColorMap(data.models, data.daily, colorOverrides),
    [data.models, data.daily, colorOverrides],
  );

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
    const base = hideLowVolume
      ? tableModels.filter(
          (m) => m.slotStatus !== 'configured' && m.totalTokens >= LOW_VOLUME_THRESHOLD,
        )
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
  }, [tableModels, hideLowVolume, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredModels.length / MODELS_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * MODELS_PAGE_SIZE;
  const visibleModels = filteredModels.slice(pageStart, pageStart + MODELS_PAGE_SIZE);
  const maxModelTokens = Math.max(1, ...filteredModels.map((m) => m.totalTokens || 0));

  const expandedIdx = expandedModel
    ? visibleModels.findIndex((m) => m.modelName === expandedModel)
    : -1;
  const isLastRowUpwardOverlay =
    expandedIdx >= 1 && expandedIdx === visibleModels.length - 1;
  const replacedNextIdx =
    expandedIdx >= 0 && expandedIdx < visibleModels.length - 1 ? expandedIdx + 1 : -1;
  const appendRowPricing = expandedIdx === 0 && visibleModels.length === 1;

  const switchPage = (nextPage: number) => {
    const clamped = Math.max(1, Math.min(totalPages, nextPage));
    setPage(clamped);
    setExpandedModel(null);
  };

  const renderPricingContent = (model: ModelUsageSummary) => {
    const isSlot = model.slotStatus === 'configured' || model.totalTokens === 0;
    const pricingText = model.unitPricing
      ? `${t('workbench.colInput')} ${formatUsd(model.unitPricing.inputPerMillion)} · ${t('workbench.colOutput')} ${formatUsd(model.unitPricing.outputPerMillion)} · ${t('workbench.colCacheRead')} ${
          model.unitPricing.cacheReadPerMillion !== undefined
            ? formatUsd(model.unitPricing.cacheReadPerMillion)
            : '—'
        } · ${t('workbench.colCacheWrite')} ${
          model.unitPricing.cacheWritePerMillion !== undefined
            ? formatUsd(model.unitPricing.cacheWritePerMillion)
            : '—'
        }`
      : t('workbench.pricingUnavailable');

    return (
      <div className="flex h-[28px] flex-nowrap items-center justify-between gap-3 overflow-hidden">
        <span
          title={`${t('workbench.pricingSingleLineLabel')}：${pricingText}`}
          className="min-w-0 truncate font-mono tabular-nums text-[var(--color-text-muted)]"
        >
          {t('workbench.pricingSingleLineLabel')}：
          {model.unitPricing ? (
            <span className="text-[var(--color-text)]">{pricingText}</span>
          ) : (
            <span>{pricingText}</span>
          )}
        </span>

        {!isSingleDay && !isSlot ? (
          <button
            type="button"
            onClick={() => onInspectModelCache(model.modelName)}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface-card)] px-2.5 py-0.5 text-[0.7rem] font-medium text-[var(--color-text)] transition-colors hover:border-[var(--color-accent)]"
          >
            <IconLineChart className="size-3.5 text-[var(--color-accent)]" />
            <span>{t('workbench.focusCacheTrend')}</span>
          </button>
        ) : null}
      </div>
    );
  };

  const renderModelRow = (model: ModelUsageSummary, isExpanded: boolean) => {
    const isSlot = model.slotStatus === 'configured' || model.totalTokens === 0;
    const costAvailable = !billingPreview || billingPreview.status === 'ready';
    const modelColor =
      modelColorMap.get(model.modelName) ?? 'var(--chart-other-1, #e05275)';

    return (
      <tr
        data-selected={isExpanded}
        data-expanded-parent={isExpanded ? 'true' : undefined}
        className="h-[40px]"
      >
        <td className="py-1.5 pr-2">
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

        <td className="py-1.5 px-2 tabular-nums">
          {isSlot ? (
            <span className="font-mono text-[var(--color-text-soft)]">—</span>
          ) : (
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-[var(--surface-recessed-bg,var(--color-row-bg))]">
                <div
                  className="h-full rounded-full transition-[width] duration-300 ease-out"
                  style={{
                    width: `${Math.max(4, (model.totalTokens / maxModelTokens) * 100)}%`,
                    backgroundColor: modelColor,
                  }}
                />
              </div>
              <span className="shrink-0 font-mono text-[0.73rem] font-medium text-[var(--color-text)]">
                {formatCompactTokens(model.totalTokens)}
              </span>
              <span className="truncate font-mono text-[0.67rem] text-[var(--color-text-muted)]">
                {formatPercent(model.shareOfTokens)}
              </span>
            </div>
          )}
        </td>

        <td className="py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap text-[var(--color-text-muted)]">
          {isSlot ? '—' : formatCompactCell(model.inputTokens)}
        </td>
        <td className="py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap text-[var(--color-text-muted)]">
          {isSlot ? '—' : formatCompactCell(model.outputTokens)}
        </td>
        <td className="py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap text-[var(--color-text)]">
          {isSlot ? '—' : formatCompactCell(model.cacheReadTokens)}
        </td>
        <td className="py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap text-[var(--color-text-muted)]">
          {isSlot ? '—' : formatCompactCell(model.cacheCreationTokens)}
        </td>
        <td className="py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap text-[var(--color-text-muted)]">
          {isSlot ? '—' : formatCompactCell(model.reasoningTokens)}
        </td>

        <td className="py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap text-[var(--color-text)]">
          {isSlot ? '—' : formatPercent(model.cacheHitRate)}
        </td>

        <td className="py-1.5 pl-2 text-right font-mono tabular-nums whitespace-nowrap text-[var(--color-text)]">
          {!costAvailable || isSlot
            ? '—'
            : formatKnownCost(model.cost, model.missingPricing)}
        </td>
      </tr>
    );
  };

  const bodyContent = (
    <div className="dashboard-models-page-frame">
      <div
        onScroll={handleScrollReveal}
        className="dashboard-subtle-scrollbar min-h-0 flex-1 overflow-auto"
      >
        {visibleModels.length === 0 ? (
          <div className="flex h-[260px] flex-col items-center justify-center gap-2.5 text-[0.78rem] text-[var(--color-text-soft)]">
            <span>
              {hideLowVolume && tableModels.length > 0
                ? t('workbench.curatedFilterEmpty')
                : t('workbench.noData')}
            </span>
            {hideLowVolume && tableModels.length > 0 ? (
              <button
                type="button"
                onClick={toggleHideLowVolume}
                className="dashboard-expand-button cursor-pointer"
              >
                {t('workbench.curatedFilterShowAll', { count: tableModels.length })}
              </button>
            ) : null}
          </div>
        ) : (
          <table className="dashboard-data-table w-full min-w-[860px] table-fixed text-left text-[0.75rem]">
            <colgroup>
              <col className="w-[28%]" />
              <col className="w-[20%]" />
              <col className="w-[7.5%]" />
              <col className="w-[7%]" />
              <col className="w-[7.5%]" />
              <col className="w-[6.5%]" />
              <col className="w-[6.5%]" />
              <col className="w-[7.5%]" />
              <col className="w-[9.5%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-[var(--color-border-faint)] text-[0.68rem] font-medium text-[var(--color-text-soft)]">
                <th className="py-1.5 pr-2 font-medium">{t('workbench.colModel')}</th>
                <th className="py-1.5 px-2 font-medium">{t('workbench.colThroughput')}</th>
                <th className="py-1.5 px-2 text-right font-medium">{t('workbench.colInput')}</th>
                <th className="py-1.5 px-2 text-right font-medium">{t('workbench.colOutput')}</th>
                <th className="py-1.5 px-2 text-right font-medium">{t('workbench.colCacheRead')}</th>
                <th className="py-1.5 px-2 text-right font-medium">{t('workbench.colCacheWrite')}</th>
                <th className="py-1.5 px-2 text-right font-medium">{t('workbench.colReasoning')}</th>
                <th className="py-1.5 px-2 text-right font-medium">{t('workbench.colCacheHit')}</th>
                <th className="py-1.5 pl-2 text-right font-medium">{t('workbench.colCost')}</th>
              </tr>
            </thead>
            <tbody>
              {visibleModels.map((model, idx) => {
                // Upward in-place overlay when the bottom-most row is expanded: lift it into idx - 1 and show pricing below
                if (isLastRowUpwardOverlay) {
                  const lastModel = visibleModels[expandedIdx];
                  if (idx === expandedIdx - 1) {
                    return <Fragment key={lastModel.modelName}>{renderModelRow(lastModel, true)}</Fragment>;
                  }
                  if (idx === expandedIdx) {
                    return (
                      <tr
                        key={`pricing-${lastModel.modelName}`}
                        data-expanded-detail="true"
                        className="h-[40px]"
                      >
                        <td colSpan={9} className="px-4 py-1.5 text-[0.71rem]">
                          {renderPricingContent(lastModel)}
                        </td>
                      </tr>
                    );
                  }
                }

                // Downward in-place overlay: when an earlier row is expanded, replace the next row's slot directly
                if (idx === replacedNextIdx && expandedIdx >= 0) {
                  const ownerModel = visibleModels[expandedIdx];
                  return (
                    <tr
                      key={`pricing-${ownerModel.modelName}`}
                      data-expanded-detail="true"
                      className="h-[40px]"
                    >
                      <td colSpan={9} className="px-4 py-1.5 text-[0.71rem]">
                        {renderPricingContent(ownerModel)}
                      </td>
                    </tr>
                  );
                }

                const isExpanded = expandedIdx === idx;
                return (
                  <Fragment key={model.modelName}>
                    {renderModelRow(model, isExpanded)}
                    {isExpanded && appendRowPricing ? (
                      <tr
                        key={`pricing-${model.modelName}`}
                        data-expanded-detail="true"
                        className="h-[40px]"
                      >
                        <td colSpan={9} className="px-4 py-1.5 text-[0.71rem]">
                          {renderPricingContent(model)}
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

      <div className="mt-2 flex shrink-0 items-center justify-between border-t border-[var(--color-border-faint)] pt-2 text-[0.72rem]">
        <span className="font-mono tabular-nums text-[var(--color-text-soft)]">
          {t('workbench.paginationSummary', { count: filteredModels.length })}
        </span>

        {totalPages > 1 ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label={t('workbench.paginationPrev')}
              disabled={safePage <= 1}
              onClick={() => switchPage(safePage - 1)}
              className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-[0.7rem] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-row-bg)] hover:text-[var(--color-text)] disabled:cursor-default disabled:opacity-40"
            >
              <IconChevronLeft className="size-3.5" />
              <span>{t('workbench.paginationPrev')}</span>
            </button>
            <span className="min-w-[44px] text-center font-mono text-[0.7rem] tabular-nums text-[var(--color-text)]">
              {t('workbench.paginationPage', { page: safePage, total: totalPages })}
            </span>
            <button
              type="button"
              aria-label={t('workbench.paginationNext')}
              disabled={safePage >= totalPages}
              onClick={() => switchPage(safePage + 1)}
              className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-[0.7rem] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-row-bg)] hover:text-[var(--color-text)] disabled:cursor-default disabled:opacity-40"
            >
              <span>{t('workbench.paginationNext')}</span>
              <IconChevronRight className="size-3.5" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <section ref={sectionRef} className="dashboard-wb-stage dashboard-models-card relative p-4 sm:p-5">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border-faint)] pb-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[0.95rem] font-semibold text-[var(--color-text)]">
            {t('workbench.modelsTitle')}
          </h2>
          <div className="relative inline-flex">
            <ModelsCuratedFilterToggle
              hideLowVolume={hideLowVolume}
              onToggle={toggleHideLowVolume}
            />
            {showOuterHint ? (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute right-[48%] bottom-[calc(100%+5px)] z-20 flex items-start gap-1 select-none"
              >
                <span
                  className="mt-[9px] w-[84px] shrink-0 -rotate-[2deg] text-center text-[13px] leading-[1.35] font-medium italic text-balance text-[var(--color-text)] opacity-85"
                  style={{ fontFamily: "'Segoe Script', 'KaiTi', 'STKaiti', Georgia, serif" }}
                >
                  {hideLowVolume
                    ? t('workbench.curatedFilterHintOn')
                    : t('workbench.curatedFilterHintOff')}
                </span>
                <svg
                  viewBox="0 0 132 64"
                  className="h-[64px] w-[132px] shrink-0 overflow-visible text-[var(--color-text)] opacity-75"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.65"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M 126 61 C 114 14, 52 4, 6 26" />
                  <path d="M 10.2 15.8 L 5.6 26.2 L 16.5 27.8" />
                </svg>
              </div>
            ) : null}
          </div>
        </div>

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
              onClick={() => setSort(key)}
              className="dashboard-wb-tab"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2.5 flex min-h-0 flex-1 flex-col">{bodyContent}</div>
    </section>
  );
}
