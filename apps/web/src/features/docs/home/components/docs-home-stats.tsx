'use client';

import { useTranslations } from 'next-intl';
import type { DocsHomeStatsModel } from '@/features/docs/shared/types';

type DocsHomeStatsProps = {
  stats?: DocsHomeStatsModel;
};

type StatCardProps = {
  label: string;
  value: number;
  description: string;
  tag: string;
  badgeTone: 'sky' | 'amber' | 'indigo' | 'emerald';
};

const BADGE_STYLES = {
  sky: {
    bg: 'var(--badge-sky-bg)',
    border: 'var(--badge-sky-border)',
    fg: 'var(--badge-sky-fg)',
    dot: 'var(--badge-sky-dot)',
  },
  amber: {
    bg: 'var(--badge-amber-bg)',
    border: 'var(--badge-amber-border)',
    fg: 'var(--badge-amber-fg)',
    dot: 'var(--badge-amber-dot)',
  },
  indigo: {
    bg: 'var(--badge-indigo-bg)',
    border: 'var(--badge-indigo-border)',
    fg: 'var(--badge-indigo-fg)',
    dot: 'var(--badge-indigo-dot)',
  },
  emerald: {
    bg: 'var(--badge-emerald-bg)',
    border: 'var(--badge-emerald-border)',
    fg: 'var(--badge-emerald-fg)',
    dot: 'var(--badge-emerald-dot)',
  },
};

function StatCard({
  label,
  value,
  description,
  tag,
  badgeTone,
}: StatCardProps) {
  const badge = BADGE_STYLES[badgeTone];

  return (
    <article className="group min-w-0 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-card)] p-4 shadow-[var(--shadow-card-sm)] transition-all hover:border-[var(--color-text-soft)] hover:shadow-[var(--shadow-card-hover)]">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[0.72rem] font-medium uppercase tracking-[0.08em] text-[var(--color-text-soft)]">
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: badge.dot }}
          />
          <span className="truncate">{label}</span>
        </span>
        <span
          className="inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 font-mono text-[0.64rem] font-medium leading-none"
          style={{
            backgroundColor: badge.bg,
            borderColor: badge.border,
            color: badge.fg,
          }}
        >
          {tag}
        </span>
      </div>
      <p className="mt-2 text-[1.75rem] font-semibold tracking-[-0.04em] tabular-nums font-mono text-[var(--color-text)]">
        {value}
      </p>
      <p className="mt-1 text-[0.72rem] leading-relaxed text-[var(--color-nav-muted)] line-clamp-1">
        {description}
      </p>
    </article>
  );
}

export function DocsHomeStats({ stats }: DocsHomeStatsProps) {
  const t = useTranslations('docs.home.stats');

  if (!stats) {
    return null;
  }

  return (
    <section aria-label="Documentation statistics" className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label={t('total')}
        value={stats.totalArticles}
        description={t('totalDesc')}
        tag="ALL"
        badgeTone="sky"
      />
      <StatCard
        label={t('collections')}
        value={stats.collections}
        description={t('collectionsDesc')}
        tag="SERIES"
        badgeTone="amber"
      />
      <StatCard
        label={t('standalone')}
        value={stats.standalone}
        description={t('standaloneDesc')}
        tag="GUIDE"
        badgeTone="indigo"
      />
      <StatCard
        label={t('recent')}
        value={stats.recentlyUpdated}
        description={t('recentDesc')}
        tag="30D"
        badgeTone="emerald"
      />
    </section>
  );
}
