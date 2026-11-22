'use client';

import { useLocale } from 'next-intl';
import { DocsLibraryStats } from './components/docs-library-stats';
import { DocsLibraryTable } from './components/docs-library-table';
import type { DocsLibraryPageModel } from './types';

export function DocsSettingsPanel({ page }: { page: DocsLibraryPageModel }) {
  const locale = useLocale();
  const isZh = locale === 'zh';

  return (
    <section id="docs" className="min-w-0 max-w-[760px] space-y-6">
      <header className="space-y-1">
        <h2 className="text-[length:var(--text-xl)] font-semibold tracking-[-0.025em] text-[var(--color-text)]">
          {isZh ? '文档管理' : 'Docs & Articles'}
        </h2>
        <p className="text-[length:var(--text-sm)] leading-relaxed text-[var(--color-text-muted)] tabular-nums">
          {isZh
            ? `共 ${page.stats.totalArticles} 篇已发布文档 · 概览分布、路由检索与访问权限`
            : `${page.stats.totalArticles} published ${page.stats.totalArticles === 1 ? 'article' : 'articles'} · Overview, routes, and access control`}
        </p>
      </header>
      <DocsLibraryStats stats={page.stats} />
      <DocsLibraryTable entries={page.entries} />
    </section>
  );
}
