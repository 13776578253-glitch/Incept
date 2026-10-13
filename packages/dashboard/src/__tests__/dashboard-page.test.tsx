// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TokenDashboardData } from '@incept/dashboard/domain';
import { TokenDashboardPage } from '@incept/dashboard/next';
import en from '@incept/dashboard/messages/en';
import zh from '@incept/dashboard/messages/zh';

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('@incept/dashboard/adapters', () => ({ readDashboardSnapshot: mocks.load }));

const tokens = {
  inputTokens: 0, outputTokens: 0, cacheReadTokens: 0,
  cacheCreationTokens: 0, reasoningTokens: 0, totalTokens: 0, cost: 0,
};
const emptyData: TokenDashboardData = {
  range: '30d',
  updatedAt: '2026-10-01T04:00:00Z',
  dateRange: { from: '—', to: '—', activeDays: 0 },
  totals: {
    ...tokens, cacheHitRate: 0, outputToInputRatio: 0, sessionCount: 0, projectCount: 0,
  },
  daily: [], monthly: [], models: [], sources: [], projects: [], sessions: [],
  costs: {
    totalCost: 0, avgDailyCost: 0, peakDay: { date: '—', cost: 0, tokens: 0 },
    blendedCostPerMillion: 0, estimatedCacheSavings: 0, pricedTokens: 0,
    unpricedTokens: 0, tokenCoverageRate: 100, pricedModelCount: 0,
    totalModelCount: 0, modelCoverageRate: 100, unpricedModels: [],
  },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('package server/client composition', () => {
  it('renders a loading shell when history is absent without waiting for native collection', async () => {
    mocks.load.mockResolvedValue(null);
    render(<NextIntlClientProvider locale="zh" messages={{ dashboard: zh }} timeZone="Asia/Singapore">{await TokenDashboardPage()}</NextIntlClientProvider>);
    expect(screen.getByText(zh.page.loadingFirst)).toBeDefined();
    expect(screen.queryByText(zh.overview.kpi.knownTokens)).toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(zh.page.title);
  });
  it.each([
    ['en', en], ['zh', zh],
  ] as const)('loads data and renders all dashboard sections with %s package messages', async (locale, messages) => {
    mocks.load.mockResolvedValue(emptyData);
    render(
      <NextIntlClientProvider locale={locale} messages={{ dashboard: messages }} timeZone="Asia/Shanghai">
        {await TokenDashboardPage({ canImport: true })}
      </NextIntlClientProvider>,
    );

    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(mocks.load).toHaveBeenCalledWith('30d');
    expect(screen.getByRole('button', { name: messages.page.range30d }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(messages.page.title);
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '#overview', '#models', '#costs', '#projects',
    ]);
    for (const section of ['overview', 'models', 'costs', 'projects'] as const) {
      expect(screen.getByRole('heading', { name: messages[section].title })).toBeDefined();
    }
  });
});
