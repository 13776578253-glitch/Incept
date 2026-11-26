// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import { emptyDashboard } from '../domain';
import zh from '../messages/zh.json';
import { DiagnosticsDrawer } from '../react/sections/workbench/diagnostics-drawer';
import type { BillingPreview } from '../react/hooks/use-billing-preview';

afterEach(() => {
  cleanup();
});

function renderDrawer(
  unpricedModels: Array<{ modelName: string; source: string; totalTokens: number }> = [],
  billingPreview?: BillingPreview,
) {
  const base = emptyDashboard();
  base.costs.unpricedModels = unpricedModels.map((item) => ({
    modelName: item.modelName,
    source: item.source,
    inputTokens: item.totalTokens,
    outputTokens: 0,
    cacheReadTokens: 0,
    totalTokens: item.totalTokens,
    sessionCount: 1,
  }));
  return render(
    <NextIntlClientProvider locale="zh" messages={{ dashboard: zh }}>
      <DiagnosticsDrawer open onClose={() => {}} data={base} billingPreview={billingPreview} />
    </NextIntlClientProvider>,
  );
}

describe('DiagnosticsDrawer', () => {
  it('shows Usage estimate basis, sorts unpriced models by tokens descending, and toggles compact limit', () => {
    renderDrawer([
      { modelName: 'model-small', source: 'codex', totalTokens: 1_000_000 },
      { modelName: 'model-huge', source: 'antigravity', totalTokens: 2_500_000_000 },
      { modelName: 'model-mid', source: 'deepseekHarness', totalTokens: 500_000_000 },
      { modelName: 'model-4', source: 'codex', totalTokens: 40_000_000 },
      { modelName: 'model-5', source: 'codex', totalTokens: 30_000_000 },
      { modelName: 'model-6', source: 'codex', totalTokens: 20_000_000 },
      { modelName: 'model-7', source: 'codex', totalTokens: 500_000 },
    ]);

    expect(screen.getByText(zh.workbench.diagnosticsBasisUsage)).toBeDefined();
    const items = screen.getAllByRole('listitem');
    expect(items[0].textContent).toContain('model-huge');
    expect(items[1].textContent).toContain('model-mid');
    expect(screen.queryByText('model-7')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '展开全部 7 项' }));
    expect(screen.getByText('model-7')).toBeDefined();
  });

  it('shows Managed Billing basis, distinguishes missing rate vs missing tier, and surfaces excluded tokens', () => {
    const preview: BillingPreview = {
      status: 'ready',
      data: {
        run: 'test-run',
        revision: 4487,
        catalog: 'cat',
        asOf: '2026-11-26T00:00:00.000Z',
        range: 'all',
        members: 100,
        tokens: 1_000_000_000,
        estimatedCostUsd: '100.00',
        estimatedTokens: 600_000_000,
        excludedTokens: 300_000_000,
        recordedUnknownCurrency: 0,
        unpricedTokens: 100_000_000,
        breakdown: {
          days: [],
          models: [
            {
              model: 'claude-opus-5-5',
              estimatedCostUsd: '0',
              estimatedTokens: 0,
              unpricedTokens: 12_678_053,
              excludedTokens: 0,
              channels: [
                { channel: 'claudeCode', estimatedCostUsd: '0', estimatedTokens: 0, unpricedTokens: 12_678_053, excludedTokens: 0 },
              ],
            },
            {
              model: 'gemini-flash-worker-agy',
              estimatedCostUsd: '0',
              estimatedTokens: 0,
              unpricedTokens: 127_185_164,
              excludedTokens: 0,
              channels: [
                { channel: 'antigravity', estimatedCostUsd: '0', estimatedTokens: 0, unpricedTokens: 127_185_164, excludedTokens: 0 },
              ],
            },
          ],
          unpriced: [
            { channel: 'claudeCode', model: 'claude-opus-5-5', reason: 'RATE_COMPONENT_MISSING', observations: 67 },
            { channel: 'antigravity', model: 'gemini-flash-worker-agy', reason: 'RATE_NOT_FOUND', observations: 481 },
          ],
        },
      },
    };

    renderDrawer([], preview);
    expect(screen.getByText(zh.workbench.diagnosticsBasisManaged)).toBeDefined();
    const items = screen.getAllByRole('listitem');
    expect(items[0].textContent).toContain('gemini-flash-worker-agy');
    expect(items[0].textContent).toContain(zh.workbench.diagnosticsReasonRateMissing);
    expect(items[1].textContent).toContain('claude-opus-5-5');
    expect(items[1].textContent).toContain(zh.workbench.diagnosticsReasonComponentMissing);
    expect(screen.getByText(/政策排除/)).toBeDefined();
  });

  it('shows fallback basis label when Managed Billing is unavailable', () => {
    renderDrawer([], { status: 'unavailable' });
    expect(screen.getByText(zh.workbench.diagnosticsBasisFallbackUnavailable)).toBeDefined();
  });
});
