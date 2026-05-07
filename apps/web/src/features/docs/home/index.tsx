'use client';

import { useTranslations } from 'next-intl';
import { DocsHomeGroupSection } from '@/features/docs/home/components/docs-home-group-section';
import { DocsHomeIntro } from '@/features/docs/home/components/docs-home-intro';
import type { DocsHomePageModel } from '@/features/docs/shared/types';

type DocsHomeFeatureProps = {
  page: DocsHomePageModel;
};

export function DocsHomeFeature({ page }: DocsHomeFeatureProps) {
  const t = useTranslations('docs');

  return (
    <div className="mx-auto w-full max-w-[1120px] px-6 md:px-8 xl:pr-10 xl:pl-[5.5rem] 2xl:pr-12 2xl:pl-[7.5rem]">
      <DocsHomeIntro intro={page.intro} />

      <div className="space-y-14 pb-16 md:space-y-[4.5rem] md:pb-20">
        {page.groups.map((group) => (
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
