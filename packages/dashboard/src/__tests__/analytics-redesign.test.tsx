// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import type { DailyUsagePoint, TokenDashboardData } from '../domain';
import { emptyDashboard } from '../domain';
import zh from '../messages/zh.json';
import en from '../messages/en.json';
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
  computeCalendarQuantileThresholds,
  computeCostForecast,
  computeMovingAverage,
  deriveNetTokenComposition,
  deriveTokenComposition,
  getCalendarIntensityLevel,
  OTHERS_SERIES_ID,
} from '../react/analytics/derive-analytics';
import {
  resetDashboardPreferences,
  writeDashboardPreferences,
} from '../react/dashboard-preferences';
import { resolveStableModelColor } from '../react/model-colors';
import { formatUsd } from '../react/formatters';
import { TokenDashboardFeature } from '../react/token-dashboard-feature';

afterEach(() => {
  cleanup();
  resetDashboardPreferences();
  window.localStorage.clear();
});

const emptyDayTokens = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  reasoningTokens: 0,
  cost: 0,
  totalTokens: 0,
};

function wrap(children: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="zh" timeZone="Asia/Shanghai" messages={{ dashboard: zh }}>
      {children}
    </NextIntlClientProvider>
  );
}

describe('dashboard analytics derivation & workbench redesign', () => {
  it('separates all 5 token types strictly without merging cache writes and reasoning', () => {
    const parts = deriveTokenComposition({
      inputTokens: 200,
      cacheReadTokens: 500,
      cacheCreationTokens: 100,
      outputTokens: 150,
      reasoningTokens: 50,
      totalTokens: 1000,
      cost: 0,
    });
    expect(parts.map((p) => [p.id, p.tokens, p.share])).toEqual([
      ['cacheRead', 500, 0.5],
      ['input', 200, 0.2],
      ['cacheWrite', 100, 0.1],
      ['output', 150, 0.15],
      ['reasoning', 50, 0.05],
    ]);
  });

  it('aggregates daily points into Monday-start weeks with partial flags and moving averages', () => {
    const daily: DailyUsagePoint[] = [
      { ...emptyDayTokens, date: '2026-10-12', inputTokens: 100, totalTokens: 100, modelsUsed: ['a'], modelBreakdowns: [] },
      { ...emptyDayTokens, date: '2026-10-13', inputTokens: 200, totalTokens: 200, modelsUsed: ['a'], modelBreakdowns: [] },
      { ...emptyDayTokens, date: '2026-10-19', inputTokens: 300, totalTokens: 300, modelsUsed: ['a'], modelBreakdowns: [] },
    ];
    const weeks = buildTimeBuckets(daily, [], 'week');
    expect(weeks).toHaveLength(2);
    expect(weeks[0].key).toBe('2026-10-12');
    expect(weeks[0].totalTokens).toBe(300);
    expect(weeks[0].isPartial).toBe(true);
    expect(weeks[1].key).toBe('2026-10-19');
    expect(weeks[1].totalTokens).toBe(300);

    expect(computeMovingAverage([100, 200, 300], 2)).toEqual([100, 150, 250]);
  });

  it('computes weighted global and per-model cache hit rates with null gaps on inactive days', () => {
    const daily: DailyUsagePoint[] = [
      {
        ...emptyDayTokens,
        date: '2026-10-12',
        inputTokens: 200,
        cacheReadTokens: 800,
        totalTokens: 1000,
        modelsUsed: ['model-a'],
        modelBreakdowns: [
          { ...emptyDayTokens, modelName: 'model-a', inputTokens: 200, cacheReadTokens: 800, totalTokens: 1000 },
        ],
      },
      {
        ...emptyDayTokens,
        date: '2026-10-13',
        inputTokens: 100,
        cacheReadTokens: 0,
        totalTokens: 100,
        modelsUsed: ['model-b'],
        modelBreakdowns: [
          { ...emptyDayTokens, modelName: 'model-b', inputTokens: 100, cacheReadTokens: 0, totalTokens: 100 },
        ],
      },
      {
        ...emptyDayTokens,
        date: '2026-10-14',
        inputTokens: 50,
        cacheReadTokens: 150,
        totalTokens: 200,
        modelsUsed: ['model-a'],
        modelBreakdowns: [
          { ...emptyDayTokens, modelName: 'model-a', inputTokens: 50, cacheReadTokens: 150, totalTokens: 200 },
        ],
      },
    ];
    const buckets = buildTimeBuckets(daily, [], 'day');
    const globalSeries = buildGlobalCacheSeries(buckets);
    expect(globalSeries.map((p) => p.hitRate)).toEqual([0.8, 0, 0.75]);

    const perModel = buildModelCacheSeries(buckets, ['model-a', 'model-b']);
    expect(perModel[0].points.map((p) => p.hitRate)).toEqual([0.8, null, 0.75]);
    expect(perModel[0].windowHitRate).toBeCloseTo(950 / 1200);
    expect(perModel[1].points.map((p) => p.hitRate)).toEqual([null, 0, null]);
  });

  it('supports single-day drilldown, per-model cache comparison via row action, and diagnostics drawer', async () => {
    const base = emptyDashboard('30d');
    const data: TokenDashboardData = {
      ...base,
      dateRange: { from: '2026-10-12', to: '2026-10-13', activeDays: 2, calendarDays: 2 },
      totals: {
        ...base.totals,
        inputTokens: 300,
        cacheReadTokens: 700,
        cacheCreationTokens: 50,
        outputTokens: 150,
        reasoningTokens: 50,
        totalTokens: 1250,
        cacheHitRate: 700 / 1050,
        outputToInputRatio: 200 / 1050,
        sessionCount: 3,
        projectCount: 1,
      },
      daily: [
        {
          ...emptyDayTokens,
          date: '2026-10-12',
          inputTokens: 100,
          cacheReadTokens: 300,
          totalTokens: 400,
          modelsUsed: ['claude-sonnet'],
          modelBreakdowns: [
            { ...emptyDayTokens, modelName: 'claude-sonnet', inputTokens: 100, cacheReadTokens: 300, totalTokens: 400 },
          ],
        },
        {
          ...emptyDayTokens,
          date: '2026-10-13',
          inputTokens: 200,
          cacheReadTokens: 400,
          cacheCreationTokens: 50,
          outputTokens: 150,
          reasoningTokens: 50,
          totalTokens: 850,
          modelsUsed: ['claude-sonnet', 'gpt-5'],
          modelBreakdowns: [
            { ...emptyDayTokens, modelName: 'claude-sonnet', inputTokens: 100, cacheReadTokens: 400, totalTokens: 500 },
            { ...emptyDayTokens, modelName: 'gpt-5', inputTokens: 100, cacheCreationTokens: 50, outputTokens: 150, reasoningTokens: 50, totalTokens: 350 },
          ],
        },
      ],
      models: [
        {
          ...emptyDayTokens,
          inputTokens: 200,
          cacheReadTokens: 700,
          totalTokens: 900,
          modelName: 'claude-sonnet',
          displayName: 'Claude Sonnet',
          provider: 'claude',
          source: 'Claude Code',
          sourcesUsed: ['Claude Code'],
          shareOfTokens: 900 / 1250,
          shareOfCost: 0.7,
          cacheHitRate: 700 / 900,
          missingPricing: false,
          slotStatus: 'measured',
          sessionCount: 2,
          activeDays: 2,
        },
        {
          ...emptyDayTokens,
          inputTokens: 100,
          cacheCreationTokens: 50,
          outputTokens: 150,
          reasoningTokens: 50,
          totalTokens: 350,
          modelName: 'gpt-5',
          displayName: 'GPT-5',
          provider: 'openai',
          source: 'Codex',
          sourcesUsed: ['Codex'],
          shareOfTokens: 350 / 1250,
          shareOfCost: 0.3,
          cacheHitRate: 0,
          missingPricing: false,
          slotStatus: 'measured',
          sessionCount: 1,
          activeDays: 1,
        },
      ],
    };

    render(wrap(<TokenDashboardFeature data={data} canImport />));

    // Switch to 1D single-day view
    fireEvent.click(screen.getByRole('button', { name: zh.workbench.range1d }));
    expect(screen.getByRole('heading', { name: zh.workbench.singleDayTitle })).toBeDefined();
    expect(screen.getByText(zh.workbench.hourlyReadyTitle)).toBeDefined();

    // Return to window view, toggle <1M curated filter off to reveal low-volume test models, expand row in place, and jump to multi-model cache comparison
    fireEvent.click(screen.getByRole('button', { name: zh.workbench.backToRange }));
    fireEvent.click(screen.getByRole('button', { name: zh.workbench.curatedFilterOn }));
    fireEvent.click(screen.getByRole('button', { name: '展开 claude-sonnet 详情' }));
    expect(screen.getByText(new RegExp(zh.workbench.pricingSingleLineLabel))).toBeDefined();
    // In-place overlay keeps total tbody rows equal to the page model count (2 models -> 2 tr, covering row 2)
    expect(screen.queryByText('GPT-5')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '收起 claude-sonnet 详情' }));
    expect(screen.getByText('GPT-5')).toBeDefined();
    // Expand bottom-most row (gpt-5): overlays the row above in place cleanly and keeps full-width pricing row visible
    const modelsTable = screen.getByRole('table');
    fireEvent.click(screen.getByRole('button', { name: '展开 gpt-5 详情' }));
    expect(screen.getByText(new RegExp(zh.workbench.pricingSingleLineLabel))).toBeDefined();
    expect(within(modelsTable).queryByText('Claude Sonnet')).toBeNull();
    expect(within(modelsTable).getByText('GPT-5')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '收起 gpt-5 详情' }));
    expect(within(modelsTable).getByText('Claude Sonnet')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: '展开 claude-sonnet 详情' }));
    fireEvent.click(screen.getByRole('button', { name: zh.workbench.focusCacheTrend }));
    expect(screen.getByRole('button', { name: zh.workbench.cacheByModel }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: zh.workbench.cachePickerTitle }).textContent).toContain('1 /');
    const globalAvgBtn = screen.getByRole('button', {
      name: new RegExp(zh.workbench.cacheGlobalAvgLine),
    });
    expect(globalAvgBtn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(globalAvgBtn);
    expect(globalAvgBtn.getAttribute('aria-pressed')).toBe('true');

    // Open and close minimalist diagnostics checklist
    fireEvent.click(screen.getByRole('button', { name: zh.workbench.diagnosticsOpen }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(zh.workbench.diagnosticsSectionSources)).toBeDefined();
    fireEvent.click(within(dialog).getByRole('button', { name: zh.workbench.diagnosticsClose }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps en and zh workbench localization keys aligned without Chinese full stops', () => {
    const collectKeys = (node: unknown, prefix = ''): string[] => {
      if (!node || typeof node !== 'object') return [prefix];
      return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
        collectKeys(value, prefix ? `${prefix}.${key}` : key),
      );
    };
    const collectStrings = (node: unknown): string[] => {
      if (typeof node === 'string') return [node];
      if (!node || typeof node !== 'object') return [];
      return Object.values(node as Record<string, unknown>).flatMap(collectStrings);
    };
    expect(collectKeys(zh.workbench).sort()).toEqual(collectKeys(en.workbench).sort());
    for (const text of collectStrings(zh.workbench)) {
      expect(text).not.toContain('。');
    }
  });

  it('derives net non-cache token composition, model-family migration series, and billing grain aggregation', () => {
    const netParts = deriveNetTokenComposition({
      inputTokens: 200,
      cacheReadTokens: 9000,
      cacheCreationTokens: 100,
      outputTokens: 150,
      reasoningTokens: 50,
      totalTokens: 9500,
      cost: 0,
    });
    expect(netParts.map((p) => [p.id, p.share])).toEqual([
      ['input', 200 / 500],
      ['cacheWrite', 100 / 500],
      ['output', 150 / 500],
      ['reasoning', 50 / 500],
    ]);

    const daily: DailyUsagePoint[] = [
      {
        ...emptyDayTokens,
        date: '2026-10-12',
        totalTokens: 1000,
        modelsUsed: ['claude-sonnet', 'gpt-5'],
        modelBreakdowns: [
          { ...emptyDayTokens, modelName: 'claude-sonnet', totalTokens: 600 },
          { ...emptyDayTokens, modelName: 'gpt-5', totalTokens: 400 },
        ],
      },
      {
        ...emptyDayTokens,
        date: '2026-10-13',
        totalTokens: 1000,
        modelsUsed: ['deepseek-chat', 'gemini-2.5-pro'],
        modelBreakdowns: [
          { ...emptyDayTokens, modelName: 'deepseek-chat', totalTokens: 700 },
          { ...emptyDayTokens, modelName: 'gemini-2.5-pro', totalTokens: 300 },
        ],
      },
    ];
    const buckets = buildTimeBuckets(daily, [], 'day');
    const migration = buildModelFamilyMigrationSeries(buckets, [], 4);
    expect(migration.seriesIds).toEqual(['DeepSeek', 'Claude', 'GPT', 'Gemini']);
    expect(migration.buckets[0].shares).toMatchObject({ Claude: 0.6, GPT: 0.4, DeepSeek: 0, Gemini: 0 });
    expect(migration.buckets[1].shares).toMatchObject({ DeepSeek: 0.7, Gemini: 0.3, Claude: 0, GPT: 0 });

    const weeklyBilling = aggregateBillingDaysByGrain(
      [
        { day: '2026-10-12', estimatedCostUsd: '1.20', estimatedTokens: 100, unpricedTokens: 0, excludedTokens: 0 },
        { day: '2026-10-13', estimatedCostUsd: '0.80', estimatedTokens: 100, unpricedTokens: 0, excludedTokens: 0 },
        { day: '2026-10-19', estimatedCostUsd: '3.00', estimatedTokens: 200, unpricedTokens: 0, excludedTokens: 0 },
      ],
      'week',
    );
    expect(weeklyBilling).toHaveLength(2);
    expect(weeklyBilling[0].numericUsd).toBeCloseTo(2.0);
    expect(weeklyBilling[0].isPartial).toBe(true);
    expect(weeklyBilling[1].numericUsd).toBeCloseTo(3.0);

    // Single-month fallback keeps exact calendar days instead of collapsing all 30d bars into 1 column
    const singleMonthFallback = aggregateBillingDaysByGrain(
      [
        { day: '2026-10-12', estimatedCostUsd: '1.20', estimatedTokens: 100, unpricedTokens: 0, excludedTokens: 0 },
        { day: '2026-10-13', estimatedCostUsd: '0.80', estimatedTokens: 100, unpricedTokens: 0, excludedTokens: 0 },
      ],
      'month',
    );
    expect(singleMonthFallback).toHaveLength(2);
    expect(singleMonthFallback[0].key).toBe('2026-10-12');
  });

  it('defaults volume mode to by-model, toggles normalized net share & family migration area, and keeps alerts inline in toolbar', async () => {
    const base = emptyDashboard('30d');
    const data: TokenDashboardData = {
      ...base,
      collectionIssues: ['sample-warning-1', 'sample-warning-2'],
      dateRange: { from: '2026-10-12', to: '2026-10-13', activeDays: 2, calendarDays: 2 },
      totals: {
        ...base.totals,
        inputTokens: 300,
        cacheReadTokens: 700,
        cacheCreationTokens: 50,
        outputTokens: 150,
        reasoningTokens: 50,
        totalTokens: 1250,
        cacheHitRate: 700 / 1050,
        outputToInputRatio: 200 / 1050,
        sessionCount: 3,
      },
      daily: [
        {
          ...emptyDayTokens,
          date: '2026-10-12',
          inputTokens: 100,
          cacheReadTokens: 300,
          totalTokens: 400,
          modelsUsed: ['claude-sonnet'],
          modelBreakdowns: [
            { ...emptyDayTokens, modelName: 'claude-sonnet', inputTokens: 100, cacheReadTokens: 300, totalTokens: 400 },
          ],
        },
        {
          ...emptyDayTokens,
          date: '2026-10-13',
          inputTokens: 200,
          cacheReadTokens: 400,
          cacheCreationTokens: 50,
          outputTokens: 150,
          reasoningTokens: 50,
          totalTokens: 850,
          modelsUsed: ['gpt-5'],
          modelBreakdowns: [
            { ...emptyDayTokens, modelName: 'gpt-5', inputTokens: 200, cacheReadTokens: 400, cacheCreationTokens: 50, outputTokens: 150, reasoningTokens: 50, totalTokens: 850 },
          ],
        },
      ],
      models: [
        {
          ...emptyDayTokens,
          inputTokens: 100,
          cacheReadTokens: 300,
          totalTokens: 400,
          modelName: 'claude-sonnet',
          displayName: 'Claude Sonnet',
          provider: 'claude',
          source: 'Claude Code',
          shareOfTokens: 400 / 1250,
          shareOfCost: 0.5,
          cacheHitRate: 0.75,
          missingPricing: false,
          slotStatus: 'measured',
          sessionCount: 2,
          activeDays: 1,
        },
        {
          ...emptyDayTokens,
          inputTokens: 200,
          cacheReadTokens: 400,
          cacheCreationTokens: 50,
          outputTokens: 150,
          reasoningTokens: 50,
          totalTokens: 850,
          modelName: 'gpt-5',
          displayName: 'GPT-5',
          provider: 'openai',
          source: 'Codex',
          shareOfTokens: 850 / 1250,
          shareOfCost: 0.5,
          cacheHitRate: 400 / 650,
          missingPricing: false,
          slotStatus: 'measured',
          sessionCount: 1,
          activeDays: 1,
        },
      ],
    };

    render(wrap(<TokenDashboardFeature data={data} canImport />));

    // Inline diagnostics button absorbs warning count without rendering the removed standalone warning banner
    const diagBtn = screen.getByRole('button', { name: zh.workbench.diagnosticsOpen });
    expect(diagBtn.textContent).toContain('2');
    expect(screen.queryByText(/项采集警告/)).toBeNull();

    // Toolbar shows circular progressbar + hover freshness info + compact refresh button, without Import button
    expect(screen.queryByRole('button', { name: zh.imports.open })).toBeNull();
    expect(screen.getByRole('progressbar', { name: zh.page.autoRefresh })).toBeDefined();
    expect(screen.getByRole('button', { name: zh.page.refresh })).toBeDefined();

    // Default volume mode is By Model; dynamic moving average sits in Layer 2 (outside Row 1 header)
    const byModelBtn = screen.getByRole('button', { name: zh.workbench.modeByModel });
    const dayGrainBtn = screen.getByRole('button', { name: zh.workbench.grainDay });
    expect(byModelBtn.getAttribute('aria-pressed')).toBe('true');
    const row1Header = byModelBtn.closest('.border-b');
    expect(row1Header).not.toBeNull();
    expect(row1Header?.contains(dayGrainBtn)).toBe(true);
    expect(screen.queryByRole('button', { name: '总量' })).toBeNull();
    const movingAvgBtn = screen.getByRole('button', { name: new RegExp(zh.workbench.movingAvg7d) });
    expect(row1Header?.contains(movingAvgBtn)).toBe(false);
    fireEvent.click(movingAvgBtn);
    expect(movingAvgBtn.getAttribute('aria-pressed')).toBe('true');

    // Switching grain to Weekly adapts moving-average label from 7D to 4W
    fireEvent.click(screen.getByRole('button', { name: zh.workbench.grainWeek }));
    expect(screen.getByRole('button', { name: new RegExp(zh.workbench.movingAvg4w) })).toBeDefined();
    fireEvent.click(dayGrainBtn);

    // Cross-bar model spotlight: hovering a bar opens the floating breakdown popover; clicking legend locks series spotlight
    const volDay1Bar = screen.getByRole('button', { name: /^2026-10-12:/ });
    fireEvent.mouseEnter(volDay1Bar);
    const popover = screen.getByRole('tooltip');
    expect(popover.textContent).toContain('2026-10-12');
    expect(popover.textContent).toContain('claude-sonnet');
    fireEvent.mouseLeave(volDay1Bar);
    expect(screen.queryByRole('tooltip')).toBeNull();

    const gptLegendBtn = screen
      .getAllByRole('button')
      .find((btn) => btn.textContent?.includes('gpt-5') && btn.hasAttribute('aria-pressed'));
    expect(gptLegendBtn).toBeDefined();
    if (gptLegendBtn) {
      fireEvent.click(gptLegendBtn);
      expect(gptLegendBtn.getAttribute('aria-pressed')).toBe('true');
      fireEvent.click(gptLegendBtn);
      expect(gptLegendBtn.getAttribute('aria-pressed')).toBe('false');
    }

    // Switch to normalized Token Share mode & confirm compact micro-tags update dynamically on hover
    fireEvent.click(screen.getByRole('button', { name: zh.workbench.modeByToken }));
    expect(screen.getByText('100%')).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Token 构成与效率' })).toBeNull();
    expect(screen.queryByRole('button', { name: '仅净增' })).toBeNull();

    const compBarsRegion = screen.getByLabelText(zh.workbench.modeByToken);
    // Window total is 1250 -> cacheRead 700 (56.0%)
    expect(compBarsRegion.textContent).toContain('56.0%');
    // Hover first day (2026-10-12: total 400, cacheRead 300 -> 75.0%)
    const day1Bar = screen.getByRole('button', { name: /^2026-10-12:/ });
    fireEvent.mouseEnter(day1Bar);
    expect(compBarsRegion.textContent).toContain('75.0%');
    fireEvent.mouseLeave(day1Bar);
    expect(compBarsRegion.textContent).toContain('56.0%');

    // Switch to Cache Hit Rate & verify Zoomed/Full range labels in Row 1 + single-model searchable focus
    fireEvent.click(screen.getByRole('tab', { name: zh.workbench.tabCache }));
    const autoScaleBtn = screen.getByRole('button', { name: zh.workbench.cacheScaleAuto });
    expect(autoScaleBtn.getAttribute('aria-pressed')).toBe('true');
    expect(row1Header?.contains(autoScaleBtn)).toBe(true);
    const fullScaleBtn = screen.getByRole('button', { name: zh.workbench.cacheScaleFull });
    fireEvent.click(fullScaleBtn);
    expect(fullScaleBtn.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: zh.workbench.cacheByModel }));
    const pickerBtn = screen.getByRole('button', { name: zh.workbench.cachePickerTitle });
    fireEvent.click(pickerBtn);
    const pickerDialog = screen.getByRole('dialog', { name: zh.workbench.cachePickerTitle });
    expect(within(pickerDialog).getByRole('button', { name: zh.workbench.cachePickerReset })).toBeDefined();
    expect(within(pickerDialog).getByRole('button', { name: zh.workbench.cachePickerSelectAll })).toBeDefined();
    expect(within(pickerDialog).getByRole('button', { name: zh.workbench.cachePickerClear })).toBeDefined();
    const claudeOpt = within(pickerDialog).getByRole('checkbox', { name: /claude-sonnet/ });
    expect(claudeOpt.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(claudeOpt);
    expect(claudeOpt.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(claudeOpt);
    expect(claudeOpt.getAttribute('aria-checked')).toBe('true');

    // Switch to Model Trends tab & verify group/mode controls sit in Row 1 while global preferences drive palette, pins & colors
    fireEvent.click(screen.getByRole('tab', { name: zh.workbench.tabMigration }));
    expect(screen.getByRole('button', { name: zh.workbench.migrationAbsolute }).getAttribute('aria-pressed')).toBe('true');
    const shareBtn = screen.getByRole('button', { name: zh.workbench.migrationShare });
    fireEvent.click(shareBtn);
    expect(shareBtn.getAttribute('aria-pressed')).toBe('true');
    const byFamilyBtn = screen.getByRole('button', { name: zh.workbench.migrationByFamily });
    expect(byFamilyBtn.getAttribute('aria-pressed')).toBe('true');
    expect(row1Header?.contains(byFamilyBtn)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: zh.workbench.migrationByModel }));
    expect(screen.getByRole('button', { name: zh.workbench.migrationByModel }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('combobox', { name: zh.workbench.pinModelPlaceholder })).toBeNull();

    // Apply independent Light/Dark preferences programmatically & verify live theme switching
    act(() => {
      writeDashboardPreferences({
        light: {
          paletteStyle: 'vivid',
          familyColors: {},
          modelColors: { 'claude-sonnet': '#ff6600' },
        },
        dark: {
          paletteStyle: 'pastel',
          familyColors: {},
          modelColors: { 'claude-sonnet': '#66ccff' },
        },
        pinnedModels: ['claude-sonnet'],
      });
    });
    expect(document.querySelector('[data-dashboard-palette="vivid"]')).not.toBeNull();
    expect(screen.getAllByText('claude-sonnet').length).toBeGreaterThan(0);
    const lightCustomSwatch = Array.from(document.querySelectorAll('span')).find(
      (el) => el.style.backgroundColor === 'rgb(255, 102, 0)' || el.style.backgroundColor === '#ff6600',
    );
    expect(lightCustomSwatch).toBeDefined();

    // Toggle dark class on documentElement -> Dashboard automatically applies dark scheme
    act(() => {
      document.documentElement.classList.add('dark');
    });
    await waitFor(() => {
      expect(document.querySelector('[data-dashboard-palette="pastel"]')).not.toBeNull();
    });
    const darkCustomSwatch = Array.from(document.querySelectorAll('span')).find(
      (el) => el.style.backgroundColor === 'rgb(102, 204, 255)' || el.style.backgroundColor === '#66ccff',
    );
    expect(darkCustomSwatch).toBeDefined();
    act(() => {
      document.documentElement.classList.remove('dark');
    });

    // Switch to Ref. Cost tab & verify EWMA trend toggle sits in Layer 2 (outside Row 1 header)
    fireEvent.click(screen.getByRole('tab', { name: zh.workbench.tabCost }));
    const ewmaBtn = screen.getByRole('button', { name: new RegExp(zh.workbench.costTrendLine) });
    expect(ewmaBtn.getAttribute('aria-pressed')).toBe('true');
    expect(row1Header?.contains(ewmaBtn)).toBe(false);

    // Calendar tab omits P25/P75 explanatory text
    fireEvent.click(screen.getByRole('tab', { name: zh.workbench.tabCalendar }));
    expect(screen.queryByText(/P25\s/)).toBeNull();
  });

  it('shows 3M average in All+Month, hides <1M models by default, and paginates models in fixed 8-row pages', () => {
    const base = emptyDashboard('all');
    const manyModels = Array.from({ length: 11 }, (_, idx) => {
      const total = idx < 10 ? (12 - idx) * 1_000_000 : 250_000;
      return {
        ...emptyDayTokens,
        inputTokens: Math.round(total * 0.2),
        outputTokens: Math.round(total * 0.1),
        cacheReadTokens: Math.round(total * 0.65),
        cacheCreationTokens: Math.round(total * 0.03),
        reasoningTokens: Math.round(total * 0.02),
        totalTokens: total,
        modelName: idx === 10 ? 'tiny-sub-1m-model' : `hero-model-${idx + 1}`,
        displayName: idx === 10 ? 'tiny-sub-1m-model' : `hero-model-${idx + 1}`,
        provider: 'openai' as const,
        source: 'Codex',
        shareOfTokens: 0.09,
        shareOfCost: 0.09,
        cacheHitRate: 0.74,
        missingPricing: false,
        slotStatus: 'measured' as const,
        sessionCount: 4,
        activeDays: 3,
      };
    });

    const dataAll: TokenDashboardData = {
      ...base,
      range: 'all',
      dateRange: { from: '2026-09-01', to: '2026-11-25', activeDays: 3, calendarDays: 86 },
      totals: {
        ...base.totals,
        totalTokens: manyModels.reduce((sum, m) => sum + m.totalTokens, 0),
        sessionCount: 44,
      },
      daily: [
        { ...emptyDayTokens, date: '2026-09-02', totalTokens: 1_000_000, modelsUsed: ['hero-model-1'], modelBreakdowns: [] },
        { ...emptyDayTokens, date: '2026-10-05', totalTokens: 2_000_000, modelsUsed: ['hero-model-1'], modelBreakdowns: [] },
        { ...emptyDayTokens, date: '2026-11-12', totalTokens: 3_000_000, modelsUsed: ['hero-model-1'], modelBreakdowns: [] },
      ],
      monthly: [
        { ...emptyDayTokens, month: '2026-09', totalTokens: 1_000_000, modelsUsed: ['hero-model-1'], modelBreakdowns: [] },
        { ...emptyDayTokens, month: '2026-10', totalTokens: 2_000_000, modelsUsed: ['hero-model-1'], modelBreakdowns: [] },
        { ...emptyDayTokens, month: '2026-11', totalTokens: 3_000_000, modelsUsed: ['hero-model-1'], modelBreakdowns: [] },
      ],
      models: manyModels,
    };

    render(wrap(<TokenDashboardFeature data={dataAll} canImport />));

    // All + Month grain adapts moving average to 3 月均线
    expect(screen.getByRole('button', { name: new RegExp(zh.workbench.movingAvg3m) })).toBeDefined();

    // <1M model hidden by default, 10 >=1M models paginated into 2 pages (8 + 2)
    expect(screen.queryByText('tiny-sub-1m-model')).toBeNull();
    expect(screen.getByText('1 / 2')).toBeDefined();
    expect(screen.queryByText('hero-model-9')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: zh.workbench.paginationNext }));
    expect(screen.getByText('2 / 2')).toBeDefined();
    expect(screen.getByText('hero-model-9')).toBeDefined();

    // Toggle <1M filter off to inspect all 11 models
    fireEvent.click(screen.getByRole('button', { name: zh.workbench.curatedFilterOn }));
    expect(screen.getByText('1 / 2')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: zh.workbench.paginationNext }));
    expect(screen.getByText('tiny-sub-1m-model')).toBeDefined();
  });

  it('keeps Weekly grain enabled in 7d range and switches to aggregated Donut and summary views', () => {
    const base = emptyDashboard('7d');
    const data7d: TokenDashboardData = {
      ...base,
      range: '7d',
      dateRange: { from: '2026-11-19', to: '2026-11-25', activeDays: 2, calendarDays: 7 },
      totals: {
        ...base.totals,
        inputTokens: 300,
        cacheReadTokens: 700,
        outputTokens: 200,
        totalTokens: 1200,
        cost: 2.5,
        cacheHitRate: 0.7,
        sessionCount: 4,
      },
      daily: [
        {
          ...emptyDayTokens,
          date: '2026-11-19',
          inputTokens: 100,
          cacheReadTokens: 300,
          totalTokens: 400,
          cost: 1.0,
          modelsUsed: ['claude-sonnet'],
          modelBreakdowns: [
            { ...emptyDayTokens, modelName: 'claude-sonnet', inputTokens: 100, cacheReadTokens: 300, totalTokens: 400, cost: 1.0 },
          ],
        },
        {
          ...emptyDayTokens,
          date: '2026-11-25',
          inputTokens: 200,
          cacheReadTokens: 400,
          outputTokens: 200,
          totalTokens: 800,
          cost: 1.5,
          modelsUsed: ['gpt-5'],
          modelBreakdowns: [
            { ...emptyDayTokens, modelName: 'gpt-5', inputTokens: 200, cacheReadTokens: 400, outputTokens: 200, totalTokens: 800, cost: 1.5 },
          ],
        },
      ],
      models: [
        {
          ...emptyDayTokens,
          inputTokens: 200,
          cacheReadTokens: 400,
          outputTokens: 200,
          totalTokens: 800,
          cost: 1.5,
          modelName: 'gpt-5',
          displayName: 'GPT-5',
          provider: 'openai',
          source: 'Codex',
          shareOfTokens: 800 / 1200,
          shareOfCost: 0.6,
          cacheHitRate: 400 / 600,
          missingPricing: false,
          slotStatus: 'measured',
          sessionCount: 2,
          activeDays: 1,
        },
        {
          ...emptyDayTokens,
          inputTokens: 100,
          cacheReadTokens: 300,
          totalTokens: 400,
          cost: 1.0,
          modelName: 'claude-sonnet',
          displayName: 'Claude Sonnet',
          provider: 'claude',
          source: 'Claude Code',
          shareOfTokens: 400 / 1200,
          shareOfCost: 0.4,
          cacheHitRate: 0.75,
          missingPricing: false,
          slotStatus: 'measured',
          sessionCount: 2,
          activeDays: 1,
        },
      ],
    };

    render(wrap(<TokenDashboardFeature data={data7d} canImport />));

    const weekBtn = screen.getByRole('button', { name: zh.workbench.grainWeek });
    expect((weekBtn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(weekBtn);
    expect(weekBtn.getAttribute('aria-pressed')).toBe('true');

    // Weekly Volume -> Model Donut
    expect(screen.getByRole('region', { name: zh.workbench.weeklyModelsTitle })).toBeDefined();

    // Weekly Cache Hit Rate -> Model bars, unused Global/Per-Model toggle hidden
    fireEvent.click(screen.getByRole('tab', { name: zh.workbench.tabCache }));
    expect(screen.getByText(zh.workbench.weeklyCacheTitle)).toBeDefined();
    expect(screen.queryByRole('button', { name: zh.workbench.cacheGlobal })).toBeNull();
    expect(screen.queryByRole('button', { name: zh.workbench.cacheByModel })).toBeNull();

    // Weekly Model Trends -> Family Donut
    fireEvent.click(screen.getByRole('tab', { name: zh.workbench.tabMigration }));
    expect(screen.getByRole('region', { name: zh.workbench.weeklyFamilyTitle })).toBeDefined();

    // Weekly Ref. Cost -> Cost Donut + Summary + thousands comma formatting
    fireEvent.click(screen.getByRole('tab', { name: zh.workbench.tabCost }));
    expect(screen.getByRole('region', { name: zh.workbench.weeklyCostTitle })).toBeDefined();
    expect(formatUsd(11056, 0)).toBe('$11,056');

    // Drill into single day -> KPI Cost card reflects single-day summary instead of multi-day session count
    fireEvent.click(screen.getByRole('button', { name: zh.workbench.range1d }));
    expect(screen.queryByText('2 天 · 4 会话')).toBeNull();
  });

  it('computes clean 5%-stepped adaptive cache rate domains with guaranteed >= 10% span', () => {
    expect(computeAdaptiveRateDomain([0.91, 0.98])).toEqual({ yMin: 0.85, yMax: 1 });
    expect(computeAdaptiveRateDomain([0.82, 0.95])).toEqual({ yMin: 0.75, yMax: 1 });
    expect(computeAdaptiveRateDomain([0.99, 1.0])).toEqual({ yMin: 0.9, yMax: 1 });
    expect(computeAdaptiveRateDomain([null, null])).toEqual({ yMin: 0, yMax: 1 });
  });

  it('preserves deterministic family colors, per-bucket top-5 retention, stage-hero union, quantile calendar & EWMA cost forecast', () => {
    const colorA = resolveStableModelColor('gemini-4-hydrogen', 'Gemini');
    const colorB = resolveStableModelColor('  GEMINI-4-HYDROGEN ', 'Gemini');
    expect(colorA).toBe(colorB);
    expect(colorA).toContain('var(--chart-gemini-');
    expect(resolveStableModelColor('gpt-6.1-sol', 'GPT')).toContain('var(--chart-gpt-');

    const mapSmall = buildStableModelColorMap(
      [{ ...emptyDayTokens, modelName: 'gemini-4-hydrogen', displayName: 'gemini-4-hydrogen', provider: 'gemini', source: 'Antigravity', shareOfTokens: 1, shareOfCost: 0, cacheHitRate: 0, missingPricing: false, sessionCount: 1, activeDays: 1 }],
      [],
    );
    const mapLarge = buildStableModelColorMap(
      [
        { ...emptyDayTokens, modelName: 'gemini-3.8-flash', displayName: 'gemini-3.8-flash', provider: 'gemini', source: 'Antigravity', shareOfTokens: 0.5, shareOfCost: 0, cacheHitRate: 0, missingPricing: false, sessionCount: 1, activeDays: 1 },
        { ...emptyDayTokens, modelName: 'gemini-4-hydrogen', displayName: 'gemini-4-hydrogen', provider: 'gemini', source: 'Antigravity', shareOfTokens: 0.5, shareOfCost: 0, cacheHitRate: 0, missingPricing: false, sessionCount: 1, activeDays: 1 },
      ],
      [],
    );
    expect(mapSmall.get('gemini-4-hydrogen')).toBe(mapLarge.get('gemini-4-hydrogen'));

    // Same-family custom hex auto-derives distinct theme-aware shades; explicit per-model override wins
    const makeGeminiModel = (modelName: string) => ({
      ...emptyDayTokens,
      modelName,
      displayName: modelName,
      provider: 'gemini' as const,
      source: 'Antigravity',
      shareOfTokens: 1 / 3,
      shareOfCost: 0,
      cacheHitRate: 0,
      missingPricing: false,
      slotStatus: 'measured' as const,
      sessionCount: 1,
      activeDays: 1,
    });
    const geminiCatalog = [
      makeGeminiModel('gemini-4-hydrogen'),
      makeGeminiModel('gemini-4-neon'),
      makeGeminiModel('gemini-4-hydrogen-tiered-high'),
    ];
    const lightDerived = buildStableModelColorMap(geminiCatalog, [], {
      themeMode: 'light',
      familyColors: { Gemini: '#16a87a' },
    });
    const darkDerived = buildStableModelColorMap(geminiCatalog, [], {
      themeMode: 'dark',
      familyColors: { Gemini: '#16a87a' },
    });
    const lightColors = geminiCatalog.map((m) => lightDerived.get(m.modelName));
    expect(new Set(lightColors).size).toBe(3);
    expect(darkDerived.get('gemini-4-neon')).not.toBe(lightDerived.get('gemini-4-neon'));

    const modelOverridden = buildStableModelColorMap(geminiCatalog, [], {
      themeMode: 'light',
      familyColors: { Gemini: '#16a87a' },
      modelColors: { 'gemini-4-neon': '#ff5500' },
    });
    expect(modelOverridden.get('gemini-4-neon')).toBe('#ff5500');
    expect(modelOverridden.get('gemini-4-hydrogen')).toBe(lightDerived.get('gemini-4-hydrogen'));

    // Period hero with tiny global rank still retains its own bar slot on Day 1
    const daily: DailyUsagePoint[] = [
      {
        ...emptyDayTokens,
        date: '2026-10-01',
        totalTokens: 100,
        modelsUsed: ['old-hero'],
        modelBreakdowns: [{ ...emptyDayTokens, modelName: 'old-hero', totalTokens: 100 }],
      },
      {
        ...emptyDayTokens,
        date: '2026-10-02',
        totalTokens: 6000,
        modelsUsed: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'],
        modelBreakdowns: [
          { ...emptyDayTokens, modelName: 'm1', totalTokens: 1000 },
          { ...emptyDayTokens, modelName: 'm2', totalTokens: 1000 },
          { ...emptyDayTokens, modelName: 'm3', totalTokens: 1000 },
          { ...emptyDayTokens, modelName: 'm4', totalTokens: 1000 },
          { ...emptyDayTokens, modelName: 'm5', totalTokens: 1000 },
          { ...emptyDayTokens, modelName: 'm6', totalTokens: 1000 },
        ],
      },
    ];
    const buckets = buildTimeBuckets(daily, [], 'day');
    const colorMap = buildStableModelColorMap([], daily);
    const perBars = buildPerBucketModelBars(buckets, colorMap, '其他模型', 5);
    expect(perBars[0].segments.map((s) => s.id)).toEqual(['old-hero']);
    expect(perBars[1].segments.find((s) => s.id === OTHERS_SERIES_ID)?.value).toBe(1000);

    const heroSeries = buildStageHeroMigrationSeries(buckets, [], colorMap, {
      pinnedModels: ['m6'],
      maxSeries: 8,
    });
    expect(heroSeries.seriesIds).toContain('old-hero');
    expect(heroSeries.seriesIds).toContain('m6');
    expect(heroSeries.buckets[0].totalTokens).toBe(100);
    expect(heroSeries.buckets[1].totalTokens).toBe(6000);

    // Calendar quantile immunity against 1.33B outlier
    const outlierCalendar = [
      { totalTokens: 50_000_000 },
      { totalTokens: 120_000_000 },
      { totalTokens: 220_000_000 },
      { totalTokens: 310_000_000 },
      { totalTokens: 1_330_000_000 },
    ];
    const thresholds = computeCalendarQuantileThresholds(outlierCalendar);
    expect(getCalendarIntensityLevel(220_000_000, thresholds).level).toBe(2);
    expect(getCalendarIntensityLevel(310_000_000, thresholds).level).toBe(3);
    expect(getCalendarIntensityLevel(1_330_000_000, thresholds).level).toBe(4);

    // Cost forecast EWMA
    const forecast = computeCostForecast(
      [
        { key: 'd1', cost: 10, hasData: true },
        { key: 'd2', cost: 20, hasData: true },
      ],
      0.5,
    );
    expect(forecast.weightedDailyUsd).toBeCloseTo(15);
    expect(forecast.projected30dUsd).toBeCloseTo(450);
    expect(forecast.projectedAnnualUsd).toBeCloseTo(5475);
  });

  it('renders 24h horizontal heatmap in 1D view with peak readout, hover/click inspection, partial coverage, and empty fallback', () => {
    const hourlyDayOne = Array.from({ length: 24 }, (_, hour) =>
      hour === 14 ? 4_000_000 : hour === 9 ? 1_000_000 : 0,
    );
    const data: TokenDashboardData = {
      ...emptyDashboard('30d'),
      updatedAt: '2026-10-15T12:00:00Z',
      totals: {
        ...emptyDayTokens,
        inputTokens: 10_000_000,
        totalTokens: 10_000_000,
        cacheHitRate: 0,
        outputToInputRatio: 0,
        sessionCount: 2,
        projectCount: 1,
      },
      daily: [
        {
          ...emptyDayTokens,
          date: '2026-10-14',
          inputTokens: 2_000_000,
          totalTokens: 2_000_000,
          modelsUsed: ['gpt-5'],
          modelBreakdowns: [{ ...emptyDayTokens, modelName: 'gpt-5', inputTokens: 2_000_000, totalTokens: 2_000_000 }],
        },
        {
          ...emptyDayTokens,
          date: '2026-10-15',
          inputTokens: 8_000_000,
          totalTokens: 8_000_000,
          modelsUsed: ['gpt-5'],
          modelBreakdowns: [{ ...emptyDayTokens, modelName: 'gpt-5', inputTokens: 8_000_000, totalTokens: 8_000_000 }],
          hourlyTokens: hourlyDayOne,
          hourlyMeasuredTokens: 5_000_000,
        },
      ],
      models: [
        {
          ...emptyDayTokens,
          inputTokens: 10_000_000,
          totalTokens: 10_000_000,
          modelName: 'gpt-5',
          displayName: 'GPT-5',
          provider: 'openai',
          source: 'Codex',
          sourcesUsed: ['Codex'],
          shareOfTokens: 1,
          shareOfCost: 0,
          cacheHitRate: 0,
          missingPricing: false,
          slotStatus: 'measured',
          sessionCount: 2,
          activeDays: 2,
        },
      ],
    };

    const { container } = render(wrap(<TokenDashboardFeature data={data} canImport />));
    fireEvent.click(screen.getByRole('button', { name: zh.workbench.range1d }));

    const hourButtons = container.querySelectorAll('button[data-hour]');
    expect(hourButtons).toHaveLength(24);
    expect(screen.getByText('峰值 14:00 · 4.00M')).toBeDefined();
    expect(screen.getByText('分时覆盖 63%')).toBeDefined();
    expect(screen.getByText('活跃 2 时段 · UTC+8')).toBeDefined();

    const hour14 = container.querySelector('button[data-hour="14"]') as HTMLButtonElement;
    const hour03 = container.querySelector('button[data-hour="3"]') as HTMLButtonElement;
    fireEvent.mouseEnter(hour14);
    expect(screen.getByText('14:00–14:59 · 4.00M · 50.0%')).toBeDefined();
    fireEvent.click(hour14);
    expect(hour14.getAttribute('aria-pressed')).toBe('true');

    fireEvent.mouseEnter(hour03);
    expect(screen.getByText('03:00–03:59 · 无用量')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: zh.workbench.prevDay }));
    expect(container.querySelectorAll('button[data-hour]')).toHaveLength(0);
    expect(screen.getByText(zh.workbench.hourlyReadyDesc)).toBeDefined();
  });
});
