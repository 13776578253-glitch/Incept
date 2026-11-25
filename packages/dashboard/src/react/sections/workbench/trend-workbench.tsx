'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { DailyUsagePoint, TokenDashboardData, UsageRange } from '../../../domain';
import {
  aggregateBillingDaysByGrain,
  buildGlobalCacheSeries,
  buildModelCacheSeries,
  buildModelFamilyMigrationSeries,
  buildPerBucketModelBars,
  buildStableModelColorMap,
  buildStageHeroMigrationSeries,
  buildTimeBuckets,
  computeAdaptiveRateDomain,
  computeBucketEwmaSeries,
  computeCostForecast,
  computeMovingAverage,
  deriveTokenComposition,
  OTHERS_SERIES_ID,
  resolveBreakdownTokens,
  resolveModelFamily,
  type TimeGrain,
} from '../../analytics/derive-analytics';
import { CompactCalendarPicker } from '../../charts/compact-calendar-picker';
import { DonutChart } from '../../charts/donut-chart';
import { MultiLineChart } from '../../charts/multi-line-chart';
import { StackedAreaChart } from '../../charts/stacked-area-chart';
import { StackedBarChart, type StackedBarDatum } from '../../charts/stacked-bar-chart';
import type { DashboardPreferences } from '../../dashboard-preferences';
import {
  formatCompactTokens,
  formatPercent,
  formatReferenceUsd,
  formatUsd,
} from '../../formatters';
import type { BillingPreview } from '../../hooks/use-billing-preview';
import {
  CHART_MUTED_COLOR,
  CHART_TOTAL_LINE_COLOR,
  resolveStableModelColor,
  TOKEN_TYPE_COLORS,
} from '../../model-colors';
import { IconCalendar, IconChevronLeft, IconChevronRight, IconClock } from './workbench-icons';

export type WorkbenchTrendTab = 'volume' | 'cache' | 'migration' | 'cost' | 'calendar';
export type CacheSubView = 'global' | 'models';

type VolumeMode = 'models' | 'tokens';
type CacheScale = 'auto' | 'full';
type MigrationMode = 'absolute' | 'share';
type MigrationGroup = 'family' | 'model';

type TrendWorkbenchProps = {
  data: TokenDashboardData;
  billingPreview?: BillingPreview;
  preferences?: DashboardPreferences;
  rangePreset: UsageRange;
  viewMode: 'range' | 'day';
  selectedDay: DailyUsagePoint | null;
  onSelectDate: (date: string) => void;
  onExitSingleDay: () => void;
  activeTab: WorkbenchTrendTab;
  onTabChange: (tab: WorkbenchTrendTab) => void;
  cacheSubView: CacheSubView;
  onCacheSubViewChange: (view: CacheSubView) => void;
  selectedCacheModels: ReadonlySet<string> | null;
  onToggleCacheModel: (modelName: string) => void;
};

function defaultGrainForRange(range: UsageRange): TimeGrain {
  return range === 'all' ? 'month' : 'day';
}

export function TrendWorkbench({
  data,
  billingPreview,
  preferences,
  rangePreset,
  viewMode,
  selectedDay,
  onSelectDate,
  onExitSingleDay,
  activeTab,
  onTabChange,
  cacheSubView,
  onCacheSubViewChange,
  selectedCacheModels,
  onToggleCacheModel,
}: TrendWorkbenchProps) {
  const t = useTranslations('dashboard');
  const locale = useLocale() === 'zh' ? 'zh' : 'en';

  const [grainState, setGrainState] = useState<{ range: UsageRange; grain: TimeGrain }>({
    range: rangePreset,
    grain: defaultGrainForRange(rangePreset),
  });
  const effectiveGrain: TimeGrain =
    grainState.range === rangePreset ? grainState.grain : defaultGrainForRange(rangePreset);

  const [volumeMode, setVolumeMode] = useState<VolumeMode>('models');
  const [showMovingAvg, setShowMovingAvg] = useState(false);
  const [cacheScale, setCacheScale] = useState<CacheScale>('auto');
  const [migrationMode, setMigrationMode] = useState<MigrationMode>('absolute');
  const [migrationGroup, setMigrationGroup] = useState<MigrationGroup>('family');
  const [showCostTrend, setShowCostTrend] = useState(true);
  const [dayDonutMode, setDayDonutMode] = useState<'models' | 'tokens'>('models');
  const [calendarPopoverOpen, setCalendarPopoverOpen] = useState(false);
  const [dayNavDirection, setDayNavDirection] = useState<'prev' | 'next' | null>(null);

  const [hoveredVolumeIdx, setHoveredVolumeIdx] = useState<number | null>(null);
  const [hoveredCacheIdx, setHoveredCacheIdx] = useState<number | null>(null);
  const [hoveredMigrationIdx, setHoveredMigrationIdx] = useState<number | null>(null);
  const [hoveredCostIdx, setHoveredCostIdx] = useState<number | null>(null);

  const navigateDay = (nextDate: string, hint?: 'prev' | 'next') => {
    const dir =
      hint ??
      (selectedDay
        ? nextDate < selectedDay.date
          ? 'prev'
          : nextDate > selectedDay.date
            ? 'next'
            : null
        : null);
    setDayNavDirection(dir);
    onSelectDate(nextDate);
  };

  const sortedDaily = useMemo(
    () => [...data.daily].sort((a, b) => a.date.localeCompare(b.date)),
    [data.daily],
  );

  const colorOverrides = useMemo(
    () => ({
      familyColors: preferences?.familyColors,
      modelColors: preferences?.modelColors,
    }),
    [preferences?.familyColors, preferences?.modelColors],
  );

  const modelColorMap = useMemo(
    () => buildStableModelColorMap(data.models, sortedDaily, colorOverrides),
    [data.models, sortedDaily, colorOverrides],
  );

  const orderedModelNames = useMemo(
    () =>
      data.models
        .filter((m) => m.slotStatus !== 'configured' && m.totalTokens > 0)
        .sort((a, b) => b.totalTokens - a.totalTokens)
        .map((m) => m.modelName),
    [data.models],
  );

  const buckets = useMemo(
    () => buildTimeBuckets(sortedDaily, data.monthly, effectiveGrain),
    [sortedDaily, data.monthly, effectiveGrain],
  );

  const tokenLabels = useMemo(
    () => ({
      input: t('workbench.tokenLabels.input'),
      cacheRead: t('workbench.tokenLabels.cacheRead'),
      cacheWrite: t('workbench.tokenLabels.cacheWrite'),
      output: t('workbench.tokenLabels.output'),
      reasoning: t('workbench.tokenLabels.reasoning'),
    }),
    [t],
  );

  const perBucketBars = useMemo(
    () => buildPerBucketModelBars(buckets, modelColorMap, t('workbench.others'), 5),
    [buckets, modelColorMap, t],
  );

  const getStableColor = (modelName: string) =>
    modelColorMap.get(modelName) ??
    resolveStableModelColor(modelName, resolveModelFamily(modelName));

  // ==================== SINGLE-DAY (1D) VIEW ====================
  if (viewMode === 'day') {
    const dayIndex = selectedDay
      ? sortedDaily.findIndex((d) => d.date === selectedDay.date)
      : -1;
    const prevDay = dayIndex > 0 ? sortedDaily[dayIndex - 1] : null;
    const nextDay =
      dayIndex >= 0 && dayIndex < sortedDaily.length - 1 ? sortedDaily[dayIndex + 1] : null;

    const dayTotal = selectedDay ? resolveBreakdownTokens(selectedDay) : 0;
    const dayModels = selectedDay
      ? [...selectedDay.modelBreakdowns]
          .map((row) => ({
            modelName: row.modelName,
            tokens: resolveBreakdownTokens(row),
            prompt:
              (row.inputTokens || 0) +
              (row.cacheReadTokens || 0) +
              (row.cacheCreationTokens || 0),
            cacheRead: row.cacheReadTokens || 0,
          }))
          .filter((r) => r.tokens > 0)
          .sort((a, b) => b.tokens - a.tokens)
      : [];

    const top5DayModels = dayModels.slice(0, 5);
    const otherDayTokens = dayModels
      .slice(5)
      .reduce((sum, item) => sum + item.tokens, 0);

    const modelDonutSlices = [
      ...top5DayModels.map((item) => ({
        id: item.modelName,
        label: item.modelName,
        value: item.tokens,
        share: dayTotal > 0 ? item.tokens / dayTotal : 0,
        color: getStableColor(item.modelName),
      })),
      ...(otherDayTokens > 0
        ? [
            {
              id: OTHERS_SERIES_ID,
              label: t('workbench.others'),
              value: otherDayTokens,
              share: dayTotal > 0 ? otherDayTokens / dayTotal : 0,
              color: CHART_MUTED_COLOR,
            },
          ]
        : []),
    ];

    const tokenDonutSlices = selectedDay
      ? deriveTokenComposition(selectedDay).map((part) => ({
          id: part.id,
          label: tokenLabels[part.id],
          value: part.tokens,
          share: part.share,
          color: part.color,
        }))
      : [];

    const dayBillingPoint =
      selectedDay && billingPreview?.status === 'ready'
        ? billingPreview.data.breakdown?.days.find((d) => d.day === selectedDay.date)
        : undefined;

    const daySlideClass =
      dayNavDirection === 'prev'
        ? 'dashboard-day-slide-prev'
        : dayNavDirection === 'next'
          ? 'dashboard-day-slide-next'
          : '';

    return (
      <section className="dashboard-wb-stage dashboard-wb-stage-fixed p-4 sm:p-5">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border-faint)] pb-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-[0.95rem] font-semibold text-[var(--color-text)]">
              {t('workbench.singleDayTitle')}
            </h2>
            {selectedDay ? (
              <span
                key={selectedDay.date}
                className={`rounded-full bg-[var(--surface-chip-bg,var(--color-row-bg))] px-2.5 py-0.5 font-mono text-[0.74rem] font-medium tabular-nums text-[var(--color-text)] ${daySlideClass}`}
              >
                {selectedDay.date}
              </span>
            ) : null}
            {dayBillingPoint ? (
              <span className="rounded-full border border-[var(--color-border-subtle)] px-2 py-0.5 font-mono text-[0.7rem] tabular-nums text-[var(--color-text-muted)]">
                {t('workbench.dayCostPoint', {
                  cost: formatReferenceUsd(
                    dayBillingPoint.estimatedCostUsd,
                    dayBillingPoint.estimatedTokens,
                    true,
                  ),
                })}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              aria-label={t('workbench.prevDay')}
              disabled={!prevDay}
              onClick={() => prevDay && navigateDay(prevDay.date, 'prev')}
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-[8px] border border-[var(--color-border)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-row-bg)] disabled:cursor-not-allowed disabled:opacity-35"
            >
              <IconChevronLeft className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label={t('workbench.nextDay')}
              disabled={!nextDay}
              onClick={() => nextDay && navigateDay(nextDay.date, 'next')}
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-[8px] border border-[var(--color-border)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-row-bg)] disabled:cursor-not-allowed disabled:opacity-35"
            >
              <IconChevronRight className="size-3.5" />
            </button>
            <button
              type="button"
              aria-expanded={calendarPopoverOpen}
              onClick={() => setCalendarPopoverOpen((prev) => !prev)}
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[8px] border border-[var(--color-border)] px-2.5 text-[0.74rem] font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-row-bg)]"
            >
              <IconCalendar className="size-3.5 text-[var(--color-text-muted)]" />
              <span>{t('workbench.pickDate')}</span>
            </button>
            <button
              type="button"
              onClick={onExitSingleDay}
              className="inline-flex h-8 cursor-pointer items-center rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-[0.74rem] font-medium text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
            >
              {t('workbench.backToRange')}
            </button>
          </div>
        </div>

        {calendarPopoverOpen ? (
          <div className="mt-3 flex-1 overflow-y-auto rounded-[12px] border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-3.5">
            <CompactCalendarPicker
              points={sortedDaily}
              selectedDate={selectedDay?.date ?? null}
              onSelectDate={(date) => {
                navigateDay(date);
                setCalendarPopoverOpen(false);
              }}
              locale={locale}
              prevMonthLabel={t('overview.trend.previousMonth')}
              nextMonthLabel={t('overview.trend.nextMonth')}
              lessLabel={t('overview.trend.calendarLess')}
              moreLabel={t('overview.trend.calendarMore')}
            />
          </div>
        ) : !selectedDay ? (
          <div className="mt-4 flex flex-1 items-center justify-center rounded-[10px] border border-dashed border-[var(--color-border-subtle)] text-[0.8rem] text-[var(--color-text-soft)]">
            {t('workbench.noData')}
          </div>
        ) : (
          <div className="mt-4 grid flex-1 min-h-0 grid-cols-1 gap-5 overflow-y-auto lg:grid-cols-12">
            <div className="flex flex-col justify-between gap-4 lg:col-span-7">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-[0.78rem]">
                  <span className="font-medium text-[var(--color-text)]">
                    {t('workbench.dayModelsBarTitle')}
                  </span>
                  <span
                    key={`summary-${selectedDay.date}`}
                    className={`font-mono text-[0.72rem] tabular-nums text-[var(--color-text-muted)] ${daySlideClass}`}
                  >
                    {t('workbench.dayKnownSummary', {
                      tokens: formatCompactTokens(dayTotal),
                      models: dayModels.length,
                    })}
                  </span>
                </div>

                {dayModels.length === 0 ? (
                  <p className="rounded-[8px] border border-dashed border-[var(--color-border-subtle)] py-6 text-center text-[0.76rem] text-[var(--color-text-soft)]">
                    {t('workbench.noData')}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {dayModels.slice(0, 5).map((row) => {
                      const pct = dayTotal > 0 ? (row.tokens / dayTotal) * 100 : 0;
                      const hitRate = row.prompt > 0 ? row.cacheRead / row.prompt : null;
                      const rowColor = getStableColor(row.modelName);
                      return (
                        <div key={row.modelName} className="space-y-1">
                          <div className="flex items-center justify-between gap-2 text-[0.74rem]">
                            <span className="flex min-w-0 items-center gap-2">
                              <span
                                aria-hidden="true"
                                className="size-2 shrink-0 rounded-full"
                                style={{ backgroundColor: rowColor }}
                              />
                              <span className="truncate font-mono text-[var(--color-text)]">
                                {row.modelName}
                              </span>
                            </span>
                            <span className="shrink-0 font-mono text-[0.71rem] tabular-nums text-[var(--color-text-muted)]">
                              {formatCompactTokens(row.tokens)} ({pct.toFixed(1)}%)
                              {hitRate !== null ? ` · Hit ${formatPercent(hitRate)}` : ''}
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-recessed-bg,var(--color-row-bg))]">
                            <div
                              className="h-full rounded-full transition-[width] duration-300 ease-out"
                              style={{
                                width: `${Math.max(2, pct)}%`,
                                backgroundColor: rowColor,
                              }}
                            />
                          </div>
                      </div>
                    );
                  })}
                  {otherDayTokens > 0 ? (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-[0.74rem]">
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: CHART_MUTED_COLOR }}
                          />
                          <span className="truncate text-[var(--color-text-muted)]">
                            {t('workbench.others')}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono text-[0.71rem] tabular-nums text-[var(--color-text-muted)]">
                          {formatCompactTokens(otherDayTokens)} (
                          {(dayTotal > 0 ? (otherDayTokens / dayTotal) * 100 : 0).toFixed(1)}%)
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-recessed-bg,var(--color-row-bg))]">
                        <div
                          className="h-full rounded-full transition-[width] duration-300 ease-out"
                          style={{
                            width: `${Math.max(2, dayTotal > 0 ? (otherDayTokens / dayTotal) * 100 : 0)}%`,
                            backgroundColor: CHART_MUTED_COLOR,
                          }}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

              <div className="rounded-[12px] border border-dashed border-[var(--color-border-subtle)] bg-[var(--surface-recessed-bg,var(--color-row-bg))] p-3">
                <div className="flex items-center justify-between gap-2 text-[0.75rem]">
                  <span className="inline-flex items-center gap-1.5 font-medium text-[var(--color-text)]">
                    <IconClock className="size-3.5 text-[var(--color-accent)]" />
                    <span>{t('workbench.hourlyReadyTitle')}</span>
                  </span>
                  <span className="text-[0.68rem] text-[var(--color-text-soft)]">
                    {t('workbench.hourlyReadyDesc')}
                  </span>
                </div>
                <div aria-hidden="true" className="mt-2.5 grid grid-cols-12 gap-1 opacity-35">
                  {Array.from({ length: 24 }, (_, hour) => (
                    <div
                      key={hour}
                      className="h-2.5 rounded-[2px] bg-[var(--color-border-strong)]"
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col rounded-[12px] border border-[var(--color-border-faint)] bg-[var(--color-surface)] p-4 lg:col-span-5">
              <div className="shrink-0 flex items-center justify-between gap-2">
                <div className="dashboard-wb-tabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={dayDonutMode === 'models'}
                    data-active={dayDonutMode === 'models'}
                    onClick={() => setDayDonutMode('models')}
                    className="dashboard-wb-tab"
                  >
                    {t('workbench.dayDonutModels')}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={dayDonutMode === 'tokens'}
                    data-active={dayDonutMode === 'tokens'}
                    onClick={() => setDayDonutMode('tokens')}
                    className="dashboard-wb-tab"
                  >
                    {t('workbench.dayDonutTokens')}
                  </button>
                </div>
              </div>

              <div className="flex flex-1 min-h-0 items-center justify-center py-2">
                <DonutChart
                  ariaLabel={
                    dayDonutMode === 'models'
                      ? t('workbench.dayDonutModels')
                      : t('workbench.dayDonutTokens')
                  }
                  slices={dayDonutMode === 'models' ? modelDonutSlices : tokenDonutSlices}
                  centerLabel={selectedDay.date}
                  centerValue={formatCompactTokens(dayTotal)}
                  emptyLabel={t('workbench.noData')}
                  centerTransitionKey={selectedDay.date}
                  transitionDirection={dayNavDirection}
                />
              </div>
            </div>
          </div>
        )}
      </section>
    );
  }

  // ==================== MULTI-DAY / RANGE WORKBENCH VIEW ====================
  const grainOptions: ReadonlyArray<TimeGrain> =
    rangePreset === 'all' ? ['month', 'week'] : ['day', 'week'];
  const isGrainDisabled = activeTab === 'calendar';
  const isSevenDayWeekly = rangePreset === '7d' && effectiveGrain === 'week';
  const weeklySpanLabel =
    data.dateRange.from === data.dateRange.to
      ? data.dateRange.from
      : `${data.dateRange.from} — ${data.dateRange.to}`;
  const weeklyDonutLabel =
    data.dateRange.from === data.dateRange.to
      ? data.dateRange.from.slice(5)
      : `${data.dateRange.from.slice(5)} ~ ${data.dateRange.to.slice(5)}`;

  const scrollMinColWidth =
    (effectiveGrain === 'month' && buckets.length > 18) ||
    (effectiveGrain === 'week' && buckets.length > 26) ||
    (effectiveGrain === 'day' && buckets.length > 35)
      ? 34
      : undefined;

  const volumeBarData: StackedBarDatum[] =
    volumeMode === 'models'
      ? perBucketBars.map((entry) => ({
          key: entry.key,
          label: entry.label,
          fullLabel: entry.fullLabel,
          total: entry.total,
          formattedTotal: formatCompactTokens(entry.total),
          isPartial: entry.isPartial,
          segments: entry.segments,
        }))
      : buckets.map((bucket) => {
          const parts = deriveTokenComposition(bucket);
          const partSum = parts.reduce((sum, p) => sum + p.tokens, 0);
          return {
            key: bucket.key,
            label: bucket.label,
            fullLabel: bucket.fullLabel,
            total: partSum,
            formattedTotal: formatCompactTokens(partSum),
            isPartial: bucket.isPartial,
            segments: parts.map((p) => ({
              id: p.id,
              label: tokenLabels[p.id],
              value: p.tokens,
              color: p.color,
            })),
          };
        });

  const modelLegendItems = (() => {
    const total = Math.max(1, data.totals.totalTokens);
    const items = orderedModelNames.slice(0, 5).map((name) => {
      const found = data.models.find((m) => m.modelName === name);
      const val = found?.totalTokens ?? 0;
      return {
        id: name,
        label: name,
        color: getStableColor(name),
        share: val / total,
      };
    });
    const topVal = orderedModelNames
      .slice(0, 5)
      .reduce((acc, name) => acc + (data.models.find((m) => m.modelName === name)?.totalTokens ?? 0), 0);
    const rem = Math.max(0, data.totals.totalTokens - topVal);
    if (rem > 0) {
      items.push({
        id: OTHERS_SERIES_ID,
        label: t('workbench.others'),
        color: CHART_MUTED_COLOR,
        share: rem / total,
      });
    }
    return items;
  })();

  const activeTokenBucket =
    hoveredVolumeIdx !== null && hoveredVolumeIdx >= 0 && hoveredVolumeIdx < buckets.length
      ? buckets[hoveredVolumeIdx]
      : null;

  const animatedTokenSlices = deriveTokenComposition(
    activeTokenBucket ?? data.totals,
  );

  const canOverlayMovingAvg = volumeMode === 'models' && buckets.length >= 2;
  const movingAvgValues =
    canOverlayMovingAvg && showMovingAvg
      ? computeMovingAverage(
          buckets.map((b) => b.totalTokens),
          7,
        )
      : undefined;

  const globalCachePoints = buildGlobalCacheSeries(buckets);
  const modelCacheSeriesList = buildModelCacheSeries(
    buckets,
    orderedModelNames.slice(0, 8),
    modelColorMap,
  );
  const defaultActiveCacheModels = new Set(orderedModelNames.slice(0, 4));
  const hiddenCacheIds = new Set(
    modelCacheSeriesList
      .map((s) => s.modelName)
      .filter((name) =>
        selectedCacheModels ? !selectedCacheModels.has(name) : !defaultActiveCacheModels.has(name),
      ),
  );

  const visibleCacheValues =
    cacheSubView === 'global'
      ? globalCachePoints.map((p) => p.hitRate)
      : modelCacheSeriesList
          .filter((s) => !hiddenCacheIds.has(s.modelName))
          .flatMap((s) => s.points.map((p) => p.hitRate));

  const cacheDomain =
    cacheScale === 'full'
      ? { yMin: 0, yMax: 1 }
      : computeAdaptiveRateDomain(visibleCacheValues);

  const migrationData =
    migrationGroup === 'family'
      ? buildModelFamilyMigrationSeries(buckets, data.models, 5, preferences?.familyColors)
      : buildStageHeroMigrationSeries(buckets, data.models, modelColorMap, {
          pinnedModels: preferences?.pinnedModels,
          maxSeries: 8,
        });

  const migrationTotals = migrationData.buckets.reduce(
    (sum, b) => sum + b.totalTokens,
    0,
  );
  const migrationSeriesList = migrationData.seriesIds.map((id) => {
    const seriesTotal = migrationData.buckets.reduce(
      (sum, b) => sum + (b.tokensBySeries[id] ?? 0),
      0,
    );
    return {
      id,
      label:
        id === OTHERS_SERIES_ID
          ? migrationGroup === 'family'
            ? t('workbench.familyOther')
            : t('workbench.others')
          : id,
      color: migrationData.colors[id] ?? CHART_MUTED_COLOR,
      summaryShare: migrationTotals > 0 ? seriesTotal / migrationTotals : 0,
      summaryTokens: seriesTotal,
    };
  });

  const billingDays = billingPreview?.status === 'ready' ? billingPreview.data.breakdown?.days ?? [] : [];
  const costDailyInputs = billingPreview
    ? [...billingDays]
        .sort((a, b) => a.day.localeCompare(b.day))
        .map((d) => {
          const parsed = Number(d.estimatedCostUsd);
          const hasData = d.estimatedTokens > 0 && Number.isFinite(parsed);
          return { key: d.day, cost: hasData ? parsed : 0, hasData };
        })
    : sortedDaily.map((d) => ({
        key: d.date,
        cost: d.cost || 0,
        hasData: (d.cost || 0) > 0,
      }));
  const costForecast = computeCostForecast(costDailyInputs, 0.25);

  const aggregatedBilling = billingPreview?.status === 'ready'
    ? aggregateBillingDaysByGrain(billingDays, effectiveGrain)
    : [];

  const costBars: StackedBarDatum[] = billingPreview
    ? aggregatedBilling.map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        fullLabel: bucket.fullLabel,
        total: bucket.numericUsd,
        formattedTotal: formatReferenceUsd(
          bucket.estimatedCostUsd,
          bucket.estimatedTokens,
          true,
        ),
        isPartial: bucket.isPartial,
        segments: [
          {
            id: 'usd',
            label: t('workbench.referenceCost'),
            value: bucket.numericUsd,
            color: TOKEN_TYPE_COLORS.cacheWrite,
          },
        ],
      }))
    : buckets.map((b) => ({
        key: b.key,
        label: b.label,
        fullLabel: b.fullLabel,
        total: b.cost,
        formattedTotal: formatUsd(b.cost),
        isPartial: b.isPartial,
        segments: [
          {
            id: 'cost',
            label: t('workbench.referenceCost'),
            value: b.cost,
            color: TOKEN_TYPE_COLORS.cacheWrite,
          },
        ],
      }));

  const costEwmaOverlay =
    showCostTrend && costBars.length >= 2
      ? computeBucketEwmaSeries(
          costBars.map((b) => b.total),
          0.3,
        )
      : undefined;

  const costScrollWidth =
    (effectiveGrain === 'month' && costBars.length > 18) ||
    (effectiveGrain === 'week' && costBars.length > 26) ||
    (effectiveGrain === 'day' && costBars.length > 35)
      ? 34
      : undefined;

  const renderInlineReadout = () => {
    if (isSevenDayWeekly) {
      return (
        <span className="truncate font-mono text-[0.68rem] tabular-nums text-[var(--color-text-soft)]">
          {weeklySpanLabel}
        </span>
      );
    }

    const defaultSpan = `${data.dateRange.from} — ${data.dateRange.to}`;

    if (activeTab === 'volume' && hoveredVolumeIdx !== null && volumeBarData[hoveredVolumeIdx]) {
      const bar = volumeBarData[hoveredVolumeIdx];
      const avg = movingAvgValues?.[hoveredVolumeIdx];
      const topSegments = bar.segments
        .filter((s) => s.value > 0)
        .slice(0, 2)
        .map((s) => `${s.label} ${volumeMode === 'tokens' && bar.total > 0 ? `${((s.value / bar.total) * 100).toFixed(1)}%` : formatCompactTokens(s.value)}`)
        .join(' · ');
      return (
        <span className="truncate font-mono text-[0.7rem] tabular-nums text-[var(--color-text)]">
          {bar.fullLabel} · <strong>{bar.formattedTotal}</strong>
          {avg !== null && avg !== undefined ? ` · 7D ${formatCompactTokens(avg)}` : ''}
          {topSegments ? <span className="ml-2 text-[var(--color-text-muted)]">{topSegments}</span> : null}
        </span>
      );
    }

    if (activeTab === 'cache' && hoveredCacheIdx !== null && buckets[hoveredCacheIdx]) {
      const b = buckets[hoveredCacheIdx];
      if (cacheSubView === 'global') {
        const pt = globalCachePoints[hoveredCacheIdx];
        return (
          <span className="truncate font-mono text-[0.7rem] tabular-nums text-[var(--color-text)]">
            {b.fullLabel} · <strong>{pt?.hitRate !== null && pt?.hitRate !== undefined ? formatPercent(pt.hitRate) : '—'}</strong>
          </span>
        );
      }
      const visible = modelCacheSeriesList.filter((s) => !hiddenCacheIds.has(s.modelName)).slice(0, 3);
      const summary = visible
        .map((s) => {
          const val = s.points[hoveredCacheIdx]?.hitRate;
          return `${s.modelName} ${val !== null && val !== undefined ? formatPercent(val) : '—'}`;
        })
        .join(' · ');
      return (
        <span className="truncate font-mono text-[0.7rem] tabular-nums text-[var(--color-text)]">
          {b.fullLabel} · <span className="text-[var(--color-text-muted)]">{summary}</span>
        </span>
      );
    }

    if (activeTab === 'migration' && hoveredMigrationIdx !== null && migrationData.buckets[hoveredMigrationIdx]) {
      const mb = migrationData.buckets[hoveredMigrationIdx];
      return (
        <span className="truncate font-mono text-[0.7rem] tabular-nums text-[var(--color-text)]">
          {mb.fullLabel} · <strong>{formatCompactTokens(mb.totalTokens)}</strong>
        </span>
      );
    }

    if (activeTab === 'cost' && hoveredCostIdx !== null && costBars[hoveredCostIdx]) {
      const cb = costBars[hoveredCostIdx];
      return (
        <span className="truncate font-mono text-[0.7rem] tabular-nums text-[var(--color-text)]">
          {cb.fullLabel} · <strong>{cb.formattedTotal}</strong>
        </span>
      );
    }

    return (
      <span className="truncate font-mono text-[0.68rem] tabular-nums text-[var(--color-text-soft)]">
        {defaultSpan}
      </span>
    );
  };

  return (
    <section className="dashboard-wb-stage dashboard-wb-stage-fixed p-4 sm:p-5">
      <h2 className="sr-only">{t('workbench.trendTitle')}</h2>

      {/* Layer 1: Frameless underline main navigation + all view toggles + far-right granularity */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border-faint)]">
        <div
          className="dashboard-nav-tabs"
          role="tablist"
          aria-label={t('workbench.trendTitle')}
        >
          {(
            [
              ['volume', t('workbench.tabVolume')],
              ['cache', t('workbench.tabCache')],
              ['migration', t('workbench.tabMigration')],
              ['cost', t('workbench.tabCost')],
              ['calendar', t('workbench.tabCalendar')],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              data-active={activeTab === id}
              onClick={() => onTabChange(id)}
              className="dashboard-nav-tab"
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 pb-1.5">
          {activeTab === 'volume' && volumeMode === 'models' && !isSevenDayWeekly ? (
            <button
              type="button"
              aria-pressed={showMovingAvg}
              disabled={!canOverlayMovingAvg}
              onClick={() => setShowMovingAvg((prev) => !prev)}
              className="dashboard-ghost-toggle"
            >
              <span
                aria-hidden="true"
                className="inline-block w-3.5 border-t-2 border-dashed"
                style={{ borderColor: CHART_TOTAL_LINE_COLOR }}
              />
              <span>{t('workbench.movingAvg7d')}</span>
            </button>
          ) : null}

          {activeTab === 'volume' ? (
            <div className="dashboard-wb-tabs" role="group" aria-label={t('overview.trend.metric')}>
              {(
                [
                  ['models', t('workbench.modeByModel')],
                  ['tokens', t('workbench.modeByToken')],
                ] as const
              ).map(([modeId, modeLabel]) => (
                <button
                  key={modeId}
                  type="button"
                  aria-pressed={volumeMode === modeId}
                  data-active={volumeMode === modeId}
                  onClick={() => setVolumeMode(modeId)}
                  className="dashboard-wb-tab"
                >
                  {modeLabel}
                </button>
              ))}
            </div>
          ) : null}

          {activeTab === 'cache' && !isSevenDayWeekly ? (
            <div className="dashboard-wb-tabs" role="group" aria-label={t('workbench.cacheScaleAuto')}>
              <button
                type="button"
                aria-pressed={cacheScale === 'auto'}
                data-active={cacheScale === 'auto'}
                onClick={() => setCacheScale('auto')}
                className="dashboard-wb-tab"
              >
                {t('workbench.cacheScaleAuto')}
              </button>
              <button
                type="button"
                aria-pressed={cacheScale === 'full'}
                data-active={cacheScale === 'full'}
                onClick={() => setCacheScale('full')}
                className="dashboard-wb-tab"
              >
                {t('workbench.cacheScaleFull')}
              </button>
            </div>
          ) : null}

          {activeTab === 'cache' && !isSevenDayWeekly ? (
            <div className="dashboard-wb-tabs" role="group" aria-label={t('workbench.tabCache')}>
              <button
                type="button"
                aria-pressed={cacheSubView === 'global'}
                data-active={cacheSubView === 'global'}
                onClick={() => onCacheSubViewChange('global')}
                className="dashboard-wb-tab"
              >
                {t('workbench.cacheGlobal')}
              </button>
              <button
                type="button"
                aria-pressed={cacheSubView === 'models'}
                data-active={cacheSubView === 'models'}
                onClick={() => onCacheSubViewChange('models')}
                className="dashboard-wb-tab"
              >
                {t('workbench.cacheByModel')}
              </button>
            </div>
          ) : null}

          {activeTab === 'migration' ? (
            <div className="dashboard-wb-tabs" role="group" aria-label={t('workbench.migrationByFamily')}>
              <button
                type="button"
                aria-pressed={migrationGroup === 'family'}
                data-active={migrationGroup === 'family'}
                onClick={() => setMigrationGroup('family')}
                className="dashboard-wb-tab"
              >
                {t('workbench.migrationByFamily')}
              </button>
              <button
                type="button"
                aria-pressed={migrationGroup === 'model'}
                data-active={migrationGroup === 'model'}
                onClick={() => setMigrationGroup('model')}
                className="dashboard-wb-tab"
              >
                {t('workbench.migrationByModel')}
              </button>
            </div>
          ) : null}

          {activeTab === 'migration' && !isSevenDayWeekly ? (
            <div className="dashboard-wb-tabs" role="group" aria-label={t('workbench.tabMigration')}>
              <button
                type="button"
                aria-pressed={migrationMode === 'absolute'}
                data-active={migrationMode === 'absolute'}
                onClick={() => setMigrationMode('absolute')}
                className="dashboard-wb-tab"
              >
                {t('workbench.migrationAbsolute')}
              </button>
              <button
                type="button"
                aria-pressed={migrationMode === 'share'}
                data-active={migrationMode === 'share'}
                onClick={() => setMigrationMode('share')}
                className="dashboard-wb-tab"
              >
                {t('workbench.migrationShare')}
              </button>
            </div>
          ) : null}

          {activeTab === 'cost' && !isSevenDayWeekly ? (
            <button
              type="button"
              aria-pressed={showCostTrend}
              disabled={costBars.length < 2}
              onClick={() => setShowCostTrend((prev) => !prev)}
              className="dashboard-ghost-toggle"
            >
              <span
                aria-hidden="true"
                className="inline-block w-3.5 border-t-2 border-dashed"
                style={{ borderColor: CHART_TOTAL_LINE_COLOR }}
              />
              <span>{t('workbench.costTrendLine')}</span>
            </button>
          ) : null}

          {/* Permanently anchored far-right granularity slot */}
          <div
            className={`dashboard-wb-tabs shrink-0 transition-opacity ${isGrainDisabled ? 'opacity-45' : ''}`}
            role="group"
            aria-label={t('overview.trend.granularity')}
          >
            {grainOptions.map((g) => (
              <button
                key={g}
                type="button"
                disabled={isGrainDisabled}
                aria-pressed={effectiveGrain === g}
                data-active={effectiveGrain === g}
                onClick={() => setGrainState({ range: rangePreset, grain: g })}
                className="dashboard-wb-tab disabled:cursor-default"
              >
                {g === 'day'
                  ? t('workbench.grainDay')
                  : g === 'week'
                    ? t('workbench.grainWeek')
                    : t('workbench.grainMonth')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Layer 2: Calm right-aligned inline hover readout */}
      <div className="mt-1.5 flex min-h-5 shrink-0 items-center justify-end gap-2">
        {renderInlineReadout()}
      </div>

      {/* Layer 3: Fixed flex chart stage */}
      <div className="mt-2.5 flex flex-1 min-h-0 flex-col">
        {activeTab === 'volume' ? (
          isSevenDayWeekly ? (
            (() => {
              const activeWeeklyModels = data.models
                .filter((m) => m.slotStatus !== 'configured' && m.totalTokens > 0)
                .sort((a, b) => b.totalTokens - a.totalTokens);
              const weeklyTotal = Math.max(
                data.totals.totalTokens,
                activeWeeklyModels.reduce((sum, item) => sum + item.totalTokens, 0),
              );
              const top5WeeklyModels = activeWeeklyModels.slice(0, 5);
              const otherWeeklyTokens = activeWeeklyModels
                .slice(5)
                .reduce((sum, item) => sum + item.totalTokens, 0);
              const weeklyModelSlices = [
                ...top5WeeklyModels.map((item) => ({
                  id: item.modelName,
                  label: item.modelName,
                  value: item.totalTokens,
                  share: weeklyTotal > 0 ? item.totalTokens / weeklyTotal : 0,
                  color: getStableColor(item.modelName),
                })),
                ...(otherWeeklyTokens > 0
                  ? [
                      {
                        id: OTHERS_SERIES_ID,
                        label: t('workbench.others'),
                        value: otherWeeklyTokens,
                        share: weeklyTotal > 0 ? otherWeeklyTokens / weeklyTotal : 0,
                        color: CHART_MUTED_COLOR,
                      },
                    ]
                  : []),
              ];
              const weeklyTokenSlices = deriveTokenComposition(data.totals).map((part) => ({
                id: part.id,
                label: tokenLabels[part.id],
                value: part.tokens,
                share: part.share,
                color: part.color,
              }));
              const activeSlices =
                volumeMode === 'models' ? weeklyModelSlices : weeklyTokenSlices;

              return (
                <div className="grid flex-1 min-h-0 grid-cols-1 gap-5 overflow-y-auto lg:grid-cols-12">
                  <div className="flex flex-col justify-center gap-3 lg:col-span-7">
                    <div className="flex items-center justify-between text-[0.78rem]">
                      <span className="font-medium text-[var(--color-text)]">
                        {volumeMode === 'models'
                          ? t('workbench.weeklyModelsTitle')
                          : t('workbench.weeklyTokensTitle')}
                      </span>
                      <span className="font-mono text-[0.72rem] tabular-nums text-[var(--color-text-muted)]">
                        {t('workbench.dayKnownSummary', {
                          tokens: formatCompactTokens(weeklyTotal),
                          models: activeWeeklyModels.length,
                        })}
                      </span>
                    </div>
                    {activeSlices.length === 0 ? (
                      <p className="rounded-[8px] border border-dashed border-[var(--color-border-subtle)] py-6 text-center text-[0.76rem] text-[var(--color-text-soft)]">
                        {t('workbench.noData')}
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {activeSlices.map((row) => {
                          const pct = Math.max(0, Math.min(100, row.share * 100));
                          return (
                            <div key={row.id} className="space-y-1">
                              <div className="flex items-center justify-between gap-2 text-[0.74rem]">
                                <span className="flex min-w-0 items-center gap-2">
                                  <span
                                    aria-hidden="true"
                                    className="size-2 shrink-0 rounded-full"
                                    style={{ backgroundColor: row.color }}
                                  />
                                  <span className="truncate font-mono text-[var(--color-text)]">
                                    {row.label}
                                  </span>
                                </span>
                                <span className="shrink-0 font-mono text-[0.71rem] tabular-nums text-[var(--color-text-muted)]">
                                  {formatCompactTokens(row.value)} ({pct.toFixed(1)}%)
                                </span>
                              </div>
                              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-recessed-bg,var(--color-row-bg))]">
                                <div
                                  className="h-full rounded-full transition-[width] duration-300 ease-out"
                                  style={{
                                    width: `${Math.max(2, pct)}%`,
                                    backgroundColor: row.color,
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-center rounded-[12px] border border-[var(--color-border-faint)] bg-[var(--color-surface)] p-4 lg:col-span-5">
                    <DonutChart
                      ariaLabel={
                        volumeMode === 'models'
                          ? t('workbench.weeklyModelsTitle')
                          : t('workbench.weeklyTokensTitle')
                      }
                      slices={activeSlices}
                      centerLabel={weeklyDonutLabel}
                      centerValue={formatCompactTokens(weeklyTotal)}
                      emptyLabel={t('workbench.noData')}
                      centerTransitionKey={`weekly-volume-${volumeMode}`}
                    />
                  </div>
                </div>
              );
            })()
          ) : volumeMode === 'models' ? (
            <StackedBarChart
              ariaLabel={t('workbench.tabVolume')}
              data={volumeBarData}
              hideReadoutBar
              enableSeriesSpotlight
              minColumnWidth={scrollMinColWidth}
              onHoverIndexChange={setHoveredVolumeIdx}
              legendItems={modelLegendItems}
              formatYAxis={(val) => formatCompactTokens(val)}
              overlayLine={movingAvgValues}
              overlayLabel={t('workbench.movingAvg7d')}
              overlayColor={CHART_TOTAL_LINE_COLOR}
              partialLabel={t('workbench.partialBucket')}
              emptyLabel={t('workbench.noData')}
              onSelectBar={(datum) => {
                const bucket = buckets.find((b) => b.key === datum.key);
                const drillDate = bucket?.dates[bucket.dates.length - 1];
                if (drillDate) onSelectDate(drillDate);
              }}
            />
          ) : (
            <div className="flex flex-1 min-h-0 flex-col gap-2">
              <StackedBarChart
                ariaLabel={t('workbench.tabVolume')}
                data={volumeBarData}
                normalized
                hideReadoutBar
                minColumnWidth={scrollMinColWidth}
                onHoverIndexChange={setHoveredVolumeIdx}
                formatYAxis={(val) => formatCompactTokens(val)}
                partialLabel={t('workbench.partialBucket')}
                emptyLabel={t('workbench.noData')}
                onSelectBar={(datum) => {
                  const bucket = buckets.find((b) => b.key === datum.key);
                  const drillDate = bucket?.dates[bucket.dates.length - 1];
                  if (drillDate) onSelectDate(drillDate);
                }}
              />

              <div
                aria-label={t('workbench.modeByToken')}
                className="flex shrink-0 flex-wrap items-center gap-1.5"
              >
                {animatedTokenSlices.map((part) => {
                  const pct = Math.max(0, Math.min(100, part.share * 100));
                  return (
                    <div
                      key={part.id}
                      className="dashboard-hatched-bar is-micro"
                    >
                      {pct > 0 ? (
                        <span
                          aria-hidden="true"
                          className="dashboard-hatched-fill"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: `color-mix(in oklab, ${part.color} 11%, var(--color-bg))`,
                          }}
                        />
                      ) : null}
                      <span className="relative z-[1] inline-flex items-center gap-1 text-[0.66rem] font-medium text-[var(--color-text-muted)]">
                        <span
                          aria-hidden="true"
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: part.color }}
                        />
                        <span>{tokenLabels[part.id]}</span>
                      </span>
                      <span className="relative z-[1] font-mono text-[0.65rem] tabular-nums text-[var(--color-text)]">
                        {formatPercent(part.share)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        ) : null}

        {activeTab === 'cache' ? (
          isSevenDayWeekly ? (
            (() => {
              const weeklyCacheModels = data.models
                .filter((m) => m.slotStatus !== 'configured' && m.totalTokens > 0)
                .sort((a, b) => b.totalTokens - a.totalTokens)
                .slice(0, 7);
              const totalPrompt =
                (data.totals.inputTokens || 0) +
                (data.totals.cacheReadTokens || 0) +
                (data.totals.cacheCreationTokens || 0);

              return (
                <div className="grid flex-1 min-h-0 grid-cols-1 gap-5 overflow-y-auto lg:grid-cols-12">
                  <div className="flex flex-col justify-center gap-2.5 lg:col-span-7">
                    <div className="text-[0.78rem] font-medium text-[var(--color-text)]">
                      {t('workbench.weeklyCacheTitle')}
                    </div>
                    {weeklyCacheModels.length === 0 ? (
                      <p className="rounded-[8px] border border-dashed border-[var(--color-border-subtle)] py-6 text-center text-[0.76rem] text-[var(--color-text-soft)]">
                        {t('workbench.noData')}
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {weeklyCacheModels.map((m) => {
                          const ratePct = Math.max(0, Math.min(100, (m.cacheHitRate || 0) * 100));
                          const color = getStableColor(m.modelName);
                          return (
                            <div key={m.modelName} className="space-y-1">
                              <div className="flex items-center justify-between gap-2 text-[0.74rem]">
                                <span className="flex min-w-0 items-center gap-2">
                                  <span
                                    aria-hidden="true"
                                    className="size-2 shrink-0 rounded-full"
                                    style={{ backgroundColor: color }}
                                  />
                                  <span className="truncate font-mono text-[var(--color-text)]">
                                    {m.modelName}
                                  </span>
                                </span>
                                <span className="shrink-0 font-mono text-[0.71rem] tabular-nums text-[var(--color-text-muted)]">
                                  {formatPercent(m.cacheHitRate)} · {formatCompactTokens(m.cacheReadTokens)}
                                </span>
                              </div>
                              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-recessed-bg,var(--color-row-bg))]">
                                <div
                                  className="h-full rounded-full transition-[width] duration-300 ease-out"
                                  style={{
                                    width: `${Math.max(2, ratePct)}%`,
                                    backgroundColor: color,
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col justify-center gap-3 rounded-[12px] border border-[var(--color-border-faint)] bg-[var(--color-surface)] p-5 lg:col-span-5">
                    <span className="text-[0.75rem] font-medium text-[var(--color-text-muted)]">
                      {t('workbench.weightedCacheHit')}
                    </span>
                    <div className="font-mono text-[2rem] font-semibold tracking-tight tabular-nums text-[var(--color-text)]">
                      {formatPercent(data.totals.cacheHitRate)}
                    </div>
                    <div className="space-y-1 border-t border-[var(--color-border-faint)] pt-2.5 text-[0.72rem] text-[var(--color-text-muted)]">
                      <div className="flex justify-between font-mono tabular-nums">
                        <span>{tokenLabels.cacheRead}</span>
                        <span className="text-[var(--color-text)]">
                          {formatCompactTokens(data.totals.cacheReadTokens)}
                        </span>
                      </div>
                      <div className="flex justify-between font-mono tabular-nums">
                        <span>Prompt</span>
                        <span className="text-[var(--color-text)]">
                          {formatCompactTokens(totalPrompt)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()
          ) : cacheSubView === 'global' ? (
            <MultiLineChart
              ariaLabel={t('workbench.cacheGlobal')}
              showArea
              hideReadoutBar
              minColumnWidth={scrollMinColWidth}
              onHoverIndexChange={setHoveredCacheIdx}
              yMin={cacheDomain.yMin}
              yMax={cacheDomain.yMax}
              formatValue={(v) => formatPercent(v)}
              formatDenominator={(d) => t('workbench.promptDenominator', { value: formatCompactTokens(d) })}
              emptyLabel={t('workbench.noData')}
              xAxis={globalCachePoints.map((p) => ({
                key: p.key,
                label: p.label,
                fullLabel: p.fullLabel,
              }))}
              series={[
                {
                  id: 'global-cache-hit',
                  label: t('workbench.weightedCacheHit'),
                  color: TOKEN_TYPE_COLORS.cacheRead,
                  values: globalCachePoints.map((p) => p.hitRate),
                  denominators: globalCachePoints.map((p) => p.promptTokens),
                  summaryValue: formatPercent(data.totals.cacheHitRate),
                },
              ]}
            />
          ) : (
            <MultiLineChart
              ariaLabel={t('workbench.cacheByModel')}
              hideReadoutBar
              minColumnWidth={scrollMinColWidth}
              onHoverIndexChange={setHoveredCacheIdx}
              yMin={cacheDomain.yMin}
              yMax={cacheDomain.yMax}
              formatValue={(v) => formatPercent(v)}
              formatDenominator={(d) => t('workbench.promptDenominator', { value: formatCompactTokens(d) })}
              emptyLabel={t('workbench.noData')}
              xAxis={buckets.map((b) => ({
                key: b.key,
                label: b.label,
                fullLabel: b.fullLabel,
              }))}
              hiddenSeriesIds={hiddenCacheIds}
              onToggleSeries={onToggleCacheModel}
              series={modelCacheSeriesList.map((item) => ({
                id: item.modelName,
                label: item.modelName,
                color: item.color,
                values: item.points.map((p) => p.hitRate),
                denominators: item.points.map((p) => p.promptTokens),
                summaryValue:
                  item.windowHitRate !== null ? formatPercent(item.windowHitRate) : '—',
              }))}
            />
          )
        ) : null}

        {activeTab === 'migration' ? (
          isSevenDayWeekly ? (
            (() => {
              const weeklyMigrationSlices = migrationSeriesList.map((series) => ({
                id: series.id,
                label: series.label,
                value: series.summaryTokens,
                share: series.summaryShare,
                color: series.color,
              }));
              return (
                <div className="grid flex-1 min-h-0 grid-cols-1 gap-5 overflow-y-auto lg:grid-cols-12">
                  <div className="flex flex-col justify-center gap-3 lg:col-span-7">
                    <div className="flex items-center justify-between text-[0.78rem]">
                      <span className="font-medium text-[var(--color-text)]">
                        {migrationGroup === 'family'
                          ? t('workbench.weeklyFamilyTitle')
                          : t('workbench.weeklyHeroTitle')}
                      </span>
                      <span className="font-mono text-[0.72rem] tabular-nums text-[var(--color-text-muted)]">
                        {formatCompactTokens(migrationTotals)}
                      </span>
                    </div>
                    {weeklyMigrationSlices.length === 0 ? (
                      <p className="rounded-[8px] border border-dashed border-[var(--color-border-subtle)] py-6 text-center text-[0.76rem] text-[var(--color-text-soft)]">
                        {t('workbench.noData')}
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {weeklyMigrationSlices.slice(0, 7).map((row) => {
                          const pct = Math.max(0, Math.min(100, row.share * 100));
                          return (
                            <div key={row.id} className="space-y-1">
                              <div className="flex items-center justify-between gap-2 text-[0.74rem]">
                                <span className="flex min-w-0 items-center gap-2">
                                  <span
                                    aria-hidden="true"
                                    className="size-2 shrink-0 rounded-full"
                                    style={{ backgroundColor: row.color }}
                                  />
                                  <span className="truncate font-mono text-[var(--color-text)]">
                                    {row.label}
                                  </span>
                                </span>
                                <span className="shrink-0 font-mono text-[0.71rem] tabular-nums text-[var(--color-text-muted)]">
                                  {formatCompactTokens(row.value)} ({pct.toFixed(1)}%)
                                </span>
                              </div>
                              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-recessed-bg,var(--color-row-bg))]">
                                <div
                                  className="h-full rounded-full transition-[width] duration-300 ease-out"
                                  style={{
                                    width: `${Math.max(2, pct)}%`,
                                    backgroundColor: row.color,
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-center rounded-[12px] border border-[var(--color-border-faint)] bg-[var(--color-surface)] p-4 lg:col-span-5">
                    <DonutChart
                      ariaLabel={
                        migrationGroup === 'family'
                          ? t('workbench.weeklyFamilyTitle')
                          : t('workbench.weeklyHeroTitle')
                      }
                      slices={weeklyMigrationSlices}
                      centerLabel={weeklyDonutLabel}
                      centerValue={formatCompactTokens(migrationTotals)}
                      emptyLabel={t('workbench.noData')}
                      centerTransitionKey={`weekly-migration-${migrationGroup}`}
                    />
                  </div>
                </div>
              );
            })()
          ) : (
            <StackedAreaChart
              ariaLabel={t('workbench.tabMigration')}
              buckets={migrationData.buckets}
              series={migrationSeriesList}
              mode={migrationMode}
              hideReadoutBar
              minColumnWidth={scrollMinColWidth}
              onHoverIndexChange={setHoveredMigrationIdx}
              formatTokens={(n) => formatCompactTokens(n)}
              emptyLabel={t('workbench.noData')}
            />
          )
        ) : null}

        {activeTab === 'cost' ? (
          billingPreview?.status === 'loading' ? (
            <div className="flex flex-1 min-h-[210px] items-center justify-center text-[0.78rem] text-[var(--color-text-soft)]">
              {t('workbench.billingLoading')}
            </div>
          ) : billingPreview && billingPreview.status !== 'ready' ? (
            <div className="flex flex-1 min-h-[210px] items-center justify-center text-[0.78rem] text-[var(--color-text-soft)]">
              {t('workbench.billingUnavailable')}
            </div>
          ) : isSevenDayWeekly ? (
            (() => {
              const pricedWeeklyModels = data.models
                .filter((m) => m.slotStatus !== 'configured' && !m.missingPricing && m.cost > 0)
                .sort((a, b) => b.cost - a.cost);
              const modelCostTotal = pricedWeeklyModels.reduce((sum, m) => sum + m.cost, 0);
              const billingTotal = billingPreview
                ? billingDays.reduce((sum, d) => sum + (Number(d.estimatedCostUsd) || 0), 0)
                : data.totals.cost || modelCostTotal;
              const top5Cost = pricedWeeklyModels.slice(0, 5);
              const otherCost = pricedWeeklyModels.slice(5).reduce((sum, m) => sum + m.cost, 0);
              const weeklyCostSlices = [
                ...top5Cost.map((m) => ({
                  id: m.modelName,
                  label: m.modelName,
                  value: m.cost,
                  share: modelCostTotal > 0 ? m.cost / modelCostTotal : 0,
                  color: getStableColor(m.modelName),
                })),
                ...(otherCost > 0
                  ? [
                      {
                        id: OTHERS_SERIES_ID,
                        label: t('workbench.others'),
                        value: otherCost,
                        share: modelCostTotal > 0 ? otherCost / modelCostTotal : 0,
                        color: CHART_MUTED_COLOR,
                      },
                    ]
                  : []),
              ];

              return (
                <div className="grid flex-1 min-h-0 grid-cols-1 gap-5 overflow-y-auto lg:grid-cols-12">
                  <div className="flex flex-col justify-between gap-3 lg:col-span-7">
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between text-[0.78rem]">
                        <span className="font-medium text-[var(--color-text)]">
                          {t('workbench.weeklyCostTitle')}
                        </span>
                        <span className="font-mono text-[0.72rem] tabular-nums text-[var(--color-text-muted)]">
                          {formatUsd(
                            billingTotal,
                            billingTotal < 0.1 && billingTotal > 0 ? 3 : 2,
                          )}
                        </span>
                      </div>

                      {weeklyCostSlices.length === 0 ? (
                        <p className="rounded-[8px] border border-dashed border-[var(--color-border-subtle)] py-6 text-center text-[0.76rem] text-[var(--color-text-soft)]">
                          {t('workbench.weeklyNoCostData')}
                        </p>
                      ) : (
                        <div className="space-y-2.5">
                          {weeklyCostSlices.map((row) => {
                            const pct = Math.max(0, Math.min(100, row.share * 100));
                            return (
                              <div key={row.id} className="space-y-1">
                                <div className="flex items-center justify-between gap-2 text-[0.74rem]">
                                  <span className="flex min-w-0 items-center gap-2">
                                    <span
                                      aria-hidden="true"
                                      className="size-2 shrink-0 rounded-full"
                                      style={{ backgroundColor: row.color }}
                                    />
                                    <span className="truncate font-mono text-[var(--color-text)]">
                                      {row.label}
                                    </span>
                                  </span>
                                  <span className="shrink-0 font-mono text-[0.71rem] tabular-nums text-[var(--color-text-muted)]">
                                    {formatUsd(row.value, row.value < 0.1 && row.value > 0 ? 3 : 2)} (
                                    {pct.toFixed(1)}%)
                                  </span>
                                </div>
                                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-recessed-bg,var(--color-row-bg))]">
                                  <div
                                    className="h-full rounded-full transition-[width] duration-300 ease-out"
                                    style={{
                                      width: `${Math.max(2, pct)}%`,
                                      backgroundColor: row.color,
                                    }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {costForecast.weightedDailyUsd !== null && costForecast.weightedDailyUsd > 0 ? (
                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border-faint)] pt-2 font-mono text-[0.69rem] tabular-nums text-[var(--color-text-muted)]">
                        <span>
                          {t('workbench.costWeightedDaily', {
                            value: formatUsd(
                              costForecast.weightedDailyUsd,
                              costForecast.weightedDailyUsd < 0.1 ? 3 : 2,
                            ),
                          })}
                        </span>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[var(--color-text)]">
                          <span>
                            {t('workbench.costProjected30d', {
                              value: formatUsd(costForecast.projected30dUsd ?? 0),
                            })}
                          </span>
                          <span>
                            {t('workbench.costProjectedAnnual', {
                              value: formatUsd(costForecast.projectedAnnualUsd ?? 0, 0),
                            })}
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-center rounded-[12px] border border-[var(--color-border-faint)] bg-[var(--color-surface)] p-4 lg:col-span-5">
                    <DonutChart
                      ariaLabel={t('workbench.weeklyCostTitle')}
                      slices={weeklyCostSlices}
                      centerLabel={weeklyDonutLabel}
                      centerValue={formatUsd(
                        billingTotal,
                        billingTotal < 0.1 && billingTotal > 0 ? 3 : 2,
                      )}
                      emptyLabel={t('workbench.weeklyNoCostData')}
                      formatValue={(v) => formatUsd(v, v < 0.1 && v > 0 ? 3 : 2)}
                    />
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="flex flex-1 min-h-0 flex-col gap-2">
              <StackedBarChart
                ariaLabel={t('workbench.tabCost')}
                data={costBars}
                hideReadoutBar
                minColumnWidth={costScrollWidth}
                onHoverIndexChange={setHoveredCostIdx}
                overlayLine={costEwmaOverlay}
                overlayLabel={t('workbench.costTrendLine')}
                overlayColor={CHART_TOTAL_LINE_COLOR}
                formatYAxis={(val) => formatUsd(val, val < 0.1 && val > 0 ? 3 : 2)}
                partialLabel={t('workbench.partialBucket')}
                emptyLabel={
                  billingPreview
                    ? t('costs.reference.emptyBreakdown')
                    : t('workbench.noData')
                }
                onSelectBar={(datum) => {
                  if (billingPreview) {
                    const match = aggregatedBilling.find((b) => b.key === datum.key);
                    if (match?.drillDate) onSelectDate(match.drillDate);
                  } else {
                    const matchBucket = buckets.find((b) => b.key === datum.key);
                    const drillDate = matchBucket?.dates[matchBucket.dates.length - 1];
                    if (drillDate) onSelectDate(drillDate);
                  }
                }}
              />

              {costForecast.weightedDailyUsd !== null && costForecast.weightedDailyUsd > 0 ? (
                <div className="flex h-6 shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border-faint)] pt-1.5 font-mono text-[0.69rem] tabular-nums text-[var(--color-text-muted)]">
                  <span>
                    {t('workbench.costWeightedDaily', {
                      value: formatUsd(
                        costForecast.weightedDailyUsd,
                        costForecast.weightedDailyUsd < 0.1 ? 3 : 2,
                      ),
                    })}
                  </span>
                  <div className="flex items-center gap-4">
                    <span>
                      {t('workbench.costProjected30d', {
                        value: formatUsd(costForecast.projected30dUsd ?? 0),
                      })}
                    </span>
                    <span>
                      {t('workbench.costProjectedAnnual', {
                        value: formatUsd(costForecast.projectedAnnualUsd ?? 0, 0),
                      })}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          )
        ) : null}

        {activeTab === 'calendar' ? (
          <CompactCalendarPicker
            points={sortedDaily}
            selectedDate={selectedDay?.date ?? null}
            onSelectDate={(date) => onSelectDate(date)}
            locale={locale}
            prevMonthLabel={t('overview.trend.previousMonth')}
            nextMonthLabel={t('overview.trend.nextMonth')}
            lessLabel={t('overview.trend.calendarLess')}
            moreLabel={t('overview.trend.calendarMore')}
          />
        ) : null}
      </div>
    </section>
  );
}
