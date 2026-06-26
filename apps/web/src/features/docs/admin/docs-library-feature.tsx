'use client';

import { useTranslations } from 'next-intl';
import { WorkspaceShell } from '@/components/layouts/containers/workspace-shell';
import { DocsLibraryStats } from './components/docs-library-stats';
import { DocsLibraryTable } from './components/docs-library-table';
import type { DocsLibraryPageModel } from './types';

type DocsLibraryFeatureProps = {
  page: DocsLibraryPageModel;
};

export function DocsLibraryFeature({
  page,
}: DocsLibraryFeatureProps) {
  const t = useTranslations('docs.library');

  return (
    <WorkspaceShell>
      <div className="mx-auto flex w-full max-w-[1520px] flex-col gap-8 px-6 py-10 lg:px-10">
        <header className="space-y-3">
          <p className="text-[0.76rem] uppercase tracking-[0.2em] text-[var(--color-text-soft)]">
            {t('eyebrow')}
          </p>
          <h1 className="max-w-[11ch] text-[clamp(2.4rem,5vw,4.6rem)] font-semibold leading-[0.95] tracking-[-0.04em] text-[var(--color-text)]">
            {t('title')}
          </h1>
          <p className="max-w-[760px] text-[1.02rem] leading-8 text-[var(--color-text-muted)]">
            {t('description')}
          </p>
        </header>

        <DocsLibraryStats stats={page.stats} />
        <DocsLibraryTable entries={page.entries} />
      </div>
    </WorkspaceShell>
  );
}
