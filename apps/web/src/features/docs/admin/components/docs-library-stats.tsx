import { useTranslations } from 'next-intl';
import type { DocsLibraryStatsModel } from '../types';

type DocsLibraryStatsProps = {
  stats: DocsLibraryStatsModel;
};

type StatCardProps = {
  label: string;
  value: number;
  description: string;
  dotColor: string;
};

function StatCard({
  label,
  value,
  description,
  dotColor,
}: StatCardProps) {
  return (
    <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-5 shadow-[var(--shadow-card-sm)]">
      <p className="inline-flex items-center gap-1.5 text-[0.72rem] font-medium uppercase tracking-[0.16em] text-[var(--color-text-soft)]">
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
        <span>{label}</span>
      </p>
      <p className="mt-3 text-[2rem] font-semibold leading-none text-[var(--color-text)] tabular-nums">
        {value}
      </p>
      <p className="mt-3 text-[0.88rem] leading-6 text-[var(--color-text-muted)]">
        {description}
      </p>
    </article>
  );
}

export function DocsLibraryStats({
  stats,
}: DocsLibraryStatsProps) {
  const t = useTranslations('docs.library.stats');

  return (
    <section className="grid gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--surface-recessed-bg)] p-3 md:grid-cols-2 xl:grid-cols-5">
      <StatCard
        label={t('total.label')}
        value={stats.totalArticles}
        description={t('total.description')}
        dotColor="var(--badge-indigo-dot)"
      />
      <StatCard
        label={t('standalone.label')}
        value={stats.standaloneArticleCount}
        description={t('standalone.description')}
        dotColor="var(--badge-sky-dot)"
      />
      <StatCard
        label={t('collectionArticles.label')}
        value={stats.collectionArticleCount}
        description={t('collectionArticles.description')}
        dotColor="var(--badge-emerald-dot)"
      />
      <StatCard
        label={t('collections.label')}
        value={stats.collectionCount}
        description={t('collections.description')}
        dotColor="var(--badge-amber-dot)"
      />
      <StatCard
        label={t('recentlyUpdated.label')}
        value={stats.recentlyUpdatedCount}
        description={t('recentlyUpdated.description')}
        dotColor="var(--badge-rose-dot)"
      />
    </section>
  );
}
