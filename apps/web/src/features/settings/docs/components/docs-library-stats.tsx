import { useLocale, useTranslations } from 'next-intl';
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
    <article className="group min-w-0 rounded-[14px] bg-[var(--color-bg)] p-3.5 shadow-[var(--shadow-card-sm)] transition-all hover:shadow-[var(--shadow-card-hover)]">
      <p className="flex min-w-0 items-center gap-1.5 text-[0.7rem] font-medium uppercase tracking-[0.06em] text-[var(--color-text-soft)]">
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
        <span className="truncate">{label}</span>
      </p>
      <p className="mt-2 text-[1.45rem] font-semibold leading-none text-[var(--color-text)] tabular-nums tracking-tight">
        {value}
      </p>
      <p className="mt-2 text-[0.7rem] leading-relaxed text-[var(--color-nav-muted)] line-clamp-2">
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

  return (
    <section className="space-y-3.5 rounded-2xl bg-[color:var(--color-row-bg)] p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg)] text-[var(--badge-indigo-icon)] shadow-[var(--shadow-card-sm)]">
            <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2.5 3.5h11v9h-11zM2.5 6.5h11M6 6.5v6" />
            </svg>
          </span>
          <h3 className="text-[0.9375rem] font-medium text-[var(--color-text)]">
            {isZh ? '全库概览' : 'Overview'}
          </h3>
        </div>
        <span className="text-[0.72rem] text-[var(--color-nav-muted)]">
          {isZh ? '文档与合集分布统计' : 'Published content & collection distribution'}
        </span>
      </div>

      <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
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
      </div>
    </section>
  );
}
