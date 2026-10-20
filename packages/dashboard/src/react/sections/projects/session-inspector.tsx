'use client';

import { useTranslations } from 'next-intl';
import { formatKnownCost, formatCompactTokens, formatUsd, formatDateTimeShort, formatDuration } from '../../formatters';
import { CredibilityPill } from '../../components/credibility-pill';
import type { ProjectsState } from './use-projects-state';

type SessionInspectorProps = Pick<ProjectsState, 'inspectedSession'>;

export function SessionInspector({
  inspectedSession,
}: SessionInspectorProps) {
  const t = useTranslations('dashboard');

  return (
    <div className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-card)]">
      <div className="border-b border-[var(--color-border)] px-5 py-3.5">
        <h3 className="text-[0.95rem] font-semibold text-[var(--color-text)]">
          {t('projects.sessions.inspector.title')}
        </h3>
        {inspectedSession ? (
          <p className="mt-0.5 truncate font-mono text-[0.72rem] text-[var(--color-nav-muted)]">
            {inspectedSession.sessionId}
          </p>
        ) : null}
      </div>

      {inspectedSession ? (
        <div className="divide-y divide-[var(--color-border)] px-5">
          {/* Summary Title, Source & Project */}
          <div className="space-y-2 py-3.5 text-[0.76rem]">
            {inspectedSession.deviceLabel ? <div className="break-all text-xs text-[var(--color-nav-muted)]">
              {t('imports.device', { name: inspectedSession.deviceLabel })}<br />{t('imports.batch')} {inspectedSession.importBatchId}
            </div> : null}
            <div className="font-medium text-[var(--color-text)]">
              {inspectedSession.title ??
                t('projects.sessions.untitledSession', {
                  source: inspectedSession.source,
                  id: inspectedSession.sessionId.slice(0, 8),
                })}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[0.72rem] text-[var(--color-text-muted)]">
              <span>{t('projects.sessions.inspector.source')}</span>
              <span className="rounded border border-[var(--color-border)] bg-[var(--color-row-bg)] px-1.5 py-0.5 font-mono text-[0.68rem] font-medium text-[var(--color-text)]">
                {inspectedSession.source}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[0.72rem] text-[var(--color-text-muted)]">
              <span>{t('projects.sessions.inspector.project')}</span>
              <span className="font-mono font-medium text-[var(--color-text)]">
                {inspectedSession.projectName}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[0.72rem] text-[var(--color-text-muted)]">
              <span>{t('projects.sessions.inspector.timeWindow')}</span>
              <span className="font-mono tabular-nums text-[var(--color-text)]">
                {inspectedSession.timestampPrecision === 'day' ? formatDateTimeShort(inspectedSession.firstActivity).slice(0, 10) : formatDateTimeShort(inspectedSession.firstActivity)} →{' '}
                {inspectedSession.timestampPrecision === 'day' ? formatDateTimeShort(inspectedSession.lastActivity).slice(0, 10) : formatDateTimeShort(inspectedSession.lastActivity)} (
                {inspectedSession.timestampPrecision === 'day' ? t('projects.sessions.dailySummary') : formatDuration(inspectedSession.durationMinutes)})
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[0.72rem] text-[var(--color-text-muted)]">
              <span>{t('projects.sessions.inspector.coverageStatus')}</span>
              {inspectedSession.modelBreakdowns.some((m) => m.missingPricing) ? (
                <CredibilityPill
                  label={t('projects.sessions.inspector.coveragePartial')}
                  tone="indigo"
                />
              ) : (
                <CredibilityPill
                  label={t('projects.sessions.inspector.coverageFull')}
                  tone="emerald"
                />
              )}
            </div>
          </div>

          {/* Session Token Split */}
          {inspectedSession.historyIncomplete ? <p className="py-3 text-[0.72rem] text-[var(--color-text-muted)]">
            {t('projects.sessions.inspector.incompleteHistory')}
          </p> : null}
          <div className="space-y-2 py-3.5">
            <div className="flex items-center justify-between text-[0.74rem]">
              <span className="font-semibold text-[var(--color-text)]">
                {t('projects.sessions.inspector.tokenBreakdown')}
              </span>
              <span className="font-mono font-semibold tabular-nums text-[var(--color-text)]">
                {formatCompactTokens(inspectedSession.totalTokens)} ·{' '}
                {formatKnownCost(inspectedSession.cost, inspectedSession.missingPricing)}
              </span>
            </div>

            {[
              {
                label: 'Cache Read',
                val: inspectedSession.cacheReadTokens,
                color: 'var(--badge-sky-dot)',
              },
              {
                label: 'Standard Input',
                val: inspectedSession.inputTokens,
                color: 'var(--badge-indigo-dot)',
              },
              {
                label: 'Model Output',
                val: inspectedSession.outputTokens,
                color: 'var(--badge-emerald-dot)',
              },
              {
                label: 'Reasoning',
                val: inspectedSession.reasoningTokens,
                color: 'var(--badge-amber-dot)',
              },
              { label: 'Cache Write', val: inspectedSession.cacheCreationTokens, color: 'var(--badge-rose-dot)' },
            ].map((row) => {
              const pct =
                inspectedSession.totalTokens > 0
                  ? (row.val / inspectedSession.totalTokens) * 100
                  : 0;
              return (
                <div key={row.label} className="space-y-1">
                  <div className="flex items-center justify-between font-mono text-[0.7rem] tabular-nums">
                    <span className="text-[var(--color-text-muted)]">{row.label}</span>
                    <span className="text-[var(--color-text)]">
                      {formatCompactTokens(row.val)} ({pct.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-row-bg)]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(pct, row.val > 0 ? 2 : 0)}%`,
                        backgroundColor: row.color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Per-Model Breakdown inside the Session */}
          <div className="space-y-2 py-3.5">
            <div className="text-[0.74rem] font-semibold text-[var(--color-text)]">
              {t('projects.sessions.inspector.modelBreakdown')}
            </div>
            <div className="divide-y divide-[var(--color-border)]">
              {inspectedSession.modelBreakdowns.map((mb) => {
                const mbTotal =
                  mb.inputTokens + mb.outputTokens + mb.cacheReadTokens + mb.cacheCreationTokens + (mb.reasoningTokens ?? 0);
                return (
                  <div key={mb.modelName} className="py-2 font-mono text-[0.72rem]">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-[var(--color-text)]">
                        {mb.modelName}
                      </span>
                      <span className="font-semibold tabular-nums text-[var(--color-text)]">
                        {mb.missingPricing ? '—' : formatUsd(mb.cost)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between text-[0.68rem] tabular-nums text-[var(--color-nav-muted)]">
                      <span>
                        In {formatCompactTokens(mb.inputTokens)} · Cache{' '}
                        {formatCompactTokens(mb.cacheReadTokens)} · Out{' '}
                        {formatCompactTokens(mb.outputTokens)}
                      </span>
                      <span>{formatCompactTokens(mbTotal)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
