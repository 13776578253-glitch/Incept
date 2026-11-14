import { useFormatter, useTranslations } from 'next-intl';
import type { BillingPreview } from '../hooks/use-billing-preview';
import { formatDateTimeShort, formatUsd } from '../formatters';

export function ReferenceCostMetric({ preview, showBreakdown = false }: { preview: BillingPreview; showBreakdown?: boolean }) {
  const t = useTranslations('dashboard.costs.reference');
  const format = useFormatter();
  const data = preview.status === 'ready' ? preview.data : undefined;
  const eligible = data ? data.estimatedTokens + data.unpricedTokens : 0;
  const coverage = data && eligible > 0
    ? format.number(data.estimatedTokens / eligible, { style: 'percent', maximumFractionDigits: 2 })
    : t('notApplicable');
  const amount = data && data.estimatedTokens > 0 ? `${formatUsd(Number(data.estimatedCostUsd))} USD` : '—';

  return (
    <div role="status" aria-busy={preview.status === 'loading'}
      className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-4">
      <span className="text-[0.76rem] font-medium text-[var(--color-text-muted)]">{t('label')}</span>
      <div className="mt-2 text-[1.75rem] font-semibold tracking-[-0.04em] tabular-nums text-[var(--color-text)]">{amount}</div>
      <p className="mt-1.5 min-h-5 text-[0.7rem] text-[var(--color-nav-muted)]">
        {data ? t('coverage', { coverage }) : t(preview.status === 'loading' ? 'loading' : 'unavailable')}
      </p>
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
