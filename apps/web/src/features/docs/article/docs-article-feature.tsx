'use client';

import { useTranslations } from 'next-intl';
import { DocsReferenceShell } from '@/components/layouts/containers/docs-reference-shell';
import { DocsArticleBody } from '@/features/docs/shared/components/docs-article-body';
import { DocsArticleRightRail } from '@/features/docs/shared/components/docs-article-right-rail';
import { DocsArticleSidebar } from '@/features/docs/shared/components/docs-article-sidebar';
import type { MockDocsDetailPage } from '@/lib/mock/shared/mock-types';

type DocsArticleFeatureProps = {
  page: MockDocsDetailPage;
};

export function DocsArticleFeature({ page }: DocsArticleFeatureProps) {
  const t = useTranslations('docs');

  return (
    <DocsReferenceShell
      layoutMode={page.layoutMode}
      sidebar={
        page.layoutMode === 'sidebar' ? (
          <DocsArticleSidebar groups={page.sidebarGroups} />
        ) : undefined
      }
      aside={
        <DocsArticleRightRail
          items={page.outline}
          label={page.outlineLabel || t('reference.outlineLabel')}
        />
      }
    >
      <DocsArticleBody page={page} />
    </DocsReferenceShell>
  );
}
