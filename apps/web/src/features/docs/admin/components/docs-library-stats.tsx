import { useTranslations } from 'next-intl';
import type { DocsLibraryStatsModel } from '../types';

type DocsLibraryStatsProps = {
  stats: DocsLibraryStatsModel;
};

type StatCardProps = {
  label: string;
  value: number;
  description: string;
};

function StatCard({
  label,
  value,
  description,
}: StatCardProps) {
  return (
    <article className="rounded-[1rem] border border-[color:color-mix(in_srgb,var(--color-border)_60%,transparent)] bg-[color:color-mix(in_srgb,var(--color-surface)_96%,transparent)] p-5">
      <p className="text-[0.74rem] uppercase tracking-[0.18em] text-[var(--color-text-soft)]">
        {label}
      </p>
      <p className="mt-3 text-[2rem] font-semibold leading-none text-[var(--color-text)]">
        {value}
      </p>
      <p className="mt-3 text-[0.92rem] leading-7 text-[var(--color-text-muted)]">
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
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <StatCard
        label={t('total.label')}
        value={stats.totalArticles}
        description={t('total.description')}
      />
      <StatCard
        label={t('standalone.label')}
        value={stats.standaloneArticleCount}
        description={t('standalone.description')}
      />
      <StatCard
        label={t('collectionArticles.label')}
        value={stats.collectionArticleCount}
        description={t('collectionArticles.description')}
      />
      <StatCard
        label={t('collections.label')}
        value={stats.collectionCount}
        description={t('collections.description')}
      />
      <StatCard
        label={t('recentlyUpdated.label')}
        value={stats.recentlyUpdatedCount}
        description={t('recentlyUpdated.description')}
      />
    </section>
  );
}
