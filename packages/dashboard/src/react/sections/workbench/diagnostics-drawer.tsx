'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { TokenDashboardData } from '../../../domain';
import { useScrollReveal } from '../../charts/use-scroll-reveal';
import { formatCompactTokens, formatDateTimeShort } from '../../formatters';
import type { RemoteStatus } from '../../hooks/remote-refresh';
import type { BillingPreview } from '../../hooks/use-billing-preview';
import { isExcludedBillingModelName } from '../../reconcile-billing-models';
import { IconClose } from './workbench-icons';

type DiagnosticsDrawerProps = {
  open: boolean;
  onClose: () => void;
  data: TokenDashboardData;
  billingPreview?: BillingPreview;
  remoteInfo?: RemoteStatus | null;
  remoteDevice?: string;
  remoteState?: string;
};

type UnpricedDiagnosticItem = {
  key: string;
  model: string;
  reasonKey: 'diagnosticsReasonRateMissing' | 'diagnosticsReasonComponentMissing' | 'diagnosticsReasonOther';
  tokens: number;
  observations?: number;
};

const COMPACT_UNPRICED_LIMIT = 6;

export function DiagnosticsDrawer({
  open,
  onClose,
  data,
  billingPreview,
  remoteInfo,
  remoteDevice,
  remoteState,
}: DiagnosticsDrawerProps) {
  const t = useTranslations('dashboard');
  const handleScrollReveal = useScrollReveal();
  const [showAllUnpriced, setShowAllUnpriced] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const collectionIssues = data.collectionIssues ?? [];
  const isManagedReady = billingPreview?.status === 'ready';
  const pricingBasisKey = isManagedReady
    ? 'workbench.diagnosticsBasisManaged'
    : billingPreview?.status === 'loading'
      ? 'workbench.diagnosticsBasisFallbackLoading'
      : billingPreview?.status === 'unavailable'
        ? 'workbench.diagnosticsBasisFallbackUnavailable'
        : 'workbench.diagnosticsBasisUsage';

  const unpricedItems: UnpricedDiagnosticItem[] = (() => {
    if (isManagedReady) {
      const tokenLookup = new Map<string, number>();
      for (const modelRow of billingPreview.data.breakdown?.models ?? []) {
        for (const ch of modelRow.channels) {
          if (ch.unpricedTokens > 0) {
            const k = `${ch.channel}:${modelRow.model}`;
            tokenLookup.set(k, (tokenLookup.get(k) ?? 0) + ch.unpricedTokens);
          }
        }
      }
      return (billingPreview.data.breakdown?.unpriced ?? [])
        .filter((item) => Boolean(item.model))
        .map((item): UnpricedDiagnosticItem => ({
          key: `${item.channel}:${item.model}:${item.reason}`,
          model: item.model,
          reasonKey:
            item.reason === 'RATE_COMPONENT_MISSING'
              ? 'diagnosticsReasonComponentMissing'
              : item.reason === 'RATE_NOT_FOUND'
                ? 'diagnosticsReasonRateMissing'
                : 'diagnosticsReasonOther',
          tokens: tokenLookup.get(`${item.channel}:${item.model}`) ?? 0,
          observations: item.observations,
        }))
        .sort((a, b) => b.tokens - a.tokens || (b.observations ?? 0) - (a.observations ?? 0) || a.model.localeCompare(b.model));
    }

    const byModel = new Map<string, number>();
    for (const item of data.costs.unpricedModels) {
      if (!item.modelName || isExcludedBillingModelName(item.modelName)) continue;
      byModel.set(item.modelName, (byModel.get(item.modelName) ?? 0) + item.totalTokens);
    }
    return [...byModel.entries()]
      .map(([model, tokens]): UnpricedDiagnosticItem => ({
        key: model,
        model,
        reasonKey: 'diagnosticsReasonRateMissing',
        tokens,
      }))
      .sort((a, b) => b.tokens - a.tokens || a.model.localeCompare(b.model));
  })();

  const excludedTokens = isManagedReady
    ? billingPreview.data.excludedTokens
    : data.models
        .filter((model) => model.slotStatus !== 'configured' && isExcludedBillingModelName(model.modelName))
        .reduce((sum, model) => sum + model.totalTokens, 0);
  const visibleUnpriced = showAllUnpriced ? unpricedItems : unpricedItems.slice(0, COMPACT_UNPRICED_LIMIT);
  const issueCount = collectionIssues.length + unpricedItems.length;
  const selectedDevice = remoteInfo?.devices.find((d) => d.id === remoteDevice);
  const phaseLabel = (state?: string) =>
    t(state === 'offline' ? 'remote.unreachable' : 'remote.' + (state || 'idle'));

  return (
    <div
      className="dashboard-diagnostics-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-diagnostics-title"
        className="dashboard-diagnostics-sheet"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border-faint)] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <h2
              id="dashboard-diagnostics-title"
              className="text-[0.9rem] font-semibold text-[var(--color-text)]"
            >
              {t('workbench.diagnosticsTitle')}
            </h2>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[0.66rem] font-medium ${
                issueCount > 0
                  ? 'bg-[var(--badge-amber-bg)] text-[var(--badge-amber-fg)]'
                  : 'bg-[var(--surface-chip-bg,var(--color-row-bg))] text-[var(--color-text-muted)]'
              }`}
            >
              <span
                aria-hidden="true"
                className={`size-1.5 rounded-full ${
                  issueCount > 0 ? 'bg-[var(--badge-amber-dot)]' : 'bg-[var(--badge-emerald-dot)]'
                }`}
              />
              {issueCount > 0
                ? t('workbench.diagnosticsAttentionCount', { count: issueCount })
                : t('workbench.diagnosticsAllClear')}
            </span>
          </div>

          <button
            type="button"
            aria-label={t('workbench.diagnosticsClose')}
            onClick={onClose}
            className="inline-flex size-7 cursor-pointer items-center justify-center rounded-[7px] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-row-bg)] hover:text-[var(--color-text)]"
          >
            <IconClose className="size-3.5" />
          </button>
        </header>

        <div
          onScroll={handleScrollReveal}
          className="dashboard-subtle-scrollbar flex-1 space-y-4 overflow-y-auto px-4 py-3.5 text-[0.75rem]"
        >
          {/* 1. Collection Alerts */}
          <section className="space-y-1.5">
            <div className="flex items-center justify-between text-[0.7rem] font-medium text-[var(--color-text-soft)]">
              <span>{t('workbench.diagnosticsSectionAlerts')}</span>
              <span className="font-mono tabular-nums">{collectionIssues.length}</span>
            </div>
            {collectionIssues.length === 0 ? (
              <div className="flex items-center gap-2 rounded-[9px] border border-[var(--color-border-faint)] px-3 py-2 text-[0.72rem] text-[var(--color-text-muted)]">
                <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-[var(--badge-emerald-dot)]" />
                <span>{t('workbench.diagnosticsNoAlerts')}</span>
              </div>
            ) : (
              <ul className="space-y-1">
                {collectionIssues.map((issue, idx) => (
                  <li
                    key={`${issue}-${idx}`}
                    className="rounded-[9px] border border-[var(--badge-amber-border)] bg-[var(--badge-amber-bg)] px-2.5 py-1.5 font-mono text-[0.7rem] text-[var(--badge-amber-fg)]"
                  >
                    {issue}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 2. Unpriced Models */}
          <section className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-[0.7rem] font-medium text-[var(--color-text-soft)]">
              <span className="flex min-w-0 items-center gap-1.5">
                <span>{t('workbench.diagnosticsSectionUnpriced')}</span>
                <span className="truncate rounded-full border border-[var(--color-border-faint)] bg-[var(--surface-chip-bg,var(--color-row-bg))] px-1.5 py-0.5 text-[0.62rem] font-normal text-[var(--color-text-muted)]">
                  {t(pricingBasisKey)}
                </span>
              </span>
              <span className="shrink-0 font-mono tabular-nums">{unpricedItems.length}</span>
            </div>
            {unpricedItems.length === 0 ? (
              <div className="flex items-center gap-2 rounded-[9px] border border-[var(--color-border-faint)] px-3 py-2 text-[0.72rem] text-[var(--color-text-muted)]">
                <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-[var(--badge-emerald-dot)]" />
                <span>{t('workbench.diagnosticsAllPriced')}</span>
              </div>
            ) : (
              <div className="space-y-1.5">
                <ul className="divide-y divide-[var(--color-border-faint)] rounded-[10px] border border-[var(--color-border-faint)]">
                  {visibleUnpriced.map((item) => (
                    <li
                      key={item.key}
                      className="flex items-center justify-between gap-2 px-3 py-1.5 text-[0.72rem]"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate font-mono text-[0.68rem] text-[var(--color-text)]">
                          {item.model}
                        </span>
                        <span className="shrink-0 rounded-full bg-[var(--surface-chip-bg,var(--color-row-bg))] px-1.5 py-0.5 text-[0.6rem] text-[var(--color-text-muted)]">
                          {t(`workbench.${item.reasonKey}`)}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-[0.68rem] tabular-nums text-[var(--color-text-muted)]">
                        {item.tokens > 0
                          ? formatCompactTokens(item.tokens)
                          : item.observations !== undefined
                            ? `${item.observations}`
                            : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
                {unpricedItems.length > COMPACT_UNPRICED_LIMIT ? (
                  <button
                    type="button"
                    onClick={() => setShowAllUnpriced((prev) => !prev)}
                    className="cursor-pointer text-[0.68rem] font-medium text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
                  >
                    {showAllUnpriced
                      ? t('workbench.diagnosticsUnpricedCollapse', { count: COMPACT_UNPRICED_LIMIT })
                      : t('workbench.diagnosticsUnpricedShowAll', { count: unpricedItems.length })}
                  </button>
                ) : null}
              </div>
            )}
            {excludedTokens > 0 ? (
              <div className="px-1 font-mono text-[0.66rem] tabular-nums text-[var(--color-text-soft)]">
                {t('workbench.diagnosticsExcludedSummary', { tokens: formatCompactTokens(excludedTokens) })}
              </div>
            ) : null}
          </section>

          {/* 3. Source Online Status */}
          <section className="space-y-1.5">
            <div className="flex items-center justify-between text-[0.7rem] font-medium text-[var(--color-text-soft)]">
              <span>{t('workbench.diagnosticsSectionSources')}</span>
              <span className="font-mono tabular-nums">{data.sources.length}</span>
            </div>
            {data.sources.length === 0 ? (
              <div className="rounded-[9px] border border-[var(--color-border-faint)] px-3 py-2 text-[0.72rem] text-[var(--color-text-soft)]">
                {t('workbench.noData')}
              </div>
            ) : (
              <ul className="divide-y divide-[var(--color-border-faint)] rounded-[10px] border border-[var(--color-border-faint)]">
                {data.sources.map((src) => {
                  const isActive =
                    src.status === 'active' || src.totalTokens > 0 || src.sessionCount > 0;
                  return (
                    <li
                      key={src.sourceId}
                      className="flex items-center justify-between gap-2 px-3 py-1.5 text-[0.72rem]"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          aria-hidden="true"
                          className={`size-1.5 shrink-0 rounded-full ${
                            isActive ? 'bg-[var(--badge-emerald-dot)]' : 'bg-[var(--color-text-soft)] opacity-50'
                          }`}
                        />
                        <span className="truncate font-medium text-[var(--color-text)]">
                          {src.label || src.sourceId}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-[0.68rem] tabular-nums text-[var(--color-text-muted)]">
                        {isActive
                          ? `${src.sessionCount} · ${formatCompactTokens(src.totalTokens)}`
                          : t('workbench.diagnosticsSourceIdle')}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {remoteInfo ? (
            <div className="flex items-center justify-between gap-2 border-t border-[var(--color-border-faint)] pt-2.5 font-mono text-[0.68rem] tabular-nums text-[var(--color-text-muted)]">
              <span>
                {selectedDevice?.name || t('remote.device')} ·{' '}
                {t(selectedDevice?.online ? 'remote.online' : 'remote.offline')}
              </span>
              <span>
                {phaseLabel(remoteState || selectedDevice?.lastJob?.phase)}
                {selectedDevice?.lastCommittedAt
                  ? ` · ${formatDateTimeShort(selectedDevice.lastCommittedAt)}`
                  : ''}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
