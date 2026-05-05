'use client';

import { useTranslations } from 'next-intl';
import { DocsReferenceShell } from '@/components/layouts/containers/docs-reference-shell';
import { DocsReferenceArticle } from '@/features/docs/components/docs-reference-article';
import { DocsReferenceRightRail } from '@/features/docs/components/docs-reference-right-rail';
import { DocsReferenceSidebar } from '@/features/docs/components/docs-reference-sidebar';
import { docsReferencePageMock } from '@/lib/mock/pages/docs/docs-reference-page.mock';

export function DocsReferenceFeature() {
  const t = useTranslations('docs');
  const page = docsReferencePageMock;

  return (
    <DocsReferenceShell
      layoutMode={page.layoutMode}
      sidebar={
        page.layoutMode === 'sidebar' ? (
          <DocsReferenceSidebar groups={page.sidebarGroups} />
        ) : undefined
      }
      aside={
        <DocsReferenceRightRail
          items={page.outline}
          label={t('reference.outlineLabel')}
        />
      }
    >
      <DocsReferenceArticle page={page} />
    </DocsReferenceShell>
  );
}
