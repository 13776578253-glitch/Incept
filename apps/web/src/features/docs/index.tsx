'use client';

import { useTranslations } from 'next-intl';
import { DocsArchiveGroupSection } from '@/features/docs/components/docs-archive-group-section';
import { DocsArchiveIntro } from '@/features/docs/components/docs-archive-intro';
import { docsArchivePageMock } from '@/lib/mock/pages/docs/docs-page.mock';
import {
  resolveDocsArchiveAccess,
  type ResolvedMockDocsArchiveGroup,
} from '@/lib/mock/pages/docs/docs-permissions.mock';

export { DocsReferenceFeature } from './docs-reference-feature';

export function DocsArchiveFeature() {
  const t = useTranslations('docs');
  const resolvedGroups: ResolvedMockDocsArchiveGroup[] =
    resolveDocsArchiveAccess(
      docsArchivePageMock.groups,
      docsArchivePageMock.viewer.accessRole,
    );

  return (
    <div className="mx-auto w-full max-w-[1120px] px-6 md:px-8 xl:pr-10 xl:pl-[5.5rem] 2xl:pr-12 2xl:pl-[7.5rem]">
      <DocsArchiveIntro intro={docsArchivePageMock.intro} />

      <div className="space-y-14 pb-16 md:space-y-[4.5rem] md:pb-20">
        {resolvedGroups.map((group) => (
          <DocsArchiveGroupSection
            key={group.id}
            group={group}
            entriesLabel={t('groups.entries', { count: group.articles.length })}
          />
        ))}
      </div>
    </div>
  );
}
