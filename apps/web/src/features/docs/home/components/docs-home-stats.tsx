'use client';

import { useTranslations } from 'next-intl';
import type { DocsHomeStatsModel } from '@/features/docs/shared/types';

type DocsHomeStatsProps = {
  stats?: DocsHomeStatsModel;
};

export function DocsHomeStats({ stats }: DocsHomeStatsProps) {
  const t = useTranslations('docs.home.stats');

  if (!stats) {
    return null;
  }

  return (
    <div
      aria-label="Documentation overview stats"
      className="flex flex-wrap items-center gap-2 sm:gap-2.5"
    >
      <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-card)] px-3 py-1 text-[0.72rem] text-[var(--color-text-muted)] shadow-[var(--shadow-card-sm)]">
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: 'var(--badge-sky-dot)' }}
        />
        <span>{t('total')}</span>
        <span className="font-mono font-semibold tabular-nums text-[var(--color-text)]">
          {stats.totalArticles}
        </span>
      </div>

      <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-card)] px-3 py-1 text-[0.72rem] text-[var(--color-text-muted)] shadow-[var(--shadow-card-sm)]">
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: 'var(--badge-amber-dot)' }}
        />
        <span>{t('collections')}</span>
        <span className="font-mono font-semibold tabular-nums text-[var(--color-text)]">
          {stats.collections}
        </span>
      </div>

      <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-card)] px-3 py-1 text-[0.72rem] text-[var(--color-text-muted)] shadow-[var(--shadow-card-sm)]">
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: 'var(--badge-indigo-dot)' }}
        />
        <span>{t('standalone')}</span>
        <span className="font-mono font-semibold tabular-nums text-[var(--color-text)]">
          {stats.standalone}
        </span>
      </div>

      <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-card)] px-3 py-1 text-[0.72rem] text-[var(--color-text-muted)] shadow-[var(--shadow-card-sm)]">
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: 'var(--badge-emerald-dot)' }}
        />
        <span>{t('recent')}</span>
        <span className="font-mono font-semibold tabular-nums text-[var(--color-text)]">
          {stats.recentlyUpdated}
        </span>
      </div>
    </div>
  );
}
