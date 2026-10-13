import { useTranslations } from 'next-intl';
import type { ImportReceipt } from '../../domain';
import { formatDateTimeShort, formatCompactTokens } from '../formatters';
import { useState, type ReactNode } from 'react';

export function ImportHistory({ history, headingAction }: { history: ImportReceipt[]; headingAction?: ReactNode }) {
  const t = useTranslations('dashboard.imports');
  const [copyState, setCopyState] = useState<{ id: string; status: 'copied' | 'failed' }>();
  async function copyCommand(batch: ImportReceipt) {
    try {
      await navigator.clipboard.writeText(`corepack pnpm dashboard:imports rollback ${batch.id}`);
      setCopyState({ id: batch.id, status: 'copied' });
    } catch {
      setCopyState({ id: batch.id, status: 'failed' });
    }
  }
  return <section className="space-y-4">
    <div className="dashboard-import-history-heading flex items-center justify-between gap-2"><h3 className="text-[0.88rem] font-medium">{t('history')}</h3>{headingAction}</div>
    {!history.length ? <p className="dashboard-import-empty-history text-[0.78rem] text-[var(--color-text-muted)]">{t('emptyHistory')}</p> :
      <div className="space-y-3">{history.map(batch =>
        <article key={batch.id} className="dashboard-import-history-card space-y-2 p-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2"><strong>{batch.deviceLabel}</strong>
            <span className="text-[var(--color-nav-muted)]">{t(batch.status === 'active' ? 'active' : 'rolledBack')} · {formatDateTimeShort(batch.importedAt)}</span></div>
          <p>{t('batchSummary', { records: batch.added, tokens: formatCompactTokens(batch.addedTokens), duplicates: batch.duplicateLocal + batch.duplicateImported })}</p>
          <p className="break-all font-mono text-[var(--color-nav-muted)]">{batch.id}</p>
          {batch.status === 'active' ? <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[var(--color-nav-muted)]">{t('rollbackCommand')}</span>
              <button type="button" className="rounded-md px-2 py-1 text-[var(--badge-sky-fg)] hover:bg-[var(--color-row-bg)] focus-visible:outline-2"
                aria-label={t('copyCommand', { id: batch.id })} onClick={() => void copyCommand(batch)}>
                {t(copyState?.id === batch.id && copyState.status === 'copied' ? 'copied' : 'copy')}
              </button>
            </div>
            <code className="block select-all whitespace-pre-wrap break-all font-mono leading-5 text-[var(--color-text-muted)]">corepack pnpm dashboard:imports rollback {batch.id}</code>
            {copyState?.id === batch.id ? <span role="status" className="block text-[var(--color-nav-muted)]">{t(copyState.status === 'copied' ? 'copySuccess' : 'copyFailed')}</span> : null}
          </div> :
            <p className="text-[var(--color-nav-muted)]">{batch.rolledBackAt ? formatDateTimeShort(batch.rolledBackAt) : ''}</p>}
        </article>)}</div>}
  </section>;
}
