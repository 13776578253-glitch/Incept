'use client';

import { useLocale } from 'next-intl';
import { DocsLibraryStats } from './components/docs-library-stats';
import { DocsLibraryTable } from './components/docs-library-table';
import type { DocsLibraryPageModel } from './types';

export function DocsSettingsPanel({ page }: { page: DocsLibraryPageModel }) {
  const locale = useLocale();
  const isZh = locale === 'zh';

  return (
    <section id="docs" className="min-w-0 max-w-[760px] space-y-7">
      <header className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-[1.18rem] font-semibold tracking-[-0.03em] text-[var(--color-text)]">
            {isZh ? '文档管理' : 'Docs & Articles'}
          </h2>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--surface-chip-border)] bg-[var(--surface-chip-bg)] px-2.5 py-0.5 text-[0.72rem] font-medium tabular-nums text-[var(--color-nav-muted)]">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--badge-indigo-dot)]" />
            {page.stats.totalArticles} {isZh ? '篇文档' : page.stats.totalArticles === 1 ? 'article' : 'articles'}
          </span>
        </div>
      </header>
      <DocsLibraryStats stats={page.stats} />
      <DocsLibraryTable entries={page.entries} />
    </section>
  );
}
