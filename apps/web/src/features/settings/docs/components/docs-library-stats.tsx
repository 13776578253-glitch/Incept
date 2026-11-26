import { ProgressMeter } from '@incept/ui';
import { useLocale, useTranslations } from 'next-intl';
import type { DocsLibraryStatsModel } from '../types';

type DocsLibraryStatsProps = {
  stats: DocsLibraryStatsModel;
};

type StatItemProps = {
  label: string;
  value: number;
  description: string;
};

function StatItem({
  label,
  value,
  description,
}: StatItemProps) {
  return (
    <article className="min-w-0 sm:px-3.5 sm:first:pl-0 sm:last:pr-0">
      <p className="truncate text-[length:var(--text-2xs)] font-medium text-[var(--color-text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-[length:var(--text-xl)] font-semibold leading-none tracking-tight text-[var(--color-text)] tabular-nums">
        {value}
      </p>
      <p title={description} className="mt-1 line-clamp-2 text-[length:var(--text-2xs)] leading-4 text-[var(--color-text-soft)]">
        {description}
      </p>
    </article>
  );
}

export function DocsLibraryStats({
  stats,
}: DocsLibraryStatsProps) {
  const t = useTranslations('docs.library.stats');
  const locale = useLocale();
  const isZh = locale === 'zh';
  const total = Math.max(stats.totalArticles, 0);
  const meterMax = Math.max(total, 1);
  const toPercent = (count: number) => (total > 0 ? Math.round((count / total) * 100) : 0);

  return (
    <section id="docs-overview" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[length:var(--text-sm)] font-medium text-[var(--color-text)]">
          {isZh ? '全库概览' : 'Overview'}
        </h3>
        <span className="text-[length:var(--text-xs)] text-[var(--color-text-soft)]">
          {isZh ? '文档与合集分布统计' : 'Published content & collection distribution'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-y-4 border-y border-[var(--color-border-faint)] py-3.5 sm:grid-cols-5 sm:gap-y-0 sm:divide-x sm:divide-[var(--color-border-faint)]">
        <StatItem
          label={t('total.label')}
          value={stats.totalArticles}
          description={t('total.description')}
        />
        <StatItem
          label={t('standalone.label')}
          value={stats.standaloneArticleCount}
          description={t('standalone.description')}
        />
        <StatItem
          label={t('collectionArticles.label')}
          value={stats.collectionArticleCount}
          description={t('collectionArticles.description')}
        />
        <StatItem
          label={t('collections.label')}
          value={stats.collectionCount}
          description={t('collections.description')}
        />
        <StatItem
          label={t('recentlyUpdated.label')}
          value={stats.recentlyUpdatedCount}
          description={t('recentlyUpdated.description')}
        />
      </div>

      <ProgressMeter
        title={isZh ? '已发布内容占比' : 'Published distribution'}
        summary={
          isZh
            ? `共 ${stats.totalArticles} 篇 · ${stats.collectionCount} 个合集`
            : `${stats.totalArticles} total · ${stats.collectionCount} collections`
        }
        segments={[
          {
            id: 'standalone',
            label: isZh ? '独立' : 'Standalone',
            value: stats.standaloneArticleCount,
            max: meterMax,
            tone: 'sky',
            valueText: `${toPercent(stats.standaloneArticleCount)}%`,
          },
          {
            id: 'collection',
            label: isZh ? '合集' : 'Series',
            value: stats.collectionArticleCount,
            max: meterMax,
            tone: 'emerald',
            valueText: `${toPercent(stats.collectionArticleCount)}%`,
          },
          {
            id: 'recent',
            label: isZh ? '近期更新' : 'Updated',
            value: stats.recentlyUpdatedCount,
            max: meterMax,
            tone: 'accent',
            valueText: `${toPercent(stats.recentlyUpdatedCount)}%`,
          },
        ]}
      />
    </section>
  );
}
