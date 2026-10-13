'use client';

import { useTranslations } from 'next-intl';
import type { TokenDashboardData } from '../../../domain/index';
import { formatKnownCost, formatCompactTokens, formatUsd, formatPercent } from '../../formatters';
import { CredibilityPill } from '../../components/credibility-pill';
import { MODEL_COLORS } from '../../model-colors';

type SourcesPanelProps = {
  data: TokenDashboardData;
};

export function SourcesPanel({
  data,
}: SourcesPanelProps) {
  const t = useTranslations('dashboard');

  return (
    <div className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-card)]">
      <div className="border-b border-[var(--color-border)] px-5 py-3.5">
        <h3 className="text-[0.95rem] font-semibold text-[var(--color-text)]">
          {t('models.sources.title')}
        </h3>
        <p className="text-[0.73rem] text-[var(--color-nav-muted)]">
          {t('models.sources.subtitle')}
        </p>
      </div>

      <div className="divide-y divide-[var(--color-border)] px-5">
        {data.collectionIssues?.length ? (
          <p role="status" className="py-2 text-[0.73rem] text-[var(--badge-amber-fg)]">
            {t('models.sources.readIssues', { count: data.collectionIssues.length })}
          </p>
        ) : null}
        {data.sources.map((src, idx) => {
          const isActive = src.status === 'active';
          const maxSourceTokens = Math.max(
            1,
            ...data.sources.map((s) => s.totalTokens),
          );
          const relWidth = Math.max(
            3,
            Math.round((src.totalTokens / maxSourceTokens) * 100),
          );
          return (
            <div
              key={src.sourceId}
              className={`py-3 ${isActive ? '' : 'opacity-75'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="size-2 rounded-full"
                    style={{
                      backgroundColor: MODEL_COLORS[idx % MODEL_COLORS.length],
                    }}
                  />
                  <span className="text-[0.82rem] font-semibold text-[var(--color-text)]">
                    {src.label}
                  </span>
                  <CredibilityPill
                    label={
                      isActive
                        ? t('models.sources.statusActive')
                        : t('models.sources.statusPending')
                    }
                    tone={isActive ? 'emerald' : 'indigo'}
                  />
                  {src.collectionMode ? <span className="text-[0.66rem] text-[var(--color-nav-muted)]">
                    {t('models.sources.mode.' + src.collectionMode)}
                  </span> : null}
                </div>

                <div className="flex items-center gap-3 font-mono text-[0.78rem] tabular-nums">
                  <span className="font-semibold text-[var(--color-text)]">
                    {isActive ? formatCompactTokens(src.totalTokens) : '—'}
                  </span>
                  <span className="w-12 text-right text-[var(--color-text-muted)]">
                    {isActive ? formatPercent(src.shareOfTokens, 1) : '—'}
                  </span>
                </div>
              </div>

              {isActive ? (
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-row-bg)]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${relWidth}%`,
                      backgroundColor: MODEL_COLORS[idx % MODEL_COLORS.length],
                    }}
                  />
                </div>
              ) : (
                <div className="mt-1.5 h-1.5 w-full rounded-full border border-dashed border-[var(--color-border)] bg-transparent" />
              )}

              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[0.69rem] text-[var(--color-nav-muted)]">
                <span>{t(`models.sources.${src.descriptionKey}`)}</span>
                <span className="shrink-0 font-mono tabular-nums">
                  {isActive
                    ? `${t('models.sources.sessionsModels', {
                      sessions: src.sessionCount,
                      models: src.modelsUsed.length,
                    })} · ${formatKnownCost(src.cost, src.missingPricing)}`
                    : '—'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
