'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import type { TokenDashboardData } from '../../../domain';
import { useScrollReveal } from '../../charts/use-scroll-reveal';
import { formatCompactTokens, formatDateTimeShort } from '../../formatters';
import type { RemoteStatus } from '../../hooks/remote-refresh';
import type { BillingPreview } from '../../hooks/use-billing-preview';
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
  const unpricedModels: string[] =
    billingPreview?.status === 'ready'
      ? Array.from(
          new Set(
            (billingPreview.data.breakdown?.unpriced ?? [])
              .map((item) => item.model)
              .filter(Boolean),
          ),
        )
      : Array.from(
          new Set(
            data.costs.unpricedModels
              .map((item) => item.modelName)
              .filter(Boolean),
          ),
        );

  const issueCount = collectionIssues.length + unpricedModels.length;
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
            <div className="flex items-center justify-between text-[0.7rem] font-medium text-[var(--color-text-soft)]">
              <span>{t('workbench.diagnosticsSectionUnpriced')}</span>
              <span className="font-mono tabular-nums">{unpricedModels.length}</span>
            </div>
            {unpricedModels.length === 0 ? (
              <div className="flex items-center gap-2 rounded-[9px] border border-[var(--color-border-faint)] px-3 py-2 text-[0.72rem] text-[var(--color-text-muted)]">
                <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-[var(--badge-emerald-dot)]" />
                <span>{t('workbench.diagnosticsAllPriced')}</span>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {unpricedModels.map((modelName) => (
                  <span
                    key={modelName}
                    className="rounded-full border border-[var(--color-border-subtle)] bg-[var(--surface-chip-bg,var(--color-row-bg))] px-2 py-0.5 font-mono text-[0.68rem] text-[var(--color-text)]"
                  >
                    {modelName}
                  </span>
                ))}
              </div>
            )}
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
