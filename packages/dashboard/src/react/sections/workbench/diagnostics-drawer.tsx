'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import type { TokenDashboardData } from '../../../domain';
import { formatDateTimeShort } from '../../formatters';
import type { RemoteStatus } from '../../hooks/remote-refresh';
import type { BillingPreview } from '../../hooks/use-billing-preview';
import { CostsSection } from '../costs/costs-section';
import { SourcesPanel } from '../models/sources-panel';
import { ProjectsSection } from '../projects/projects-section';
import { IconClose } from './workbench-icons';

export type DiagnosticsTab = 'billing' | 'sources' | 'projects';

type DiagnosticsDrawerProps = {
  open: boolean;
  onClose: () => void;
  activeTab: DiagnosticsTab;
  onTabChange: (tab: DiagnosticsTab) => void;
  data: TokenDashboardData;
  billingPreview?: BillingPreview;
  canViewDetails: boolean;
  remoteInfo?: RemoteStatus | null;
  remoteDevice?: string;
  remoteState?: string;
};

export function DiagnosticsDrawer({
  open,
  onClose,
  activeTab,
  onTabChange,
  data,
  billingPreview,
  canViewDetails,
  remoteInfo,
  remoteDevice,
  remoteState,
}: DiagnosticsDrawerProps) {
  const t = useTranslations('dashboard');

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

  const selectedDevice = remoteInfo?.devices.find((d) => d.id === remoteDevice);
  const job = selectedDevice?.lastJob;
  const phaseLabel = (state?: string) =>
    t(state === 'offline' ? 'remote.unreachable' : 'remote.' + (state || 'idle'));

  return (
    <div
      className="dashboard-drawer-backdrop"
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
        className="dashboard-drawer-panel"
      >
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] px-5 py-4">
          <h2
            id="dashboard-diagnostics-title"
            className="text-[1rem] font-semibold text-[var(--color-text)]"
          >
            {t('workbench.diagnosticsTitle')}
          </h2>
          <button
            type="button"
            aria-label={t('workbench.diagnosticsClose')}
            onClick={onClose}
            className="inline-flex size-8 cursor-pointer items-center justify-center rounded-[8px] border border-[var(--color-border)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-row-bg)] hover:text-[var(--color-text)]"
          >
            <IconClose className="size-4" />
          </button>
        </header>

        <div className="border-b border-[var(--color-border-faint)] px-5 py-2.5">
          <div className="dashboard-wb-tabs" role="tablist">
            {(
              [
                ['billing', t('workbench.diagnosticsTabBilling')],
                ['sources', t('workbench.diagnosticsTabSources')],
                ['projects', t('workbench.diagnosticsTabProjects')],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={activeTab === id}
                data-active={activeTab === id}
                onClick={() => onTabChange(id)}
                className="dashboard-wb-tab"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {activeTab === 'billing' ? (
            <CostsSection data={data} billingPreview={billingPreview} />
          ) : null}

          {activeTab === 'sources' ? (
            <div className="space-y-4">
              {remoteInfo ? (
                <div className="rounded-[12px] border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-3.5 text-[0.74rem]">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border-faint)] pb-2">
                    <span className="font-medium text-[var(--color-text)]">
                      {t('workbench.remoteSyncTitle')}
                    </span>
                    <span className="font-mono text-[var(--color-text-muted)]">
                      {t(selectedDevice?.online ? 'remote.online' : 'remote.offline')} ·{' '}
                      {phaseLabel(remoteState || job?.phase)}
                    </span>
                  </div>
                  <div className="mt-2.5 grid grid-cols-1 gap-2 font-mono tabular-nums text-[var(--color-text-muted)] sm:grid-cols-3">
                    <div>
                      <span className="text-[var(--color-text-soft)]">{t('remote.collected')} </span>
                      <span className="text-[var(--color-text)]">
                        {selectedDevice?.lastCollectedAt
                          ? formatDateTimeShort(selectedDevice.lastCollectedAt)
                          : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--color-text-soft)]">{t('remote.cloudCommitted')} </span>
                      <span className="text-[var(--color-text)]">
                        {selectedDevice?.lastCommittedAt
                          ? formatDateTimeShort(selectedDevice.lastCommittedAt)
                          : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--color-text-soft)]">{t('remote.thisRefresh')} </span>
                      <span className="text-[var(--color-text)]">
                        {job?.dataRevision !== null && job?.dataRevision !== undefined
                          ? `rev ${job.dataRevision}`
                          : '—'}
                        {(job?.reviewTotal ?? 0) > 0 ? ` · ${t('remote.historyReviews')} ${job?.reviewTotal}` : ''}
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}

              {data.collectionIssues && data.collectionIssues.length > 0 ? (
                <div className="rounded-[12px] border border-[var(--badge-amber-border)] bg-[var(--badge-amber-bg)] p-3 text-[0.76rem] text-[var(--badge-amber-fg)]">
                  {t('models.sources.readIssues', { count: data.collectionIssues.length })}
                </div>
              ) : null}
              <SourcesPanel data={data} />
            </div>
          ) : null}

          {activeTab === 'projects' ? (
            <ProjectsSection data={data} canViewDetails={canViewDetails} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
