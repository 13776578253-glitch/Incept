'use client';

import { useTranslations } from 'next-intl';
import { DocsHomeGroupSection } from '@/features/docs/home/components/docs-home-group-section';
import { DocsHomeIntro } from '@/features/docs/home/components/docs-home-intro';
import { docsHomePageMock } from '@/lib/mock/pages/docs/home/docs-home-page.mock';
import { docsArticlePagesMock } from '@/lib/mock/pages/docs/article/docs-article-pages.mock';
import {
  resolveDocsArchiveAccess,
  type ResolvedMockDocsArchiveGroup,
} from '@/lib/mock/pages/docs/shared/docs-access.mock';

const detailSlugs = new Set(docsArticlePagesMock.map((page) => page.slug));

export function DocsHomeFeature() {
  const t = useTranslations('docs');
  const resolvedGroups: ResolvedMockDocsArchiveGroup[] = resolveDocsArchiveAccess(
    docsHomePageMock.groups,
    docsHomePageMock.viewer.accessRole,
  ).map((group) => ({
    ...group,
    articles: group.articles.map((article) => ({
      ...article,
      href:
        article.isAccessible && detailSlugs.has(article.slug)
          ? `/docs/${article.slug}`
          : undefined,
    })),
  }));

  return (
    <div className="mx-auto w-full max-w-[1120px] px-6 md:px-8 xl:pr-10 xl:pl-[5.5rem] 2xl:pr-12 2xl:pl-[7.5rem]">
      <DocsHomeIntro intro={docsHomePageMock.intro} />

      <div className="space-y-14 pb-16 md:space-y-[4.5rem] md:pb-20">
        {resolvedGroups.map((group) => (
          <DocsHomeGroupSection
            key={group.id}
            group={group}
            entriesLabel={t('groups.entries', { count: group.articles.length })}
          />
        ))}
      </div>
    </div>
  );
}
