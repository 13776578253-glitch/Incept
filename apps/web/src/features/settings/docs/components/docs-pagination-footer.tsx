'use client';

import { useTranslations } from 'next-intl';

type DocsPaginationFooterProps = {
  page: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (nextPage: number) => void;
};

export function DocsPaginationFooter({
  page,
  totalPages,
  pageSize,
  totalItems,
  onPageChange,
}: DocsPaginationFooterProps) {
  const t = useTranslations('docs.library.pagination');

  if (totalPages <= 1 || totalItems === 0) {
    return null;
  }

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(totalItems, page * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border-faint)] pt-3">
      <span className="text-[length:var(--text-2xs)] tabular-nums text-[var(--color-text-muted)]">
        {t('summary', { start, end, total: totalItems })}
      </span>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="cursor-pointer rounded-[7px] border border-[var(--color-border-faint)] bg-[var(--color-bg)] px-2.5 py-1 text-[length:var(--text-2xs)] font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-hover)] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-focus)]"
        >
          {t('prev')}
        </button>

        <span className="min-w-[44px] text-center font-mono text-[length:var(--text-2xs)] tabular-nums text-[var(--color-text-muted)]">
          {t('pageIndicator', { page, totalPages })}
        </span>

        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="cursor-pointer rounded-[7px] border border-[var(--color-border-faint)] bg-[var(--color-bg)] px-2.5 py-1 text-[length:var(--text-2xs)] font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-hover)] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-focus)]"
        >
          {t('next')}
        </button>
      </div>
    </div>
  );
}
