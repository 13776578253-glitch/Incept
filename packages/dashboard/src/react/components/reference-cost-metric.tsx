import { useFormatter, useTranslations } from 'next-intl';
import type { BillingPreview } from '../hooks/use-billing-preview';
import { formatDateTimeShort, formatReferenceUsd, referenceCoverageRatio } from '../formatters';
import { CredibilityPill } from './credibility-pill';

export function ReferenceCostMetric({ preview, showBreakdown = false }: { preview: BillingPreview; showBreakdown?: boolean }) {
  const t = useTranslations('dashboard.costs.reference');
  const format = useFormatter();
  const data = preview.status === 'ready' ? preview.data : undefined;
  const ratio = data ? referenceCoverageRatio(data.estimatedTokens, data.unpricedTokens) : null;
  const coverage = ratio === null
    ? t('notApplicable')
    : format.number(ratio, { style: 'percent', maximumFractionDigits: 2 });
  const amount = data ? formatReferenceUsd(data.estimatedCostUsd, data.estimatedTokens, true) : '—';
  const catchingUp = data?.liveRevision !== undefined && data.revision < data.liveRevision;

  return (
    <div aria-busy={preview.status === 'loading'}
      className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.76rem] font-medium text-[var(--color-text-muted)]">{t('label')}</span>
        <CredibilityPill label={t('reviewedBadge')} tone="emerald" />
      </div>
      <div className="mt-2 text-[1.75rem] font-semibold tracking-[-0.04em] tabular-nums text-[var(--color-text)]">{amount}</div>
      <p className="mt-1.5 truncate font-mono text-[0.7rem] tabular-nums text-[var(--color-nav-muted)]">
        {data ? t('coverage', { coverage }) : t(preview.status === 'loading' ? 'loading' : 'unavailable')}
      </p>
      {catchingUp && data && (
        <p className="mt-1 text-[0.7rem] font-medium leading-4 text-[var(--badge-amber-fg)]">
          {t('catchingUp', { revision: String(data.revision), liveRevision: String(data.liveRevision) })}
        </p>
      )}
      {showBreakdown && (
        <dl className="mt-4 grid min-h-28 gap-3 text-sm text-[var(--color-text-muted)] sm:min-h-14 sm:grid-cols-4">
          {data && (
            <>
              <div><dt>{t('estimatedTokens')}</dt><dd className="tabular-nums">{format.number(data.estimatedTokens)}</dd></div>
              <div><dt>{t('unpricedTokens')}</dt><dd className="tabular-nums">{format.number(data.unpricedTokens)}</dd></div>
              <div><dt>{t('excludedTokens')}</dt><dd className="tabular-nums">{format.number(data.excludedTokens)}</dd></div>
              <div><dt>{t('asOf')}</dt><dd className="tabular-nums">{formatDateTimeShort(data.asOf)}</dd></div>
            </>
          )}
        </dl>
      )}
    </div>
  );
}
